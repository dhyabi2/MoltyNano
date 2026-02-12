import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import { sendNano, signMessage } from '../lib/wallet'
import { nanoToRaw, rawToNano } from '../lib/nano-rpc'
import { generateId } from '../lib/ipfs'
import { p2pNetwork } from '../lib/p2p'
import { upsertTip } from '../lib/db'
import type { Tip } from '../types'

interface Props {
  targetId: string
  targetType: 'post' | 'comment'
  recipientAddress: string
}

export default function TipButton({ targetId, targetType, recipientAddress }: Props) {
  const { state, dispatch } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [amount, setAmount] = useState('0.001')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canTip =
    state.wallet.address &&
    state.wallet.privateKey &&
    recipientAddress &&
    recipientAddress !== 'anonymous' &&
    recipientAddress !== state.wallet.address

  const handleTip = async () => {
    if (!canTip || !state.wallet.privateKey || !state.wallet.address) return

    setSending(true)
    setError('')
    setSuccess('')

    try {
      const amountRaw = nanoToRaw(amount)
      const blockHash = await sendNano(
        state.wallet.privateKey,
        state.wallet.address,
        recipientAddress,
        amountRaw
      )

      const tipId = generateId()
      const createdAt = Date.now()
      const tipSigData = { id: tipId, from: state.wallet.address!, to: recipientAddress, amountRaw, blockHash, targetId, targetType, createdAt }
      const signature = signMessage(state.wallet.privateKey!, JSON.stringify(tipSigData))
      const tip: Tip = {
        ...tipSigData,
        signature,
      }

      await upsertTip(tip)
      dispatch({ type: 'ADD_TIP', tip })
      p2pNetwork.broadcast({ type: 'TIP', data: tip })

      setSuccess(`Sent ${amount} XNO!`)
      setTimeout(() => {
        setShowModal(false)
        setSuccess('')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send tip')
    } finally {
      setSending(false)
    }
  }

  if (!canTip) return null

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-xs text-green-600 hover:text-green-400 flex items-center gap-0.5"
        title="Send XNO tip"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.95-3.12 3.19z" />
        </svg>
        Tip
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 sm:p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base sm:text-lg font-semibold text-gray-100 mb-3 sm:mb-4">Send XNO Tip</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Amount (XNO)</label>
                <div className="flex gap-1.5 sm:gap-2">
                  {['0.001', '0.01', '0.1', '1'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAmount(preset)}
                      className={`px-2.5 py-1.5 text-xs rounded border ${
                        amount === preset
                          ? 'border-orange-500 text-orange-400'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="text-xs text-gray-500 truncate">
                To: <span className="font-mono">{recipientAddress.slice(0, 16)}...</span>
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-900/20 rounded p-2">
                  {error}
                </div>
              )}

              {success && (
                <div className="text-xs text-green-400 bg-green-900/20 rounded p-2">
                  {success}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleTip}
                  disabled={sending || !amount || parseFloat(amount) <= 0}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
                >
                  {sending ? 'Sending...' : `Send ${amount} XNO`}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
