import { useState } from 'react'

interface PasswordSetupModalProps {
  onComplete: (password: string) => Promise<void>
  onCancel: () => void
  mode: 'create' | 'import' | 'migrate'
}

export default function PasswordSetupModal({ onComplete, onCancel, mode }: PasswordSetupModalProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const title = mode === 'migrate'
    ? 'Encrypt Your Wallet'
    : mode === 'import'
      ? 'Set Password for Imported Wallet'
      : 'Set Wallet Password'

  const isValid = password.length >= 8 && password === confirm

  const handleSubmit = async () => {
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      await onComplete(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password')
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid && !loading) {
      handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 sm:p-6 max-w-sm w-full">
        <h2 className="text-base font-semibold text-gray-200 mb-4">{title}</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Password (min 8 characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter password"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Confirm password"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          {password.length > 0 && password.length < 8 && (
            <p className="text-xs text-yellow-400">Password must be at least 8 characters</p>
          )}
          {confirm.length > 0 && password !== confirm && (
            <p className="text-xs text-red-400">Passwords do not match</p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <p className="text-xs text-gray-500">
            This password encrypts your wallet locally. If you forget it, you will need your seed to recover access.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
            >
              {loading ? 'Encrypting...' : 'Set Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
