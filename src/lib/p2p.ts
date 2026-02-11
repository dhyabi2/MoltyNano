import Peer, { type DataConnection } from 'peerjs'
import type { P2PMessage, SyncData } from '../types'
import { getAllData, getDataSince, mergeData } from './db'

type MessageHandler = (msg: P2PMessage, peerId: string) => void

class P2PNetwork {
  private peer: Peer | null = null
  private connections: Map<string, DataConnection> = new Map()
  private messageHandlers: Set<MessageHandler> = new Set()
  private connectionHandlers: Set<(peers: string[]) => void> = new Set()
  private broadcastChannel: BroadcastChannel | null = null
  private myPeerId: string = ''
  private knownPeers: Set<string> = new Set()
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private _isReady = false
  // Message deduplication: track seen message hashes with TTL
  private seenMessages: Map<string, number> = new Map()
  private readonly SEEN_MSG_TTL = 30_000 // 30 seconds
  // Offline message queue
  private offlineQueue: P2PMessage[] = []
  // Track last sync time per peer for delta sync
  private lastSyncTime: Map<string, number> = new Map()

  get peerId(): string {
    return this.myPeerId
  }

  get connectedPeerIds(): string[] {
    return Array.from(this.connections.keys())
  }

  get isReady(): boolean {
    return this._isReady
  }

  // Generate a hash key for message deduplication
  private getMessageKey(msg: P2PMessage): string | null {
    switch (msg.type) {
      case 'NEW_COMMUNITY': return `community:${msg.data.id}`
      case 'NEW_POST': return `post:${msg.data.id}`
      case 'NEW_COMMENT': return `comment:${msg.data.id}`
      case 'VOTE': return `vote:${msg.data.id}`
      case 'TIP': return `tip:${msg.data.id}`
      default: return null // SYNC_REQUEST, SYNC_RESPONSE, PEER_LIST are not deduplicated
    }
  }

  // Check if message was already processed; if not, mark it as seen
  private isMessageSeen(msg: P2PMessage): boolean {
    const key = this.getMessageKey(msg)
    if (!key) return false // non-dedup messages always pass through
    const now = Date.now()
    // Clean expired entries periodically
    if (this.seenMessages.size > 500) {
      for (const [k, ts] of this.seenMessages) {
        if (now - ts > this.SEEN_MSG_TTL) this.seenMessages.delete(k)
      }
    }
    if (this.seenMessages.has(key)) return true
    this.seenMessages.set(key, now)
    return false
  }

  async init(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Generate a short peer ID
      const id = 'mb-' + Math.random().toString(36).substring(2, 10)

      this.peer = new Peer(id, {
        debug: 0,
      })

      this.peer.on('open', (peerId) => {
        this.myPeerId = peerId
        this._isReady = true
        console.log('[P2P] My peer ID:', peerId)
        this.setupBroadcastChannel()
        resolve(peerId)
      })

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn)
      })

      this.peer.on('error', (err) => {
        console.error('[P2P] Peer error:', err)
        // Don't reject if already initialized - this might be a connection error
        if (!this._isReady) {
          // Try again without specifying ID
          this.peer = new Peer({ debug: 0 })
          this.peer.on('open', (peerId) => {
            this.myPeerId = peerId
            this._isReady = true
            this.setupBroadcastChannel()
            this.peer!.on('connection', (conn) => this.handleConnection(conn))
            resolve(peerId)
          })
          this.peer.on('error', (e) => {
            if (!this._isReady) reject(e)
          })
        }
      })

      this.peer.on('disconnected', () => {
        console.log('[P2P] Disconnected from signaling server, reconnecting...')
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect()
        }
      })
    })
  }

  private setupBroadcastChannel() {
    // BroadcastChannel for same-origin (same browser) communication
    this.broadcastChannel = new BroadcastChannel('moltynano-p2p')
    this.broadcastChannel.onmessage = (event) => {
      const { type, data, fromPeerId } = event.data
      if (fromPeerId === this.myPeerId) return // ignore own messages

      if (type === 'ANNOUNCE') {
        // Another tab announced itself, try to connect
        if (!this.connections.has(fromPeerId) && fromPeerId !== this.myPeerId) {
          this.connectToPeer(fromPeerId)
        }
      } else if (type === 'MESSAGE') {
        const msg = data as P2PMessage
        if (this.isMessageSeen(msg)) return // skip duplicate
        // Relay message from BroadcastChannel
        this.notifyMessageHandlers(msg, fromPeerId)
      }
    }

    // Announce ourselves
    this.broadcastChannel.postMessage({
      type: 'ANNOUNCE',
      fromPeerId: this.myPeerId,
    })
  }

  connectToPeer(remotePeerId: string): Promise<void> {
    if (this.connections.has(remotePeerId) || remotePeerId === this.myPeerId) {
      return Promise.resolve()
    }
    if (!this.peer || this.peer.destroyed) {
      return Promise.reject(new Error('Peer not initialized'))
    }

    return new Promise((resolve, reject) => {
      const conn = this.peer!.connect(remotePeerId, { reliable: true })
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10000)

      conn.on('open', () => {
        clearTimeout(timeout)
        this.handleConnection(conn)
        resolve()
      })

      conn.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  private handleConnection(conn: DataConnection) {
    const remotePeerId = conn.peer

    conn.on('open', () => {
      console.log('[P2P] Connected to:', remotePeerId)
      this.connections.set(remotePeerId, conn)
      this.knownPeers.add(remotePeerId)
      this.notifyConnectionHandlers()

      // Flush offline queue to new peer
      if (this.offlineQueue.length > 0) {
        for (const queuedMsg of this.offlineQueue) {
          this.sendToPeer(remotePeerId, queuedMsg)
        }
        this.offlineQueue = []
      }

      // Request sync from new peer (delta if we've synced before)
      const since = this.lastSyncTime.get(remotePeerId)
      this.sendToPeer(remotePeerId, { type: 'SYNC_REQUEST', since })

      // Share our known peers
      const peerList = Array.from(this.knownPeers).filter(
        (p) => p !== remotePeerId && p !== this.myPeerId
      )
      if (peerList.length > 0) {
        this.sendToPeer(remotePeerId, { type: 'PEER_LIST', data: peerList })
      }
    })

    conn.on('data', (rawData) => {
      try {
        const msg = rawData as P2PMessage
        if (this.isMessageSeen(msg)) return // skip duplicate
        this.handleMessage(msg, remotePeerId)
      } catch (err) {
        console.error('[P2P] Error handling message:', err)
      }
    })

    conn.on('close', () => {
      console.log('[P2P] Disconnected from:', remotePeerId)
      this.connections.delete(remotePeerId)
      this.notifyConnectionHandlers()

      // Try to reconnect after a delay
      const timer = setTimeout(() => {
        if (!this.connections.has(remotePeerId) && this.peer && !this.peer.destroyed) {
          this.connectToPeer(remotePeerId).catch(() => {
            // Failed to reconnect, remove from known peers
            this.knownPeers.delete(remotePeerId)
          })
        }
      }, 5000)
      this.reconnectTimers.set(remotePeerId, timer)
    })

    conn.on('error', (err) => {
      console.error('[P2P] Connection error with', remotePeerId, err)
    })

    // If connection is already open (incoming)
    if (conn.open) {
      this.connections.set(remotePeerId, conn)
      this.knownPeers.add(remotePeerId)
      this.notifyConnectionHandlers()
      const since = this.lastSyncTime.get(remotePeerId)
      this.sendToPeer(remotePeerId, { type: 'SYNC_REQUEST', since })
    }
  }

  private async handleMessage(msg: P2PMessage, fromPeerId: string) {
    switch (msg.type) {
      case 'SYNC_REQUEST': {
        // Support delta sync: if 'since' timestamp provided, only send newer records
        const data = msg.since ? await getDataSince(msg.since) : await getAllData()
        this.sendToPeer(fromPeerId, { type: 'SYNC_RESPONSE', data })
        break
      }
      case 'SYNC_RESPONSE': {
        await mergeData(msg.data)
        this.lastSyncTime.set(fromPeerId, Date.now())
        this.notifyMessageHandlers(msg, fromPeerId)
        break
      }
      case 'PEER_LIST': {
        // Connect to peers we don't know about
        for (const peerId of msg.data) {
          if (!this.connections.has(peerId) && peerId !== this.myPeerId) {
            this.knownPeers.add(peerId)
            this.connectToPeer(peerId).catch(() => {})
          }
        }
        break
      }
      default: {
        // For all other messages, notify handlers
        this.notifyMessageHandlers(msg, fromPeerId)
        break
      }
    }
  }

  sendToPeer(peerId: string, msg: P2PMessage) {
    const conn = this.connections.get(peerId)
    if (conn && conn.open) {
      conn.send(msg)
    }
  }

  broadcast(msg: P2PMessage) {
    let sentToAnyPeer = false

    // Send to all connected PeerJS peers
    for (const [, conn] of this.connections) {
      if (conn.open) {
        conn.send(msg)
        sentToAnyPeer = true
      }
    }

    // Also broadcast via BroadcastChannel for same-origin tabs
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'MESSAGE',
        data: msg,
        fromPeerId: this.myPeerId,
      })
    }

    // If no peers connected, queue for later delivery
    if (!sentToAnyPeer && msg.type !== 'SYNC_REQUEST' && msg.type !== 'SYNC_RESPONSE') {
      this.offlineQueue.push(msg)
      // Cap queue size to prevent memory bloat
      if (this.offlineQueue.length > 1000) {
        this.offlineQueue = this.offlineQueue.slice(-500)
      }
    }
  }

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

  destroy() {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()
    this.broadcastChannel?.close()
    for (const conn of this.connections.values()) {
      conn.close()
    }
    this.connections.clear()
    this.peer?.destroy()
    this._isReady = false
  }
}

// Singleton instance
export const p2pNetwork = new P2PNetwork()
