import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import VoteButtons from './VoteButtons'
import { shortenAddress } from '../lib/nano-rpc'
import { safeBigInt } from '../lib/wallet'

interface Props {
  postId: string
}

export default function PostCard({ postId }: Props) {
  const { state } = useStore()
  const post = state.posts.find((p) => p.id === postId)
  if (!post) return null

  const community = state.communities.find((c) => c.id === post.communityId)
  const commentCount = state.comments.filter((c) => c.postId === post.id).length
  const tipTotal = state.tips
    .filter((t) => t.targetId === post.id)
    .reduce((sum, t) => sum + Number(safeBigInt(t.amountRaw)) / 1e30, 0)

  const timeAgo = getTimeAgo(post.createdAt)

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex">
        {/* Vote column */}
        <div className="p-2 sm:p-3 flex items-start">
          <VoteButtons targetId={post.id} targetType="post" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-2 sm:py-3 pr-3 sm:pr-4">
          {/* Meta line */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-gray-500 mb-1">
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
            <span className="truncate">
              <span className="text-gray-400" title={post.author}>
                {post.authorName || shortenAddress(post.author)}
              </span>
            </span>
            <span>·</span>
            <span>{timeAgo}</span>
          </div>

          {/* Title */}
          <Link
            to={`/c/${community?.name || 'general'}/post/${post.id}`}
            className="block"
          >
            <h3 className="text-sm sm:text-base font-medium text-gray-100 hover:text-orange-400 mb-1 break-words">
              {post.title}
            </h3>
          </Link>

          {/* Body preview */}
          {post.body && (
            <p className="text-sm text-gray-400 line-clamp-3 mb-2 break-words">{post.body}</p>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-500">
            <Link
              to={`/c/${community?.name || 'general'}/post/${post.id}`}
              className="flex items-center gap-1 hover:text-gray-300 py-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              {commentCount} comment{commentCount !== 1 ? 's' : ''}
            </Link>
            {tipTotal > 0 && (
              <span className="text-green-500">
                {tipTotal.toFixed(4)} XNO
              </span>
            )}
            {post.signature && (
              <span className="text-green-700" title="Cryptographically signed">
                signed
              </span>
            )}
          </div>
        </div>
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
