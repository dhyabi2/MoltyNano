import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'

interface Props {
  communityId?: string
  communityName?: string
}

export default function CreatePost({ communityId, communityName }: Props) {
  const { state, createPost } = useStore()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedCommunity, setSelectedCommunity] = useState(communityId || '')
  const [expanded, setExpanded] = useState(false)
  const [posting, setPosting] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim() || !selectedCommunity) return
    setPosting(true)
    try {
      const post = await createPost(title.trim(), body.trim(), selectedCommunity)
      const comm = state.communities.find((c) => c.id === selectedCommunity)
      setTitle('')
      setBody('')
      setExpanded(false)
      navigate(`/c/${comm?.name || 'general'}/post/${post.id}`)
    } finally {
      setPosting(false)
    }
  }

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className="bg-gray-900 border border-gray-800 rounded-lg p-3 cursor-text hover:border-gray-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 text-sm">
            {state.wallet.address ? state.wallet.displayName?.[0]?.toUpperCase() || 'N' : '?'}
          </div>
          <span className="text-sm text-gray-500">Create a post...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">Create a Post</h3>

      {!communityId && (
        <select
          value={selectedCommunity}
          onChange={(e) => setSelectedCommunity(e.target.value)}
          className="w-full mb-3 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
        >
          <option value="">Choose a community</option>
          {state.communities.map((c) => (
            <option key={c.id} value={c.id}>
              m/{c.name}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full mb-3 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
        autoFocus
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Text (optional)"
        className="w-full mb-3 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
        rows={4}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500 truncate">
          Posting as {state.wallet.displayName || 'Anonymous'}
          {state.wallet.address ? ' (signed)' : ''}
        </span>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setExpanded(false)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !selectedCommunity || posting}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
