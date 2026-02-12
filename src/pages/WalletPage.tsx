import { useState, useEffect } from 'react'
import { useStore } from '../hooks/useStore'
import { getAccountBalance, rawToNano, nanoToRaw } from '../lib/nano-rpc'
import { receiveNano, clearWallet, sendNano, safeBigInt, isLegacyWallet, updateWalletPublicData, unlockWallet as unlockWalletFromStorage } from '../lib/wallet'
import { encrypt, decrypt } from '../lib/crypto'
import { QRCodeSVG } from 'qrcode.react'
import PasswordSetupModal from '../components/PasswordSetupModal'

export default function WalletPage() {
  const { state, dispatch, initWalletWithPassword, setupPassword, lockWallet } = useStore()
  const [importSeed, setImportSeed] = useState('')
  const [displayName, setDisplayName] = useState(state.wallet.displayName || '')
  const [refreshing, setRefreshing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendStatus, setSendStatus] = useState('')

  // Password setup modal
  const [showPasswordSetup, setShowPasswordSetup] = useState<'create' | 'import' | 'migrate' | null>(null)
  const [pendingSeed, setPendingSeed] = useState<string | null>(null)

  // Seed reveal
  const [showSeedPasswordPrompt, setShowSeedPasswordPrompt] = useState(false)
  const [seedPassword, setSeedPassword] = useState('')
  const [revealedSeed, setRevealedSeed] = useState<string | null>(null)
  const [seedError, setSeedError] = useState('')

  // Encrypted backup
  const [backupPassword, setBackupPassword] = useState('')
  const [backupConfirm, setBackupConfirm] = useState('')
  const [backupError, setBackupError] = useState('')
  const [showBackupExport, setShowBackupExport] = useState(false)
  const [backupExporting, setBackupExporting] = useState(false)
  const [showBackupImport, setShowBackupImport] = useState(false)
  const [backupImportPassword, setBackupImportPassword] = useState('')
  const [backupImportData, setBackupImportData] = useState<string | null>(null)
  const [backupImportError, setBackupImportError] = useState('')
  const [backupImportFile, setBackupImportFile] = useState<string | null>(null)

  const isLegacy = isLegacyWallet()

  useEffect(() => {
    setDisplayName(state.wallet.displayName || '')
  }, [state.wallet.displayName])

  // Auto-hide revealed seed after 30 seconds
  useEffect(() => {
    if (!revealedSeed) return
    const timer = setTimeout(() => {
      setRevealedSeed(null)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [revealedSeed])

  const refreshBalance = async () => {
    if (!state.wallet.address) return
    setRefreshing(true)
    try {
      const info = await getAccountBalance(state.wallet.address)
      updateWalletPublicData({ balance: info.balance, pending: info.receivable || info.pending })
      dispatch({
        type: 'SET_WALLET',
        wallet: { ...state.wallet, balance: info.balance, pending: info.receivable || info.pending },
      })
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
    updateWalletPublicData({ displayName: displayName.trim() })
    dispatch({ type: 'SET_WALLET', wallet: { ...state.wallet, displayName: displayName.trim() } })
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

  const handlePasswordSetupComplete = async (password: string) => {
    if (showPasswordSetup === 'migrate') {
      await setupPassword(password)
    } else {
      await initWalletWithPassword(password, pendingSeed || undefined)
    }
    setShowPasswordSetup(null)
    setPendingSeed(null)
  }

  const handleRevealSeed = async () => {
    setSeedError('')
    if (isLegacy) {
      // Legacy wallet: seed is in memory
      setRevealedSeed(state.wallet.seed)
      setShowSeedPasswordPrompt(false)
      return
    }
    try {
      const fullWallet = await unlockWalletFromStorage(seedPassword)
      setRevealedSeed(fullWallet.seed)
      setSeedPassword('')
      setShowSeedPasswordPrompt(false)
    } catch {
      setSeedError('Incorrect password')
    }
  }

  const handleExportEncryptedBackup = async () => {
    setBackupError('')
    if (backupPassword.length < 8) {
      setBackupError('Password must be at least 8 characters')
      return
    }
    if (backupPassword !== backupConfirm) {
      setBackupError('Passwords do not match')
      return
    }
    setBackupExporting(true)
    try {
      let seed: string | null = state.wallet.seed
      if (!seed && !isLegacy) {
        // Need to get seed from encrypted storage - we'll prompt for wallet password first
        // For simplicity, use the backup password to encrypt, but get seed from memory if available
        // If wallet is unlocked, seed should be in state
        if (!state.wallet.seed) {
          setBackupError('Wallet must be unlocked to export backup')
          setBackupExporting(false)
          return
        }
      }
      seed = state.wallet.seed
      if (!seed) {
        setBackupError('No seed available')
        setBackupExporting(false)
        return
      }
      const encrypted = await encrypt(JSON.stringify({
        seed,
        address: state.wallet.address,
        publicKey: state.wallet.publicKey,
      }), backupPassword)
      const backup = {
        type: 'moltynano-encrypted-backup',
        version: 1,
        address: state.wallet.address,
        encrypted,
        createdAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `moltynano-backup-${state.wallet.address?.slice(5, 15) || 'wallet'}.json`
      a.click()
      URL.revokeObjectURL(url)
      setShowBackupExport(false)
      setBackupPassword('')
      setBackupConfirm('')
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBackupExporting(false)
    }
  }

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBackupImportFile(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setBackupImportData(ev.target?.result as string)
      setBackupImportError('')
    }
    reader.readAsText(file)
  }

  const handleImportEncryptedBackup = async () => {
    setBackupImportError('')
    if (!backupImportData) {
      setBackupImportError('No backup file selected')
      return
    }
    if (!backupImportPassword) {
      setBackupImportError('Enter the backup password')
      return
    }
    try {
      const parsed = JSON.parse(backupImportData)
      if (parsed.type !== 'moltynano-encrypted-backup') {
        setBackupImportError('Invalid backup file format')
        return
      }
      const decrypted = await decrypt(parsed.encrypted, backupImportPassword)
      const secrets = JSON.parse(decrypted)
      if (!secrets.seed || typeof secrets.seed !== 'string') {
        setBackupImportError('Backup file does not contain a valid seed')
        return
      }
      // Now we have the seed - set it as pending and open password setup for the new wallet
      setPendingSeed(secrets.seed)
      setShowPasswordSetup('import')
      setShowBackupImport(false)
      setBackupImportPassword('')
      setBackupImportData(null)
      setBackupImportFile(null)
    } catch {
      setBackupImportError('Incorrect password or corrupted backup file')
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
              onClick={() => setShowPasswordSetup('create')}
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
                  setPendingSeed(importSeed.trim())
                  setShowPasswordSetup('import')
                  setImportSeed('')
                }
              }}
              disabled={importSeed.trim().length !== 128 || !/^[0-9a-fA-F]+$/.test(importSeed.trim())}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium"
            >
              Import
            </button>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-200 mb-3">Restore from Encrypted Backup</h2>
            <p className="text-sm text-gray-400 mb-3">
              Import a previously exported encrypted backup file.
            </p>
            {showBackupImport ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Backup File</label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleBackupFileSelect}
                    className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600"
                  />
                  {backupImportFile && (
                    <p className="text-xs text-gray-500 mt-1">{backupImportFile}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Backup Password</label>
                  <input
                    type="password"
                    value={backupImportPassword}
                    onChange={(e) => { setBackupImportPassword(e.target.value); setBackupImportError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleImportEncryptedBackup() }}
                    placeholder="Enter the backup password"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                {backupImportError && <p className="text-xs text-red-400">{backupImportError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowBackupImport(false); setBackupImportPassword(''); setBackupImportData(null); setBackupImportFile(null); setBackupImportError('') }}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportEncryptedBackup}
                    disabled={!backupImportData || !backupImportPassword}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded font-medium"
                  >
                    Restore Wallet
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowBackupImport(true)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
              >
                Import Encrypted Backup
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Wallet exists */
        <div className="space-y-3 sm:space-y-4">
          {/* Legacy migration warning */}
          {isLegacy && (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-300 mb-2">Security Warning</h3>
              <p className="text-xs text-yellow-400 mb-3">
                Your wallet seed is stored without encryption. Set a password to protect it.
              </p>
              <button
                onClick={() => setShowPasswordSetup('migrate')}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded font-medium"
              >
                Set Password Now
              </button>
            </div>
          )}

          {/* Wallet info */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-200">Your Wallet</h2>
              <div className="flex items-center gap-2">
                {!isLegacy && (
                  <button
                    onClick={lockWallet}
                    className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                    </svg>
                    Lock
                  </button>
                )}
                <button
                  onClick={refreshBalance}
                  disabled={refreshing}
                  className="text-xs text-orange-500 hover:text-orange-400"
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Balance'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Address</label>
                <div className="bg-gray-800 rounded px-3 py-2 text-xs font-mono text-gray-300 break-all select-all">
                  {state.wallet.address}
                </div>
              </div>

              {state.wallet.address && (
                <div className="flex justify-center">
                  <div className="bg-white rounded-lg p-3">
                    <QRCodeSVG
                      value={`nano:${state.wallet.address}`}
                      size={160}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                </div>
              )}

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
            {revealedSeed ? (
              <div>
                <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-xs font-mono text-red-300 break-all select-all">
                  {revealedSeed}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-600">Auto-hides in 30 seconds</p>
                  <button
                    onClick={() => setRevealedSeed(null)}
                    className="text-xs text-gray-400 hover:text-gray-200"
                  >
                    Hide Now
                  </button>
                </div>
              </div>
            ) : showSeedPasswordPrompt ? (
              <div className="space-y-2">
                <input
                  type="password"
                  value={seedPassword}
                  onChange={(e) => { setSeedPassword(e.target.value); setSeedError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && seedPassword) handleRevealSeed() }}
                  placeholder="Enter password to reveal seed"
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                {seedError && <p className="text-xs text-red-400">{seedError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowSeedPasswordPrompt(false); setSeedPassword(''); setSeedError('') }}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRevealSeed}
                    disabled={!seedPassword}
                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900/70 disabled:bg-gray-700 disabled:text-gray-500 text-red-400 text-xs rounded border border-red-800"
                  >
                    Reveal Seed
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (isLegacy) {
                    // Legacy: seed is in memory, reveal directly
                    setRevealedSeed(state.wallet.seed)
                  } else {
                    setShowSeedPasswordPrompt(true)
                  }
                }}
                className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm rounded border border-red-800"
              >
                {isLegacy ? 'Show Seed (Keep Private!)' : 'Show Seed (Requires Password)'}
              </button>
            )}
          </div>

          {/* Encrypted backup */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Encrypted Backup</h2>
            <p className="text-xs text-gray-500 mb-3">
              Export your wallet as a password-protected encrypted file. Safer than copying the raw seed.
            </p>
            {showBackupExport ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Backup Password (min 8 chars)</label>
                  <input
                    type="password"
                    value={backupPassword}
                    onChange={(e) => { setBackupPassword(e.target.value); setBackupError('') }}
                    placeholder="Choose a backup password"
                    autoFocus
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={backupConfirm}
                    onChange={(e) => { setBackupConfirm(e.target.value); setBackupError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleExportEncryptedBackup() }}
                    placeholder="Confirm password"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                {backupError && <p className="text-xs text-red-400">{backupError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowBackupExport(false); setBackupPassword(''); setBackupConfirm(''); setBackupError('') }}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExportEncryptedBackup}
                    disabled={backupExporting}
                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded font-medium"
                  >
                    {backupExporting ? 'Encrypting...' : 'Download Encrypted Backup'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowBackupExport(true)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded font-medium"
              >
                Export Encrypted Backup
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
                  dispatch({ type: 'SET_LOCK_STATE', lockState: 'no_wallet' })
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded"
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}

      {/* Password setup modal */}
      {showPasswordSetup && (
        <PasswordSetupModal
          mode={showPasswordSetup}
          onComplete={handlePasswordSetupComplete}
          onCancel={() => { setShowPasswordSetup(null); setPendingSeed(null) }}
        />
      )}
    </div>
  )
}
