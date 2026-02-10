import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
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
} from '../types'
import { db, upsertCommunity, upsertPost, upsertComment, upsertVote, upsertTip, getAllData, mergeData } from '../lib/db'
import { p2pNetwork } from '../lib/p2p'
import { hashContent, generateId } from '../lib/ipfs'
import { signMessage, loadWallet, saveWallet, createWallet, walletFromSeed } from '../lib/wallet'

type Action =
  | { type: 'SET_WALLET'; wallet: WalletState }
  | { type: 'ADD_COMMUNITY'; community: Community }
  | { type: 'ADD_POST'; post: Post }
  | { type: 'ADD_COMMENT'; comment: Comment }
  | { type: 'SET_VOTE'; vote: Vote }
  | { type: 'ADD_TIP'; tip: Tip }
  | { type: 'SET_PEERS'; peers: string[] }
  | { type: 'SET_PEER_ID'; peerId: string }
  | { type: 'SET_NETWORK_READY'; ready: boolean }
  | { type: 'LOAD_ALL'; data: Omit<AppState, 'wallet' | 'connectedPeers' | 'myPeerId' | 'networkReady'> }
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
  initWallet: (seed?: string) => void
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
    const saved = loadWallet()
    if (saved) {
      dispatch({ type: 'SET_WALLET', wallet: saved })
    }
  }, [])

  // Initialize P2P network
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
    const unsubMsg = p2pNetwork.onMessage((msg: P2PMessage) => {
      switch (msg.type) {
        case 'SYNC_RESPONSE':
          mergeData(msg.data).then(() => {
            dispatch({ type: 'MERGE_SYNC', data: msg.data })
          })
          break
        case 'NEW_COMMUNITY':
          upsertCommunity(msg.data).then(() => {
            dispatch({ type: 'ADD_COMMUNITY', community: msg.data })
          })
          break
        case 'NEW_POST':
          upsertPost(msg.data).then(() => {
            dispatch({ type: 'ADD_POST', post: msg.data })
          })
          break
        case 'NEW_COMMENT':
          upsertComment(msg.data).then(() => {
            dispatch({ type: 'ADD_COMMENT', comment: msg.data })
          })
          break
        case 'VOTE':
          upsertVote(msg.data).then(() => {
            dispatch({ type: 'SET_VOTE', vote: msg.data })
          })
          break
        case 'TIP':
          upsertTip(msg.data).then(() => {
            dispatch({ type: 'ADD_TIP', tip: msg.data })
          })
          break
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

  const initWallet = useCallback(
    (seed?: string) => {
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
      saveWallet(walletState)
      dispatch({ type: 'SET_WALLET', wallet: walletState })
    },
    []
  )

  const createCommunityAction = useCallback(
    async (name: string, description: string): Promise<Community> => {
      const id = generateId()
      const community: Community = {
        id,
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        description,
        creator: state.wallet.address || 'anonymous',
        createdAt: Date.now(),
        cid: '',
      }
      community.cid = await hashContent(community)
      await upsertCommunity(community)
      dispatch({ type: 'ADD_COMMUNITY', community })
      p2pNetwork.broadcast({ type: 'NEW_COMMUNITY', data: community })
      return community
    },
    [state.wallet.address]
  )

  const createPostAction = useCallback(
    async (title: string, body: string, communityId: string): Promise<Post> => {
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
      const voter = state.wallet.address || 'anonymous'
      const existing = state.votes.find(
        (v) => v.targetId === targetId && v.voter === voter
      )

      // Toggle: if same vote, remove (set to 0 effect by not adding)
      if (existing && existing.value === value) {
        // Remove vote - replace with opposite to zero out, then we just won't add
        // Actually, just toggle off - but our model doesn't have 0. So we'll just skip.
        return
      }

      const vote: Vote = {
        id: existing?.id || generateId(),
        targetId,
        targetType,
        voter,
        value,
        createdAt: Date.now(),
      }
      await upsertVote(vote)
      dispatch({ type: 'SET_VOTE', vote })
      p2pNetwork.broadcast({ type: 'VOTE', data: vote })
    },
    [state.wallet.address, state.votes]
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
    const data = JSON.parse(json)
    await mergeData(data)
    const allData = await getAllData()
    dispatch({ type: 'LOAD_ALL', data: allData })
  }, [])

  return (
    <StoreContext.Provider
      value={{
        state,
        dispatch,
        initWallet,
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
