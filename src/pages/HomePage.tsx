import { useStore } from '../hooks/useStore'
import Sidebar from '../components/Sidebar'
import PostCard from '../components/PostCard'
import CreatePost from '../components/CreatePost'

export default function HomePage() {
  const { state } = useStore()

  const sortedPosts = [...state.posts].sort((a, b) => {
    // Sort by score first, then by recency
    const scoreA = state.votes
      .filter((v) => v.targetId === a.id)
      .reduce((sum, v) => sum + v.value, 0)
    const scoreB = state.votes
      .filter((v) => v.targetId === b.id)
      .reduce((sum, v) => sum + v.value, 0)

    if (scoreB !== scoreA) return scoreB - scoreA
    return b.createdAt - a.createdAt
  })

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex gap-4">
      {/* Main feed */}
      <div className="flex-1 min-w-0 space-y-3">
        <CreatePost />

        {sortedPosts.length === 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-5 sm:p-8 text-center">
            <h2 className="text-base sm:text-lg font-semibold text-gray-300 mb-2">Welcome to MoltyNano</h2>
            <p className="text-sm text-gray-500 mb-4">
              A decentralized P2P forum. No servers needed — content syncs directly between peers.
            </p>
            <div className="text-sm text-gray-400 space-y-2">
              <p>1. Create or join a community</p>
              <p>2. Connect your Nano wallet for verified identity</p>
              <p>3. Connect to peers to sync content</p>
              <p>4. Start posting and commenting!</p>
            </div>
          </div>
        ) : (
          sortedPosts.map((post) => <PostCard key={post.id} postId={post.id} />)
        )}
      </div>

      <Sidebar />
    </div>
  )
}
