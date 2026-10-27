/**
 * Network helpers for dsh-plugin-star-radar.
 *
 * Two read-only endpoints, and that is all:
 *   - the market index (one request, ETag aware) carrying GitHub stars and
 *     30-day downloads for every installable plugin, and
 *   - npm's `latest` manifest, read only for included plugins and only for the
 *     environment notes on their cards.
 *
 * There is deliberately no use of api.npmjs.org/downloads here: its per-package
 * range endpoint rate-limits bursts with HTTP 429 and was the source of a
 * refresh that could stall. One catalog request cannot rate-limit itself.
 */

import { DEFAULTS } from './core.js'

const USER_AGENT = 'dsh-plugin-star-radar/3.0 (+https://github.com/TODO-your-name/dsh-plugin-star-radar)'

export class FetchError extends Error {
  constructor(message, { status = 0, url = '', transient = false } = {}) {
    super(message)
    this.name = 'FetchError'
    this.status = status
    this.url = url
    this.transient = transient
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchOnce(url, { timeoutMs = 20000, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...headers,
      },
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new FetchError(`请求超时（${Math.round(timeoutMs / 1000)}s）：${url}`, { url, transient: true })
    }
    throw new FetchError(`网络请求失败：${error && error.message ? error.message : String(error)}`, { url, transient: true })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson(url, { timeoutMs = 20000, headers = {}, retries = 1, validate = null, allow404 = false } = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchOnce(url, { timeoutMs, headers })
      if (response.status === 304) return { notModified: true, response }
      if (allow404 && response.status === 404) return { missing: true, status: 404, response }
      if (!response.ok) {
        throw new FetchError(`HTTP ${response.status}：${url}`, {
          status: response.status,
          url,
          transient: response.status >= 500 || response.status === 429,
        })
      }
      const text = await response.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        throw new FetchError(`返回内容不是 JSON：${url}`, { url })
      }
      if (typeof validate === 'function') validate(json)
      return { json, text, response }
    } catch (error) {
      lastError = error
      const transient = error instanceof FetchError ? error.transient : true
      if (!transient || attempt >= retries) break
      await sleep(700 * 2 ** attempt + Math.floor(Math.random() * 250))
    }
  }
  throw lastError || new FetchError(`请求失败：${url}`, { url })
}

/**
 * Fetch the market index with conditional headers. A 304 is a success and
 * lets the caller reuse its parsed cache.
 */
export async function fetchCatalog({ url = DEFAULTS.catalogUrl, etag = '', lastModified = '', timeoutMs = 90000 } = {}) {
  const headers = {}
  if (etag) headers['if-none-match'] = etag
  if (lastModified) headers['if-modified-since'] = lastModified
  const result = await fetchJson(url, {
    timeoutMs,
    headers,
    retries: 1,
    validate: json => {
      if (json === null || typeof json !== 'object' || !Array.isArray(json.plugins)) {
        throw new FetchError('插件市场索引缺少 plugins 数组', { url })
      }
    },
  })
  if (result.notModified) return { notModified: true, etag, lastModified }
  return {
    notModified: false,
    plugins: result.json.plugins,
    updated: typeof result.json.updated === 'string' ? result.json.updated : '',
    categories: result.json.categories && typeof result.json.categories === 'object' ? result.json.categories : {},
    etag: result.response.headers.get('etag') || '',
    lastModified: result.response.headers.get('last-modified') || '',
    bytes: result.text ? result.text.length : 0,
  }
}

/** Fetch one published `latest` manifest. A 404 simply means "no notes". */
export async function fetchNpmLatest(packageName, { registry = DEFAULTS.npmRegistry, timeoutMs = DEFAULTS.requestTimeoutMs } = {}) {
  if (typeof packageName !== 'string' || packageName === '') return null
  const encoded = encodeURIComponent(packageName)
  const base = typeof registry === 'string' && registry !== '' ? registry.replace(/\/+$/, '') : DEFAULTS.npmRegistry
  const url = `${base}/${encoded}/latest`
  try {
    const result = await fetchJson(url, { timeoutMs, retries: 0, allow404: true })
    if (result.missing === true) return null
    const json = result.json
    if (!json || typeof json !== 'object' || typeof json.version !== 'string') return null
    return { ...json, _url: url }
  } catch {
    return null
  }
}

export async function mapLimit(items, limit, worker) {
  const list = Array.isArray(items) ? items : []
  const results = new Array(list.length)
  let next = 0
  const size = Math.max(1, Math.min(Number(limit) || 1, list.length || 1))
  const runners = Array.from({ length: size }, async () => {
    while (true) {
      const index = next
      next += 1
      if (index >= list.length) return
      try {
        results[index] = await worker(list[index], index)
      } catch (error) {
        results[index] = { error }
      }
    }
  })
  await Promise.all(runners)
  return results
}
