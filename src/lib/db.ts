import Dexie, { type Table } from 'dexie'
import type { Community, Post, Comment, Vote, Tip } from '../types'
import { verifyCID } from './ipfs'
import { verifyPostSignature, verifyCommentSignature, verifyCommunitySignature, verifyVoteSignature, verifyTipSignature } from './wallet'

// Content size limits
const MAX_TITLE_LENGTH = 300
const MAX_BODY_LENGTH = 40_000
const MAX_COMMENT_LENGTH = 10_000
const MAX_NAME_LENGTH = 50
const MAX_DESCRIPTION_LENGTH = 500
const MAX_DISPLAY_NAME_LENGTH = 50
const MAX_TIMESTAMP_DRIFT = 5 * 60 * 1000 // 5 minutes into future

export { MAX_TITLE_LENGTH, MAX_BODY_LENGTH, MAX_COMMENT_LENGTH, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_DISPLAY_NAME_LENGTH }

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

// Timestamp validation: reject timestamps more than 5 min in the future
function isReasonableTimestamp(ts: number): boolean {
  if (typeof ts !== 'number' || isNaN(ts) || !isFinite(ts)) return false
  if (ts < 0) return false
  if (ts > Date.now() + MAX_TIMESTAMP_DRIFT) return false
  return true
}

// Upsert helpers - insert if not exists, with CID verification
export async function upsertCommunity(c: Community, skipCIDCheck = false) {
  return withRetry(async () => {
    const existing = await db.communities.get(c.id)
    if (!existing) {
      if (!skipCIDCheck && c.cid) {
        // CID was computed with cid: '' and signature: '' in the object, so verify the same way
        const valid = await verifyCID({ ...c, cid: '', signature: '' }, c.cid)
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
        await db.votes.update(existing.id, { value: v.value, createdAt: v.createdAt, signature: v.signature })
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

// Data validation helpers with size limits and timestamp checks
function isValidCommunity(c: unknown): c is Community {
  const o = c as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' &&
    typeof o.description === 'string' && typeof o.creator === 'string' &&
    typeof o.createdAt === 'number' &&
    o.name.length <= MAX_NAME_LENGTH &&
    o.description.length <= MAX_DESCRIPTION_LENGTH &&
    (o.id as string).length <= 100 &&
    isReasonableTimestamp(o.createdAt as number)
}

function isValidPost(p: unknown): p is Post {
  const o = p as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.title === 'string' &&
    typeof o.body === 'string' && typeof o.author === 'string' &&
    typeof o.communityId === 'string' && typeof o.createdAt === 'number' &&
    (o.title as string).length <= MAX_TITLE_LENGTH &&
    (o.body as string).length <= MAX_BODY_LENGTH &&
    (o.id as string).length <= 100 &&
    isReasonableTimestamp(o.createdAt as number)
}

function isValidComment(c: unknown): c is Comment {
  const o = c as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.body === 'string' &&
    typeof o.author === 'string' && typeof o.postId === 'string' &&
    typeof o.createdAt === 'number' &&
    (o.body as string).length <= MAX_COMMENT_LENGTH &&
    (o.id as string).length <= 100 &&
    isReasonableTimestamp(o.createdAt as number)
}

function isValidVote(v: unknown): v is Vote {
  const o = v as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.targetId === 'string' &&
    typeof o.voter === 'string' && (o.value === 1 || o.value === -1) &&
    typeof o.createdAt === 'number' &&
    (typeof o.targetType === 'string' && (o.targetType === 'post' || o.targetType === 'comment')) &&
    (o.id as string).length <= 100 &&
    isReasonableTimestamp(o.createdAt as number)
}

function isValidTip(t: unknown): t is Tip {
  const o = t as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.from === 'string' &&
    typeof o.to === 'string' && typeof o.amountRaw === 'string' &&
    typeof o.targetId === 'string' && typeof o.createdAt === 'number' &&
    /^[0-9]+$/.test(o.amountRaw as string) &&
    (o.id as string).length <= 100 &&
    (o.amountRaw as string).length <= 40 &&
    isReasonableTimestamp(o.createdAt as number)
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

// Verify signatures on sync data, filtering out items with invalid signatures
export function verifySyncSignatures(data: {
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
}): {
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
} {
  return {
    communities: data.communities.filter(c => verifyCommunitySignature(c)),
    posts: data.posts.filter(p => verifyPostSignature(p)),
    comments: data.comments.filter(c => verifyCommentSignature(c)),
    votes: data.votes.filter(v => verifyVoteSignature(v)),
    tips: data.tips.filter(t => verifyTipSignature(t)),
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
  // Verify signatures before merging
  const verified = verifySyncSignatures(data)

  // Use bulk operations for better performance on large syncs
  await db.transaction('rw', [db.communities, db.posts, db.comments, db.votes, db.tips], async () => {
    // Bulk upsert communities (skip existing)
    if (verified.communities.length > 0) {
      const existingIds = new Set((await db.communities.toArray()).map(c => c.id))
      const newCommunities = verified.communities.filter(c => !existingIds.has(c.id))
      if (newCommunities.length > 0) await db.communities.bulkPut(newCommunities)
    }

    // Bulk upsert posts (skip existing)
    if (verified.posts.length > 0) {
      const existingIds = new Set((await db.posts.toArray()).map(p => p.id))
      const newPosts = verified.posts.filter(p => !existingIds.has(p.id))
      if (newPosts.length > 0) await db.posts.bulkPut(newPosts)
    }

    // Bulk upsert comments (skip existing)
    if (verified.comments.length > 0) {
      const existingIds = new Set((await db.comments.toArray()).map(c => c.id))
      const newComments = verified.comments.filter(c => !existingIds.has(c.id))
      if (newComments.length > 0) await db.comments.bulkPut(newComments)
    }

    // Votes need special handling (compound key dedup + timestamp conflict resolution)
    for (const v of verified.votes) {
      const existing = await db.votes
        .where('[targetId+voter]')
        .equals([v.targetId, v.voter])
        .first()
      if (existing) {
        if (v.createdAt >= existing.createdAt) {
          await db.votes.update(existing.id, { value: v.value, createdAt: v.createdAt, signature: v.signature })
        }
      } else {
        await db.votes.put(v)
      }
    }

    // Bulk upsert tips (skip existing)
    if (verified.tips.length > 0) {
      const existingIds = new Set((await db.tips.toArray()).map(t => t.id))
      const newTips = verified.tips.filter(t => !existingIds.has(t.id))
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
