import { useState } from 'react'
import { useStore } from '../hooks/useStore'

export default function NetworkPage() {
  const { state, connectToPeer, exportData, importData } = useStore()
  const [peerIdInput, setPeerIdInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [importText, setImportText] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [exportedData, setExportedData] = useState('')

  const handleConnect = async () => {
    if (!peerIdInput.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      await connectToPeer(peerIdInput.trim())
      setPeerIdInput('')
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleExport = async () => {
    const data = await exportData()
    setExportedData(data)
    // Also copy to clipboard
    try {
      await navigator.clipboard.writeText(data)
    } catch {}
  }

  const handleImport = async () => {
    if (!importText.trim()) return
    setImportStatus('')
    try {
      await importData(importText.trim())
      setImportStatus('Data imported successfully!')
      setImportText('')
    } catch (err) {
      setImportStatus(`Error: ${err instanceof Error ? err.message : 'Invalid data'}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-100">P2P Network</h1>

      {/* Status */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Network Status</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                state.networkReady ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-300">
              {state.networkReady ? 'Online' : 'Connecting...'}
            </span>
          </div>
          {state.myPeerId && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Your Peer ID (share this with others)</label>
              <div className="bg-gray-800 rounded px-3 py-2 text-sm font-mono text-orange-400 select-all cursor-text">
                {state.myPeerId}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connect to peer */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">Connect to Peer</h2>
        <p className="text-xs text-gray-500 mb-3">
          Enter another user's peer ID to connect and sync data. All data is synced automatically
          after connection. Peers in the same browser connect automatically.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={peerIdInput}
            onChange={(e) => setPeerIdInput(e.target.value)}
            placeholder="Enter peer ID (e.g., mb-abc12345)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />
          <button
            onClick={handleConnect}
            disabled={connecting || !peerIdInput.trim()}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium shrink-0"
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
        {connectError && (
          <p className="text-xs text-red-400 mt-2">{connectError}</p>
        )}
      </div>

      {/* Connected peers */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">
          Connected Peers ({state.connectedPeers.length})
        </h2>
        {state.connectedPeers.length === 0 ? (
          <p className="text-xs text-gray-500">
            No peers connected. Connect to a peer or open this app in another browser tab.
          </p>
        ) : (
          <ul className="space-y-1">
            {state.connectedPeers.map((peerId) => (
              <li
                key={peerId}
                className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2"
              >
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-mono text-gray-300">{peerId}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Export/Import Data (IPFS-compatible) */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">
          Data Export / Import (IPFS-compatible JSON)
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Export your data as JSON to pin to IPFS (via PinMe or similar), or import data from IPFS.
          This is your data backup and portability mechanism.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
          >
            Export Data (Copy to Clipboard)
          </button>
        </div>

        {exportedData && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-1">
              Exported ({(exportedData.length / 1024).toFixed(1)} KB) — Pin this JSON to IPFS:
            </label>
            <textarea
              readOnly
              value={exportedData}
              className="w-full h-24 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-400 resize-none"
            />
          </div>
        )}

        <div>
          <label className="text-xs text-gray-400 block mb-1">Import JSON data:</label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste exported JSON here...'
            className="w-full h-24 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleImport}
            disabled={!importText.trim()}
            className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded"
          >
            Import
          </button>
          {importStatus && (
            <p className={`text-xs mt-1 ${importStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {importStatus}
            </p>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">How P2P Networking Works</h2>
        <div className="text-xs text-gray-400 space-y-2">
          <p>
            <strong className="text-gray-300">PeerJS WebRTC:</strong> Direct browser-to-browser
            connections. No data goes through servers — only the initial handshake uses a signaling server.
          </p>
          <p>
            <strong className="text-gray-300">BroadcastChannel:</strong> Tabs in the same browser
            automatically discover and sync with each other instantly.
          </p>
          <p>
            <strong className="text-gray-300">Mesh Network:</strong> When you connect to a peer,
            they share their peer list with you. You then connect to those peers too, forming a mesh.
          </p>
          <p>
            <strong className="text-gray-300">Data Sync:</strong> When two peers connect, they
            exchange all their data. New content is broadcast to all connected peers in real-time.
          </p>
          <p>
            <strong className="text-gray-300">IPFS Export:</strong> You can export all data as JSON
            and pin it to IPFS using PinMe, web3.storage, or any IPFS pinning service for permanent storage.
          </p>
        </div>
      </div>
    </div>
  )
}
