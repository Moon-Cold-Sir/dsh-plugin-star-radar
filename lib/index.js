/**
 * dsh-plugin-star-radar host entry.
 *
 * Registers the local HTTP API used by the settings page and owns the refresh
 * timer. Nothing here touches another plugin's services or DOM: the API lives
 * under its own path prefix and the cache under its own profile directory.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import { RadarService } from './service.js'
import { VERSION } from './core.js'

export const name = 'plugin-radar'

export const PACKAGE_NAME = 'dsh-plugin-star-radar'

const ROUTE_PREFIX = '/dsh-plugin-star-radar'
const API_PREFIX = `${ROUTE_PREFIX}/api`
const MAX_BODY_BYTES = 16 * 1024
const REFRESH_TICK_MS = 10 * 60 * 1000

export function apply(ctx, config = {}) {
  const profileDir = resolveProfileDir(ctx)
  const profileName = resolveProfileName(ctx, profileDir)
  const service = new RadarService({
    ctx,
    config,
    profileDir,
    profileName,
    logger: ctx.logger,
  })

  // `ensureReady` (not `init`) so a request arriving before the first
  // initialization completes joins that promise instead of starting a second
  // init that could overwrite a fresh snapshot with the cached one.
  const ready = service.ensureReady().catch(error => {
    service.lastError = error && error.message ? error.message : String(error)
    try { ctx.logger?.warn?.(`[star-radar] 初始化失败：${service.lastError}`) } catch { /* ignore */ }
  })

  let routeDispose = null
  let timer = null
  let kickTimer = null
  let disposed = false

  try {
    ctx.inject(['webServer'], scope => {
      try {
        routeDispose = scope.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: (req, res) => { void handleRequest(service, req, res) },
        })
      } catch (error) {
        try { ctx.logger?.warn?.(`[star-radar] 路由注册失败：${error?.message || error}`) } catch { /* ignore */ }
      }
    })
  } catch (error) {
    try { ctx.logger?.warn?.(`[star-radar] webServer 不可用：${error?.message || error}`) } catch { /* ignore */ }
  }

  ready.then(() => {
    if (disposed) return
    const kick = () => {
      if (disposed) return
      if (!service.isRefreshDue()) return
      service.refresh().catch(error => {
        try { ctx.logger?.warn?.(`[star-radar] 后台刷新失败：${error?.message || error}`) } catch { /* ignore */ }
      })
    }
    // Give the host a moment to finish mounting before the first network call.
    kickTimer = setTimeout(kick, 1800 + Math.floor(Math.random() * 1400))
    kickTimer.unref?.()
    timer = setInterval(kick, REFRESH_TICK_MS)
    timer.unref?.()
  })

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (timer !== null) clearInterval(timer)
    if (kickTimer !== null) clearTimeout(kickTimer)
    service.dispose()
    if (typeof routeDispose === 'function') {
      try { routeDispose() } catch { /* ignore */ }
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => dispose, 'dsh-plugin-star-radar: routes, timer and cache')
  } else {
    // A host without ctx.effect still gets a working plugin; it simply cannot
    // be hot-unloaded. The timers are unref'd so they never hold the process.
    process.once('exit', dispose)
  }
}

function resolveProfileDir(ctx) {
  // DSH sets DSH_PROFILE_DIR for profile-launched hosts and children; it is the
  // only documented source today. `profileContext` in 0.2.x exposes
  // packageManager/startedBundles/overlays/telemetryDisabledEnv but no dir, so
  // that branch only fires on a host that actually provides one.
  try {
    const profileContext = typeof ctx.get === 'function' ? ctx.get('profileContext') : undefined
    if (profileContext && typeof profileContext.dir === 'string' && profileContext.dir !== '') return profileContext.dir
  } catch {
    // Fall through to environment-based discovery.
  }
  if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR !== '') {
    return process.env.DSH_PROFILE_DIR
  }
  if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== '') {
    const profile = typeof process.env.DSH_PROFILE === 'string' && process.env.DSH_PROFILE !== ''
      ? process.env.DSH_PROFILE
      : 'desktop'
    return path.join(process.env.DSH_HOME, 'profiles', profile)
  }
  return ''
}

function resolveProfileName(ctx, profileDir) {
  try {
    const profileContext = typeof ctx.get === 'function' ? ctx.get('profileContext') : undefined
    if (profileContext && typeof profileContext.name === 'string' && profileContext.name !== '') return profileContext.name
  } catch {
    // Fall through.
  }
  if (typeof process.env.DSH_PROFILE === 'string' && process.env.DSH_PROFILE !== '') return process.env.DSH_PROFILE
  return profileDir !== '' ? path.basename(profileDir) : ''
}

function sendJson(res, status, payload) {
  if (res.writableEnded === true) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendError(res, status, code, message, extra = {}) {
  sendJson(res, status, { ok: false, code, message, ...extra })
}

class BodyTooLargeError extends Error {}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLargeError('请求体超过 16 KB 限制'))
        try { req.destroy() } catch { /* ignore */ }
        return
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('请求已中断')))
  })
}

/**
 * Mutating endpoints only accept a request that a browser on this exact origin
 * could have made: a matching `Origin`, or Chromium's same-origin fetch
 * metadata. A cross-site page cannot forge either, and a plain `curl` that
 * sends neither is rejected rather than treated as trusted.
 */
function headerValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function bareHost(value) {
  if (typeof value !== 'string' || value === '') return ''
  const text = value.trim().toLowerCase()
  const withoutPort = text.startsWith('[') ? text.slice(0, text.indexOf(']') + 1) : text.replace(/:\d+$/, '')
  return withoutPort.replace(/^\[|\]$/g, '')
}

function isLoopbackHost(value) {
  const host = bareHost(value)
  return host === '127.0.0.1' || host === '::1' || host === 'localhost' || host.endsWith('.localhost')
}

function isLoopbackSocket(req) {
  // Node reports IPv4-mapped IPv6 as ::ffff:127.0.0.1.
  const raw = req && req.socket && typeof req.socket.remoteAddress === 'string'
    ? req.socket.remoteAddress.toLowerCase().replace(/^::ffff:/, '')
    : ''
  return raw === '127.0.0.1' || raw === '::1'
}

function sameOrigin(value, host) {
  if (typeof value !== 'string' || value === '' || typeof host !== 'string' || host === '') return false
  try {
    return new URL(value).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Mutating endpoints accept only a request this page could have made.
 *
 * Browsers send `Origin` on POST, but the desktop shell does not always: an
 * embedded renderer may omit it, and a loopback request can arrive with no
 * fetch metadata at all. The check is therefore layered, and every layer still
 * rejects a cross-site page:
 *   1. `Origin` present -> it must match `Host` (this alone stops CSRF);
 *   2. `Origin: null`   -> refused (sandboxed iframe / opaque origin);
 *   3. no `Origin`      -> accept `Sec-Fetch-Site: same-origin`, a same-host
 *                          `Referer`, or a loopback socket talking to a
 *                          loopback host (the desktop-shell case).
 */
function isTrustedRequest(req) {
  const site = headerValue(req.headers['sec-fetch-site'])
  if (typeof site === 'string' && site !== '' && site !== 'same-origin' && site !== 'none') return false

  const host = headerValue(req.headers.host)
  if (typeof host !== 'string' || host === '') return false
  const origin = headerValue(req.headers.origin)

  if (typeof origin === 'string' && origin !== '') {
    if (sameOrigin(origin, host)) return true
    let scheme = ''
    try { scheme = origin === 'null' ? '' : new URL(origin).protocol } catch { scheme = '' }
    const opaqueOrCustom = origin === 'null' || (scheme !== '' && scheme !== 'http:' && scheme !== 'https:')
    // The desktop shell can present an opaque origin (file://, sandboxed frame)
    // or its own scheme. A JSON POST from loopback is the app itself: a remote
    // page would need a CORS preflight, and this router never answers one.
    return opaqueOrCustom && isLoopbackHost(host) && isLoopbackSocket(req) && isJsonContentType(req)
  }

  if (site === 'same-origin' || site === 'none') return true

  const referer = headerValue(req.headers.referer)
  if (typeof referer === 'string' && referer !== '' && sameOrigin(referer, host)) return true

  return isLoopbackHost(host) && isLoopbackSocket(req)
}

/** Append one line per refusal so a live 403 can be diagnosed after the fact. */
function logRejection(service, req) {
  try {
    const line = `${new Date().toISOString()} ${describeRejection(req)}\n`
    void fs.appendFile(path.join(service.dataDir, 'rejected.log'), line).catch(() => {})
  } catch {
    // Never let diagnostics break the response.
  }
}

/** One line in the log explaining exactly why a mutation was refused. */
function describeRejection(req) {
  const pick = name => {
    const value = headerValue(req.headers[name])
    return typeof value === 'string' && value !== '' ? value : '(none)'
  }
  const remote = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '(none)'
  return `origin=${pick('origin')} host=${pick('host')} sec-fetch-site=${pick('sec-fetch-site')} referer=${pick('referer')} remote=${remote}`
}

function isJsonContentType(req) {
  const value = req.headers['content-type']
  return typeof value === 'string' && value.toLowerCase().startsWith('application/json')
}

/**
 * Exported for tests: a plain Node request handler with no DSH dependency.
 */
export async function handleRequest(service, req, res) {
  try {
    const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET'
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    if (!pathname.startsWith(ROUTE_PREFIX)) {
      sendError(res, 404, 'not-found', 'Not found')
      return
    }

    if (method === 'GET' && pathname === `${API_PREFIX}/health`) {
      sendJson(res, 200, {
        ok: true,
        package: PACKAGE_NAME,
        modulePath: fileURLToPath(import.meta.url),
        version: VERSION,
        profile: service.profileName,
        dataDir: service.dataDir,
        initialized: service.initialized,
        refreshing: service.refreshing,
        generatedAt: service.snapshot ? service.snapshot.generatedAt : null,
        included: service.snapshot && Array.isArray(service.snapshot.items) ? service.snapshot.items.length : 0,
        rules: service.config ? { minStars: service.config.minStars, minDownloads: service.config.minDownloads } : null,
      })
      return
    }

    if (method === 'GET' && pathname === `${API_PREFIX}/state`) {
      const state = await service.getState()
      sendJson(res, 200, state)
      return
    }

    if (method === 'POST' && pathname === `${API_PREFIX}/refresh`) {
      if (!isTrustedRequest(req)) {
        try { service.warn(`拒绝非同源请求：${describeRejection(req)}`) } catch { /* ignore */ }
        logRejection(service, req)
        sendError(res, 403, 'untrusted-origin', '只接受同源请求。', { detail: describeRejection(req) })
        return
      }
      try {
        await readBody(req).catch(error => {
          if (error instanceof BodyTooLargeError) throw error
          return ''
        })
        await service.refresh({ force: true })
        const state = await service.getState()
        sendJson(res, 200, state)
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          sendError(res, 413, 'payload-too-large', '请求体过大。')
          return
        }
        sendError(res, 502, 'refresh-failed', `刷新失败：${error?.message || error}`, {
          lastError: service.lastError,
        })
      }
      return
    }

    if (method === 'POST' && pathname === `${API_PREFIX}/install`) {
      if (!isTrustedRequest(req)) {
        try { service.warn(`拒绝非同源请求：${describeRejection(req)}`) } catch { /* ignore */ }
        sendError(res, 403, 'untrusted-origin', '只接受同源请求。', { detail: describeRejection(req) })
        return
      }
      if (!isJsonContentType(req)) {
        sendError(res, 415, 'unsupported-media-type', '请求体必须是 application/json。')
        return
      }
      let body
      try {
        const text = await readBody(req)
        body = text === '' ? {} : JSON.parse(text)
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          sendError(res, 413, 'payload-too-large', '请求体过大（上限 16 KB）。')
          return
        }
        sendError(res, 400, 'bad-request', `请求体无法解析：${error?.message || error}`)
        return
      }
      const packageName = body && typeof body.package === 'string' ? body.package.trim() : ''
      if (packageName === '') {
        sendError(res, 400, 'missing-package', '缺少 package 字段。')
        return
      }
      const result = await service.install(packageName)
      const status = result.ok === true
        ? 200
        : result.code === 'already-installed' || result.code === 'busy' ? 409
          : result.code === 'install-failed' || result.code === 'install-timeout' ? 500
            : result.code === 'no-profile' ? 503
              : 400
      sendJson(res, status, result)
      return
    }

    if (pathname === `${API_PREFIX}/state` || pathname === `${API_PREFIX}/refresh` || pathname === `${API_PREFIX}/install`) {
      sendJson(res, 405, {
        ok: false,
        code: 'method-not-allowed',
        message: 'Method not allowed',
        allow: pathname.endsWith('/state') ? 'GET' : 'POST',
      })
      return
    }

    sendError(res, 404, 'not-found', '未知接口。')
  } catch (error) {
    try {
      service.warn(`请求处理失败：${error?.stack || error?.message || error}`)
    } catch {
      // ignore
    }
    if (!res.writableEnded) {
      sendError(res, 500, 'internal-error', '插件热度榜服务出现内部错误。')
    }
  }
}
