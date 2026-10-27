/**
 * Manual live smoke test: reads the real market index, prints the board, and
 * leaves the snapshot in `preview/profile` so the preview harness renders real
 * data.
 *
 *   node scripts/live-check.mjs             # full run (default manifest budget)
 *   node scripts/live-check.mjs --no-manifest  # skip npm manifests (one request)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { RadarService } from '../lib/service.js'
import { formatNumber, formatWan } from '../lib/core.js'

const root = path.resolve(import.meta.dirname, '..')
const profileDir = path.join(root, 'preview', 'profile')
await fs.mkdir(profileDir, { recursive: true })
await fs.writeFile(path.join(profileDir, 'package.json'), JSON.stringify({
  name: 'radar-preview',
  private: true,
  dsh: { profile: { bundles: ['dshmarket', 'dsh-plugin-star-radar'] } },
  dependencies: { dshmarket: '1.71.1' },
}, null, 2))

const args = new Set(process.argv.slice(2))
const service = new RadarService({
  profileDir,
  profileName: 'preview',
  config: {
    intervalHours: 6,
    catalogTimeoutMs: 120000,
    requestTimeoutMs: 20000,
    manifestConcurrency: 4,
    maxManifest: args.has('--no-manifest') ? 0 : 80,
    manifestBudgetMs: 90000,
  },
  logger: console,
})

await service.init()
const started = Date.now()
const snapshot = await service.refresh({ force: true })
await service.writeCatalogCache()
await service.writeMetaCache()

const rules = snapshot.rules
console.log('\n=== dsh-plugin-star-radar live snapshot ===')
console.log(`generated ${snapshot.generatedAt} · downloads window ${snapshot.window.start} → ${snapshot.window.end}`)
console.log(`rules: stars >= ${rules.minStars} OR 30-day downloads >= ${rules.minDownloads}`)
console.log(`catalog ${snapshot.catalog.npm} npm packages · included ${snapshot.stats.included} (by stars ${snapshot.stats.byStars}, by downloads ${snapshot.stats.byDownloads}, both ${snapshot.stats.both}, download-only ${snapshot.stats.downloadOnly})`)
console.log(`stars total ${formatNumber(snapshot.stats.starTotal)} · 30-day downloads total ${formatWan(snapshot.stats.downloadTotal)} · manifests ${snapshot.source.manifests}`)
console.log('')
console.log('rank  stars    dl30      includedBy  package')
for (const item of snapshot.items) {
  console.log(
    `${String(item.rank).padStart(4)}  ${String(formatNumber(item.stars)).padStart(6)}  ${String(formatWan(item.last30)).padStart(8)}  ` +
    `${item.includedBy.padEnd(10)}  ${item.package}${item.installed ? '  [installed]' : ''}`,
  )
}
if (snapshot.nearMisses.length > 0) {
  console.log('\n近一点:')
  for (const item of snapshot.nearMisses) {
    console.log(`  ★ ${String(item.stars).padStart(6)}  下载 ${String(formatWan(item.last30)).padStart(8)}  ${item.package}`)
  }
}
if (snapshot.warnings.length > 0) {
  console.log('\nwarnings:')
  for (const warning of snapshot.warnings) console.log(`  [${warning.stage}] ${warning.message}`)
}
console.log(`\nelapsed ${Date.now() - started}ms`)
service.dispose()
