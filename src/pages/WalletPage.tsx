import { useState, useEffect } from 'react'
import { useStore } from '../hooks/useStore'
import { getAccountBalance, rawToNano, nanoToRaw, shortenAddress } from '../lib/nano-rpc'
import { saveWallet, receiveNano, clearWallet, sendNano, safeBigInt } from '../lib/wallet'

export default function WalletPage() {
  const { state, dispatch, initWallet } = useStore()
  const [importSeed, setImportSeed] = useState('')
  const [showSeed, setShowSeed] = useState(false)
  const [displayName, setDisplayName] = useState(state.wallet.displayName || '')
  const [refreshing, setRefreshing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendStatus, setSendStatus] = useState('')

  useEffect(() => {
    setDisplayName(state.wallet.displayName || '')
  }, [state.wallet.displayName])

  const refreshBalance = async () => {
    if (!state.wallet.address) return
    setRefreshing(true)
    try {
      const info = await getAccountBalance(state.wallet.address)
      const wallet = {
        ...state.wallet,
        balance: info.balance,
        pending: info.receivable || info.pending,
      }
      saveWallet(wallet)
      dispatch({ type: 'SET_WALLET', wallet })
    } catch (err) {
      console.error('Failed to refresh balance:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const handleReceive = async () => {
    if (!state.wallet.privateKey || !state.wallet.address) return
    setReceiving(true)
    try {
      const hashes = await receiveNano(state.wallet.privateKey, state.wallet.address)
      if (hashes.length > 0) {
        await refreshBalance()
      }
    } catch (err) {
      console.error('Failed to receive:', err)
    } finally {
      setReceiving(false)
    }
  }

  const updateDisplayName = () => {
    if (!displayName.trim()) return
    const wallet = { ...state.wallet, displayName: displayName.trim() }
    saveWallet(wallet)
    dispatch({ type: 'SET_WALLET', wallet })
  }

  const handleSend = async () => {
    if (!sendTo.trim() || !sendAmount.trim() || !state.wallet.privateKey || !state.wallet.address) return
    setSendStatus('Sending...')
    try {
      const amountRaw = nanoToRaw(sendAmount)
      const hash = await sendNano(state.wallet.privateKey, state.wallet.address, sendTo.trim(), amountRaw)
      setSendStatus(`Sent! Block: ${hash.slice(0, 16)}...`)
      setSendTo('')
      setSendAmount('')
      await refreshBalance()
    } catch (err) {
      setSendStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
      <h1 className="text-xl font-bold text-gray-100">Nano (XNO) Wallet</h1>

      {!state.wallet.address ? (
        /* No wallet yet */
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-200 mb-3">Create New Wallet</h2>
            <p className="text-sm text-gray-400 mb-4">
              Generate a new Nano wallet. Your identity on MoltyNano is tied to your Nano address.
              Posts and comments are cryptographically signed with your key.
            </p>
            <button
              onClick={() => initWallet()}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium"
            >
              Generate Wallet
            </button>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-200 mb-3">Import Existing Wallet</h2>
            <p className="text-sm text-gray-400 mb-3">
              Enter your 128-character hex seed to import an existing wallet.
            </p>
            <input
              type="password"
              value={importSeed}
              onChange={(e) => setImportSeed(e.target.value)}
              placeholder="Enter your 128-character hex seed"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 mb-3 font-mono"
            />
            <button
              onClick={() => {
                if (importSeed.trim().length === 128 && /^[0-9a-fA-F]+$/.test(importSeed.trim())) {
                  initWallet(importSeed.trim())
                  setImportSeed('')
                }
              }}
              disabled={importSeed.trim().length !== 128 || !/^[0-9a-fA-F]+$/.test(importSeed.trim())}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium"
            >
              Import
            </button>
          </div>
        </div>
      ) : (
        /* Wallet exists */
        <div className="space-y-3 sm:space-y-4">
          {/* Wallet info */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-200">Your Wallet</h2>
              <button
                onClick={refreshBalance}
                disabled={refreshing}
                className="text-xs text-orange-500 hover:text-orange-400"
              >
                {refreshing ? 'Refreshing...' : 'Refresh Balance'}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Address</label>
                <div className="bg-gray-800 rounded px-3 py-2 text-xs font-mono text-gray-300 break-all select-all">
                  {state.wallet.address}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Balance</label>
                  <div className="text-base sm:text-lg font-semibold text-green-400">
                    {rawToNano(state.wallet.balance)} XNO
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Pending</label>
                  <div className="text-base sm:text-lg font-semibold text-yellow-400">
                    {rawToNano(state.wallet.pending)} XNO
                  </div>
                </div>
              </div>

              {safeBigInt(state.wallet.pending) > 0n && (
                <button
                  onClick={handleReceive}
                  disabled={receiving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded font-medium"
                >
                  {receiving ? 'Receiving...' : 'Receive Pending'}
                </button>
              )}
            </div>
          </div>

          {/* Display name */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Display Name</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={updateDisplayName}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded"
              >
                Save
              </button>
            </div>
          </div>

          {/* Send XNO */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Send XNO</h2>
            <div className="space-y-2">
              <input
                type="text"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="Recipient nano_... address"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="Amount in XNO"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!sendTo.trim() || !sendAmount.trim()}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
                >
                  Send
                </button>
              </div>
              {sendStatus && (
                <p className={`text-xs ${sendStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {sendStatus}
                </p>
              )}
            </div>
          </div>

          {/* Seed backup */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Backup Seed</h2>
            <p className="text-xs text-gray-500 mb-3">
              Save this seed to recover your wallet. Anyone with this seed can access your funds.
            </p>
            {showSeed ? (
              <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-xs font-mono text-red-300 break-all select-all">
                {state.wallet.seed}
              </div>
            ) : (
              <button
                onClick={() => setShowSeed(true)}
                className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm rounded border border-red-800"
              >
                Show Seed (Keep Private!)
              </button>
            )}
          </div>

          {/* Logout */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <button
              onClick={() => {
                if (confirm('Are you sure? Make sure you have backed up your seed!')) {
                  clearWallet()
                  dispatch({
                    type: 'SET_WALLET',
                    wallet: {
                      seed: null,
                      address: null,
                      publicKey: null,
                      privateKey: null,
                      balance: '0',
                      pending: '0',
                      displayName: 'Anonymous',
                    },
                  })
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded"
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
