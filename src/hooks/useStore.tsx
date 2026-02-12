import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import type {
  AppState,
  Community,
  Post,
  Comment,
  Vote,
  Tip,
  P2PMessage,
  WalletState,
  WalletLockState,
  EncryptedWalletStore,
} from '../types'
import { upsertCommunity, upsertPost, upsertComment, upsertVote, upsertTip, getAllData, mergeData, validateSyncData, onDBChange, checkDataIntegrity } from '../lib/db'
import { p2pNetwork } from '../lib/p2p'
import { hashContent, generateId } from '../lib/ipfs'
import {
  signMessage,
  loadWalletPublic,
  saveWalletEncrypted,
  createWallet,
  walletFromSeed,
  verifyPostSignature,
  verifyCommentSignature,
  verifyCommunitySignature,
  verifyVoteSignature,
  verifyTipSignature,
  isLegacyWallet,
  hasStoredWallet,
  unlockWallet as unlockWalletFromStorage,
  updateWalletPublicData,
} from '../lib/wallet'

const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000

type Action =
  | { type: 'SET_WALLET'; wallet: WalletState }
  | { type: 'SET_LOCK_STATE'; lockState: WalletLockState }
  | { type: 'LOCK_WALLET' }
  | { type: 'ADD_COMMUNITY'; community: Community }
  | { type: 'ADD_POST'; post: Post }
  | { type: 'ADD_COMMENT'; comment: Comment }
  | { type: 'SET_VOTE'; vote: Vote }
  | { type: 'ADD_TIP'; tip: Tip }
  | { type: 'SET_PEERS'; peers: string[] }
  | { type: 'SET_PEER_ID'; peerId: string }
  | { type: 'SET_NETWORK_READY'; ready: boolean }
  | { type: 'LOAD_ALL'; data: Omit<AppState, 'wallet' | 'walletLockState' | 'connectedPeers' | 'myPeerId' | 'networkReady'> }
  | { type: 'MERGE_SYNC'; data: { communities: Community[]; posts: Post[]; comments: Comment[]; votes: Vote[]; tips: Tip[] } }

const initialState: AppState = {
  wallet: {
    seed: null,
    address: null,
    publicKey: null,
    privateKey: null,
    balance: '0',
    pending: '0',
    displayName: 'Anonymous',
  },
  walletLockState: 'no_wallet',
  communities: [],
  posts: [],
  comments: [],
  votes: [],
  tips: [],
  connectedPeers: [],
  myPeerId: null,
  networkReady: false,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_WALLET':
      return { ...state, wallet: action.wallet }

    case 'SET_LOCK_STATE':
      return { ...state, walletLockState: action.lockState }

    case 'LOCK_WALLET':
      return {
        ...state,
        walletLockState: 'locked',
        wallet: {
          ...state.wallet,
          seed: null,
          privateKey: null,
        },
      }

    case 'ADD_COMMUNITY':
      if (state.communities.find((c) => c.id === action.community.id)) return state
      return { ...state, communities: [...state.communities, action.community] }

    case 'ADD_POST':
      if (state.posts.find((p) => p.id === action.post.id)) return state
      return { ...state, posts: [...state.posts, action.post] }

    case 'ADD_COMMENT':
      if (state.comments.find((c) => c.id === action.comment.id)) return state
      return { ...state, comments: [...state.comments, action.comment] }

    case 'SET_VOTE': {
      const existing = state.votes.findIndex(
        (v) => v.targetId === action.vote.targetId && v.voter === action.vote.voter
      )
      if (existing >= 0) {
        const newVotes = [...state.votes]
        newVotes[existing] = action.vote
        return { ...state, votes: newVotes }
      }
      return { ...state, votes: [...state.votes, action.vote] }
    }

    case 'ADD_TIP':
      if (state.tips.find((t) => t.id === action.tip.id)) return state
      return { ...state, tips: [...state.tips, action.tip] }

    case 'SET_PEERS':
      return { ...state, connectedPeers: action.peers }

    case 'SET_PEER_ID':
      return { ...state, myPeerId: action.peerId }

    case 'SET_NETWORK_READY':
      return { ...state, networkReady: action.ready }

    case 'LOAD_ALL':
      return {
        ...state,
        communities: action.data.communities,
        posts: action.data.posts,
        comments: action.data.comments,
        votes: action.data.votes,
        tips: action.data.tips,
      }

    case 'MERGE_SYNC': {
      const mergedCommunities = [...state.communities]
      for (const c of action.data.communities) {
        if (!mergedCommunities.find((x) => x.id === c.id)) mergedCommunities.push(c)
      }
      const mergedPosts = [...state.posts]
      for (const p of action.data.posts) {
        if (!mergedPosts.find((x) => x.id === p.id)) mergedPosts.push(p)
      }
      const mergedComments = [...state.comments]
      for (const c of action.data.comments) {
        if (!mergedComments.find((x) => x.id === c.id)) mergedComments.push(c)
      }
      const mergedVotes = [...state.votes]
      for (const v of action.data.votes) {
        const idx = mergedVotes.findIndex(
          (x) => x.targetId === v.targetId && x.voter === v.voter
        )
        if (idx >= 0) {
          mergedVotes[idx] = v
        } else {
          mergedVotes.push(v)
        }
      }
      const mergedTips = [...state.tips]
      for (const t of action.data.tips) {
        if (!mergedTips.find((x) => x.id === t.id)) mergedTips.push(t)
      }
      return {
        ...state,
        communities: mergedCommunities,
        posts: mergedPosts,
        comments: mergedComments,
        votes: mergedVotes,
        tips: mergedTips,
      }
    }

    default:
      return state
  }
}

interface StoreContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  initWalletWithPassword: (password: string, seed?: string) => Promise<void>
  setupPassword: (password: string) => Promise<void>
  unlockWallet: (password: string) => Promise<void>
  lockWallet: () => void
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  createCommunity: (name: string, description: string) => Promise<Community>
  createPost: (title: string, body: string, communityId: string) => Promise<Post>
  createComment: (body: string, postId: string, parentId: string | null) => Promise<Comment>
  castVote: (targetId: string, targetType: 'post' | 'comment', value: 1 | -1) => Promise<void>
  getScore: (targetId: string) => number
  getUserVote: (targetId: string) => number
  connectToPeer: (peerId: string) => Promise<void>
  exportData: () => Promise<string>
  importData: (json: string) => Promise<void>
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const autoLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // Load data from IndexedDB on mount
  useEffect(() => {
    async function loadData() {
      const data = await getAllData()
      dispatch({ type: 'LOAD_ALL', data })
    }
    loadData()
  }, [])

  // Initialize wallet from localStorage
  useEffect(() => {
    if (!hasStoredWallet()) {
      dispatch({ type: 'SET_LOCK_STATE', lockState: 'no_wallet' })
      return
    }
    if (isLegacyWallet()) {
      const saved = loadWalletPublic()
      if (saved) {
        dispatch({ type: 'SET_WALLET', wallet: saved })
        dispatch({ type: 'SET_LOCK_STATE', lockState: 'unlocked' })
      }
      return
    }
    const publicData = loadWalletPublic()
    if (publicData) {
      dispatch({ type: 'SET_WALLET', wallet: publicData })
      dispatch({ type: 'SET_LOCK_STATE', lockState: 'locked' })
    }
  }, [])

  // Periodic data integrity check (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await checkDataIntegrity()
      if (!result.ok) {
        console.error('[Store] Data integrity issues:', result.errors)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Cross-tab IndexedDB change notification - reload data when another tab writes
  useEffect(() => {
    const unsubDB = onDBChange(async () => {
      const data = await getAllData()
      dispatch({ type: 'LOAD_ALL', data })
    })
    return unsubDB
  }, [])

  // Cross-tab wallet sync via storage events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'moltynano_wallet') {
        if (e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue)
            if (parsed.version === 2) {
              const store = parsed as EncryptedWalletStore
              const current = stateRef.current
              if (current.walletLockState === 'unlocked' && current.wallet.seed) {
                dispatch({
                  type: 'SET_WALLET',
                  wallet: {
                    ...current.wallet,
                    balance: store.balance,
                    pending: store.pending,
                    displayName: store.displayName,
                  },
                })
              } else {
                dispatch({
                  type: 'SET_WALLET',
                  wallet: {
                    seed: null,
                    privateKey: null,
                    address: store.address,
                    publicKey: store.publicKey,
                    displayName: store.displayName,
                    balance: store.balance,
                    pending: store.pending,
                  },
                })
                dispatch({ type: 'SET_LOCK_STATE', lockState: 'locked' })
              }
            } else {
              const wallet = parsed as WalletState
              dispatch({ type: 'SET_WALLET', wallet })
            }
          } catch {
            // Invalid wallet data, ignore
          }
        } else {
          dispatch({ type: 'SET_WALLET', wallet: initialState.wallet })
          dispatch({ type: 'SET_LOCK_STATE', lockState: 'no_wallet' })
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Auto-lock timer
  const clearAutoLockTimer = useCallback(() => {
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current)
      autoLockTimerRef.current = null
    }
  }, [])

  const resetAutoLockTimer = useCallback(() => {
    clearAutoLockTimer()
    autoLockTimerRef.current = setTimeout(() => {
      dispatch({ type: 'LOCK_WALLET' })
    }, AUTO_LOCK_TIMEOUT)
  }, [clearAutoLockTimer])

  useEffect(() => {
    if (state.walletLockState !== 'unlocked' || isLegacyWallet()) return

    const handleActivity = () => resetAutoLockTimer()
    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)
    resetAutoLockTimer()

    return () => {
      clearAutoLockTimer()
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
    }
  }, [state.walletLockState, resetAutoLockTimer, clearAutoLockTimer])

  // Lock on extended tab hide
  useEffect(() => {
    if (state.walletLockState !== 'unlocked' || isLegacyWallet()) return

    let hiddenAt: number | null = null
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
      } else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_TIMEOUT) {
        dispatch({ type: 'LOCK_WALLET' })
        hiddenAt = null
      } else {
        hiddenAt = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [state.walletLockState])

  // Initialize P2P network — discovery is fully automatic
  useEffect(() => {
    async function initP2P() {
      try {
        const peerId = await p2pNetwork.init()
        dispatch({ type: 'SET_PEER_ID', peerId })
        dispatch({ type: 'SET_NETWORK_READY', ready: true })
      } catch (err) {
        console.error('Failed to init P2P:', err)
      }
    }
    initP2P()

    return () => {
      p2pNetwork.destroy()
    }
  }, [])

  // Listen for P2P messages
  useEffect(() => {
    const unsubMsg = p2pNetwork.onMessage(async (msg: P2PMessage) => {
      try {
        switch (msg.type) {
          case 'SYNC_RESPONSE': {
            const validatedData = validateSyncData(msg.data)
            const itemCount = validatedData.communities.length + validatedData.posts.length + validatedData.comments.length + validatedData.votes.length + validatedData.tips.length
            console.log('[Store] Merging sync response:', itemCount, 'items')
            await mergeData(validatedData)
            dispatch({ type: 'MERGE_SYNC', data: validatedData })
            console.log('[Store] Sync merge complete')
            break
          }
          case 'NEW_COMMUNITY':
            if (!verifyCommunitySignature(msg.data)) {
              console.warn('[Store] Rejected community with invalid signature:', msg.data.id)
              break
            }
            await upsertCommunity(msg.data)
            dispatch({ type: 'ADD_COMMUNITY', community: msg.data })
            break
          case 'NEW_POST':
            if (!verifyPostSignature(msg.data)) {
              console.warn('[Store] Rejected post with invalid signature:', msg.data.id)
              break
            }
            await upsertPost(msg.data)
            dispatch({ type: 'ADD_POST', post: msg.data })
            break
          case 'NEW_COMMENT':
            if (!verifyCommentSignature(msg.data)) {
              console.warn('[Store] Rejected comment with invalid signature:', msg.data.id)
              break
            }
            await upsertComment(msg.data)
            dispatch({ type: 'ADD_COMMENT', comment: msg.data })
            break
          case 'VOTE':
            if (!verifyVoteSignature(msg.data)) {
              console.warn('[Store] Rejected vote with invalid signature:', msg.data.id)
              break
            }
            await upsertVote(msg.data)
            dispatch({ type: 'SET_VOTE', vote: msg.data })
            break
          case 'TIP':
            if (!verifyTipSignature(msg.data)) {
              console.warn('[Store] Rejected tip with invalid signature:', msg.data.id)
              break
            }
            await upsertTip(msg.data)
            dispatch({ type: 'ADD_TIP', tip: msg.data })
            break
        }
      } catch (err) {
        console.error('[Store] Error processing P2P message:', msg.type, err)
      }
    })

    const unsubConn = p2pNetwork.onConnectionChange((peers: string[]) => {
      dispatch({ type: 'SET_PEERS', peers })
    })

    return () => {
      unsubMsg()
      unsubConn()
    }
  }, [])

  const initWalletWithPassword = useCallback(
    async (password: string, seed?: string) => {
      let w
      if (seed) {
        const derived = walletFromSeed(seed)
        w = { seed, ...derived }
      } else {
        w = createWallet()
      }
      const walletState: WalletState = {
        seed: w.seed,
        address: w.address,
        publicKey: w.publicKey,
        privateKey: w.privateKey,
        balance: '0',
        pending: '0',
        displayName: 'nano_' + w.address.slice(5, 11),
      }
      await saveWalletEncrypted(walletState, password)
      dispatch({ type: 'SET_WALLET', wallet: walletState })
      dispatch({ type: 'SET_LOCK_STATE', lockState: 'unlocked' })
      resetAutoLockTimer()
    },
    [resetAutoLockTimer]
  )

  const setupPassword = useCallback(
    async (password: string) => {
      const w = stateRef.current.wallet
      if (!w.seed || !w.privateKey) {
        throw new Error('No wallet secrets to encrypt')
      }
      await saveWalletEncrypted(w, password)
      dispatch({ type: 'SET_LOCK_STATE', lockState: 'unlocked' })
      resetAutoLockTimer()
    },
    [resetAutoLockTimer]
  )

  const unlockWalletAction = useCallback(
    async (password: string) => {
      const fullWallet = await unlockWalletFromStorage(password)
      dispatch({ type: 'SET_WALLET', wallet: fullWallet })
      dispatch({ type: 'SET_LOCK_STATE', lockState: 'unlocked' })
      resetAutoLockTimer()
    },
    [resetAutoLockTimer]
  )

  const lockWalletAction = useCallback(() => {
    dispatch({ type: 'LOCK_WALLET' })
    clearAutoLockTimer()
  }, [clearAutoLockTimer])

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      const fullWallet = await unlockWalletFromStorage(oldPassword)
      await saveWalletEncrypted(fullWallet, newPassword)
    },
    []
  )

  const createCommunityAction = useCallback(
    async (name: string, description: string): Promise<Community> => {
      if (stateRef.current.walletLockState === 'locked') {
        throw new Error('Wallet is locked. Unlock to create content.')
      }
      const id = generateId()
      const community: Community = {
        id,
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        description,
        creator: state.wallet.address || 'anonymous',
        createdAt: Date.now(),
        cid: '',
        signature: '',
      }
      const sigData = { id: community.id, name: community.name, description: community.description, createdAt: community.createdAt }
      community.signature = state.wallet.privateKey
        ? signMessage(state.wallet.privateKey, JSON.stringify(sigData))
        : ''
      community.cid = await hashContent({ ...community, cid: '', signature: '' })
      await upsertCommunity(community)
      dispatch({ type: 'ADD_COMMUNITY', community })
      p2pNetwork.broadcast({ type: 'NEW_COMMUNITY', data: community })
      return community
    },
    [state.wallet.address, state.wallet.privateKey]
  )

  const createPostAction = useCallback(
    async (title: string, body: string, communityId: string): Promise<Post> => {
      if (stateRef.current.walletLockState === 'locked') {
        throw new Error('Wallet is locked. Unlock to create content.')
      }
      const id = generateId()
      const postData = { id, title, body, communityId, createdAt: Date.now() }
      const signature = state.wallet.privateKey
        ? signMessage(state.wallet.privateKey, JSON.stringify(postData))
        : ''
      const post: Post = {
        ...postData,
        author: state.wallet.address || 'anonymous',
        authorName: state.wallet.displayName || 'Anonymous',
        signature,
        cid: '',
      }
      post.cid = await hashContent(post)
      await upsertPost(post)
      dispatch({ type: 'ADD_POST', post })
      p2pNetwork.broadcast({ type: 'NEW_POST', data: post })
      return post
    },
    [state.wallet]
  )

  const createCommentAction = useCallback(
    async (body: string, postId: string, parentId: string | null): Promise<Comment> => {
      if (stateRef.current.walletLockState === 'locked') {
        throw new Error('Wallet is locked. Unlock to create content.')
      }
      const id = generateId()
      const commentData = { id, body, postId, parentId, createdAt: Date.now() }
      const signature = state.wallet.privateKey
        ? signMessage(state.wallet.privateKey, JSON.stringify(commentData))
        : ''
      const comment: Comment = {
        ...commentData,
        author: state.wallet.address || 'anonymous',
        authorName: state.wallet.displayName || 'Anonymous',
        signature,
        cid: '',
      }
      comment.cid = await hashContent(comment)
      await upsertComment(comment)
      dispatch({ type: 'ADD_COMMENT', comment })
      p2pNetwork.broadcast({ type: 'NEW_COMMENT', data: comment })
      return comment
    },
    [state.wallet]
  )

  const castVoteAction = useCallback(
    async (targetId: string, targetType: 'post' | 'comment', value: 1 | -1) => {
      if (stateRef.current.walletLockState === 'locked') {
        throw new Error('Wallet is locked. Unlock to vote.')
      }
      const voter = state.wallet.address || 'anonymous'
      const existing = state.votes.find(
        (v) => v.targetId === targetId && v.voter === voter
      )

      // Toggle: if same vote exists, skip
      if (existing && existing.value === value) {
        return
      }

      const id = existing?.id || generateId()
      const createdAt = Date.now()
      const voteData = { id, targetId, targetType, value, createdAt }
      const signature = state.wallet.privateKey
        ? signMessage(state.wallet.privateKey, JSON.stringify(voteData))
        : ''
      const vote: Vote = {
        ...voteData,
        voter,
        signature,
      }
      await upsertVote(vote)
      dispatch({ type: 'SET_VOTE', vote })
      p2pNetwork.broadcast({ type: 'VOTE', data: vote })
    },
    [state.wallet.address, state.wallet.privateKey, state.votes]
  )

  const getScore = useCallback(
    (targetId: string): number => {
      return state.votes
        .filter((v) => v.targetId === targetId)
        .reduce((sum, v) => sum + v.value, 0)
    },
    [state.votes]
  )

  const getUserVoteValue = useCallback(
    (targetId: string): number => {
      const vote = state.votes.find(
        (v) => v.targetId === targetId && v.voter === (state.wallet.address || 'anonymous')
      )
      return vote ? vote.value : 0
    },
    [state.votes, state.wallet.address]
  )

  const connectToPeerAction = useCallback(async (peerId: string) => {
    await p2pNetwork.connectToPeer(peerId)
  }, [])

  const exportData = useCallback(async () => {
    const data = await getAllData()
    return JSON.stringify(data, null, 2)
  }, [])

  const importDataAction = useCallback(async (json: string) => {
    const raw = JSON.parse(json)
    const data = validateSyncData(raw)
    await mergeData(data)
    const allData = await getAllData()
    dispatch({ type: 'LOAD_ALL', data: allData })
  }, [])

  return (
    <StoreContext.Provider
      value={{
        state,
        dispatch,
        initWalletWithPassword,
        setupPassword,
        unlockWallet: unlockWalletAction,
        lockWallet: lockWalletAction,
        changePassword,
        createCommunity: createCommunityAction,
        createPost: createPostAction,
        createComment: createCommentAction,
        castVote: castVoteAction,
        getScore,
        getUserVote: getUserVoteValue,
        connectToPeer: connectToPeerAction,
        exportData,
        importData: importDataAction,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
