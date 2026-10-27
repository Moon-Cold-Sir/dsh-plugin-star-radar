import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSnapshot,
  bucketOf,
  deriveRequirements,
  formatNumber,
  formatWan,
  inclusionOf,
  normalizeCatalog,
  safeHttpUrl,
  starBuckets,
} from '../lib/core.js'

const HOST = { platform: 'win32', platformLabel: 'Windows', arch: 'x64', archLabel: 'x64', node: '24', profile: 'p' }

function row(packageName, stars, downloads, overrides = {}) {
  return {
    name: packageName,
    npm: packageName,
    stars,
    downloads,
    url: `https://github.com/example/${packageName}`,
    description: { zh: `${packageName} 的中文简介`, en: `about ${packageName}` },
    category: 'ui',
    added: '2026-08-01',
    ...overrides,
  }
}

test('number formatting stays readable at every magnitude', () => {
  assert.equal(formatNumber(89901), '89,901')
  assert.equal(formatWan(9999), '9,999')
  assert.equal(formatWan(100000), '10万')
  assert.equal(formatWan(653177), '65.3万')
})

test('star buckets always end with the configured threshold plus a download bucket', () => {
  const buckets = starBuckets(300)
  assert.deepEqual(buckets.map(bucket => bucket.key), ['s5000', 's2000', 's1000', 's500', 's300', 'downloads'])
  assert.deepEqual(starBuckets(1000).map(bucket => bucket.key), ['s5000', 's2000', 's1000', 'downloads'])
  assert.deepEqual(starBuckets(8000).map(bucket => bucket.key), ['s8000', 'downloads'])
})

test('bucketOf places a package in the highest matching star bucket', () => {
  assert.equal(bucketOf(89901, 300), 's5000')
  assert.equal(bucketOf(2100, 300), 's2000')
  assert.equal(bucketOf(640, 300), 's500')
  assert.equal(bucketOf(300, 300), 's300')
  assert.equal(bucketOf(299, 300), 'downloads')
})

test('inclusion needs either enough stars or enough 30-day downloads', () => {
  assert.equal(inclusionOf({ stars: 3000, market30: 0 }), 'stars')
  assert.equal(inclusionOf({ stars: 0, market30: 100000 }), 'downloads')
  assert.equal(inclusionOf({ stars: 3000, market30: 100000 }), 'both')
  assert.equal(inclusionOf({ stars: 2999, market30: 99999 }), '')
  assert.equal(inclusionOf({ stars: 10, market30: 500 }, 300, 100), 'downloads')
})

test('the catalog drops non-npm rows, de-duplicates and strips unsafe links', () => {
  const entries = normalizeCatalog([
    row('pkg-a', 10, 10),
    row('pkg-a', 99, 20, { description: { zh: '更长的描述文本，用来赢得去重' } }),
    { name: 'no npm', npm: null, stars: 99999 },
    { name: 'bad', npm: '../../etc/passwd' },
    row('pkg-d', 5, 5, { url: 'javascript:alert(1)', page: 'https://ok.example/p', icon: 'data:image/svg+xml,x' }),
  ], { ui: { zh: '界面' } })
  assert.equal(entries.length, 2)
  const a = entries.find(entry => entry.package === 'pkg-a')
  assert.equal(a.stars, 99)
  assert.equal(a.description, '更长的描述文本，用来赢得去重')
  assert.equal(a.categoryLabel, '界面')
  const d = entries.find(entry => entry.package === 'pkg-d')
  assert.equal(d.repo, '')
  assert.equal(d.icon, '')
  assert.equal(d.page, 'https://ok.example/p')
})

test('safeHttpUrl only lets http(s) through', () => {
  assert.equal(safeHttpUrl('https://github.com/a/b'), 'https://github.com/a/b')
  assert.equal(safeHttpUrl('javascript:alert(1)'), '')
  assert.equal(safeHttpUrl('data:text/html,x'), '')
  assert.equal(safeHttpUrl(''), '')
  assert.equal(safeHttpUrl(null), '')
})

test('requirements explain OS, Node, native modules and install scripts', () => {
  const host = { platform: 'win32', platformLabel: 'Windows', arch: 'x64', archLabel: 'x64', node: '24.0.0', profile: 'test' }
  const compatible = deriveRequirements({
    package: 'x',
    meta: { engines: { node: '>=20', dsh: '>=0.2.0' }, os: ['win32', 'linux'], scripts: { postinstall: 'node x.js' } },
  }, host)
  assert.equal(compatible.compatibleHere, true)
  assert.ok(compatible.installScripts.includes('postinstall'))

  const incompatible = deriveRequirements({ package: 'y', meta: { os: ['darwin'] } }, host)
  assert.equal(incompatible.compatibleHere, false)
  assert.ok(incompatible.notes.some(note => note.level === 'danger'))

  const native = deriveRequirements({ package: 'z', meta: { dependencies: ['sharp'] } }, host)
  assert.deepEqual(native.native, ['sharp'])
})

test('buildSnapshot keeps every included plugin, ranked by stars', () => {
  const entries = normalizeCatalog([
    row('big-stars', 9000, 100),
    row('both', 500, 200000),
    row('downloads-only', 20, 150000),
    row('too-small', 100, 1000),
  ])
  const snapshot = buildSnapshot({
    entries,
    window: { start: '2026-09-27', end: '2026-10-26', days: 30 },
    host: HOST,
    catalogMeta: { source: 'market', total: 4, npm: 4, updated: '2026-10-26' },
    installedNames: new Set(['both']),
    minStars: 300,
    minDownloads: 100000,
    nearMissLimit: 5,
  })
  assert.equal(snapshot.schemaVersion, 3)
  assert.equal(snapshot.metric, 'stars')
  assert.deepEqual(snapshot.items.map(item => item.package), ['big-stars', 'both', 'downloads-only'])
  assert.deepEqual(snapshot.items.map(item => item.rank), [1, 2, 3])
  assert.equal(snapshot.items[0].bucket, 's5000')
  assert.equal(snapshot.items[1].includedBy, 'both')
  assert.equal(snapshot.items[2].includedBy, 'downloads')
  assert.equal(snapshot.items[1].installed, true)
  assert.equal(snapshot.stats.included, 3)
  assert.equal(snapshot.stats.downloadOnly, 1)
  assert.equal(snapshot.stats.starTotal, 9520)
  assert.equal(snapshot.nearMisses.length, 1)
  assert.equal(snapshot.nearMisses[0].package, 'too-small')
  assert.equal(snapshot.nearMisses[0].gapStars, 200)
  assert.ok(snapshot.categories.length > 0)
})

test('a plugin stays included when its rank drops, which is the whole point', () => {
  const before = normalizeCatalog([row('veteran', 4000, 400000), row('newcomer', 350, 1000)])
  const first = buildSnapshot({
    entries: before,
    window: null,
    host: HOST,
    catalogMeta: null,
    installedNames: new Set(),
    minStars: 300,
    minDownloads: 100000,
  })
  const after = normalizeCatalog([row('veteran', 4000, 10), row('newcomer', 350, 1000)])
  const second = buildSnapshot({
    entries: after,
    window: null,
    host: HOST,
    catalogMeta: null,
    installedNames: new Set(),
    minStars: 300,
    minDownloads: 100000,
    previous: first,
  })
  assert.deepEqual(second.items.map(item => item.package), ['veteran', 'newcomer'])
  assert.equal(second.items[0].includedBy, 'stars')
  assert.equal(second.items[0].last30, 10)
})

test('star movement is reported against the previous snapshot only when it is fresh', () => {
  const entries = normalizeCatalog([row('mover', 500, 0)])
  const previous = buildSnapshot({
    entries: normalizeCatalog([row('mover', 480, 0)]),
    window: null,
    host: HOST,
    catalogMeta: null,
    installedNames: new Set(),
    minStars: 300,
    minDownloads: 100000,
  })
  const snapshot = buildSnapshot({
    entries,
    window: null,
    host: HOST,
    catalogMeta: null,
    installedNames: new Set(),
    minStars: 300,
    minDownloads: 100000,
    previous,
  })
  assert.equal(snapshot.items[0].starDelta, 20)

  const stale = buildSnapshot({
    entries,
    window: null,
    host: HOST,
    catalogMeta: null,
    installedNames: new Set(),
    minStars: 300,
    minDownloads: 100000,
    previous: { ...previous, generatedAt: new Date(Date.now() - 30 * 86400000).toISOString() },
  })
  assert.equal(stale.items[0].starDelta, null)
})

test('unsafe links never reach the page', () => {
  const entries = normalizeCatalog([row('unsafe', 500, 0)])
  entries[0].repo = 'javascript:alert(1)'
  entries[0].icon = 'data:image/svg+xml,x'
  const snapshot = buildSnapshot({
    entries,
    window: null,
    host: HOST,
    catalogMeta: null,
    installedNames: new Set(),
    minStars: 300,
    minDownloads: 100000,
  })
  assert.equal(snapshot.items[0].repo, '')
  assert.equal(snapshot.items[0].icon, '')
})
