import { joinRoom, selfId } from 'trystero/torrent'
import type { Room } from 'trystero'
import type { P2PMessage } from '../types'
import { getAllData, getDataSince } from './db'

type MessageHandler = (msg: P2PMessage, peerId: string) => void

const ROOM_ID = 'moltynano-main'
const APP_ID = 'moltynano'

// ── ICE servers for NAT traversal ────────────────────────────────────────
// STUN discovers public IP; TURN relays traffic when direct connection fails
// (symmetric NATs, corporate firewalls, mobile carriers, etc.)
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Free TURN relays — needed when STUN-only fails (most real-world networks)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

// Allow overriding relay URLs via localStorage (for testing)
function getRelayConfig(): { relayUrls?: string[] } {
  try {
    const raw = localStorage.getItem('moltynano-relay-config')
    if (raw) return JSON.parse(raw) as { relayUrls?: string[] }
  } catch { /* ignore */ }
  return {}
}

class P2PNetwork {
  private room: Room | null = null
  private messageHandlers: Set<MessageHandler> = new Set()
  private connectionHandlers: Set<(peers: string[]) => void> = new Set()
  private broadcastChannel: BroadcastChannel | null = null
  private myPeerId: string = ''
  private connectedPeers: Set<string> = new Set()
  private _isReady = false

  // Message deduplication
  private seenMessages: Map<string, number> = new Map()
  private readonly SEEN_MSG_TTL = 30_000

  // Offline message queue
  private offlineQueue: P2PMessage[] = []

  // Delta sync tracking per peer
  private lastSyncTime: Map<string, number> = new Map()

  // Discovery stats for the UI
  private _discoveredPeerCount = 0
  private _lastDiscoveryTime = 0

  // Trystero action sender
  private sendMsg: ((data: P2PMessage, targetPeers?: string | string[] | null) => Promise<void[]>) | null = null

  get peerId(): string {
    return this.myPeerId
  }

  get connectedPeerIds(): string[] {
    return Array.from(this.connectedPeers)
  }

  get isReady(): boolean {
    return this._isReady
  }

  get discoveredPeerCount(): number {
    return this._discoveredPeerCount
  }

  get lastDiscoveryTime(): number {
    return this._lastDiscoveryTime
  }

  // ── Message deduplication ─────────────────────────────────────────────

  private getMessageKey(msg: P2PMessage): string | null {
    switch (msg.type) {
      case 'NEW_COMMUNITY': return `community:${msg.data.id}`
      case 'NEW_POST': return `post:${msg.data.id}`
      case 'NEW_COMMENT': return `comment:${msg.data.id}`
      case 'VOTE': return `vote:${msg.data.id}`
      case 'TIP': return `tip:${msg.data.id}`
      default: return null
    }
  }

  private isMessageSeen(msg: P2PMessage): boolean {
    const key = this.getMessageKey(msg)
    if (!key) return false
    const now = Date.now()
    if (this.seenMessages.size > 500) {
      for (const [k, ts] of this.seenMessages) {
        if (now - ts > this.SEEN_MSG_TTL) this.seenMessages.delete(k)
      }
    }
    if (this.seenMessages.has(key)) return true
    this.seenMessages.set(key, now)
    return false
  }

  // ── Initialisation ────────────────────────────────────────────────────
  // Join the shared Trystero room.  Peer discovery is fully automatic via
  // public BitTorrent WebSocket trackers — no signaling server needed.

  async init(): Promise<string> {
    this.myPeerId = selfId
    console.log('[P2P] My peer ID:', this.myPeerId)

    const relayOverride = getRelayConfig()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      appId: APP_ID,
      rtcConfig: { iceServers: ICE_SERVERS },
      ...relayOverride,
    }

    this.room = joinRoom(config, ROOM_ID)
    this._isReady = true

    // Set up the single message action for all P2P communication
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [send, receive] = this.room.makeAction<any>('msg')
    this.sendMsg = send
    receive((data: P2PMessage, peerId: string) => {
      if (this.isMessageSeen(data)) return
      this.handleMessage(data, peerId).catch(err => {
        console.error('[P2P] Unhandled error in message handler:', err)
      })
    })

    // ── Peer join ──
    this.room.onPeerJoin((peerId) => {
      console.log('[P2P] Connected to:', peerId)
      this.connectedPeers.add(peerId)
      this._discoveredPeerCount = this.connectedPeers.size
      this._lastDiscoveryTime = Date.now()
      this.notifyConnectionHandlers()

      // Flush offline queue to new peer
      if (this.offlineQueue.length > 0 && this.sendMsg) {
        for (const msg of this.offlineQueue) {
          this.sendMsg(msg, peerId)
        }
        this.offlineQueue = []
      }

      // Request sync (delta if we've synced with this peer before)
      const since = this.lastSyncTime.get(peerId)
      this.sendToPeer(peerId, { type: 'SYNC_REQUEST', since })
    })

    // ── Peer leave ──
    this.room.onPeerLeave((peerId) => {
      console.log('[P2P] Disconnected from:', peerId)
      this.connectedPeers.delete(peerId)
      this._discoveredPeerCount = this.connectedPeers.size
      this.notifyConnectionHandlers()
    })

    // BroadcastChannel for same-origin tab sync
    this.setupBroadcastChannel()

    return this.myPeerId
  }

  private setupBroadcastChannel() {
    this.broadcastChannel = new BroadcastChannel('moltynano-p2p')
    this.broadcastChannel.onmessage = (event) => {
      const { type, data, fromPeerId } = event.data
      if (fromPeerId === this.myPeerId) return
      if (type === 'MESSAGE') {
        const msg = data as P2PMessage
        if (this.isMessageSeen(msg)) return
        this.notifyMessageHandlers(msg, fromPeerId)
      }
    }
  }

  // ── Message handling ──────────────────────────────────────────────────

  private async handleMessage(msg: P2PMessage, fromPeerId: string) {
    try {
      switch (msg.type) {
        case 'SYNC_REQUEST': {
          console.log('[P2P] Sync request from', fromPeerId, msg.since ? `(delta since ${new Date(msg.since).toISOString()})` : '(full)')
          const data = msg.since ? await getDataSince(msg.since) : await getAllData()
          const itemCount = data.communities.length + data.posts.length + data.comments.length + data.votes.length + data.tips.length
          console.log('[P2P] Sending sync response to', fromPeerId, `(${itemCount} items)`)
          this.sendToPeer(fromPeerId, { type: 'SYNC_RESPONSE', data })
          break
        }
        case 'SYNC_RESPONSE': {
          const d = msg.data as { communities?: unknown[]; posts?: unknown[]; comments?: unknown[]; votes?: unknown[]; tips?: unknown[] }
          const itemCount = (d.communities?.length || 0) + (d.posts?.length || 0) + (d.comments?.length || 0) + (d.votes?.length || 0) + (d.tips?.length || 0)
          console.log('[P2P] Received sync response from', fromPeerId, `(${itemCount} items)`)
          this.lastSyncTime.set(fromPeerId, Date.now())
          // Let useStore handle mergeData with validation — don't merge unvalidated data here
          this.notifyMessageHandlers(msg, fromPeerId)
          break
        }
        case 'PEER_LIST': {
          // No-op: Trystero handles discovery automatically
          break
        }
        default: {
          this.notifyMessageHandlers(msg, fromPeerId)
          break
        }
      }
    } catch (err) {
      console.error('[P2P] Error handling message from', fromPeerId, ':', err)
    }
  }

  // ── Sending ───────────────────────────────────────────────────────────

  // Kept for backward compatibility (useStore's manual connect button).
  // With Trystero, peers discover each other automatically via the room.
  connectToPeer(_remotePeerId: string): Promise<void> {
    return Promise.resolve()
  }

  sendToPeer(peerId: string, msg: P2PMessage) {
    if (this.sendMsg && this.connectedPeers.has(peerId)) {
      this.sendMsg(msg, peerId).catch(err => {
        console.error('[P2P] Failed to send to peer', peerId, ':', err)
      })
    }
  }

  broadcast(msg: P2PMessage) {
    let sentToAnyPeer = false

    if (this.sendMsg && this.connectedPeers.size > 0) {
      this.sendMsg(msg).catch(err => {
        console.error('[P2P] Broadcast failed:', err)
      })
      sentToAnyPeer = true
    }

    // Also broadcast via BroadcastChannel for same-origin tabs
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'MESSAGE',
        data: msg,
        fromPeerId: this.myPeerId,
      })
    }

    // Queue for later delivery if no peers connected
    if (!sentToAnyPeer && msg.type !== 'SYNC_REQUEST' && msg.type !== 'SYNC_RESPONSE') {
      this.offlineQueue.push(msg)
      if (this.offlineQueue.length > 1000) {
        this.offlineQueue = this.offlineQueue.slice(-500)
      }
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onConnectionChange(handler: (peers: string[]) => void) {
    this.connectionHandlers.add(handler)
    return () => this.connectionHandlers.delete(handler)
  }

  private notifyMessageHandlers(msg: P2PMessage, fromPeerId: string) {
    for (const handler of this.messageHandlers) {
      handler(msg, fromPeerId)
    }
  }

  private notifyConnectionHandlers() {
    const peers = this.connectedPeerIds
    for (const handler of this.connectionHandlers) {
      handler(peers)
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  destroy() {
    this.broadcastChannel?.close()
    this.room?.leave()
    this.room = null
    this.connectedPeers.clear()
    this.sendMsg = null
    this._isReady = false
  }
}

// Singleton instance
export const p2pNetwork = new P2PNetwork()
