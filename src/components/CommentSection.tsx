import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import VoteButtons from './VoteButtons'
import TipButton from './TipButton'
import { shortenAddress } from '../lib/nano-rpc'

interface CommentProps {
  commentId: string
  depth: number
}

function CommentItem({ commentId, depth }: CommentProps) {
  const { state, createComment } = useStore()
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')

  const comment = state.comments.find((c) => c.id === commentId)
  if (!comment) return null

  const replies = state.comments
    .filter((c) => c.parentId === commentId)
    .sort((a, b) => a.createdAt - b.createdAt)

  const timeAgo = getTimeAgo(comment.createdAt)

  const handleReply = async () => {
    if (!replyText.trim()) return
    await createComment(replyText.trim(), comment.postId, comment.id)
    setReplyText('')
    setReplying(false)
  }

  return (
    <div className={`${depth > 0 ? 'ml-2 sm:ml-4 pl-2 sm:pl-3 border-l border-gray-800' : ''}`}>
      <div className="py-2">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-gray-500 mb-1">
          <span className="text-gray-400 truncate max-w-[150px] sm:max-w-none" title={comment.author}>
            {comment.authorName || shortenAddress(comment.author)}
          </span>
          <span>·</span>
          <span>{timeAgo}</span>
          {comment.signature && (
            <span className="text-green-700 text-[10px]" title="Cryptographically signed">
              signed
            </span>
          )}
        </div>

        {/* Body */}
        <p className="text-sm text-gray-300 mb-1.5 whitespace-pre-wrap break-words">{comment.body}</p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <VoteButtons targetId={comment.id} targetType="comment" horizontal />
          <button
            onClick={() => setReplying(!replying)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Reply
          </button>
          <TipButton targetId={comment.id} targetType="comment" recipientAddress={comment.author} />
        </div>

        {/* Reply form */}
        {replying && (
          <div className="mt-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
              rows={2}
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleReply}
                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded"
              >
                Reply
              </button>
              <button
                onClick={() => setReplying(false)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested replies */}
      {replies.map((r) => (
        <CommentItem key={r.id} commentId={r.id} depth={depth + 1} />
      ))}
    </div>
  )
}

interface Props {
  postId: string
}

export default function CommentSection({ postId }: Props) {
  const { state, createComment } = useStore()
  const [commentText, setCommentText] = useState('')

  const topLevelComments = state.comments
    .filter((c) => c.postId === postId && !c.parentId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const handleSubmit = async () => {
    if (!commentText.trim()) return
    await createComment(commentText.trim(), postId, null)
    setCommentText('')
  }

  return (
    <div>
      {/* Comment input */}
      <div className="mb-4">
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={
            state.wallet.address
              ? 'What are your thoughts?'
              : 'Connect wallet to comment with verified identity...'
          }
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
          rows={3}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSubmit}
            disabled={!commentText.trim()}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
          >
            Comment
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-1">
        {topLevelComments.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No comments yet. Be the first!
          </p>
        ) : (
          topLevelComments.map((c) => (
            <CommentItem key={c.id} commentId={c.id} depth={0} />
          ))
        )}
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
