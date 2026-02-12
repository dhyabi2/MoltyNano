import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import { shortenAddress } from '../lib/nano-rpc'

export default function LockScreen() {
  const { state, unlockWallet } = useStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const handleUnlock = async () => {
    if (!password) return
    setUnlocking(true)
    setError('')
    try {
      await unlockWallet(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock')
    } finally {
      setUnlocking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && password && !unlocking) {
      handleUnlock()
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-sm w-full text-center">
        <div className="mb-4">
          <svg
            className="w-12 h-12 mx-auto text-orange-500 mb-3"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
          </svg>
          <h1 className="text-lg font-bold text-orange-500 mb-1">MoltyNano</h1>
          <h2 className="text-sm font-semibold text-gray-300">Wallet Locked</h2>
        </div>

        {state.wallet.address && (
          <p className="text-xs text-gray-500 mb-4 font-mono">
            {shortenAddress(state.wallet.address)}
          </p>
        )}

        <div className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            onKeyDown={handleKeyDown}
            placeholder="Enter password"
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleUnlock}
            disabled={!password || unlocking}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
          >
            {unlocking ? 'Unlocking...' : 'Unlock'}
          </button>

          <p className="text-xs text-gray-600">
            Forgot your password? You can recover your wallet by importing your seed after disconnecting.
          </p>
        </div>
      </div>
    </div>
  )
}
