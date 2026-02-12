import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { shortenAddress } from '../lib/nano-rpc'

export default function Navbar() {
  const { state } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
        {/* Left: Logo + desktop nav */}
        <div className="flex items-center gap-3 sm:gap-6">
          <Link to="/" className="text-lg font-bold text-orange-500 hover:text-orange-400">
            MoltyNano
          </Link>
          <Link to="/" className="hidden sm:inline text-sm text-gray-400 hover:text-gray-200 py-2">
            Home
          </Link>
          <Link to="/communities" className="hidden sm:inline text-sm text-gray-400 hover:text-gray-200 py-2">
            Communities
          </Link>
        </div>

        {/* Right: status + wallet + mobile hamburger */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Peer status */}
          <Link to="/network" className="flex items-center gap-1.5 text-xs py-2 px-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                state.networkReady ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-gray-400 hidden xs:inline">
              {state.connectedPeers.length} peer{state.connectedPeers.length !== 1 ? 's' : ''}
            </span>
          </Link>

          {/* Wallet */}
          <Link
            to="/wallet"
            className="text-xs px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1.5"
          >
            {state.walletLockState === 'locked' && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
            )}
            {state.wallet.address
              ? shortenAddress(state.wallet.address)
              : 'Wallet'}
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-2 text-gray-400 hover:text-gray-200"
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {menuOpen ? (
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-800 bg-gray-900 px-3 pb-3">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="block py-3 text-sm text-gray-300 hover:text-white border-b border-gray-800"
          >
            Home
          </Link>
          <Link
            to="/communities"
            onClick={() => setMenuOpen(false)}
            className="block py-3 text-sm text-gray-300 hover:text-white border-b border-gray-800"
          >
            Communities
          </Link>
          <Link
            to="/network"
            onClick={() => setMenuOpen(false)}
            className="block py-3 text-sm text-gray-300 hover:text-white border-b border-gray-800"
          >
            Network ({state.connectedPeers.length} peers)
          </Link>
          <Link
            to="/wallet"
            onClick={() => setMenuOpen(false)}
            className="block py-3 text-sm text-gray-300 hover:text-white"
          >
            {state.wallet.address ? shortenAddress(state.wallet.address) : 'Connect Wallet'}
          </Link>
        </div>
      )}
    </nav>
  )
}
