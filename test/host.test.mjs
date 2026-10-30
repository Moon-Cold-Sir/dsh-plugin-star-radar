import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { PACKAGE_NAME, handleRequest } from '../lib/index.js'

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writableEnded: false,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = { ...(headers || {}) }
      return this
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
      this.writableEnded = true
    },
  }
}

function mockReq({ method = 'GET', url = '/dsh-plugin-star-radar/api/state', body = '', headers = {}, remoteAddress = '127.0.0.1' } = {}) {
  const req = Readable.from(body === '' ? [] : [body])
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:64370', ...headers }
  req.socket = { remoteAddress }
  return req
}

const ORIGIN = { origin: 'http://127.0.0.1:64370', 'content-type': 'application/json' }

function mockService(overrides = {}) {
  const state = {
    items: [{ package: 'demo-plugin', name: 'Demo', total: 120000 }],
    nearMisses: [],
    generatedAt: new Date().toISOString(),
    stats: { qualified: 1 },
    host: { profile: 'desktop' },
  }
  return {
    profileName: 'desktop',
    dataDir: 'C:/tmp/profile/.dsh-plugin-radar',
    initialized: true,
    refreshing: false,
    snapshot: { generatedAt: state.generatedAt, items: [] },
    lastError: '',
    state,
    refreshed: false,
    installed: '',
    async getState() { return this.state },
    async refresh() { this.refreshed = true; return this.state },
    async install(packageName) {
      this.installed = packageName
      return { ok: true, package: packageName, installed: true, message: 'ok' }
    },
    warn() {},
    ...overrides,
  }
}

async function call(handler, request) {
  const response = mockRes()
  await handler(request, response)
  let json = null
  try { json = response.body === '' ? null : JSON.parse(response.body) } catch { /* leave null */ }
  return { response, json }
}

test('GET /api/state returns the cached state', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq())
  assert.equal(result.response.statusCode, 200)
  assert.equal(result.json.items.length, 1)
  assert.match(result.response.headers['content-type'], /application\/json/)
  assert.match(result.response.headers['cache-control'], /no-store/)
})

test('GET /api/health reports the package identity', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({ url: '/dsh-plugin-star-radar/api/health' }))
  assert.equal(result.response.statusCode, 200)
  assert.equal(result.json.ok, true)
  assert.equal(result.json.package, PACKAGE_NAME)
  assert.equal(result.json.profile, 'desktop')
  assert.match(result.json.dataDir, /dsh-plugin-radar$/)
})

test('POST /api/refresh runs a refresh for a same-origin browser request', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/refresh',
    body: '{}',
    headers: ORIGIN,
  }))
  assert.equal(result.response.statusCode, 200)
  assert.equal(service.refreshed, true)
})

test('POST /api/install forwards a validated package name', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: JSON.stringify({ package: '@scope/demo-plugin' }),
    headers: { ...ORIGIN, 'content-type': 'application/json; charset=utf-8' },
  }))
  assert.equal(result.response.statusCode, 200)
  assert.equal(result.json.ok, true)
  assert.equal(service.installed, '@scope/demo-plugin')
})

test('a cross-origin install is refused', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: JSON.stringify({ package: 'demo-plugin' }),
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
  }))
  assert.equal(result.response.statusCode, 403)
  assert.equal(result.json.code, 'untrusted-origin')
  assert.equal(service.installed, '')
})

test('a local request without an origin is accepted (desktop shell)', async () => {
  const service = mockService()
  const bare = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: JSON.stringify({ package: 'demo-plugin' }),
    headers: { 'content-type': 'application/json' },
  }))
  assert.equal(bare.response.statusCode, 200)

  const labelled = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: JSON.stringify({ package: 'demo-plugin' }),
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
  }))
  assert.equal(labelled.response.statusCode, 200)
})

test('an origin-less request from another machine is still refused', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/refresh',
    body: '{}',
    headers: { host: '192.168.1.7:64370' },
    remoteAddress: '192.168.1.9',
  }))
  assert.equal(result.response.statusCode, 403)
})

test('an opaque origin is pulled apart: JSON from loopback passes, a form post does not', async () => {
  const service = mockService()
  const opaque = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/refresh',
    body: '{}',
    headers: { origin: 'null', 'content-type': 'application/json' },
  }))
  assert.equal(opaque.response.statusCode, 200)

  const opaqueForm = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/refresh',
    body: '{}',
    headers: { origin: 'null', 'content-type': 'text/plain' },
  }))
  assert.equal(opaqueForm.response.statusCode, 403)

  const referer = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/refresh',
    body: '{}',
    headers: { referer: 'http://127.0.0.1:64370/settings' },
    remoteAddress: '192.168.1.9',
  }))
  assert.equal(referer.response.statusCode, 200)
})

test('a cross-site fetch metadata label is refused even with a matching origin', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/refresh',
    body: '{}',
    headers: { ...ORIGIN, 'sec-fetch-site': 'cross-site' },
  }))
  assert.equal(result.response.statusCode, 403)
})

test('install requires a JSON content type', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: '{"package":"demo-plugin"}',
    headers: { origin: 'http://127.0.0.1:64370', 'content-type': 'text/plain' },
  }))
  assert.equal(result.response.statusCode, 415)
  assert.equal(result.json.code, 'unsupported-media-type')
})

test('install rejects an empty package or an unparsable body', async () => {
  const service = mockService()
  const empty = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: '{}',
    headers: ORIGIN,
  }))
  assert.equal(empty.response.statusCode, 400)
  assert.equal(empty.json.code, 'missing-package')

  const broken = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: '{oops',
    headers: ORIGIN,
  }))
  assert.equal(broken.response.statusCode, 400)
  assert.equal(broken.json.code, 'bad-request')
})

test('install failures map to useful HTTP statuses', async () => {
  const service = mockService({
    async install() {
      return { ok: false, code: 'already-installed', message: 'already installed' }
    },
  })
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: JSON.stringify({ package: 'demo-plugin' }),
    headers: ORIGIN,
  }))
  assert.equal(result.response.statusCode, 409)
  assert.equal(result.json.code, 'already-installed')
})

test('an oversized body is refused with 413', async () => {
  const service = mockService()
  const big = 'x'.repeat(20 * 1024)
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'POST',
    url: '/dsh-plugin-star-radar/api/install',
    body: JSON.stringify({ package: 'demo-plugin', padding: big }),
    headers: ORIGIN,
  }))
  assert.equal(result.response.statusCode, 413)
  assert.equal(result.json.code, 'payload-too-large')
})

test('the wrong method gets a JSON 405 without a second writeHead', async () => {
  const service = mockService()
  const result = await call(handleRequest.bind(null, service), mockReq({
    method: 'GET',
    url: '/dsh-plugin-star-radar/api/install',
  }))
  assert.equal(result.response.statusCode, 405)
  assert.equal(result.json.code, 'method-not-allowed')
  assert.equal(result.response.writableEnded, true)
})

test('unknown paths are a JSON 404', async () => {
  const service = mockService()
  const inside = await call(handleRequest.bind(null, service), mockReq({ url: '/dsh-plugin-star-radar/api/nope' }))
  assert.equal(inside.response.statusCode, 404)
  assert.equal(inside.json.code, 'not-found')

  const outside = await call(handleRequest.bind(null, service), mockReq({ url: '/somewhere-else' }))
  assert.equal(outside.response.statusCode, 404)
})
