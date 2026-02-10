// Nano RPC client for interacting with the Nano network
// Uses public RPC nodes

const RPC_URLS = [
  'https://proxy.nanos.cc/proxy',
  'https://rpc.nano.to',
]

let currentRpcIndex = 0

async function rpcCall(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const body = JSON.stringify({ action, ...params })

  for (let i = 0; i < RPC_URLS.length; i++) {
    const url = RPC_URLS[(currentRpcIndex + i) % RPC_URLS.length]
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (!response.ok) continue

      const data = await response.json()
      if (data.error) {
        // "Account not found" is expected for new accounts
        if (data.error === 'Account not found') {
          return data
        }
        console.warn(`[Nano RPC] ${url} error:`, data.error)
        continue
      }
      return data
    } catch (err) {
      console.warn(`[Nano RPC] ${url} failed:`, err)
      continue
    }
  }

  throw new Error('All Nano RPC nodes failed')
}

export async function getAccountInfo(account: string): Promise<{
  balance: string
  pending: string
  frontier: string
  representative: string
  open_block: string
  block_count: string
} | null> {
  try {
    const result = await rpcCall('account_info', {
      account,
      representative: true,
      pending: true,
    }) as Record<string, string>

    if (result.error === 'Account not found') {
      return null
    }

    return {
      balance: result.balance || '0',
      pending: result.pending || '0',
      frontier: result.frontier || '',
      representative: result.representative || '',
      open_block: result.open_block || '',
      block_count: result.block_count || '0',
    }
  } catch {
    return null
  }
}

export async function getAccountBalance(account: string): Promise<{
  balance: string
  pending: string
  receivable: string
}> {
  try {
    const result = await rpcCall('account_balance', { account }) as Record<string, string>
    return {
      balance: result.balance || '0',
      pending: result.pending || '0',
      receivable: result.receivable || result.pending || '0',
    }
  } catch {
    return { balance: '0', pending: '0', receivable: '0' }
  }
}

export async function generateWork(hash: string): Promise<string> {
  try {
    const result = await rpcCall('work_generate', {
      hash,
      difficulty: 'fffffff800000000', // receive threshold (lower)
    }) as Record<string, string>
    return result.work || ''
  } catch {
    console.warn('[Nano] Work generation failed on remote, returning empty')
    return ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processBlock(block: any, subtype: string): Promise<string> {
  try {
    const result = await rpcCall('process', {
      json_block: 'true',
      subtype,
      block,
    }) as Record<string, string>
    return result.hash || ''
  } catch (err) {
    console.error('[Nano] Process block failed:', err)
    throw err
  }
}

export async function getPendingBlocks(account: string): Promise<Record<string, { amount: string; source: string }>> {
  try {
    const result = await rpcCall('pending', {
      account,
      count: '20',
      source: true,
      include_active: true,
    }) as { blocks: Record<string, { amount: string; source: string }> }
    return result.blocks || {}
  } catch {
    return {}
  }
}

// Format raw amount to Nano (divide by 10^30)
export function rawToNano(raw: string): string {
  if (!raw || raw === '0') return '0'
  const rawBigInt = BigInt(raw)
  const nano = Number(rawBigInt) / 1e30
  if (nano === 0) return '0'
  if (nano < 0.000001) return '< 0.000001'
  return nano.toFixed(6).replace(/\.?0+$/, '')
}

// Format Nano to raw (multiply by 10^30)
export function nanoToRaw(nano: string): string {
  const parts = nano.split('.')
  const whole = parts[0] || '0'
  const frac = (parts[1] || '').padEnd(30, '0').slice(0, 30)
  const raw = BigInt(whole) * BigInt('1000000000000000000000000000000') +
    BigInt(frac)
  return raw.toString()
}

// Shorten nano address for display
export function shortenAddress(address: string): string {
  if (!address || address.length < 20) return address
  return address.slice(0, 12) + '...' + address.slice(-6)
}
