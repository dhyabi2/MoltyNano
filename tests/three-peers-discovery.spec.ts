import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * Three-Peer Auto-Discovery Test (Trystero / BitTorrent trackers)
 *
 * Simulates 3 independent users opening moltynano.com from separate
 * browsers/devices. Each browser context is fully isolated (separate
 * localStorage, IndexedDB, BroadcastChannel) — identical to 3 different
 * people on 3 different devices.
 *
 * Trystero uses public BitTorrent WebSocket trackers for peer discovery.
 * No local signaling server is needed.
 */

const BASE_URL = 'http://localhost:4173'

// ─── PEER WINDOW SETUP ─────────────────────────────────────────────────────

interface PeerWindow {
  label: string
  context: BrowserContext
  page: Page
}

/** Open a fresh, isolated browser window — like a new user visiting moltynano.com */
async function openNewWindow(browser: Browser, label: string): Promise<PeerWindow> {
  const context = await browser.newContext()
  const page = await context.newPage()

  // Log P2P activity for this window
  page.on('console', (msg) => {
    if (msg.text().includes('[P2P]')) {
      console.log(`  [${label}] ${msg.text()}`)
    }
  })

  // First visit — clear any leftover state
  await page.goto(BASE_URL)
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name)
    }
    localStorage.clear()
  })

  // Reload so the app initializes with clean state
  await page.reload()
  await page.waitForTimeout(3000)

  return { label, context, page }
}

/** Read this window's peer ID from the Network page */
async function getPeerId(win: PeerWindow, timeoutMs = 60_000): Promise<string> {
  await win.page.goto(`${BASE_URL}/#/network`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const id = await win.page.evaluate(() => {
      for (const el of document.querySelectorAll('div, span')) {
        const t = el.textContent?.trim()
        // Trystero selfId: 20-char alphanumeric string
        if (t && /^[A-Za-z0-9]{16,24}$/.test(t) && el.children.length === 0) return t
      }
      return null
    })
    if (id) return id
    await win.page.waitForTimeout(500)
  }
  throw new Error(`[${win.label}] Peer ID not found within ${timeoutMs}ms`)
}

/** Read the "Connected to N peer(s)" count from the Network page */
async function getConnectedCount(win: PeerWindow): Promise<number> {
  const text = await win.page
    .locator('text=/Connected to \\d+ peer/')
    .textContent({ timeout: 3000 })
    .catch(() => null)
  if (text) {
    const m = text.match(/Connected to (\d+) peer/)
    return m ? parseInt(m[1], 10) : 0
  }
  return 0
}

/** Count rows in an IndexedDB table */
async function countInDB(page: Page, table: string): Promise<number> {
  return page.evaluate(
    async (t) => {
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
    },
    table,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Three-Peer Discovery (moltynano.com simulation)', () => {
  test.setTimeout(180_000) // 3 minutes — BitTorrent tracker discovery takes longer

  test('3 users open the site and all discover each other', async ({ browser }) => {
    // ── Open 3 separate browser windows (like 3 different devices) ──
    console.log('  Opening 3 browser windows...')
    const win1 = await openNewWindow(browser, 'User-1')
    const win2 = await openNewWindow(browser, 'User-2')
    const win3 = await openNewWindow(browser, 'User-3')
    const windows = [win1, win2, win3]

    // ── Verify each got a unique peer ID ────────────────────────────
    const ids = await Promise.all(windows.map((w) => getPeerId(w)))
    for (let i = 0; i < 3; i++) {
      console.log(`  ${windows[i].label} peer ID: ${ids[i]}`)
    }
    expect(new Set(ids).size).toBe(3)

    // ── Wait until every window sees at least 2 connected peers ─────
    let allConnected = false
    for (let attempt = 1; attempt <= 24; attempt++) {
      await win1.page.waitForTimeout(5000)

      // Refresh network pages
      for (const w of windows) {
        await w.page.goto(`${BASE_URL}/#/network`)
      }
      await win1.page.waitForTimeout(1500)

      const counts = await Promise.all(windows.map((w) => getConnectedCount(w)))
      console.log(`  Poll ${attempt}: connections = [${counts.map((c, i) => `${windows[i].label}=${c}`).join(', ')}]`)

      if (counts.every((c) => c >= 2)) {
        allConnected = true
        console.log('  All 3 users see each other!')
        break
      }
    }

    expect(allConnected).toBe(true)

    // ── Cleanup ─────────────────────────────────────────────────────
    for (const w of windows) await w.context.close()
  })

  test('data created on one device syncs to the other 2', async ({ browser }) => {
    // ── Open 3 windows ──────────────────────────────────────────────
    console.log('  Opening 3 browser windows...')
    const win1 = await openNewWindow(browser, 'Author')
    const win2 = await openNewWindow(browser, 'Reader-A')
    const win3 = await openNewWindow(browser, 'Reader-B')
    const windows = [win1, win2, win3]

    // ── Wait for peers to discover each other first ─────────────────
    console.log('  Waiting for peer discovery...')
    let peersConnected = false
    for (let attempt = 1; attempt <= 24; attempt++) {
      await win1.page.waitForTimeout(5000)
      for (const w of windows) {
        await w.page.goto(`${BASE_URL}/#/network`)
      }
      await win1.page.waitForTimeout(1000)
      const counts = await Promise.all(windows.map((w) => getConnectedCount(w)))
      console.log(`  Discovery poll ${attempt}: [${counts.join(', ')}]`)
      if (counts.every((c) => c >= 1)) {
        peersConnected = true
        break
      }
    }
    expect(peersConnected).toBe(true)

    // ── Author creates a wallet + community + post ──────────────────
    console.log('  Author creating content...')
    await win1.page.goto(`${BASE_URL}/#/wallet`)
    await win1.page.waitForTimeout(500)
    const genBtn = win1.page.locator('button:has-text("Generate Wallet")')
    if (await genBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await genBtn.click()
      await win1.page.waitForTimeout(1500)
    }

    await win1.page.goto(`${BASE_URL}/#/communities`)
    await win1.page.waitForTimeout(2000)
    await win1.page.locator('text=Create a new community').click()
    await win1.page.waitForTimeout(500)
    await win1.page.locator('input[placeholder="community_name"]').fill('threepeers')
    await win1.page.locator('input[placeholder="What is this community about?"]').fill('Three peer sync test')
    await win1.page.locator('button:has-text("Create")').last().click()
    await win1.page.waitForTimeout(3000)

    await win1.page.goto(`${BASE_URL}/#/c/threepeers`)
    await win1.page.waitForTimeout(1000)
    await win1.page.locator('text=Create a post...').click()
    await win1.page.waitForTimeout(500)
    await win1.page.locator('input[placeholder="Title"]').fill('Hello from Author')
    await win1.page.locator('textarea[placeholder="Text (optional)"]').fill('This should reach both readers')
    await win1.page.locator('button:has-text("Post")').last().click()
    await win1.page.waitForTimeout(2000)

    expect(await countInDB(win1.page, 'communities')).toBeGreaterThanOrEqual(1)
    expect(await countInDB(win1.page, 'posts')).toBeGreaterThanOrEqual(1)
    console.log('  Author content created.')

    // ── Poll until both readers have the community + post ───────────
    let allSynced = false
    for (let attempt = 1; attempt <= 20; attempt++) {
      await win2.page.waitForTimeout(5000)

      const comm2 = await countInDB(win2.page, 'communities')
      const post2 = await countInDB(win2.page, 'posts')
      const comm3 = await countInDB(win3.page, 'communities')
      const post3 = await countInDB(win3.page, 'posts')

      console.log(`  Sync poll ${attempt}: Reader-A(communities=${comm2}, posts=${post2}) Reader-B(communities=${comm3}, posts=${post3})`)

      if (comm2 >= 1 && post2 >= 1 && comm3 >= 1 && post3 >= 1) {
        allSynced = true
        console.log('  Both readers received the data!')
        break
      }
    }

    expect(allSynced).toBe(true)

    // ── Verify readers can see the post in the UI ───────────────────
    await win2.page.goto(`${BASE_URL}/#/c/threepeers`)
    await win2.page.waitForTimeout(2000)
    await expect(win2.page.locator('text=Hello from Author')).toBeVisible({ timeout: 10_000 })

    await win3.page.goto(`${BASE_URL}/#/c/threepeers`)
    await win3.page.waitForTimeout(2000)
    await expect(win3.page.locator('text=Hello from Author')).toBeVisible({ timeout: 10_000 })

    console.log('  Post visible on both reader devices.')

    // ── Cleanup ─────────────────────────────────────────────────────
    for (const w of windows) await w.context.close()
  })
})
