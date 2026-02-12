export interface Community {
  id: string
  name: string
  description: string
  creator: string // nano address
  createdAt: number
  cid: string // content hash
  signature: string
}

export interface Post {
  id: string
  title: string
  body: string
  author: string // nano address
  authorName: string
  communityId: string
  createdAt: number
  cid: string
  signature: string
}

export interface Comment {
  id: string
  body: string
  author: string
  authorName: string
  postId: string
  parentId: string | null // null = top-level, string = reply to another comment
  createdAt: number
  cid: string
  signature: string
}

export interface Vote {
  id: string
  targetId: string // post or comment ID
  targetType: 'post' | 'comment'
  voter: string // nano address
  value: 1 | -1
  createdAt: number
  signature: string
}

export interface Tip {
  id: string
  from: string
  to: string
  amountRaw: string
  blockHash: string
  targetId: string
  targetType: 'post' | 'comment'
  createdAt: number
  signature: string
}

export interface PeerInfo {
  peerId: string
  address: string
  connectedAt: number
}

export interface WalletState {
  seed: string | null
  address: string | null
  publicKey: string | null
  privateKey: string | null
  balance: string
  pending: string
  displayName: string
}

export type P2PMessage =
  | { type: 'SYNC_REQUEST'; since?: number }
  | { type: 'SYNC_RESPONSE'; data: SyncData }
  | { type: 'NEW_COMMUNITY'; data: Community }
  | { type: 'NEW_POST'; data: Post }
  | { type: 'NEW_COMMENT'; data: Comment }
  | { type: 'VOTE'; data: Vote }
  | { type: 'TIP'; data: Tip }
  | { type: 'PEER_LIST'; data: string[] }
  | { type: 'IDENTITY'; data: { peerId: string; address: string; name: string } }

export interface SyncData {
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
}

export interface EncryptedWalletStore {
  version: 2
  address: string
  publicKey: string
  displayName: string
  balance: string
  pending: string
  encrypted: { salt: string; iv: string; ct: string }
  passwordSalt: string
  passwordHash: string
}

export interface WalletSecrets {
  seed: string
  privateKey: string
}

export type WalletLockState = 'no_wallet' | 'locked' | 'unlocked'

export interface AppState {
  wallet: WalletState
  walletLockState: WalletLockState
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
  connectedPeers: string[]
  myPeerId: string | null
  networkReady: boolean
}
