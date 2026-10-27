import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'screenshots')
await fs.mkdir(outDir, { recursive: true })

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await chromium.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const errors = []

async function newPage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  page.on('pageerror', error => {
    errors.push(`pageerror: ${error.message}`)
    console.log('PAGEERROR', error.message)
  })
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`)
      console.log('CONSOLE', message.text())
    }
  })
  await page.goto('http://127.0.0.1:64555/', { waitUntil: 'networkidle' })
  try {
    await page.waitForSelector('.dpr-card', { timeout: 20000 })
  } catch (error) {
    console.log('BODY TEXT >>>')
    console.log((await page.textContent('body') || '').slice(0, 4000))
    console.log('<<< BODY TEXT')
    throw error
  }
  await page.waitForTimeout(500)
  return page
}

const light = await newPage({ width: 1280, height: 1100 })
const metrics = await light.evaluate(() => ({
  width: document.documentElement.scrollWidth,
  height: document.documentElement.scrollHeight,
  cards: document.querySelectorAll('.dpr-card').length,
  tiers: document.querySelectorAll('.dpr-tier-section').length,
  title: document.querySelector('.dpr-title') ? document.querySelector('.dpr-title').textContent : '',
}))
console.log('light metrics', JSON.stringify(metrics))
await light.screenshot({ path: path.join(outDir, 'light.png'), fullPage: true })
await light.screenshot({ path: path.join(outDir, 'viewport.png'), fullPage: false })

await light.locator('.dpr-card .dpr-btn.ghost').first().click()
await light.waitForSelector('.dpr-card .dpr-details', { timeout: 5000 })
await light.waitForTimeout(250)
await light.locator('.dpr-card .dpr-details').first().scrollIntoViewIfNeeded()
await light.waitForTimeout(200)
await light.screenshot({ path: path.join(outDir, 'details.png'), fullPage: false })

await light.locator('.dpr-card .dpr-btn.primary').first().click()
await light.waitForSelector('.dpr-modal', { timeout: 5000 })
await light.waitForTimeout(250)
await light.screenshot({ path: path.join(outDir, 'dialog.png'), fullPage: false })
await light.locator('.dpr-modal-foot .dpr-btn.primary').click()
await light.waitForSelector('.dpr-result-icon.ok', { timeout: 5000 })
await light.waitForTimeout(250)
await light.screenshot({ path: path.join(outDir, 'dialog-success.png'), fullPage: false })
await light.close()

const dark = await newPage({ width: 1280, height: 1100 })
await dark.addStyleTag({
  content: `:root {
    --dsw-alias-bg-layer-1: #0e1117;
    --dsw-alias-bg-layer-2: #151922;
    --dsw-alias-bg-overlay: #1a1f29;
    --dsw-alias-label-primary: #e8edf6;
    --dsw-alias-label-secondary: #a7b0c0;
    --dsw-alias-label-tertiary: #777f8e;
    --dsw-alias-border-l1: rgba(255,255,255,.09);
    --dsw-alias-border-l2: rgba(255,255,255,.16);
    --dsw-alias-brand-primary: #7c9cff;
  }
  body { background: #0e1117; color: #e8edf6; }`,
})
await dark.waitForTimeout(400)
await dark.screenshot({ path: path.join(outDir, 'dark.png'), fullPage: true })
await dark.screenshot({ path: path.join(outDir, 'dark-viewport.png'), fullPage: false })
await dark.close()

const mobile = await newPage({ width: 430, height: 900 })
const mobileMetrics = await mobile.evaluate(() => ({
  width: document.documentElement.scrollWidth,
  height: document.documentElement.scrollHeight,
  clientWidth: document.documentElement.clientWidth,
}))
console.log('mobile metrics', JSON.stringify(mobileMetrics))
await mobile.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true })
await mobile.close()

console.log('errors', JSON.stringify(errors, null, 2))
await browser.close()
