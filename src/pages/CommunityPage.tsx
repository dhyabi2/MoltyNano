import { useParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import Sidebar from '../components/Sidebar'
import PostCard from '../components/PostCard'
import CreatePost from '../components/CreatePost'

export default function CommunityPage() {
  const { name } = useParams<{ name: string }>()
  const { state } = useStore()

  const community = state.communities.find((c) => c.name === name)

  if (!community) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold text-gray-300 mb-2">
          Community "m/{name}" not found
        </h2>
        <p className="text-sm text-gray-500">
          It may not exist yet, or you might not be connected to peers who have it.
        </p>
      </div>
    )
  }

  const communityPosts = state.posts
    .filter((p) => p.communityId === community.id)
    .sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 flex gap-4">
      <div className="flex-1 min-w-0 space-y-3">
        {/* Community header */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h1 className="text-xl font-bold text-gray-100">m/{community.name}</h1>
          <p className="text-sm text-gray-400 mt-1">{community.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>{communityPosts.length} posts</span>
            <span>Created {new Date(community.createdAt).toLocaleDateString()}</span>
            {community.cid && (
              <span className="font-mono text-gray-600" title={community.cid}>
                CID: {community.cid.slice(0, 16)}...
              </span>
            )}
          </div>
        </div>

        <CreatePost communityId={community.id} communityName={community.name} />

        {communityPosts.length === 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center">
            <p className="text-sm text-gray-500">
              No posts in this community yet. Be the first to post!
            </p>
          </div>
        ) : (
          communityPosts.map((post) => <PostCard key={post.id} postId={post.id} />)
        )}
      </div>

      <Sidebar />
    </div>
  )
}
