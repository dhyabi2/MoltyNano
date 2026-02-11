import { wallet as nanoWallet, tools as nanoTools, block as nanoBlock } from 'nanocurrency-web'
import { getAccountInfo, generateWork, processBlock, getPendingBlocks } from './nano-rpc'
import type { WalletState } from '../types'

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

// Verify a post's signature using the author's nano address
export function verifyPostSignature(post: { id: string; title: string; body: string; communityId: string; createdAt: number; author: string; signature: string }): boolean {
  if (!post.signature || post.author === 'anonymous') return true // unsigned content is allowed but marked
  const pubKey = publicKeyFromAddress(post.author)
  if (!pubKey) return false
  const postData = { id: post.id, title: post.title, body: post.body, communityId: post.communityId, createdAt: post.createdAt }
  return verifySignature(pubKey, JSON.stringify(postData), post.signature)
}

// Verify a comment's signature using the author's nano address
export function verifyCommentSignature(comment: { id: string; body: string; postId: string; parentId: string | null; createdAt: number; author: string; signature: string }): boolean {
  if (!comment.signature || comment.author === 'anonymous') return true
  const pubKey = publicKeyFromAddress(comment.author)
  if (!pubKey) return false
  const commentData = { id: comment.id, body: comment.body, postId: comment.postId, parentId: comment.parentId, createdAt: comment.createdAt }
  return verifySignature(pubKey, JSON.stringify(commentData), comment.signature)
}

export function saveWallet(state: WalletState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadWallet(): WalletState | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as WalletState
  } catch {
    return null
  }
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
