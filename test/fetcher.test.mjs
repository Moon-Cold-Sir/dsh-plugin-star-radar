import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchCatalog, fetchNpmLatest, mapLimit } from '../lib/fetcher.js'

const originalFetch = globalThis.fetch

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('the catalog request validates the plugins array', async () => {
  globalThis.fetch = async () => response(200, { updated: '2026-10-26', plugins: [{ npm: 'x' }], categories: {} })
  const catalog = await fetchCatalog({ url: 'https://example.test/plugins.json' })
  assert.equal(catalog.notModified, false)
  assert.equal(catalog.plugins.length, 1)
  assert.equal(catalog.updated, '2026-10-26')

  globalThis.fetch = async () => response(200, { updated: '2026-10-26' })
  await assert.rejects(fetchCatalog({ url: 'https://example.test/plugins.json' }), /plugins/)
})

test('a 304 catalog answer is reported without a body', async () => {
  globalThis.fetch = async () => response(304, '')
  const catalog = await fetchCatalog({ url: 'https://example.test/plugins.json', etag: 'abc' })
  assert.equal(catalog.notModified, true)
  assert.equal(catalog.etag, 'abc')
})

test('a missing manifest is null, not an error', async () => {
  globalThis.fetch = async () => response(404, { error: 'Not found' })
  assert.equal(await fetchNpmLatest('pkg-a', { registry: 'https://registry.test' }), null)
})

test('a manifest is returned whole so core can trim it', async () => {
  globalThis.fetch = async () => response(200, { name: 'pkg-a', version: '1.2.3', engines: { node: '>=20' } })
  const latest = await fetchNpmLatest('pkg-a', { registry: 'https://registry.test' })
  assert.equal(latest.version, '1.2.3')
  assert.deepEqual(latest.engines, { node: '>=20' })
})

test('a registry 500 is retried and then surfaces as null', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(500, 'boom')
  }
  assert.equal(await fetchNpmLatest('pkg-a', { registry: 'https://registry.test' }), null)
  assert.equal(calls, 1, 'manifests fail fast rather than retrying')
})

test('mapLimit keeps order and never runs more than the limit', async () => {
  let active = 0
  let maxActive = 0
  const items = [1, 2, 3, 4, 5, 6]
  const results = await mapLimit(items, 2, async value => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active -= 1
    return value * 2
  })
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12])
  assert.ok(maxActive <= 2, `expected <= 2 concurrent workers, saw ${maxActive}`)
})

test('mapLimit isolates a throwing worker', async () => {
  const results = await mapLimit([1, 2, 3], 2, async value => {
    if (value === 2) throw new Error('nope')
    return value
  })
  assert.equal(results[0], 1)
  assert.ok(results[1].error instanceof Error)
  assert.equal(results[2], 3)
})
