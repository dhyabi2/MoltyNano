import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'

export default function CommunitiesPage() {
  const { state, createCommunity } = useStore()
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Communities</h1>
      </div>

      <CreateCommunityForm
        onCreated={(name) => navigate(`/c/${name}`)}
      />

      {state.communities.length === 0 ? (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center">
          <p className="text-sm text-gray-500">
            No communities exist yet. Create the first one!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...state.communities]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((community) => {
              const postCount = state.posts.filter(
                (p) => p.communityId === community.id
              ).length
              return (
                <Link
                  key={community.id}
                  to={`/c/${community.name}`}
                  className="block bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-orange-400">
                        m/{community.name}
                      </h3>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {community.description}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 ml-4">
                      {postCount} post{postCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Link>
              )
            })}
        </div>
      )}
    </div>
  )
}

function CreateCommunityForm({ onCreated }: { onCreated: (name: string) => void }) {
  const { createCommunity } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !description.trim()) return
    setCreating(true)
    try {
      const community = await createCommunity(name.trim(), description.trim())
      setName('')
      setDescription('')
      setExpanded(false)
      onCreated(community.name)
    } finally {
      setCreating(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-left hover:border-gray-700 transition-colors"
      >
        <span className="text-sm text-gray-500">+ Create a new community</span>
      </button>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">Create Community</h3>
      <div>
        <label className="text-xs text-gray-400 block mb-1">Name</label>
        <div className="flex items-center">
          <span className="text-sm text-gray-500 mr-1">m/</span>
          <input
            type="text"
            value={name}
            onChange={(e) =>
              setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            }
            placeholder="community_name"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
            autoFocus
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this community about?"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setExpanded(false)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !description.trim() || creating}
          className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  )
}
