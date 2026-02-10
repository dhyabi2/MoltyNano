import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { shortenAddress } from '../lib/nano-rpc'

export default function Navbar() {
  const { state } = useStore()

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-orange-500 hover:text-orange-400">
            Moltbook
          </Link>
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">
            Home
          </Link>
          <Link to="/communities" className="text-sm text-gray-400 hover:text-gray-200">
            Communities
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {/* Peer status indicator */}
          <Link to="/network" className="flex items-center gap-1.5 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                state.networkReady ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-gray-400">
              {state.connectedPeers.length} peer{state.connectedPeers.length !== 1 ? 's' : ''}
            </span>
          </Link>

          {/* Wallet */}
          <Link
            to="/wallet"
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            {state.wallet.address
              ? shortenAddress(state.wallet.address)
              : 'Connect Wallet'}
          </Link>
        </div>
      </div>
    </nav>
  )
}
