import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'

export default function Sidebar() {
  const { state } = useStore()

  const sortedCommunities = [...state.communities].sort(
    (a, b) => b.createdAt - a.createdAt
  )

  return (
    <aside className="w-64 shrink-0 hidden lg:block">
      <div className="sticky top-14 space-y-4">
        {/* About */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">About Moltbook</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            A fully decentralized P2P forum. No servers, no accounts —
            just peers sharing content via WebRTC. Identity via Nano (XNO) wallets.
            Content is content-addressed and synced peer-to-peer.
          </p>
        </div>

        {/* Communities */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200">Communities</h3>
            <Link
              to="/communities/create"
              className="text-xs text-orange-500 hover:text-orange-400"
            >
              + New
            </Link>
          </div>
          {sortedCommunities.length === 0 ? (
            <p className="text-xs text-gray-500">No communities yet. Create one!</p>
          ) : (
            <ul className="space-y-1">
              {sortedCommunities.slice(0, 15).map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/c/${c.name}`}
                    className="block text-sm text-gray-400 hover:text-orange-400 py-0.5"
                  >
                    m/{c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Network info */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">Network</h3>
          <div className="space-y-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Status</span>
              <span className={state.networkReady ? 'text-green-400' : 'text-red-400'}>
                {state.networkReady ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Peers</span>
              <span>{state.connectedPeers.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Posts</span>
              <span>{state.posts.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Comments</span>
              <span>{state.comments.length}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
