import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apply } from '../lib/index.js'

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

function mockReq(url) {
  const req = Readable.from([])
  req.method = 'GET'
  req.url = url
  req.headers = { host: '127.0.0.1:64370' }
  return req
}

test('apply registers the renamed route and disposes cleanly with the real profileContext shape', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dpr-apply-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const profileDir = path.join(dir, 'profile')
  await fs.mkdir(profileDir, { recursive: true })

  const previousProfileDir = process.env.DSH_PROFILE_DIR
  const previousProfile = process.env.DSH_PROFILE
  process.env.DSH_PROFILE_DIR = profileDir
  process.env.DSH_PROFILE = 'apply-test'
  t.after(() => {
    if (previousProfileDir === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfileDir
    if (previousProfile === undefined) delete process.env.DSH_PROFILE
    else process.env.DSH_PROFILE = previousProfile
  })

  const routes = []
  const effects = []
  const ctx = {
    logger: { info() {}, warn() {} },
    // 0.2.x profileContext exposes no dir/name — the plugin must not depend on it.
    get(name) {
      if (name === 'profileContext') {
        return { packageManager: undefined, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined }
      }
      return undefined
    },
    inject(services, callback) {
      assert.deepEqual(Array.from(services), ['webServer'])
      callback({
        webServer: {
          register(route) {
            routes.push(route)
            return () => { route.disposed = true }
          },
        },
      })
    },
    effect(callback) {
      effects.push(callback())
    },
  }

  apply(ctx, { intervalHours: 168, catalogTtlHours: 168, historyTtlHours: 168, maxCandidates: 10 })
  await new Promise(resolve => setTimeout(resolve, 80))

  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/dsh-plugin-star-radar')
  assert.equal(typeof routes[0].handler, 'function')
  assert.equal(effects.length, 1)
  assert.equal(typeof effects[0], 'function')

  const response = mockRes()
  routes[0].handler(mockReq('/dsh-plugin-star-radar/api/health'), response)
  for (let index = 0; index < 50 && !response.writableEnded; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(response.writableEnded, true)
  assert.equal(response.statusCode, 200)
  const health = JSON.parse(response.body)
  assert.equal(health.ok, true)
  assert.equal(health.package, 'dsh-plugin-star-radar')
  assert.equal(health.profile, 'apply-test')
  assert.equal(health.dataDir, path.join(profileDir, '.dsh-plugin-radar'))
  assert.equal(health.initialized, true)
  assert.ok(await fs.stat(health.dataDir).then(stat => stat.isDirectory()))

  effects[0]()
  assert.equal(routes[0].disposed, true)
})
