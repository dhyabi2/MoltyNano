import { useParams, Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import VoteButtons from '../components/VoteButtons'
import CommentSection from '../components/CommentSection'
import TipButton from '../components/TipButton'
import { shortenAddress } from '../lib/nano-rpc'

export default function PostPage() {
  const { postId } = useParams<{ name: string; postId: string }>()
  const { state } = useStore()

  const post = state.posts.find((p) => p.id === postId)
  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold text-gray-300 mb-2">Post not found</h2>
        <p className="text-sm text-gray-500">
          It may not have synced yet, or you might not be connected to peers who have it.
        </p>
      </div>
    )
  }

  const community = state.communities.find((c) => c.id === post.communityId)
  const commentCount = state.comments.filter((c) => c.postId === post.id).length
  const tipTotal = state.tips
    .filter((t) => t.targetId === post.id)
    .reduce((sum, t) => sum + Number(BigInt(t.amountRaw || '0')) / 1e30, 0)

  const timeAgo = getTimeAgo(post.createdAt)

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
      {/* Post */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          {community && (
            <>
              <Link
                to={`/c/${community.name}`}
                className="font-semibold text-gray-300 hover:text-orange-400"
              >
                m/{community.name}
              </Link>
              <span>·</span>
            </>
          )}
          <span>
            Posted by{' '}
            <span className="text-gray-400" title={post.author}>
              {post.authorName || shortenAddress(post.author)}
            </span>
          </span>
          <span>·</span>
          <span>{timeAgo}</span>
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-gray-100 mb-3">{post.title}</h1>

        {/* Body */}
        {post.body && (
          <div className="text-sm text-gray-300 mb-4 whitespace-pre-wrap leading-relaxed">
            {post.body}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2 border-t border-gray-800">
          <VoteButtons targetId={post.id} targetType="post" horizontal />
          <span className="text-xs text-gray-500">
            {commentCount} comment{commentCount !== 1 ? 's' : ''}
          </span>
          <TipButton
            targetId={post.id}
            targetType="post"
            recipientAddress={post.author}
          />
          {tipTotal > 0 && (
            <span className="text-xs text-green-500">
              {tipTotal.toFixed(4)} XNO tipped
            </span>
          )}
          {post.signature && (
            <span className="text-xs text-green-700" title="Cryptographically signed with Nano key">
              Signed
            </span>
          )}
          {post.cid && (
            <span className="text-xs font-mono text-gray-600" title={post.cid}>
              CID: {post.cid.slice(0, 16)}...
            </span>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">
          Comments ({commentCount})
        </h2>
        <CommentSection postId={post.id} />
      </div>
    </div>
  )
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
