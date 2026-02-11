import { test, expect } from '@playwright/test'
import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BASE_URL = 'http://localhost:4173'

// nano-pow needs WebGL/WebGPU - enable software GL for headless
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  },
})

test('nano-pow generates valid work client-side in browser (no RPC)', async ({ page }) => {
  // Find the nano-pow chunk filename from the build output
  const assetsDir = join(__dirname, '..', 'dist', 'assets')
  const files = readdirSync(assetsDir)
  const nanoPowChunk = files.find(f => f.startsWith('main.min-') && f.endsWith('.js'))

  expect(nanoPowChunk).toBeTruthy()
  const chunkUrl = `/assets/${nanoPowChunk}`

  await page.goto(BASE_URL)
  await page.waitForTimeout(1000)

  const result = await page.evaluate(async (url: string) => {
    try {
      const mod = await import(url)
      const NanoPow = mod.NanoPow || mod.default

      if (!NanoPow?.work_generate) {
        return { ok: false, error: 'NanoPow.work_generate not found', keys: Object.keys(mod) }
      }

      const hash = '0000000000000000000000000000000000000000000000000000000000000001'
      const start = Date.now()
      const res = await NanoPow.work_generate(hash, { difficulty: 'fffffe0000000000' })
      const elapsed = Date.now() - start

      if ('error' in res) {
        return { ok: false, error: res.error, elapsed }
      }
      return { ok: true, work: res.work, difficulty: res.difficulty, elapsed }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }, chunkUrl)

  console.log('Client-side PoW result:', JSON.stringify(result))
  expect(result.ok).toBe(true)
  expect(result.work).toBeTruthy()
  expect(result.work.length).toBe(16)
  console.log(`Client-side work generated in ${result.elapsed}ms`)
})
