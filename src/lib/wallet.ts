import { wallet as nanoWallet, tools as nanoTools, block as nanoBlock } from 'nanocurrency-web'
import { getAccountInfo, generateWork, processBlock, getPendingBlocks } from './nano-rpc'
import { encrypt, decrypt, hashPassword, verifyPassword, uint8ToBase64, base64ToUint8 } from './crypto'
import type { WalletState, EncryptedWalletStore, WalletSecrets } from '../types'

const STORAGE_KEY = 'moltynano_wallet'
const DEFAULT_REP = 'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4' // nano foundation

export function createWallet(): { seed: string; address: string; publicKey: string; privateKey: string } {
  const w = nanoWallet.generate()
  return {
    seed: w.seed,
    address: w.accounts[0].address,
    publicKey: w.accounts[0].publicKey,
    privateKey: w.accounts[0].privateKey,
  }
}

export function walletFromSeed(seed: string): { address: string; publicKey: string; privateKey: string } {
  const w = nanoWallet.fromSeed(seed)
  return {
    address: w.accounts[0].address,
    publicKey: w.accounts[0].publicKey,
    privateKey: w.accounts[0].privateKey,
  }
}

export function signMessage(privateKey: string, message: string): string {
  const messageBytes = new TextEncoder().encode(message)
  const hex = Array.from(messageBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return nanoTools.sign(privateKey, hex)
}

export function verifySignature(publicKey: string, message: string, signature: string): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message)
    const hex = Array.from(messageBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return nanoTools.verify(publicKey, signature, hex)
  } catch {
    return false
  }
}

// Derive public key from nano address for verification
export function publicKeyFromAddress(address: string): string | null {
  try {
    return nanoTools.addressToPublicKey(address)
  } catch {
    return null
  }
}

// Validate nano address format
export function isValidNanoAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false
  if (!address.startsWith('nano_') && !address.startsWith('xrb_')) return false
  if (address.length < 60 || address.length > 66) return false
  // Verify we can derive a public key (validates checksum)
  return publicKeyFromAddress(address) !== null
}

// Verify a post's signature using the author's nano address
export function verifyPostSignature(post: { id: string; title: string; body: string; communityId: string; createdAt: number; author: string; signature: string }): boolean {
  if (post.author === 'anonymous') return true // anonymous content is allowed but unverified
  if (!post.signature) return false // non-anonymous MUST have a signature
  const pubKey = publicKeyFromAddress(post.author)
  if (!pubKey) return false
  const postData = { id: post.id, title: post.title, body: post.body, communityId: post.communityId, createdAt: post.createdAt }
  return verifySignature(pubKey, JSON.stringify(postData), post.signature)
}

// Verify a comment's signature using the author's nano address
export function verifyCommentSignature(comment: { id: string; body: string; postId: string; parentId: string | null; createdAt: number; author: string; signature: string }): boolean {
  if (comment.author === 'anonymous') return true
  if (!comment.signature) return false // non-anonymous MUST have a signature
  const pubKey = publicKeyFromAddress(comment.author)
  if (!pubKey) return false
  const commentData = { id: comment.id, body: comment.body, postId: comment.postId, parentId: comment.parentId, createdAt: comment.createdAt }
  return verifySignature(pubKey, JSON.stringify(commentData), comment.signature)
}

// Verify a community's signature using the creator's nano address
export function verifyCommunitySignature(community: { id: string; name: string; description: string; creator: string; createdAt: number; signature: string }): boolean {
  if (community.creator === 'anonymous') return true
  if (!community.signature) return false
  const pubKey = publicKeyFromAddress(community.creator)
  if (!pubKey) return false
  const data = { id: community.id, name: community.name, description: community.description, createdAt: community.createdAt }
  return verifySignature(pubKey, JSON.stringify(data), community.signature)
}

// Verify a vote's signature using the voter's nano address
export function verifyVoteSignature(vote: { id: string; targetId: string; targetType: string; voter: string; value: number; createdAt: number; signature: string }): boolean {
  if (vote.voter === 'anonymous') return true
  if (!vote.signature) return false
  const pubKey = publicKeyFromAddress(vote.voter)
  if (!pubKey) return false
  const data = { id: vote.id, targetId: vote.targetId, targetType: vote.targetType, value: vote.value, createdAt: vote.createdAt }
  return verifySignature(pubKey, JSON.stringify(data), vote.signature)
}

// Verify a tip's signature using the sender's nano address
export function verifyTipSignature(tip: { id: string; from: string; to: string; amountRaw: string; blockHash: string; targetId: string; targetType: string; createdAt: number; signature: string }): boolean {
  if (tip.from === 'anonymous') return true
  if (!tip.signature) return false
  const pubKey = publicKeyFromAddress(tip.from)
  if (!pubKey) return false
  const data = { id: tip.id, from: tip.from, to: tip.to, amountRaw: tip.amountRaw, blockHash: tip.blockHash, targetId: tip.targetId, targetType: tip.targetType, createdAt: tip.createdAt }
  return verifySignature(pubKey, JSON.stringify(data), tip.signature)
}

// Safe BigInt parsing that won't throw on invalid input
export function safeBigInt(value: string | undefined | null, fallback = '0'): bigint {
  try {
    const v = value || fallback
    if (!/^[0-9]+$/.test(v)) return BigInt(fallback)
    return BigInt(v)
  } catch {
    return BigInt(fallback)
  }
}

export async function saveWalletEncrypted(state: WalletState, password: string): Promise<void> {
  if (!state.seed || !state.privateKey) {
    throw new Error('Cannot encrypt wallet without seed and privateKey')
  }
  const secrets: WalletSecrets = { seed: state.seed, privateKey: state.privateKey }
  const encrypted = await encrypt(JSON.stringify(secrets), password)
  const passwordSaltBytes = crypto.getRandomValues(new Uint8Array(16))
  const passwordSalt = uint8ToBase64(passwordSaltBytes)
  const passwordHashValue = await hashPassword(password, passwordSaltBytes)
  const store: EncryptedWalletStore = {
    version: 2,
    address: state.address!,
    publicKey: state.publicKey!,
    displayName: state.displayName,
    balance: state.balance,
    pending: state.pending,
    encrypted,
    passwordSalt,
    passwordHash: passwordHashValue,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function loadWalletPublic(): WalletState | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    if (!parsed.version || parsed.version < 2) {
      return parsed as WalletState
    }
    const store = parsed as EncryptedWalletStore
    return {
      seed: null,
      privateKey: null,
      address: store.address,
      publicKey: store.publicKey,
      displayName: store.displayName,
      balance: store.balance,
      pending: store.pending,
    }
  } catch {
    return null
  }
}

export async function unlockWallet(password: string): Promise<WalletState> {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) throw new Error('No wallet found')
  const parsed = JSON.parse(stored)
  if (!parsed.version || parsed.version < 2) {
    throw new Error('Wallet is not encrypted. Set a password first.')
  }
  const store = parsed as EncryptedWalletStore
  const isValid = await verifyPassword(password, base64ToUint8(store.passwordSalt), store.passwordHash)
  if (!isValid) throw new Error('Incorrect password')
  const secretsJson = await decrypt(store.encrypted, password)
  const secrets: WalletSecrets = JSON.parse(secretsJson)
  return {
    seed: secrets.seed,
    privateKey: secrets.privateKey,
    address: store.address,
    publicKey: store.publicKey,
    displayName: store.displayName,
    balance: store.balance,
    pending: store.pending,
  }
}

export function isLegacyWallet(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return false
  try {
    const parsed = JSON.parse(stored)
    return !parsed.version || parsed.version < 2
  } catch {
    return false
  }
}

export function hasStoredWallet(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

export function updateWalletPublicData(updates: Partial<Pick<WalletState, 'balance' | 'pending' | 'displayName'>>): void {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return
  try {
    const parsed = JSON.parse(stored)
    Object.assign(parsed, updates)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch { /* ignore */ }
}

export function clearWallet(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export async function sendNano(
  fromPrivateKey: string,
  fromAddress: string,
  toAddress: string,
  amountRaw: string
): Promise<string> {
  // Validate recipient address
  if (!isValidNanoAddress(toAddress)) {
    throw new Error('Invalid recipient address. Must be a valid nano_ address.')
  }

  // Get account info
  const info = await getAccountInfo(fromAddress)
  if (!info) {
    throw new Error('Account not found on network. Need to receive funds first.')
  }

  const balanceBigInt = BigInt(info.balance)
  const amountBigInt = BigInt(amountRaw)

  if (amountBigInt > balanceBigInt) {
    throw new Error('Insufficient balance')
  }

  // Generate work (send difficulty threshold)
  const work = await generateWork(info.frontier, 'send')
  if (!work) {
    throw new Error('Failed to generate work. Try again later.')
  }

  // Create send block
  const sendBlock = nanoBlock.send({
    walletBalanceRaw: info.balance,
    fromAddress: fromAddress,
    toAddress: toAddress,
    representativeAddress: info.representative || DEFAULT_REP,
    frontier: info.frontier,
    amountRaw: amountRaw,
    work: work,
  }, fromPrivateKey)

  // Process block
  const hash = await processBlock(sendBlock, 'send')
  if (!hash) {
    throw new Error('Failed to process send block')
  }

  return hash
}

export async function receiveNano(
  privateKey: string,
  address: string
): Promise<string[]> {
  const pending = await getPendingBlocks(address)
  const hashes: string[] = []

  const info = await getAccountInfo(address)

  for (const [blockHash, blockInfo] of Object.entries(pending)) {
    try {
      // For open blocks (new account): work is computed against the public key (hex)
      // For existing accounts: work is computed against the frontier (previous block hash)
      const workHash = info ? info.frontier : nanoTools.addressToPublicKey(address)
      const work = await generateWork(workHash, 'receive')
      if (!work) continue

      if (!info) {
        // Open block (first receive)
        const openBlock = nanoBlock.receive({
          walletBalanceRaw: '0',
          toAddress: address,
          representativeAddress: DEFAULT_REP,
          frontier: '0000000000000000000000000000000000000000000000000000000000000000',
          transactionHash: blockHash,
          amountRaw: blockInfo.amount,
          work: work,
        }, privateKey)

        const hash = await processBlock(openBlock, 'receive')
        if (hash) hashes.push(hash)
      } else {
        // Regular receive
        const currentBalance = BigInt(info.balance) + BigInt(blockInfo.amount)
        const receiveBlock = nanoBlock.receive({
          walletBalanceRaw: info.balance,
          toAddress: address,
          representativeAddress: info.representative || DEFAULT_REP,
          frontier: info.frontier,
          transactionHash: blockHash,
          amountRaw: blockInfo.amount,
          work: work,
        }, privateKey)

        const hash = await processBlock(receiveBlock, 'receive')
        if (hash) {
          hashes.push(hash)
          // Update frontier for next receive
          info.frontier = hash
          info.balance = currentBalance.toString()
        }
      }
    } catch (err) {
      console.error('[Wallet] Failed to receive block:', blockHash, err)
    }
  }

  return hashes
}
