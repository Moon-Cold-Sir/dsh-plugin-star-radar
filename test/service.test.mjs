import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RadarService } from '../lib/service.js'

const CATALOG = [
  {
    name: 'A',
    npm: 'pkg-a',
    stars: 1200,
    downloads: 5000,
    url: 'https://github.com/example/a',
    category: 'ui',
    description: { zh: 'A 的描述' },
    downloadsStart: '2026-09-27',
    downloadsEnd: '2026-10-26',
  },
  {
    name: 'B',
    npm: 'pkg-b',
    stars: 350,
    downloads: 200000,
    url: 'https://github.com/example/b',
    category: 'tools',
    description: { zh: 'B 的描述' },
    downloadsStart: '2026-09-27',
    downloadsEnd: '2026-10-26',
  },
  {
    name: 'C',
    npm: 'pkg-c',
    stars: 20,
    downloads: 10,
    url: 'https://github.com/example/c',
    category: 'tools',
    description: { zh: 'C 的描述' },
    downloadsStart: '2026-09-27',
    downloadsEnd: '2026-10-26',
  },
]

async function setup({ dependencies = { 'pkg-b': '1.0.0' }, config = {} } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dpr-star-'))
  const profile = path.join(dir, 'profile')
  await fs.mkdir(profile, { recursive: true })
  await fs.writeFile(path.join(profile, 'package.json'), JSON.stringify({
    name: 'radar-test-profile',
    private: true,
    dependencies,
    dsh: { profile: { bundles: ['pkg-b'] } },
  }, null, 2))

  const calls = { catalog: 0, latest: [] }
  const fetchers = {
    async fetchCatalog() {
      calls.catalog += 1
      return {
        notModified: false,
        plugins: CATALOG,
        categories: { ui: { zh: '界面', en: 'UI' }, tools: { zh: '工具', en: 'Tools' } },
        updated: '2026-10-26',
        etag: 'etag-1',
        lastModified: 'Mon',
        bytes: 1024,
      }
    },
    async fetchNpmLatest(packageName) {
      calls.latest.push(packageName)
      return { name: packageName, version: '1.2.3', engines: { node: '>=20' }, dist: { unpackedSize: 1024 } }
    },
  }

  const service = new RadarService({
    profileDir: profile,
    profileName: 'test',
    fetchers,
    config: {
      minStars: 300,
      minDownloads: 100000,
      catalogTtlHours: 12,
      metaTtlHours: 24,
      manifestBudgetMs: 30000,
      ...config,
    },
    ctx: { get() { return undefined } },
  })
  await service.init()
  return { dir, profile, service, calls }
}

async function cleanup(dir) {
  await fs.rm(dir, { recursive: true, force: true })
}

test('refresh includes star leaders and download leaders, ranked by stars', async t => {
  const { dir, service, calls } = await setup()
  t.after(() => cleanup(dir))

  const snapshot = await service.refresh()
  assert.equal(snapshot.schemaVersion, 3)
  assert.deepEqual(snapshot.items.map(item => item.package), ['pkg-a', 'pkg-b'])
  assert.deepEqual(snapshot.items.map(item => item.includedBy), ['stars', 'both'])
  assert.equal(snapshot.items[0].stars, 1200)
  assert.equal(snapshot.items[0].last30, 5000)
  assert.equal(snapshot.items[1].installed, true)
  assert.equal(snapshot.stats.included, 2)
  assert.equal(snapshot.source.manifests, 2)
  assert.deepEqual(calls.latest.sort(), ['pkg-a', 'pkg-b'])
  assert.equal(snapshot.window.start, '2026-09-27')
  assert.equal(snapshot.rules.minStars, 300)

  const cache = JSON.parse(await fs.readFile(path.join(dir, 'profile', '.dsh-plugin-radar', 'catalog-cache.json'), 'utf8'))
  assert.equal(cache.schemaVersion, 3)
  assert.equal(cache.entries.length, 3)
})

test('the second refresh reuses the catalog and manifest caches', async t => {
  const { dir, service, calls } = await setup()
  t.after(() => cleanup(dir))
  await service.refresh()
  assert.equal(calls.catalog, 1)
  assert.equal(calls.latest.length, 2)

  await service.refresh()
  assert.equal(calls.catalog, 1, 'catalog cache should be reused')
  assert.equal(calls.latest.length, 2, 'manifest cache should be reused')
})

test('maxManifest caps manifest reads and warns about the rest', async t => {
  const { dir, service, calls } = await setup({ config: { maxManifest: 1 } })
  t.after(() => cleanup(dir))
  const snapshot = await service.refresh()
  assert.equal(calls.latest.length, 1)
  assert.equal(snapshot.source.manifests, 1)
  assert.ok(snapshot.warnings.some(warning => warning.stage === 'manifest'))
})

test('getState serves the cached snapshot and marks old data as due', async t => {
  const { dir, service } = await setup()
  t.after(() => cleanup(dir))
  await service.refresh()
  const fresh = await service.getState()
  assert.equal(fresh.refreshDue, false)
  assert.equal(fresh.rules.minStars, 300)
  service.snapshot.generatedAt = new Date(Date.now() - 13 * 3600000).toISOString()
  const stale = await service.getState()
  assert.equal(stale.refreshDue, true)
})

test('a catalog failure falls back to the cached catalog', async t => {
  const { dir, profile, service } = await setup()
  t.after(() => cleanup(dir))
  await service.refresh()

  const failing = new RadarService({
    profileDir: profile,
    profileName: 'test',
    config: { minStars: 300, minDownloads: 100000 },
    fetchers: {
      async fetchCatalog() { throw new Error('market down') },
      async fetchNpmLatest() { return null },
    },
    ctx: { get() { return undefined } },
  })
  await failing.init()
  const snapshot = await failing.refresh({ force: true })
  assert.deepEqual(snapshot.items.map(item => item.package), ['pkg-a', 'pkg-b'])
  assert.equal(snapshot.catalog.stale, true)
  assert.ok(snapshot.warnings.some(warning => warning.stage === 'catalog'))
})

test('install goes through pluginManager and records the new dependency', async t => {
  const { dir, profile, service } = await setup()
  t.after(() => cleanup(dir))
  await service.refresh()
  const requests = []
  service.ctx = {
    get(name) {
      if (name !== 'pluginManager') return undefined
      return {
        async installBundle(spec, options) {
          requests.push({ spec, options })
          const file = path.join(profile, 'package.json')
          const pkg = JSON.parse(await fs.readFile(file, 'utf8'))
          pkg.dependencies[spec] = '1.0.0'
          await fs.writeFile(file, JSON.stringify(pkg, null, 2))
          return { application: 'restart-required', packageResult: { exitCode: 0 } }
        },
      }
    },
  }
  const result = await service.install('pkg-a')
  assert.equal(result.ok, true)
  assert.equal(result.installed, true)
  assert.equal(result.restartRequired, true)
  assert.equal(requests.length, 1)
  assert.match(requests[0].options.requestId, /^[0-9a-f-]{36}$/)
})

test('install refuses itself, legacy names, installed and unknown packages', async t => {
  const { dir, service } = await setup()
  t.after(() => cleanup(dir))
  await service.refresh()
  assert.equal((await service.install('dsh-plugin-star-radar')).code, 'self-install')
  assert.equal((await service.install('dsh-plugin-download-radar')).code, 'self-install')
  assert.equal((await service.install('dsh-plugin-radar')).code, 'self-install')
  assert.equal((await service.install('pkg-b')).code, 'already-installed')
  assert.equal((await service.install('not-on-the-board')).code, 'unknown-package')
  assert.equal((await service.install('../../etc/passwd')).code, 'invalid-package')
})

test('a build-approval request is surfaced instead of reported as success', async t => {
  const { dir, service } = await setup()
  t.after(() => cleanup(dir))
  await service.refresh()
  service.ctx = {
    get() {
      return {
        async installBundle() {
          return { application: 'restart-required', pendingBuilds: ['esbuild'], packageResult: { exitCode: 0 } }
        },
      }
    },
  }
  const result = await service.install('pkg-a')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'build-approval-required')
  assert.match(result.detail, /esbuild/)
})
