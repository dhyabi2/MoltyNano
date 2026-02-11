import { useStore } from '../hooks/useStore'

interface Props {
  targetId: string
  targetType: 'post' | 'comment'
  horizontal?: boolean
}

export default function VoteButtons({ targetId, targetType, horizontal }: Props) {
  const { castVote, getScore, getUserVote } = useStore()
  const score = getScore(targetId)
  const userVote = getUserVote(targetId)

  const containerClass = horizontal
    ? 'flex items-center gap-1'
    : 'flex flex-col items-center gap-0.5'

  return (
    <div className={containerClass}>
      <button
        onClick={() => castVote(targetId, targetType, 1)}
        className={`p-2 rounded hover:bg-gray-700 transition-colors ${
          userVote === 1 ? 'text-orange-500' : 'text-gray-500 hover:text-gray-300'
        }`}
        title="Upvote"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4l-8 8h5v8h6v-8h5z" />
        </svg>
      </button>
      <span
        className={`text-xs font-semibold min-w-[20px] text-center ${
          score > 0
            ? 'text-orange-500'
            : score < 0
            ? 'text-blue-500'
            : 'text-gray-500'
        }`}
      >
        {score}
      </span>
      <button
        onClick={() => castVote(targetId, targetType, -1)}
        className={`p-2 rounded hover:bg-gray-700 transition-colors ${
          userVote === -1 ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'
        }`}
        title="Downvote"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20l8-8h-5V4H9v8H4z" />
        </svg>
      </button>
    </div>
  )
}
