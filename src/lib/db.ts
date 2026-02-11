import Dexie, { type Table } from 'dexie'
import type { Community, Post, Comment, Vote, Tip } from '../types'
import { verifyCID } from './ipfs'

class MoltyNanoDB extends Dexie {
  communities!: Table<Community>
  posts!: Table<Post>
  comments!: Table<Comment>
  votes!: Table<Vote>
  tips!: Table<Tip>

  constructor() {
    super('moltynano')
    this.version(1).stores({
      communities: 'id, name, creator, createdAt',
      posts: 'id, communityId, author, createdAt',
      comments: 'id, postId, parentId, author, createdAt',
      votes: 'id, targetId, voter, [targetId+voter]',
      tips: 'id, from, to, targetId, createdAt',
    })
  }
}

export const db = new MoltyNanoDB()

// Cross-tab DB change notification via BroadcastChannel
const dbChangeChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('moltynano-db-changes')
  : null

type DBChangeHandler = () => void
const dbChangeHandlers = new Set<DBChangeHandler>()

export function onDBChange(handler: DBChangeHandler): () => void {
  dbChangeHandlers.add(handler)
  return () => dbChangeHandlers.delete(handler)
}

function notifyDBChange() {
  dbChangeChannel?.postMessage({ type: 'DB_CHANGED', ts: Date.now() })
}

// Listen for changes from other tabs
if (dbChangeChannel) {
  dbChangeChannel.onmessage = () => {
    for (const handler of dbChangeHandlers) {
      handler()
    }
  }
}

// Retry wrapper for DB operations with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      const delay = Math.min(100 * Math.pow(2, attempt), 2000)
      await new Promise(r => setTimeout(r, delay))
      console.warn(`[DB] Retry attempt ${attempt + 1} after error:`, err)
    }
  }
  throw new Error('Unreachable')
}

// Upsert helpers - insert if not exists, with CID verification
export async function upsertCommunity(c: Community, skipCIDCheck = false) {
  return withRetry(async () => {
    const existing = await db.communities.get(c.id)
    if (!existing) {
      if (!skipCIDCheck && c.cid) {
        // CID was computed with cid: '' in the object, so verify the same way
        const valid = await verifyCID({ ...c, cid: '' }, c.cid)
        if (!valid) {
          console.warn('[DB] Rejected community with invalid CID:', c.id)
          return false
        }
      }
      await db.communities.put(c)
      notifyDBChange()
      return true
    }
    return false
  })
}

export async function upsertPost(p: Post, skipCIDCheck = false) {
  return withRetry(async () => {
    const existing = await db.posts.get(p.id)
    if (!existing) {
      if (!skipCIDCheck && p.cid) {
        // CID was computed with cid: '' in the object, so verify the same way
        const valid = await verifyCID({ ...p, cid: '' }, p.cid)
        if (!valid) {
          console.warn('[DB] Rejected post with invalid CID:', p.id)
          return false
        }
      }
      await db.posts.put(p)
      notifyDBChange()
      return true
    }
    return false
  })
}

export async function upsertComment(c: Comment, skipCIDCheck = false) {
  return withRetry(async () => {
    const existing = await db.comments.get(c.id)
    if (!existing) {
      if (!skipCIDCheck && c.cid) {
        // CID was computed with cid: '' in the object, so verify the same way
        const valid = await verifyCID({ ...c, cid: '' }, c.cid)
        if (!valid) {
          console.warn('[DB] Rejected comment with invalid CID:', c.id)
          return false
        }
      }
      await db.comments.put(c)
      notifyDBChange()
      return true
    }
    return false
  })
}

export async function upsertVote(v: Vote) {
  return withRetry(async () => {
    // Replace existing vote by same voter on same target
    const existing = await db.votes
      .where('[targetId+voter]')
      .equals([v.targetId, v.voter])
      .first()
    if (existing) {
      // Conflict resolution: only update if newer timestamp
      if (v.createdAt >= existing.createdAt) {
        await db.votes.update(existing.id, { value: v.value, createdAt: v.createdAt })
        notifyDBChange()
      }
    } else {
      await db.votes.put(v)
      notifyDBChange()
    }
    return true
  })
}

export async function upsertTip(t: Tip) {
  return withRetry(async () => {
    const existing = await db.tips.get(t.id)
    if (!existing) {
      await db.tips.put(t)
      notifyDBChange()
      return true
    }
    return false
  })
}

// Data validation helpers
function isValidCommunity(c: unknown): c is Community {
  const o = c as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' &&
    typeof o.description === 'string' && typeof o.creator === 'string' &&
    typeof o.createdAt === 'number'
}

function isValidPost(p: unknown): p is Post {
  const o = p as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.title === 'string' &&
    typeof o.body === 'string' && typeof o.author === 'string' &&
    typeof o.communityId === 'string' && typeof o.createdAt === 'number'
}

function isValidComment(c: unknown): c is Comment {
  const o = c as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.body === 'string' &&
    typeof o.author === 'string' && typeof o.postId === 'string' &&
    typeof o.createdAt === 'number'
}

function isValidVote(v: unknown): v is Vote {
  const o = v as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.targetId === 'string' &&
    typeof o.voter === 'string' && (o.value === 1 || o.value === -1) &&
    typeof o.createdAt === 'number'
}

function isValidTip(t: unknown): t is Tip {
  const o = t as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.from === 'string' &&
    typeof o.to === 'string' && typeof o.amountRaw === 'string' &&
    typeof o.targetId === 'string' && typeof o.createdAt === 'number'
}

// Validate and filter sync data, returning only valid records
export function validateSyncData(data: unknown): {
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
} {
  const d = data as Record<string, unknown[]>
  if (!d || typeof d !== 'object') {
    return { communities: [], posts: [], comments: [], votes: [], tips: [] }
  }
  return {
    communities: Array.isArray(d.communities) ? d.communities.filter(isValidCommunity) : [],
    posts: Array.isArray(d.posts) ? d.posts.filter(isValidPost) : [],
    comments: Array.isArray(d.comments) ? d.comments.filter(isValidComment) : [],
    votes: Array.isArray(d.votes) ? d.votes.filter(isValidVote) : [],
    tips: Array.isArray(d.tips) ? d.tips.filter(isValidTip) : [],
  }
}

export async function getAllData() {
  const [communities, posts, comments, votes, tips] = await Promise.all([
    db.communities.toArray(),
    db.posts.toArray(),
    db.comments.toArray(),
    db.votes.toArray(),
    db.tips.toArray(),
  ])
  return { communities, posts, comments, votes, tips }
}

// Get data created after a given timestamp (for delta sync)
export async function getDataSince(since: number) {
  const [communities, posts, comments, votes, tips] = await Promise.all([
    db.communities.where('createdAt').above(since).toArray(),
    db.posts.where('createdAt').above(since).toArray(),
    db.comments.where('createdAt').above(since).toArray(),
    db.votes.where('createdAt').above(since).toArray(),
    db.tips.where('createdAt').above(since).toArray(),
  ])
  return { communities, posts, comments, votes, tips }
}

export async function mergeData(data: {
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
}) {
  // Use bulk operations for better performance on large syncs
  await db.transaction('rw', [db.communities, db.posts, db.comments, db.votes, db.tips], async () => {
    // Bulk upsert communities (skip existing)
    if (data.communities.length > 0) {
      const existingIds = new Set((await db.communities.toArray()).map(c => c.id))
      const newCommunities = data.communities.filter(c => !existingIds.has(c.id))
      if (newCommunities.length > 0) await db.communities.bulkPut(newCommunities)
    }

    // Bulk upsert posts (skip existing)
    if (data.posts.length > 0) {
      const existingIds = new Set((await db.posts.toArray()).map(p => p.id))
      const newPosts = data.posts.filter(p => !existingIds.has(p.id))
      if (newPosts.length > 0) await db.posts.bulkPut(newPosts)
    }

    // Bulk upsert comments (skip existing)
    if (data.comments.length > 0) {
      const existingIds = new Set((await db.comments.toArray()).map(c => c.id))
      const newComments = data.comments.filter(c => !existingIds.has(c.id))
      if (newComments.length > 0) await db.comments.bulkPut(newComments)
    }

    // Votes need special handling (compound key dedup + timestamp conflict resolution)
    for (const v of data.votes) {
      const existing = await db.votes
        .where('[targetId+voter]')
        .equals([v.targetId, v.voter])
        .first()
      if (existing) {
        if (v.createdAt >= existing.createdAt) {
          await db.votes.update(existing.id, { value: v.value, createdAt: v.createdAt })
        }
      } else {
        await db.votes.put(v)
      }
    }

    // Bulk upsert tips (skip existing)
    if (data.tips.length > 0) {
      const existingIds = new Set((await db.tips.toArray()).map(t => t.id))
      const newTips = data.tips.filter(t => !existingIds.has(t.id))
      if (newTips.length > 0) await db.tips.bulkPut(newTips)
    }
  })

  notifyDBChange()
}

export function getVoteScore(targetId: string): Promise<number> {
  return db.votes
    .where('targetId')
    .equals(targetId)
    .toArray()
    .then(votes => votes.reduce((sum, v) => sum + v.value, 0))
}

export function getUserVote(targetId: string, voter: string): Promise<Vote | undefined> {
  return db.votes
    .where('[targetId+voter]')
    .equals([targetId, voter])
    .first()
}

// Periodic data integrity check - verify DB is readable and report stats
export async function checkDataIntegrity(): Promise<{
  ok: boolean
  counts: { communities: number; posts: number; comments: number; votes: number; tips: number }
  errors: string[]
}> {
  const errors: string[] = []
  try {
    const [communities, posts, comments, votes, tips] = await Promise.all([
      db.communities.count(),
      db.posts.count(),
      db.comments.count(),
      db.votes.count(),
      db.tips.count(),
    ])

    // Verify we can actually read records (not just count)
    const samplePost = await db.posts.limit(1).first()
    if (posts > 0 && !samplePost) {
      errors.push('Posts table reports count but cannot read records')
    }

    const sampleCommunity = await db.communities.limit(1).first()
    if (communities > 0 && !sampleCommunity) {
      errors.push('Communities table reports count but cannot read records')
    }

    return {
      ok: errors.length === 0,
      counts: { communities, posts, comments, votes, tips },
      errors,
    }
  } catch (err) {
    return {
      ok: false,
      counts: { communities: 0, posts: 0, comments: 0, votes: 0, tips: 0 },
      errors: [`DB integrity check failed: ${err}`],
    }
  }
}
