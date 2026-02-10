import Dexie, { type Table } from 'dexie'
import type { Community, Post, Comment, Vote, Tip } from '../types'

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

// Upsert helpers - insert if not exists, update if newer
export async function upsertCommunity(c: Community) {
  const existing = await db.communities.get(c.id)
  if (!existing) {
    await db.communities.put(c)
    return true
  }
  return false
}

export async function upsertPost(p: Post) {
  const existing = await db.posts.get(p.id)
  if (!existing) {
    await db.posts.put(p)
    return true
  }
  return false
}

export async function upsertComment(c: Comment) {
  const existing = await db.comments.get(c.id)
  if (!existing) {
    await db.comments.put(c)
    return true
  }
  return false
}

export async function upsertVote(v: Vote) {
  // Replace existing vote by same voter on same target
  const existing = await db.votes
    .where('[targetId+voter]')
    .equals([v.targetId, v.voter])
    .first()
  if (existing) {
    await db.votes.update(existing.id, { value: v.value, createdAt: v.createdAt })
  } else {
    await db.votes.put(v)
  }
  return true
}

export async function upsertTip(t: Tip) {
  const existing = await db.tips.get(t.id)
  if (!existing) {
    await db.tips.put(t)
    return true
  }
  return false
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

export async function mergeData(data: {
  communities: Community[]
  posts: Post[]
  comments: Comment[]
  votes: Vote[]
  tips: Tip[]
}) {
  await Promise.all([
    ...data.communities.map(upsertCommunity),
    ...data.posts.map(upsertPost),
    ...data.comments.map(upsertComment),
    ...data.votes.map(upsertVote),
    ...data.tips.map(upsertTip),
  ])
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
