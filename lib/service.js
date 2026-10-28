/** Host-side service for dsh-plugin-star-radar: cache, refresh, install. */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  DEFAULTS,
  VERSION,
  buildSnapshot,
  compactLatest,
  emptySnapshot,
  hostInfo,
  inclusionOf,
  isPackageName,
  mergeRetained,
  normalizeCatalog,
  pickWindow,
  recomputeInstalled,
} from './core.js'
import { fetchCatalog, fetchNpmLatest, mapLimit } from './fetcher.js'
import { SEEDS, SEED_CATEGORIES } from './seeds.js'

const PACKAGE_NAME = 'dsh-plugin-star-radar'
const LEGACY_PACKAGE_NAMES = ['dsh-plugin-radar', 'dsh-plugin-download-radar']

const SNAPSHOT_FILE = 'snapshot.json'
const RETAINED_FILE = 'retained.json'
const CATALOG_FILE = 'catalog-cache.json'
const META_FILE = 'meta-cache.json'
const INSTALL_TIMEOUT_MS = 6 * 60 * 1000
const PNPM_TIMEOUT_MS = 5 * 60 * 1000

export class RadarService {
  constructor({ ctx, config = {}, profileDir = '', profileName = '', logger = null, fetchers = {} } = {}) {
    this.ctx = ctx
    this.config = sanitizeConfig(config)
    this.logger = logger
    this.fetchers = {
      fetchCatalog,
      fetchNpmLatest,
      ...(fetchers && typeof fetchers === 'object' ? fetchers : {}),
    }
    this.profileDir = typeof profileDir === 'string' ? profileDir : ''
    this.profileName = typeof profileName === 'string' && profileName !== ''
      ? profileName
      : this.profileDir !== '' ? path.basename(this.profileDir) : ''
    this.dataDir = this.resolveDataDir()
    this.snapshot = null
    this.catalogCache = null
    this.metaCache = {}
    this.retainedCache = {}
    this.installed = new Set()
    this.initialized = false
    this.initPromise = null
    this.refreshing = false
    this.inflight = null
    this.installBusy = false
    this.lastError = ''
    this.lastAttemptAt = 0
    this.catalogDirty = false
    this.metaDirty = false
    this.retainedDirty = false
    this.disposed = false
  }

  resolveDataDir() {
    const configured = typeof this.config.dataDir === 'string' ? this.config.dataDir.trim() : ''
    if (configured !== '') return path.isAbsolute(configured) ? configured : path.resolve(this.profileDir || process.cwd(), configured)
    if (this.profileDir !== '') return path.join(this.profileDir, '.dsh-plugin-radar')
    const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
      ? process.env.DSH_HOME
      : path.join(process.cwd(), '.dsh-plugin-radar')
    return path.join(home, 'plugin-radar')
  }

  async ensureReady() {
    if (this.initialized) return
    if (this.initPromise === null) {
      this.initPromise = this.init().catch(error => {
        this.initPromise = null
        throw error
      })
    }
    await this.initPromise
  }

  async init() {
    if (this.disposed) return
    await fs.mkdir(this.dataDir, { recursive: true })
    const [snapshot, catalog, meta, retained, installed] = await Promise.all([
      readJson(path.join(this.dataDir, SNAPSHOT_FILE)),
      readJson(path.join(this.dataDir, CATALOG_FILE)),
      readJson(path.join(this.dataDir, META_FILE)),
      readJson(path.join(this.dataDir, RETAINED_FILE)),
      this.readInstalled().catch(() => new Set()),
    ])
    this.snapshot = normalizeStoredSnapshot(snapshot)
    this.catalogCache = normalizeStoredCatalog(catalog)
    this.metaCache = normalizeStoredMeta(meta)
    this.retainedCache = normalizeStoredRetained(retained)
    this.installed = installed instanceof Set ? installed : new Set()
    if (this.snapshot !== null) this.snapshot = recomputeInstalled(this.snapshot, this.installed)
    this.initialized = true
    this.log(`缓存目录 ${this.dataDir}`)
  }

  log(message) {
    try {
      if (this.logger && typeof this.logger.info === 'function') this.logger.info(`[star-radar] ${message}`)
    } catch {
      // Logging must never be the reason a refresh fails.
    }
  }

  warn(message) {
    try {
      if (this.logger && typeof this.logger.warn === 'function') this.logger.warn(`[star-radar] ${message}`)
    } catch {
      // Ignore logger failures.
    }
  }

  async readInstalled() {
    const result = new Set()
    if (this.profileDir === '') return result
    let pkg
    try {
      pkg = JSON.parse(await fs.readFile(path.join(this.profileDir, 'package.json'), 'utf8'))
    } catch {
      return result
    }
    if (pkg === null || typeof pkg !== 'object') return result
    for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = pkg[key]
      if (deps && typeof deps === 'object') {
        for (const name of Object.keys(deps)) result.add(name)
      }
    }
    const bundles = pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)
      ? pkg.dsh.profile.bundles
      : []
    for (const name of bundles) if (typeof name === 'string') result.add(name)
    return result
  }

  async refreshInstalled() {
    this.installed = await this.readInstalled().catch(() => this.installed)
    if (this.snapshot !== null) {
      this.snapshot = recomputeInstalled(this.snapshot, this.installed)
      await this.persistSnapshot().catch(() => {})
    }
    return this.installed
  }

  isRefreshDue(now = Date.now()) {
    if (this.snapshot === null || typeof this.snapshot.generatedAt !== 'string') return true
    const generated = Date.parse(this.snapshot.generatedAt)
    if (!Number.isFinite(generated)) return true
    return now - generated >= this.config.intervalHours * 3600000
  }

  nextRefreshAt() {
    if (this.snapshot === null || typeof this.snapshot.generatedAt !== 'string') return null
    const generated = Date.parse(this.snapshot.generatedAt)
    if (!Number.isFinite(generated)) return null
    return new Date(generated + this.config.intervalHours * 3600000).toISOString()
  }

  /**
   * The state endpoint must stay fast: it returns the cached snapshot and, when
   * that snapshot is stale, starts a refresh in the background instead of
   * making the settings page wait for the network.
   */
  async getState() {
    await this.ensureReady()
    const installed = await this.readInstalled().catch(() => this.installed)
    this.installed = installed
    let snapshot = this.snapshot
    if (snapshot !== null) {
      snapshot = recomputeInstalled(snapshot, installed)
      this.snapshot = snapshot
    }
    const refreshDue = this.isRefreshDue()
    const shouldKick = refreshDue && !this.refreshing && Date.now() - this.lastAttemptAt > 60000
    const state = snapshot !== null
      ? {
          ...snapshot,
          version: VERSION,
          host: { ...(snapshot.host || hostInfo(this.profileName)), profile: this.profileName },
        }
      : emptySnapshot({
          host: hostInfo(this.profileName),
          minStars: this.config.minStars,
          minDownloads: this.config.minDownloads,
          intervalHours: this.config.intervalHours,
          status: this.lastError !== '' ? 'error' : 'warming',
          message: this.lastError !== ''
            ? `首次读取尚未完成：${this.lastError}`
            : '正在读取插件市场索引，通常几秒钟即可完成…',
        })
    state.refreshing = this.refreshing || shouldKick
    state.refreshDue = refreshDue
    state.nextRefreshAt = this.nextRefreshAt()
    state.lastError = this.lastError
    state.lastAttemptAt = this.lastAttemptAt > 0 ? new Date(this.lastAttemptAt).toISOString() : null
    state.rules = { minStars: this.config.minStars, minDownloads: this.config.minDownloads }
    if (shouldKick) {
      void this.refresh().catch(() => {})
    }
    return state
  }

  async refresh({ force = false } = {}) {
    await this.ensureReady()
    if (this.disposed) throw new Error('star-radar service is disposed')
    if (this.inflight !== null) return this.inflight
    this.refreshing = true
    this.lastAttemptAt = Date.now()
    this.inflight = this.doRefresh(force)
      .then(snapshot => {
        this.lastError = ''
        return snapshot
      })
      .catch(error => {
        this.lastError = error && error.message ? error.message : String(error)
        this.warn(`刷新失败：${this.lastError}`)
        throw error
      })
      .finally(() => {
        this.refreshing = false
        this.inflight = null
      })
    return this.inflight
  }

  async doRefresh(force) {
    const startedAt = Date.now()
    const loaded = await this.loadEntries(force)
    const entries = loaded.entries
    const warnings = []
    if (loaded.error) warnings.push({ stage: 'catalog', message: loaded.error })
    if (loaded.catalogMeta.stale === true) warnings.push({ stage: 'catalog', message: '市场索引为缓存数据，后台会继续重试。' })

    const window = pickWindow(entries)
    const included = entries.filter(entry => inclusionOf(entry, this.config.minStars, this.config.minDownloads) !== '')

    // Manifest reads only feed the environment notes, so they are budgeted and
    // never block the board: whatever misses the budget simply has no notes yet.
    const deadline = Date.now() + this.config.manifestBudgetMs
    let manifests = 0
    let skipped = 0
    const targets = included.slice(0, this.config.maxManifest)
    if (included.length > targets.length) skipped = included.length - targets.length
    await mapLimit(targets, this.config.manifestConcurrency, async entry => {
      if (Date.now() > deadline) {
        skipped += 1
        return null
      }
      const latest = await this.latestFor(entry.package)
      if (latest !== null) {
        entry.meta = latest
        if (!entry.version && latest.version) entry.version = latest.version
        manifests += 1
      }
      return null
    })
    if (skipped > 0) {
      warnings.push({
        stage: 'manifest',
        message: `${skipped} 个插件的环境信息本轮未读取（预算/上限），卡片仍会显示，下轮补齐。`,
      })
    }

    const installed = await this.readInstalled().catch(() => this.installed)
    this.installed = installed
    let snapshot = buildSnapshot({
      entries,
      window,
      host: hostInfo(this.profileName),
      catalogMeta: {
        ...loaded.catalogMeta,
        npm: entries.length,
        manifests,
      },
      installedNames: installed,
      generatedAt: new Date().toISOString(),
      minStars: this.config.minStars,
      minDownloads: this.config.minDownloads,
      intervalHours: this.config.intervalHours,
      warnings,
      nearMissLimit: this.config.nearMissLimit,
      previous: this.snapshot,
    })
    snapshot.version = VERSION

    // Retention: a plugin that once qualified stays visible for retainDays even
    // after it falls below both thresholds, with its last measured numbers.
    const now = Date.now()
    const activePackages = new Set(snapshot.items.map(item => item.package))
    for (const item of snapshot.items) {
      const previousRecord = this.retainedCache[item.package]
      const stamp = new Date(now).toISOString()
      this.retainedCache[item.package] = {
        item,
        lastQualifiedAt: stamp,
        firstIncludedAt: previousRecord && previousRecord.firstIncludedAt ? previousRecord.firstIncludedAt : stamp,
      }
      this.retainedDirty = true
    }
    const retainedList = []
    for (const [packageName, record] of Object.entries(this.retainedCache)) {
      if (activePackages.has(packageName)) continue
      const qualifiedAt = Date.parse(record.lastQualifiedAt)
      const age = Number.isFinite(qualifiedAt) ? now - qualifiedAt : Infinity
      if (age > this.config.retainDays * 86400000) {
        delete this.retainedCache[packageName]
        this.retainedDirty = true
        continue
      }
      retainedList.push({
        ...record.item,
        retained: true,
        lastQualifiedAt: record.lastQualifiedAt,
        firstIncludedAt: record.firstIncludedAt,
      })
    }
    snapshot = mergeRetained(snapshot, retainedList)

    if (this.catalogDirty) {
      await this.writeCatalogCache().catch(error => warnings.push({ stage: 'cache', message: `目录缓存写入失败：${error.message}` }))
      this.catalogDirty = false
    }
    if (this.metaDirty) {
      await this.writeMetaCache().catch(error => warnings.push({ stage: 'cache', message: `包信息缓存写入失败：${error.message}` }))
      this.metaDirty = false
    }
    if (this.retainedDirty) {
      await this.writeRetainedCache().catch(error => warnings.push({ stage: 'cache', message: `保留名单写入失败：${error.message}` }))
      this.retainedDirty = false
    }

    this.snapshot = snapshot
    await this.persistSnapshot().catch(error => this.warn(`快照写入失败：${error.message}`))
    this.log(
      `刷新完成：${snapshot.stats.included} 个收录（收藏 ${snapshot.stats.byStars} / 下载 ${snapshot.stats.byDownloads}），保留 ${snapshot.stats.retained} 个已跌出，` +
      `${manifests} 个环境信息，用时 ${Date.now() - startedAt}ms`,
    )
    return snapshot
  }

  async loadEntries(force) {
    const cache = this.catalogCache
    const cacheAge = cache !== null && typeof cache.fetchedAt === 'string'
      ? Date.now() - Date.parse(cache.fetchedAt)
      : Infinity
    const cacheFresh = cache !== null
      && Array.isArray(cache.entries)
      && cache.entries.length > 0
      && Number.isFinite(cacheAge)
      && cacheAge < this.config.catalogTtlHours * 3600000
    if (!force && cacheFresh) {
      return {
        entries: cache.entries.map(entry => ({ ...entry })),
        catalogMeta: {
          source: cache.source || 'awesome-dsh-plugin',
          updated: cache.updated || '',
          fetchedAt: cache.fetchedAt,
          total: cache.total || 0,
          stale: false,
        },
        fallback: cache.fallback === true,
        error: '',
      }
    }

    try {
      const fetched = await this.fetchers.fetchCatalog({
        url: this.config.catalogUrl,
        etag: cache && cache.etag ? cache.etag : '',
        lastModified: cache && cache.lastModified ? cache.lastModified : '',
        timeoutMs: this.config.catalogTimeoutMs,
      })
      if (fetched.notModified && cache !== null && Array.isArray(cache.entries) && cache.entries.length > 0) {
        this.catalogCache = { ...cache, fetchedAt: new Date().toISOString() }
        this.catalogDirty = true
        this.log('市场索引未变化（304），复用缓存')
        return {
          entries: cache.entries.map(entry => ({ ...entry })),
          catalogMeta: {
            source: cache.source || 'awesome-dsh-plugin',
            updated: cache.updated || '',
            fetchedAt: this.catalogCache.fetchedAt,
            total: cache.total || 0,
            stale: false,
          },
          fallback: cache.fallback === true,
          error: '',
        }
      }
      const entries = normalizeCatalog(fetched.plugins, fetched.categories)
      if (entries.length === 0) throw new Error('市场索引中没有可用的 npm 插件')
      const fetchedAt = new Date().toISOString()
      this.catalogCache = {
        schemaVersion: 3,
        source: 'awesome-dsh-plugin.com',
        updated: fetched.updated || '',
        fetchedAt,
        total: fetched.plugins.length,
        etag: fetched.etag || '',
        lastModified: fetched.lastModified || '',
        fallback: false,
        entries,
      }
      this.catalogDirty = true
      this.log(`市场索引读取成功：${fetched.plugins.length} 行，${entries.length} 个 npm 包，${(fetched.bytes / 1024 / 1024).toFixed(1)} MB`)
      return {
        entries: entries.map(entry => ({ ...entry })),
        catalogMeta: {
          source: 'awesome-dsh-plugin.com',
          updated: fetched.updated || '',
          fetchedAt,
          total: fetched.plugins.length,
          stale: false,
        },
        fallback: false,
        error: '',
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      this.warn(`市场索引读取失败：${message}`)
      if (cache !== null && Array.isArray(cache.entries) && cache.entries.length > 0) {
        return {
          entries: cache.entries.map(entry => ({ ...entry })),
          catalogMeta: {
            source: cache.source || 'awesome-dsh-plugin',
            updated: cache.updated || '',
            fetchedAt: cache.fetchedAt || '',
            total: cache.total || 0,
            stale: true,
          },
          fallback: cache.fallback === true,
          error: message,
        }
      }
      const seedRows = SEEDS.map(seed => ({
        name: seed.name,
        npm: seed.package,
        version: '',
        url: seed.repo || '',
        page: '',
        icon: '',
        stars: 0,
        capabilities: seed.capabilities || [],
        install: `dsh plugin --profile ${this.profileName || 'web'} add ${seed.package}`,
        added: '',
        category: seed.category,
        description: { zh: seed.description, en: '' },
        downloads: 0,
        downloadsStart: '',
        downloadsEnd: '',
      }))
      const entries = normalizeCatalog(seedRows, SEED_CATEGORIES)
      return {
        entries,
        catalogMeta: {
          source: '内置种子目录（市场索引不可达）',
          updated: '',
          fetchedAt: '',
          total: seedRows.length,
          stale: true,
        },
        fallback: true,
        error: message,
      }
    }
  }

  async latestFor(packageName) {
    const cached = this.metaCache[packageName]
    if (cached && cached.latest && Date.now() - Number(cached.at || 0) < this.config.metaTtlHours * 3600000) {
      return cached.latest
    }
    const latest = await this.fetchers.fetchNpmLatest(packageName, {
      registry: this.config.npmRegistry,
      timeoutMs: this.config.requestTimeoutMs,
    })
    if (latest === null) return cached && cached.latest ? cached.latest : null
    const compact = compactLatest(latest)
    if (compact !== null) {
      this.metaCache[packageName] = { at: Date.now(), latest: compact }
      this.metaDirty = true
    }
    return compact
  }

  async writeCatalogCache() {
    if (this.catalogCache === null) return
    await writeJsonAtomic(path.join(this.dataDir, CATALOG_FILE), this.catalogCache)
  }

  /** Persist the retention roster so a restart does not forget it. */
  async writeRetainedCache() {
    const now = Date.now()
    const kept = {}
    const entries = Object.entries(this.retainedCache)
      .filter(([, record]) => record && record.item && typeof record.item.package === 'string')
      .filter(([, record]) => {
        const qualifiedAt = Date.parse(record.lastQualifiedAt)
        return Number.isFinite(qualifiedAt) && now - qualifiedAt <= this.config.retainDays * 86400000
      })
      .sort((a, b) => Date.parse(b[1].lastQualifiedAt) - Date.parse(a[1].lastQualifiedAt))
      .slice(0, 500)
    for (const [name, record] of entries) kept[name] = record
    this.retainedCache = kept
    await writeJsonAtomic(path.join(this.dataDir, RETAINED_FILE), { schemaVersion: 1, entries: kept })
  }

  async writeMetaCache() {
    const now = Date.now()
    const entries = Object.entries(this.metaCache)
      .filter(([, value]) => value && value.latest && Number.isFinite(Number(value.at)))
      .sort((a, b) => Number(b[1].at) - Number(a[1].at))
      .slice(0, 500)
    const kept = {}
    for (const [name, value] of entries) {
      if (now - Number(value.at) <= 7 * 86400000) kept[name] = value
    }
    this.metaCache = kept
    await writeJsonAtomic(path.join(this.dataDir, META_FILE), { schemaVersion: 1, entries: kept })
  }

  async persistSnapshot() {
    if (this.snapshot === null) return
    const snapshot = { ...this.snapshot }
    delete snapshot.refreshing
    delete snapshot.refreshDue
    delete snapshot.nextRefreshAt
    delete snapshot.lastError
    delete snapshot.lastAttemptAt
    await writeJsonAtomic(path.join(this.dataDir, SNAPSHOT_FILE), snapshot)
  }

  findEntry(packageName) {
    if (this.snapshot !== null) {
      for (const item of this.snapshot.items || []) if (item.package === packageName) return item
      for (const item of this.snapshot.nearMisses || []) if (item.package === packageName) return item
    }
    if (this.catalogCache !== null && Array.isArray(this.catalogCache.entries)) {
      return this.catalogCache.entries.find(entry => entry.package === packageName) || null
    }
    return null
  }

  async install(packageName) {
    await this.ensureReady()
    if (this.installBusy) {
      return { ok: false, code: 'busy', message: '另一个安装任务正在进行中，请稍候再试。' }
    }
    if (!isPackageName(packageName)) {
      return { ok: false, code: 'invalid-package', message: '包名不合法，已拒绝安装。' }
    }
    if (packageName === PACKAGE_NAME || LEGACY_PACKAGE_NAMES.includes(packageName)) {
      return { ok: false, code: 'self-install', message: '不能通过本页面安装它自己。' }
    }
    const installed = await this.readInstalled().catch(() => this.installed)
    if (installed.has(packageName)) {
      return { ok: false, code: 'already-installed', message: '该插件已经安装。', installed: true }
    }
    const entry = this.findEntry(packageName)
    if (entry === null) {
      return { ok: false, code: 'unknown-package', message: '这个包不在当前收录列表中，已拒绝安装。' }
    }

    this.installBusy = true
    try {
      const manager = this.ctx && typeof this.ctx.get === 'function' ? this.ctx.get('pluginManager') : undefined
      const result = manager && typeof manager.installBundle === 'function'
        ? await this.installViaManager(manager, packageName)
        : await this.installViaPnpm(packageName)
      if (!result.ok) return result
      await this.refreshInstalled()
      return {
        ...result,
        package: packageName,
        installed: true,
        message: result.message || '安装完成。',
        restartRequired: result.restartRequired !== false,
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      this.warn(`安装 ${packageName} 失败：${message}`)
      return {
        ok: false,
        code: 'install-failed',
        message: `安装失败：${message}`,
        detail: message,
        manual: `pnpm add ${packageName}`,
      }
    } finally {
      this.installBusy = false
    }
  }

  async installViaManager(manager, packageName) {
    const requestId = randomUUID()
    let result
    try {
      result = await withTimeout(
        manager.installBundle(packageName, { requestId }),
        INSTALL_TIMEOUT_MS,
        `安装 ${packageName} 超时（6 分钟）`,
      )
    } catch (error) {
      if (managementCode(error) === 'already-installed') {
        return { ok: false, code: 'already-installed', message: '桌面端认为这个包已经安装。', installed: true }
      }
      throw error
    }
    const application = result && typeof result === 'object' ? result.application : ''
    if (application === 'failed' || application === 'cancelled') {
      const code = managementCode(result.error) || 'install-failed'
      return {
        ok: false,
        code,
        message: describeManagementError(result.error, packageName),
        detail: describeManagementError(result.error, packageName, true),
        manual: `pnpm add ${packageName}`,
      }
    }
    const pendingBuilds = result && Array.isArray(result.pendingBuilds) ? result.pendingBuilds : []
    if (pendingBuilds.length > 0) {
      return {
        ok: false,
        code: 'build-approval-required',
        message: '安装需要先批准该包的安装脚本，请在「设置 → 插件」里完成。',
        detail: `待批准的构建脚本：${pendingBuilds.join('、')}`,
        manual: `pnpm add ${packageName}`,
      }
    }
    const exitCode = result && result.packageResult ? result.packageResult.exitCode : undefined
    if (typeof exitCode === 'number' && exitCode !== 0) {
      return {
        ok: false,
        code: 'install-failed',
        message: `安装进程退出码 ${exitCode}。`,
        detail: String(result.packageResult.output || result.packageResult.stderr || result.packageResult.stdout || '').slice(-4000),
        manual: `pnpm add ${packageName}`,
      }
    }
    return {
      ok: true,
      message: application === 'restart-required' ? '安装完成。重启 DSH 后生效。' : '安装完成。',
      restartRequired: application !== 'installed',
      detail: application ? `宿主返回：${application}` : '',
    }
  }

  async installViaPnpm(packageName) {
    if (this.profileDir === '') {
      return {
        ok: false,
        code: 'no-profile',
        message: '宿主没有提供 profile 目录，无法自动安装。',
        manual: `pnpm add ${packageName}`,
      }
    }
    const invocation = this.ctx && typeof this.ctx.get === 'function'
      ? this.ctx.get('profileContext') && this.ctx.get('profileContext').packageManager
      : null
    let command = 'pnpm'
    let args = ['add', packageName]
    let env = { ...process.env, CI: 'true', NO_COLOR: '1' }
    let shell = process.platform === 'win32'
    if (invocation && typeof invocation.command === 'string' && invocation.command.trim() !== ''
      && Array.isArray(invocation.args) && invocation.args.every(item => typeof item === 'string')) {
      command = invocation.command
      args = [...invocation.args, 'add', packageName]
      env = { ...process.env, ...(invocation.env || {}), CI: 'true', NO_COLOR: '1' }
      shell = process.platform === 'win32' && /\.cmd$/i.test(command)
    } else {
      const script = findPnpmScript()
      if (script !== '') {
        command = process.execPath
        args = [script, 'add', packageName]
        env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', CI: 'true', NO_COLOR: '1' }
        shell = false
      }
    }
    const run = await runProcess(command, args, {
      cwd: this.profileDir,
      env,
      timeoutMs: PNPM_TIMEOUT_MS,
      shell,
    })
    if (run.exitCode !== 0) {
      return {
        ok: false,
        code: run.timedOut ? 'install-timeout' : 'install-failed',
        message: run.timedOut
          ? '安装超时，请到 DSH 的插件设置里查看是否已完成。'
          : `安装命令退出码 ${run.exitCode}。`,
        detail: [run.stdout, run.stderr].filter(Boolean).join('\n').slice(-5000),
        manual: `pnpm add ${packageName}`,
      }
    }
    return {
      ok: true,
      message: '安装完成。重启 DSH 后生效。',
      restartRequired: true,
      detail: [run.stdout, run.stderr].filter(Boolean).join('\n').slice(-2000),
    }
  }

  dispose() {
    this.disposed = true
  }
}

function sanitizeConfig(config) {
  const merged = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) }
  const number = (value, fallback, min, max) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  return {
    ...merged,
    minStars: number(merged.minStars, DEFAULTS.minStars, 1, 10000000),
    minDownloads: number(merged.minDownloads, DEFAULTS.minDownloads, 1, 10000000000),
    intervalHours: number(merged.intervalHours, DEFAULTS.intervalHours, 1, 168),
    catalogTtlHours: number(merged.catalogTtlHours, DEFAULTS.catalogTtlHours, 1, 168),
    retainDays: number(merged.retainDays, DEFAULTS.retainDays, 1, 3650),
    metaTtlHours: number(merged.metaTtlHours, DEFAULTS.metaTtlHours, 1, 168),
    maxManifest: number(merged.maxManifest, DEFAULTS.maxManifest, 0, 400),
    manifestConcurrency: number(merged.manifestConcurrency, DEFAULTS.manifestConcurrency, 1, 12),
    manifestBudgetMs: number(merged.manifestBudgetMs, DEFAULTS.manifestBudgetMs, 5000, 600000),
    requestTimeoutMs: number(merged.requestTimeoutMs, DEFAULTS.requestTimeoutMs, 3000, 120000),
    catalogTimeoutMs: number(merged.catalogTimeoutMs, DEFAULTS.catalogTimeoutMs, 5000, 180000),
    nearMissLimit: number(merged.nearMissLimit, DEFAULTS.nearMissLimit, 0, 30),
    catalogUrl: typeof merged.catalogUrl === 'string' && merged.catalogUrl !== '' ? merged.catalogUrl : DEFAULTS.catalogUrl,
    npmRegistry: typeof merged.npmRegistry === 'string' && merged.npmRegistry !== '' ? merged.npmRegistry : DEFAULTS.npmRegistry,
    dataDir: typeof merged.dataDir === 'string' ? merged.dataDir : '',
  }
}

function normalizeStoredSnapshot(value) {
  if (value === null || typeof value !== 'object') return null
  if (value.schemaVersion !== 3 || !Array.isArray(value.items) || !Array.isArray(value.nearMisses)) return null
  return value
}

function normalizeStoredRetained(value) {
  if (value === null || typeof value !== 'object') return {}
  const source = value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries) ? value.entries : {}
  const out = {}
  for (const [name, record] of Object.entries(source)) {
    if (!record || typeof record !== 'object') continue
    if (!record.item || typeof record.item !== 'object') continue
    if (typeof record.item.package !== 'string' || record.item.package !== name) continue
    if (!Number.isFinite(Date.parse(record.lastQualifiedAt))) continue
    out[name] = record
  }
  return out
}

function normalizeStoredCatalog(value) {
  if (value === null || typeof value !== 'object') return null
  if (!Array.isArray(value.entries) || value.entries.length === 0) return null
  return value
}

function normalizeStoredMeta(value) {
  if (value === null || typeof value !== 'object') return {}
  if (value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)) {
    const out = {}
    for (const [name, item] of Object.entries(value.entries)) {
      if (item && typeof item === 'object' && item.latest && Number.isFinite(Number(item.at))) out[name] = item
    }
    return out
  }
  return {}
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeJsonAtomic(file, value) {
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(value), 'utf8')
  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true }).catch(() => {})
    await fs.rename(tmp, file)
  }
}

function managementCode(error) {
  if (!error || typeof error !== 'object') return ''
  if (typeof error.code === 'string') return error.code
  if (error.error && typeof error.error.code === 'string') return error.error.code
  return ''
}

function describeManagementError(error, packageName, detail = false) {
  const code = managementCode(error)
  const messages = {
    'already-installed': '桌面端认为这个包已经安装，未做改动。',
    'not-removable': '这个插件由桌面端管理，不能通过本页面移除或覆盖。',
    'bundle-in-use': '这个插件正在使用中，桌面端不允许现在覆盖。',
    'stop-profile': '需要先停止当前 profile 才能安装。',
    'management-required': '当前 profile 由桌面端管理，不能直接修改。',
    'incompatible-version': '这个版本与当前 DSH 不兼容，宿主拒绝了安装。',
    'update-incomplete': '桌面端没有在限定时间内完成安装，请到「设置 → 插件」查看状态并重试。',
  }
  if (code !== '' && messages[code]) return messages[code]
  const raw = error && typeof error === 'object'
    ? (typeof error.message === 'string' ? error.message : error.diagnostic)
    : error
  const text = typeof raw === 'string' && raw !== '' ? raw : '宿主没有说明失败原因。'
  return detail ? `${text}${code ? `（${code}）` : ''}` : text
}

function findPnpmScript() {
  const candidates = [process.env.DSH_PNPM, process.env.DSH_PNPM_SCRIPT, process.env.PNPM_SCRIPT, ...process.argv]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate === '') continue
    if (!/pnpm(?:\.mjs|\.cjs|\.js)$/i.test(candidate)) continue
    try {
      if (requireExists(candidate)) return candidate
    } catch {
      // Keep looking.
    }
  }
  return ''
}

function requireExists(file) {
  try {
    const fsSync = process.getBuiltinModule ? process.getBuiltinModule('node:fs') : null
    if (fsSync) return fsSync.existsSync(file)
    return false
  } catch {
    return false
  }
}

function withTimeout(promise, ms, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function runProcess(command, args, { cwd, env, timeoutMs, shell = false }) {
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env,
        shell,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ exitCode: 127, stdout: '', stderr: error.message, timedOut: false })
      return
    }
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
      finish({ exitCode: 124, stdout, stderr: `${stderr}\n安装超时`.trim(), timedOut: true })
    }, Math.max(10000, timeoutMs))
    child.stdout?.on('data', chunk => {
      stdout = (stdout + chunk.toString()).slice(-256 * 1024)
    })
    child.stderr?.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-128 * 1024)
    })
    child.on('error', error => {
      finish({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut })
    })
    child.on('close', code => {
      finish({ exitCode: typeof code === 'number' ? code : 1, stdout, stderr, timedOut })
    })
  })
}

function killTree(child) {
  if (!child || typeof child.pid !== 'number') return
  try {
    if (process.platform === 'win32') {
      const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      taskkill.on('error', () => {})
    } else {
      child.kill('SIGTERM')
      setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* already gone */ }
      }, 5000).unref?.()
    }
  } catch {
    // Best effort.
  }
}

export { readJson, writeJsonAtomic }
