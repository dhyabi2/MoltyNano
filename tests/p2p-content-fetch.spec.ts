import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * P2P Content Fetch E2E Tests (BitTorrent tracker signaling)
 *
 * Two isolated browser contexts simulate two separate devices/users.
 * They discover each other via real public BitTorrent WebSocket trackers
 * and sync content through Trystero WebRTC data channels.
 *
 * These tests verify that synced content is actually visible and
 * browsable in the UI — not just present in IndexedDB.
 */

const BASE_URL = 'http://localhost:4173'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

interface PeerWindow {
  label: string
  context: BrowserContext
  page: Page
}

async function openPeer(browser: Browser, label: string): Promise<PeerWindow> {
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.text().includes('[P2P]')) {
      console.log(`  [${label}] ${msg.text()}`)
    }
  })

  await page.goto(BASE_URL)
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name)
    }
    localStorage.clear()
  })
  await page.reload()
  await page.waitForTimeout(3000)

  return { label, context, page }
}

async function createWallet(page: Page) {
  await page.goto(`${BASE_URL}/#/wallet`)
  await page.waitForTimeout(500)
  const btn = page.locator('button:has-text("Generate Wallet")')
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(1500)
  }
}

async function createCommunity(page: Page, name: string, description: string) {
  await page.goto(`${BASE_URL}/#/communities`)
  await page.waitForTimeout(1000)
  await page.locator('text=Create a new community').click()
  await page.waitForTimeout(500)
  await page.locator('input[placeholder="community_name"]').fill(name)
  await page.locator('input[placeholder="What is this community about?"]').fill(description)
  await page.locator('button:has-text("Create")').last().click()
  await page.waitForTimeout(3000)
}

async function createPost(page: Page, communityName: string, title: string, body: string) {
  await page.goto(`${BASE_URL}/#/c/${communityName}`)
  await page.waitForTimeout(1000)
  await page.locator('text=Create a post...').click()
  await page.waitForTimeout(500)
  await page.locator('input[placeholder="Title"]').fill(title)
  await page.locator('textarea[placeholder="Text (optional)"]').fill(body)
  await page.locator('button:has-text("Post")').last().click()
  await page.waitForTimeout(2000)
}

async function getConnectedCount(page: Page): Promise<number> {
  const text = await page
    .locator('text=/Connected to \\d+ peer/')
    .textContent({ timeout: 3000 })
    .catch(() => null)
  if (text) {
    const m = text.match(/Connected to (\d+) peer/)
    return m ? parseInt(m[1], 10) : 0
  }
  return 0
}

async function countInDB(page: Page, table: string): Promise<number> {
  return page.evaluate(async (t) => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open('moltynano')
      req.onsuccess = () => {
        const db = req.result
        try {
          const tx = db.transaction(t, 'readonly')
          const getAll = tx.objectStore(t).getAll()
          getAll.onsuccess = () => { db.close(); resolve(getAll.result.length) }
          getAll.onerror = () => { db.close(); resolve(0) }
        } catch { db.close(); resolve(0) }
      }
      req.onerror = () => resolve(0)
    })
  }, table)
}

/** Wait until both peers see at least 1 connected peer */
async function waitForPeerDiscovery(peerA: PeerWindow, peerB: PeerWindow, maxAttempts = 24) {
  console.log('  Waiting for BitTorrent tracker peer discovery...')
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await peerA.page.waitForTimeout(5000)

    await peerA.page.goto(`${BASE_URL}/#/network`)
    await peerB.page.goto(`${BASE_URL}/#/network`)
    await peerA.page.waitForTimeout(1500)

    const countA = await getConnectedCount(peerA.page)
    const countB = await getConnectedCount(peerB.page)
    console.log(`  Discovery poll ${attempt}: ${peerA.label}=${countA}, ${peerB.label}=${countB}`)

    if (countA >= 1 && countB >= 1) {
      console.log('  Peers discovered each other!')
      return
    }
  }
  throw new Error('Peers failed to discover each other via BitTorrent trackers')
}

/** Poll until a condition on a page's IndexedDB is met */
async function waitForSync(page: Page, table: string, minCount: number, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.waitForTimeout(5000)
    const count = await countInDB(page, table)
    console.log(`  Sync poll ${attempt}: ${table}=${count} (need >=${minCount})`)
    if (count >= minCount) return
  }
  throw new Error(`Sync timed out: ${table} never reached ${minCount} entries`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P2P Content Fetch Between Peers', () => {
  test.setTimeout(180_000)

  test('community created by Peer A is browsable by Peer B', async ({ browser }) => {
    const peerA = await openPeer(browser, 'Peer-A')
    const peerB = await openPeer(browser, 'Peer-B')

    await createWallet(peerA.page)
    await createWallet(peerB.page)

    await waitForPeerDiscovery(peerA, peerB)

    // Peer A creates a community
    console.log('  Peer A creating community...')
    await createCommunity(peerA.page, 'synctest', 'A community for sync testing')

    // Wait for data to reach Peer B
    await waitForSync(peerB.page, 'communities', 1)

    // Peer B navigates to communities page and sees it in the UI
    await peerB.page.goto(`${BASE_URL}/#/communities`)
    await peerB.page.waitForTimeout(2000)
    await expect(peerB.page.locator('text=synctest')).toBeVisible({ timeout: 10_000 })
    console.log('  Peer B sees community listed on Communities page.')

    // Peer B clicks into the community page
    await peerB.page.goto(`${BASE_URL}/#/c/synctest`)
    await peerB.page.waitForTimeout(2000)
    await expect(peerB.page.locator('text=m/synctest').first()).toBeVisible({ timeout: 10_000 })
    await expect(peerB.page.locator('text=A community for sync testing').first()).toBeVisible({ timeout: 10_000 })
    console.log('  Peer B can browse community page with header and description.')

    await peerA.context.close()
    await peerB.context.close()
  })

  test('post created by Peer A is readable by Peer B', async ({ browser }) => {
    const peerA = await openPeer(browser, 'Peer-A')
    const peerB = await openPeer(browser, 'Peer-B')

    await createWallet(peerA.page)
    await createWallet(peerB.page)

    await waitForPeerDiscovery(peerA, peerB)

    // Peer A creates community + post
    console.log('  Peer A creating community and post...')
    await createCommunity(peerA.page, 'postfetch', 'Post fetch test')
    await createPost(peerA.page, 'postfetch', 'Hello from Peer A', 'This is the full post body that Peer B should be able to read.')

    // Wait for data to reach Peer B
    await waitForSync(peerB.page, 'posts', 1)

    // Peer B navigates to the community and sees the post title
    await peerB.page.goto(`${BASE_URL}/#/c/postfetch`)
    await peerB.page.waitForTimeout(2000)
    await expect(peerB.page.locator('text=Hello from Peer A')).toBeVisible({ timeout: 10_000 })
    console.log('  Peer B sees post title on community page.')

    // Peer B clicks into the post and reads the full content
    await peerB.page.locator('text=Hello from Peer A').first().click()
    await peerB.page.waitForTimeout(2000)
    await expect(peerB.page.locator('text=Hello from Peer A')).toBeVisible({ timeout: 10_000 })
    await expect(peerB.page.locator('text=This is the full post body that Peer B should be able to read.')).toBeVisible({ timeout: 10_000 })
    await expect(peerB.page.locator('text=/[Ss]igned/')).toBeVisible({ timeout: 10_000 })
    console.log('  Peer B can read full post with title, body, and signed badge.')

    await peerA.context.close()
    await peerB.context.close()
  })

  test('comment from Peer B syncs back to Peer A', async ({ browser }) => {
    const peerA = await openPeer(browser, 'Peer-A')
    const peerB = await openPeer(browser, 'Peer-B')

    await createWallet(peerA.page)
    await createWallet(peerB.page)

    await waitForPeerDiscovery(peerA, peerB)

    // Peer A creates community + post
    console.log('  Peer A creating community and post...')
    await createCommunity(peerA.page, 'commentfetch', 'Comment fetch test')
    await createPost(peerA.page, 'commentfetch', 'Discuss this topic', 'Let us discuss.')

    // Wait for post to reach Peer B
    await waitForSync(peerB.page, 'posts', 1)

    // Peer B navigates to the post and adds a comment
    console.log('  Peer B adding comment...')
    await peerB.page.goto(`${BASE_URL}/#/c/commentfetch`)
    await peerB.page.waitForTimeout(2000)
    await peerB.page.locator('text=Discuss this topic').first().click()
    await peerB.page.waitForTimeout(2000)

    await peerB.page.locator('textarea[placeholder="What are your thoughts?"]').fill('Reply from Peer B')
    await peerB.page.locator('button:has-text("Comment")').click()
    await peerB.page.waitForTimeout(2000)

    // Verify Peer B sees their own comment
    await expect(peerB.page.locator('text=Reply from Peer B')).toBeVisible({ timeout: 10_000 })
    console.log('  Peer B sees their own comment.')

    // Wait for comment to sync back to Peer A
    await waitForSync(peerA.page, 'comments', 1)

    // Peer A navigates to the post and sees Peer B's comment
    await peerA.page.goto(`${BASE_URL}/#/c/commentfetch`)
    await peerA.page.waitForTimeout(2000)
    await peerA.page.locator('text=Discuss this topic').first().click()
    await peerA.page.waitForTimeout(2000)

    await expect(peerA.page.locator('text=Reply from Peer B')).toBeVisible({ timeout: 10_000 })
    console.log('  Peer A can see comment from Peer B!')

    await peerA.context.close()
    await peerB.context.close()
  })

  test('vote from Peer B syncs back to Peer A', async ({ browser }) => {
    const peerA = await openPeer(browser, 'Peer-A')
    const peerB = await openPeer(browser, 'Peer-B')

    await createWallet(peerA.page)
    await createWallet(peerB.page)

    await waitForPeerDiscovery(peerA, peerB)

    // Peer A creates community + post
    console.log('  Peer A creating community and post...')
    await createCommunity(peerA.page, 'votefetch', 'Vote fetch test')
    await createPost(peerA.page, 'votefetch', 'Upvote this post', 'Please upvote.')

    // Wait for post to reach Peer B
    await waitForSync(peerB.page, 'posts', 1)

    // Peer B navigates to the post and upvotes
    console.log('  Peer B upvoting post...')
    await peerB.page.goto(`${BASE_URL}/#/c/votefetch`)
    await peerB.page.waitForTimeout(2000)
    await peerB.page.locator('text=Upvote this post').first().click()
    await peerB.page.waitForTimeout(2000)

    await peerB.page.locator('[title="Upvote"]').first().click()
    await peerB.page.waitForTimeout(1500)

    // Verify vote stored on Peer B side
    const votesB = await countInDB(peerB.page, 'votes')
    expect(votesB).toBeGreaterThanOrEqual(1)
    console.log('  Peer B vote recorded.')

    // Wait for vote to sync to Peer A
    await waitForSync(peerA.page, 'votes', 1)

    // Peer A navigates to the post and checks the vote count
    await peerA.page.goto(`${BASE_URL}/#/c/votefetch`)
    await peerA.page.waitForTimeout(2000)
    await peerA.page.locator('text=Upvote this post').first().click()
    await peerA.page.waitForTimeout(2000)

    // Verify vote is reflected in Peer A's DB
    const votesA = await countInDB(peerA.page, 'votes')
    expect(votesA).toBeGreaterThanOrEqual(1)
    console.log('  Peer A received vote from Peer B!')

    await peerA.context.close()
    await peerB.context.close()
  })
})
