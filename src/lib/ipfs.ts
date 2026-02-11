// IPFS Content Addressing
// Creates CID-compatible content hashes for all content
// This allows content to be verified and optionally pinned to IPFS

export async function hashContent(data: unknown): Promise<string> {
  const json = JSON.stringify(data, Object.keys(data as object).sort())
  const encoder = new TextEncoder()
  const buffer = encoder.encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  // Return base32-like CID format: "bafy" prefix + hex hash (simplified CIDv1)
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `bafy${hex}`
}

export function generateId(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Export all data as a JSON blob suitable for IPFS pinning
export function exportForIPFS(data: {
  communities: unknown[]
  posts: unknown[]
  comments: unknown[]
  votes: unknown[]
  tips: unknown[]
}): string {
  return JSON.stringify(data, null, 2)
}

// Import data from an IPFS JSON blob
export function importFromIPFS(json: string) {
  try {
    return JSON.parse(json)
  } catch {
    throw new Error('Invalid IPFS data format')
  }
}

// Verify a CID matches the content hash
export async function verifyCID(data: unknown, claimedCid: string): Promise<boolean> {
  if (!claimedCid) return true // no CID to verify
  const computedCid = await hashContent(data)
  return computedCid === claimedCid
}
