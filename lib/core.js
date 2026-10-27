/**
 * Pure data-shaping helpers for dsh-plugin-star-radar.
 *
 * No I/O and no DSH imports: the inclusion rule, the star buckets, the
 * environment notes and the snapshot shape all live here and are covered by
 * test/core.test.mjs.
 *
 * Inclusion model (schema 3)
 * --------------------------
 * A plugin is 收录 (included) when EITHER of these holds:
 *   - its GitHub star count is at least `minStars` (3000 by default, which
 *     keeps the initial board to roughly 25–30 entries), or
 *   - its npm 30-day download count is at least `minDownloads`.
 *
 * Inclusion is sticky by construction: once a plugin is famous enough it stays
 * on the list even if its downloads later fall out of the visible top, which is
 * exactly what a pure leaderboard loses. Every card also carries the reason it
 * is here (`includedBy`).
 *
 * The primary ranking is stars; trailing-30-day downloads is the secondary
 * number. Both come from the single market index request, so a refresh never
 * fans out into per-package npm API calls.
 */

export const DEFAULTS = Object.freeze({
  /** GitHub stars needed to be included. */
  minStars: 3000,
  /** Trailing-30-day npm downloads needed to be included. */
  minDownloads: 100000,
  intervalHours: 6,
  catalogTtlHours: 12,
  metaTtlHours: 24,
  /** How many included plugins get their npm manifest read for environment
   * notes. Entries beyond this keep their card without the extra notes. */
  maxManifest: 80,
  manifestConcurrency: 4,
  /** Hard budget for the manifest phase of one refresh. */
  manifestBudgetMs: 90000,
  requestTimeoutMs: 20000,
  catalogTimeoutMs: 90000,
  nearMissLimit: 8,
  catalogUrl: 'https://awesome-dsh-plugin.com/plugins.json',
  npmRegistry: 'https://registry.npmjs.org',
})

export const VERSION = '3.0.0'

export const SNAPSHOT_SCHEMA = 3

/** Absolute star buckets shown as sections; `minStars` is appended as the last
 * star bucket so lowering the threshold never hides a section. */
const FIXED_STAR_BUCKETS = [5000, 2000, 1000, 500]

function bucketLabel(min) {
  if (min >= 1000) {
    const k = min / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k+`
  }
  return `${min}+`
}

export function starBuckets(minStars = DEFAULTS.minStars) {
  const threshold = Number(minStars) > 0 ? Number(minStars) : DEFAULTS.minStars
  const mins = [...new Set([...FIXED_STAR_BUCKETS.filter(min => min > threshold), threshold])].sort((a, b) => b - a)
  const buckets = mins.map(min => ({
    key: `s${min}`,
    min,
    label: bucketLabel(min),
    title: `★ ${min.toLocaleString('zh-CN')}+`,
  }))
  buckets.push({ key: 'downloads', min: 0, label: '下载入榜', title: '收藏未达门槛，但近 30 天下载量达标' })
  return buckets
}

export function bucketOf(stars, minStars = DEFAULTS.minStars) {
  const value = Number(stars) || 0
  for (const bucket of starBuckets(minStars)) {
    if (bucket.key === 'downloads') continue
    if (value >= bucket.min) return bucket.key
  }
  return 'downloads'
}

export const OS_LABELS = Object.freeze({
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  netbsd: 'NetBSD',
  sunos: 'SunOS',
  aix: 'AIX',
  android: 'Android',
  cygwin: 'Cygwin',
})

export const CPU_LABELS = Object.freeze({
  x64: 'x64',
  arm64: 'arm64',
  ia32: 'ia32',
  arm: 'arm',
  ppc64: 'ppc64',
  s390x: 's390x',
  mips64el: 'mips64el',
})

export function osLabel(value) {
  if (!value) return ''
  const key = String(value)
  const bare = key.startsWith('!') ? key.slice(1) : key
  const label = OS_LABELS[bare] || bare
  return key.startsWith('!') ? `非 ${label}` : label
}

export function cpuLabel(value) {
  if (!value) return ''
  const key = String(value)
  const bare = key.startsWith('!') ? key.slice(1) : key
  return key.startsWith('!') ? `非 ${CPU_LABELS[bare] || bare}` : CPU_LABELS[bare] || bare
}

export function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  try {
    return Math.round(n).toLocaleString('zh-CN')
  } catch {
    return String(Math.round(n))
  }
}

/** 100000 → 10万, 653177 → 65.3万, 2010311 → 201万. */
export function formatWan(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 100000000) {
    const yi = n / 100000000
    return `${yi >= 100 ? Math.round(yi) : Math.round(yi * 100) / 100}亿`
  }
  if (n < 10000) return formatNumber(n)
  const wan = n / 10000
  const rounded = wan >= 100 ? Math.round(wan) : Math.round(wan * 10) / 10
  return `${rounded}万`
}

export function formatCompact(value) {
  return formatWan(value)
}

export function isPackageName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 214
    && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value)
    && !value.includes('..')
}

/** Only http(s) links may reach an `href`, so market-supplied data can never
 * inject a `javascript:` URL into the page. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return ''
  const text = value.trim()
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return text
  } catch {
    return ''
  }
}

export function toNonNegativeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function truncate(value, max = 1200) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string')
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()]
  return []
}

function pickLocalized(value) {
  if (typeof value === 'string') return { zh: value, en: '' }
  if (value && typeof value === 'object') {
    return {
      zh: typeof value.zh === 'string' ? value.zh : '',
      en: typeof value.en === 'string' ? value.en : '',
    }
  }
  return { zh: '', en: '' }
}

function displayNameOf(raw, packageName) {
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (rawName === '') return packageName
  const hash = rawName.lastIndexOf('#')
  if (hash !== -1) {
    const tail = rawName.slice(hash + 1).replace(/^packages\//, '')
    if (tail !== '') return tail
  }
  return rawName
}

function addDaysUtc(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function dateDaysAgoUtc(days, now = Date.now()) {
  return new Date(now - days * 86400000).toISOString().slice(0, 10)
}

export function daysBetween(start, end) {
  const a = new Date(`${start}T00:00:00.000Z`).getTime()
  const b = new Date(`${end}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return Math.round((b - a) / 86400000)
}

/**
 * Pick the 30-day window the market index reports. All entries share the same
 * window today; the majority vote keeps that true if a single row lags behind.
 */
export function pickWindow(entries, now = Date.now()) {
  const counts = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry.downloadsStart !== 'string' || typeof entry.downloadsEnd !== 'string') continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.downloadsStart) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.downloadsEnd)) continue
    const key = `${entry.downloadsStart}|${entry.downloadsEnd}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let best = null
  for (const [key, count] of counts) {
    if (best === null || count > best.count) {
      const [start, end] = key.split('|')
      best = { start, end, count }
    }
  }
  if (best !== null && best.start <= best.end) {
    return { start: best.start, end: best.end, days: daysBetween(best.start, best.end) + 1 }
  }
  const end = dateDaysAgoUtc(1, now)
  const start = addDaysUtc(end, -29)
  return { start, end, days: 30 }
}

function categoryLabelOf(category, categories) {
  if (!category) return ''
  const entry = categories && typeof categories === 'object' ? categories[category] : null
  if (entry && typeof entry === 'object') {
    if (typeof entry.zh === 'string' && entry.zh !== '') return entry.zh
    if (typeof entry.en === 'string' && entry.en !== '') return entry.en
  }
  return String(category)
}

/**
 * Turn the market's plugin rows into one row per npm package. Rows without a
 * usable npm package name are dropped: the board points at installable plugins.
 */
export function normalizeCatalog(plugins, categories = null) {
  if (!Array.isArray(plugins)) return []
  const chosen = new Map()
  for (const raw of plugins) {
    if (raw === null || typeof raw !== 'object') continue
    const packageName = typeof raw.npm === 'string' ? raw.npm.trim() : ''
    if (!isPackageName(packageName)) continue
    const description = pickLocalized(raw.description)
    const entry = {
      name: displayNameOf(raw, packageName),
      package: packageName,
      version: typeof raw.version === 'string' ? raw.version : '',
      description: truncate(description.zh || description.en, 1600),
      descriptionEn: truncate(description.en, 1200),
      category: typeof raw.category === 'string' ? raw.category : '',
      categoryLabel: categoryLabelOf(raw.category, categories),
      stars: toNonNegativeNumber(raw.stars),
      market30: toNonNegativeNumber(raw.downloads),
      downloadsStart: typeof raw.downloadsStart === 'string' ? raw.downloadsStart : '',
      downloadsEnd: typeof raw.downloadsEnd === 'string' ? raw.downloadsEnd : '',
      downloadsCheckedAt: typeof raw.downloadsCheckedAt === 'string' ? raw.downloadsCheckedAt : '',
      repo: safeHttpUrl(raw.url),
      page: safeHttpUrl(raw.page),
      install: typeof raw.install === 'string' ? raw.install : '',
      icon: safeHttpUrl(raw.icon),
      capabilities: asArray(raw.capabilities),
      added: typeof raw.added === 'string' ? raw.added : '',
      updated: typeof raw.updated === 'string' ? raw.updated : '',
      source: 'market',
      meta: null,
    }
    const previous = chosen.get(packageName)
    if (previous === undefined || scoreEntry(entry) > scoreEntry(previous)) chosen.set(packageName, entry)
  }
  return [...chosen.values()].sort((a, b) => b.stars - a.stars || b.market30 - a.market30)
}

function scoreEntry(entry) {
  return entry.stars * 4 + entry.market30 + Math.min(entry.description.length, 1600) * 2
}

/** Why a plugin is on the board; also what keeps it findable after its ranking
 * drops. */
export function inclusionOf(item, minStars = DEFAULTS.minStars, minDownloads = DEFAULTS.minDownloads) {
  const byStars = toNonNegativeNumber(item && item.stars) >= minStars
  const byDownloads = toNonNegativeNumber(item && item.market30) >= minDownloads
  if (byStars && byDownloads) return 'both'
  if (byStars) return 'stars'
  if (byDownloads) return 'downloads'
  return ''
}

export function compactLatest(latest) {
  if (latest === null || typeof latest !== 'object') return null
  const repo = latest.repository
  const repository = typeof repo === 'string'
    ? { url: repo }
    : repo && typeof repo === 'object'
      ? { url: typeof repo.url === 'string' ? repo.url : '', directory: typeof repo.directory === 'string' ? repo.directory : '' }
      : null
  const scripts = latest.scripts && typeof latest.scripts === 'object' ? latest.scripts : {}
  const depKeys = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).slice(0, 60) : []
  return {
    name: typeof latest.name === 'string' ? latest.name : '',
    version: typeof latest.version === 'string' ? latest.version : '',
    description: truncate(typeof latest.description === 'string' ? latest.description : '', 1200),
    engines: latest.engines && typeof latest.engines === 'object' ? latest.engines : null,
    os: asArray(latest.os),
    cpu: asArray(latest.cpu),
    deprecated: typeof latest.deprecated === 'string' ? truncate(latest.deprecated, 500) : '',
    dependencies: depKeys(latest.dependencies),
    peerDependencies: depKeys(latest.peerDependencies),
    optionalDependencies: depKeys(latest.optionalDependencies),
    scripts: {
      preinstall: typeof scripts.preinstall === 'string' ? scripts.preinstall : '',
      install: typeof scripts.install === 'string' ? scripts.install : '',
      postinstall: typeof scripts.postinstall === 'string' ? scripts.postinstall : '',
    },
    dist: latest.dist && typeof latest.dist === 'object'
      ? { unpackedSize: toNonNegativeNumber(latest.dist.unpackedSize), fileCount: toNonNegativeNumber(latest.dist.fileCount) }
      : null,
    dsh: latest.dsh && typeof latest.dsh === 'object' ? latest.dsh : null,
    repository,
    homepage: safeHttpUrl(latest.homepage),
    bugs: latest.bugs && typeof latest.bugs === 'object' && typeof latest.bugs.url === 'string' ? { url: safeHttpUrl(latest.bugs.url) } : null,
    license: typeof latest.license === 'string' ? latest.license : '',
    author: typeof latest.author === 'string'
      ? latest.author
      : latest.author && typeof latest.author === 'object' && typeof latest.author.name === 'string'
        ? latest.author.name
        : '',
    keywords: asArray(latest.keywords).slice(0, 24),
    gypfile: latest.gypfile === true,
    binary: latest.binary && typeof latest.binary === 'object' ? Object.keys(latest.binary).slice(0, 10) : [],
    type: typeof latest.type === 'string' ? latest.type : '',
  }
}

const NATIVE_HINTS = [
  'sharp',
  'canvas',
  'better-sqlite3',
  'sqlite3',
  'node-pty',
  'node-gyp',
  'node-addon-api',
  'ffi-napi',
  'ref-napi',
  'usb',
  'serialport',
  'sodium-native',
  'argon2',
  'bcrypt',
  'leveldown',
  're2',
  'puppeteer',
  'playwright',
  'electron',
]

function nativeDependencies(meta) {
  if (!meta) return []
  const names = [...(meta.dependencies || []), ...(meta.optionalDependencies || [])]
  const found = []
  for (const name of names) {
    if (NATIVE_HINTS.some(hint => name === hint || name.startsWith(`${hint}/`))) found.push(name)
  }
  if (meta.gypfile === true && !found.includes('node-gyp')) found.push('node-gyp')
  if (Array.isArray(meta.binary) && meta.binary.length > 0 && found.length === 0) found.push('prebuilt binary')
  return [...new Set(found)]
}

export function platformCompatible(meta, host) {
  if (!meta || !host) return true
  const os = asArray(meta.os)
  const cpu = asArray(meta.cpu)
  const positives = os.filter(value => !value.startsWith('!'))
  const negatives = os.filter(value => value.startsWith('!')).map(value => value.slice(1))
  if (positives.length > 0 && !positives.includes(host.platform)) return false
  if (negatives.includes(host.platform)) return false
  const positiveCpus = cpu.filter(value => !value.startsWith('!'))
  const negativeCpus = cpu.filter(value => value.startsWith('!')).map(value => value.slice(1))
  if (positiveCpus.length > 0 && !positiveCpus.includes(host.arch)) return false
  if (negativeCpus.includes(host.arch)) return false
  return true
}

export function hostInfo(profile = '') {
  const proc = globalThis.process || {}
  const platform = typeof proc.platform === 'string' ? proc.platform : 'unknown'
  return {
    platform,
    platformLabel: OS_LABELS[platform] || platform,
    arch: typeof proc.arch === 'string' ? proc.arch : 'unknown',
    archLabel: CPU_LABELS[proc.arch] || proc.arch || 'unknown',
    node: proc.versions && typeof proc.versions.node === 'string' ? proc.versions.node : '',
    profile: typeof profile === 'string' ? profile : '',
  }
}

function describeOsList(os) {
  if (!Array.isArray(os) || os.length === 0) return ''
  return os.map(osLabel).filter(Boolean).join(' / ')
}

function describeCpuList(cpu) {
  if (!Array.isArray(cpu) || cpu.length === 0) return ''
  return cpu.map(cpuLabel).filter(Boolean).join(' / ')
}

function note(level, title, text) {
  return { level, title, text }
}

export function deriveRequirements(entry, host) {
  const meta = entry && entry.meta && typeof entry.meta === 'object' ? entry.meta : null
  const engines = meta && meta.engines && typeof meta.engines === 'object' ? meta.engines : {}
  const node = typeof engines.node === 'string' ? engines.node : ''
  const dshCompat = meta && meta.dsh && meta.dsh.compatibility && typeof meta.dsh.compatibility === 'object'
    ? meta.dsh.compatibility
    : {}
  const dsh = typeof dshCompat.dsh === 'string' && dshCompat.dsh !== ''
    ? dshCompat.dsh
    : typeof engines.dsh === 'string' ? engines.dsh : ''
  const os = asArray(meta && meta.os)
  const cpu = asArray(meta && meta.cpu)
  const compatibleHere = platformCompatible(meta, host)
  const native = nativeDependencies(meta)
  const installScripts = meta && meta.scripts
    ? ['preinstall', 'install', 'postinstall'].filter(key => typeof meta.scripts[key] === 'string' && meta.scripts[key] !== '')
    : []
  const size = meta && meta.dist ? toNonNegativeNumber(meta.dist.unpackedSize) : 0
  const dependencies = meta && Array.isArray(meta.dependencies) ? meta.dependencies : []
  const peerDependencies = meta && Array.isArray(meta.peerDependencies) ? meta.peerDependencies : []
  const capabilities = entry && Array.isArray(entry.capabilities) ? entry.capabilities : []
  const notes = []

  if (os.length > 0) {
    if (compatibleHere) {
      notes.push(note('info', '系统要求', `支持 ${describeOsList(os)}；当前系统为 ${host.platformLabel}，满足声明。`))
    } else {
      notes.push(note('danger', '系统不兼容', `该插件声明支持 ${describeOsList(os)}，当前系统为 ${host.platformLabel}，安装后可能无法运行。`))
    }
  } else {
    notes.push(note('info', '系统要求', '包内未声明 os 限制，Windows / macOS / Linux 通用；仍建议先确认插件自身说明。'))
  }

  if (cpu.length > 0) {
    notes.push(note(
      compatibleHere ? 'info' : 'warn',
      'CPU 架构',
      `声明支持 ${describeCpuList(cpu)}；当前架构为 ${host.archLabel}。`,
    ))
  }

  if (node !== '') {
    notes.push(note('info', 'Node.js 要求', `包声明 Node.js ${node}；当前宿主运行时为 Node.js ${host.node || '未知'}。`))
  }

  if (dsh !== '') {
    notes.push(note('info', 'DSH 版本要求', `包声明 DSH ${dsh}；安装前请确认当前 DSH 版本落在该范围内。`))
  } else {
    notes.push(note('info', 'DSH 版本要求', '包内未声明 DSH 版本范围；建议在测试 profile 中先验证。'))
  }

  if (meta && meta.deprecated) {
    notes.push(note('danger', 'npm 已弃用', `npm 将该版本标记为 deprecated：${meta.deprecated}`))
  }

  if (native.length > 0) {
    notes.push(note(
      'warn',
      '原生模块',
      `包含 ${native.join('、')}。首次安装可能需要编译工具链（Windows 需要 VS Build Tools，macOS 需要 Xcode Command Line Tools），安装时间会明显变长。`,
    ))
  }

  if (installScripts.length > 0) {
    notes.push(note('warn', '安装脚本', `安装时会执行 ${installScripts.join(' / ')} 脚本，请确认来源可信后再继续。`))
  }

  if (size >= 20 * 1024 * 1024) {
    notes.push(note('info', '安装体积', `解压后约 ${(size / 1024 / 1024).toFixed(1)} MB，首次下载和安装可能较慢。`))
  }

  if (capabilities.includes('shell')) {
    notes.push(note('warn', '权限：执行命令', '市场索引显示该插件会执行 Shell 命令，请只安装你信任的来源。'))
  }
  if (capabilities.includes('fs-write')) {
    notes.push(note('warn', '权限：写入文件', '市场索引显示该插件可写入工作区文件，安装前请确认其用途。'))
  }
  if (capabilities.includes('network')) {
    notes.push(note('info', '权限：联网', '市场索引显示该插件需要访问网络。'))
  }
  if (capabilities.includes('subagent')) {
    notes.push(note('info', '权限：子代理', '该插件可能会启动子代理执行任务。'))
  }

  notes.push(note('warn', '安装后生效', '安装会写入当前 DSH profile 并更新依赖；通常需要重启或重载 DSH 后才会加载。'))
  notes.push(note('info', '第三方插件', '本榜单按收藏数与下载量收录，不代表安全审计结论。请核对仓库、作者与权限后再安装。'))

  return {
    node,
    dsh,
    os,
    cpu,
    osLabel: os.length > 0 ? describeOsList(os) : 'Windows / macOS / Linux 通用',
    cpuLabel: cpu.length > 0 ? describeCpuList(cpu) : '未声明',
    compatibleHere,
    size,
    dependencies,
    peerDependencies,
    dependencyCount: dependencies.length,
    peerDependencyCount: peerDependencies.length,
    native,
    installScripts,
    deprecated: meta && meta.deprecated ? meta.deprecated : '',
    client: Boolean(meta && meta.dsh && meta.dsh.client),
    host: Boolean(meta && meta.dsh && meta.dsh.bundle),
    declared: Boolean(meta && meta.dsh),
    dshReleases: dshCompat && dshCompat.dshReleases && typeof dshCompat.dshReleases === 'object'
      ? Object.keys(dshCompat.dshReleases).slice(0, 30)
      : [],
    capabilities,
    notes,
  }
}

function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  return {
    engines: meta.engines || null,
    os: Array.isArray(meta.os) ? meta.os : [],
    cpu: Array.isArray(meta.cpu) ? meta.cpu : [],
    deprecated: typeof meta.deprecated === 'string' ? meta.deprecated : '',
    dependencies: Array.isArray(meta.dependencies) ? meta.dependencies.slice(0, 40) : [],
    peerDependencies: Array.isArray(meta.peerDependencies) ? meta.peerDependencies.slice(0, 40) : [],
    dist: meta.dist || null,
    dsh: meta.dsh || null,
    repository: meta.repository || null,
    homepage: typeof meta.homepage === 'string' ? meta.homepage : '',
    license: typeof meta.license === 'string' ? meta.license : '',
    author: typeof meta.author === 'string' ? meta.author : '',
    gypfile: meta.gypfile === true,
    binary: Array.isArray(meta.binary) ? meta.binary : [],
  }
}

export function buildGlobalNotes({
  window = null,
  minStars = DEFAULTS.minStars,
  minDownloads = DEFAULTS.minDownloads,
  intervalHours = DEFAULTS.intervalHours,
} = {}) {
  const windowText = window && window.start && window.end
    ? `${window.start} → ${window.end}（${window.days} 天）`
    : '最近 30 天'
  return [
    note('info', '收录规则', `满足任一条即收录：GitHub 收藏数 ≥ ${formatNumber(minStars)}，或 npm 近 30 天下载 ≥ ${formatNumber(minDownloads)}。收录后不会因为排名变化被移出，方便随时回查。`),
    note('info', '排序方式', `默认按收藏数从高到低；每张卡片同时给出该插件近 30 天的 npm 下载量（统计窗口 ${windowText}），也可以切换为按下载量排序。`),
    note('info', '为什么两个指标', '收藏数代表「有人愿意持续关注」，下载数代表「最近真的被装」。只看下载量，老插件会被挤下去；只看收藏数，会漏掉刚发布但立刻被大量安装的新插件。'),
    note('warn', '安装会改 profile', '点击安装会写入当前 DSH profile 的依赖并更新锁文件；多数插件需要重启或重载 DSH 才会出现在界面中。'),
    note('warn', '安全提示', '收藏与下载都高不等于安全。第三方插件可能申请命令执行、文件读写、网络等权限，请核对仓库、作者与权限后再安装。'),
    note('info', '刷新与缓存', `后台每 ${intervalHours} 小时刷新一次；数据来自插件市场公开索引的单次请求，网络失败时保留上次成功快照。`),
    note('info', '隐私', '本插件只在本地缓存公开市场数据，不上传任何本地信息；安装操作只发往本机 DSH 宿主。'),
  ]
}

export function emptySnapshot({
  host,
  minStars = DEFAULTS.minStars,
  minDownloads = DEFAULTS.minDownloads,
  intervalHours = DEFAULTS.intervalHours,
  status = 'warming',
  message = '',
} = {}) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA,
    generatedAt: null,
    status,
    message,
    window: null,
    metric: 'stars',
    rules: { minStars, minDownloads },
    buckets: starBuckets(minStars),
    categories: [],
    items: [],
    nearMisses: [],
    stats: {
      included: 0,
      starTotal: 0,
      downloadTotal: 0,
      byStars: 0,
      byDownloads: 0,
      both: 0,
      downloadOnly: 0,
      installed: 0,
      catalogNpm: 0,
      catalogTotal: 0,
      topStars: 0,
      topDownloads: 0,
    },
    catalog: null,
    source: null,
    host: host || hostInfo(),
    notes: buildGlobalNotes({ window: null, minStars, minDownloads, intervalHours }),
    warnings: [],
  }
}

function nearMissProgress(entry, minStars, minDownloads) {
  const starPart = minStars > 0 ? (toNonNegativeNumber(entry.stars) / minStars) : 0
  const downloadPart = minDownloads > 0 ? (toNonNegativeNumber(entry.market30) / minDownloads) : 0
  return Math.max(starPart, downloadPart)
}

/**
 * Build the board snapshot. `entries` are normalized catalog rows; only rows
 * satisfying the inclusion rule become items.
 */
export function buildSnapshot({
  entries,
  window,
  host,
  catalogMeta,
  installedNames,
  generatedAt = new Date().toISOString(),
  minStars = DEFAULTS.minStars,
  minDownloads = DEFAULTS.minDownloads,
  intervalHours = DEFAULTS.intervalHours,
  warnings = [],
  nearMissLimit = DEFAULTS.nearMissLimit,
  previous = null,
}) {
  const list = Array.isArray(entries) ? entries : []
  const installed = installedNames instanceof Set ? installedNames : new Set()
  const buckets = starBuckets(minStars)
  const previousStars = new Map()
  if (previous && Array.isArray(previous.items)) {
    for (const item of previous.items) {
      if (item && typeof item.package === 'string') previousStars.set(item.package, Number(item.stars) || 0)
    }
  }
  const previousAt = previous && typeof previous.generatedAt === 'string' ? previous.generatedAt : ''
  const previousFresh = previousAt !== '' && Number.isFinite(Date.parse(previousAt))
    && (Date.now() - Date.parse(previousAt)) < 7 * 86400000

  const items = []
  const near = []
  const categories = new Map()

  for (const entry of list) {
    const includedBy = inclusionOf(entry, minStars, minDownloads)
    if (includedBy === '') {
      near.push({ entry, progress: nearMissProgress(entry, minStars, minDownloads) })
      continue
    }
    const requirements = deriveRequirements(entry, host)
    const stars = toNonNegativeNumber(entry.stars)
    const last30 = toNonNegativeNumber(entry.market30)
    const previousValue = previousFresh ? previousStars.get(entry.package) : undefined
    const starDelta = typeof previousValue === 'number' && previousValue > 0 ? stars - previousValue : null
    const categoryLabel = entry.categoryLabel || entry.category || '未分类'
    categories.set(categoryLabel, (categories.get(categoryLabel) || 0) + 1)
    items.push({
      id: entry.package,
      name: entry.name || entry.package,
      package: entry.package,
      version: entry.version || (entry.meta && entry.meta.version) || '',
      description: entry.description || (entry.meta && entry.meta.description) || '',
      descriptionEn: entry.descriptionEn || '',
      category: entry.category || '',
      categoryLabel,
      stars,
      starDelta,
      last30,
      downloadsStart: entry.downloadsStart || '',
      downloadsEnd: entry.downloadsEnd || '',
      downloadsCheckedAt: entry.downloadsCheckedAt || '',
      includedBy,
      bucket: bucketOf(stars, minStars),
      rank: 0,
      repo: safeHttpUrl(entry.repo || (entry.meta && entry.meta.repository && entry.meta.repository.url) || ''),
      page: safeHttpUrl(entry.page || ''),
      homepage: safeHttpUrl(entry.homepage || (entry.meta && entry.meta.homepage) || ''),
      npmUrl: `https://www.npmjs.com/package/${entry.package}`,
      icon: safeHttpUrl(entry.icon || ''),
      install: entry.install || '',
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities : [],
      added: entry.added || '',
      updated: entry.updated || '',
      installed: installed.has(entry.package),
      compatibleHere: requirements.compatibleHere,
      requirements,
      meta: cleanMeta(entry.meta),
      noticeCount: requirements.notes.filter(item => item.level === 'warn' || item.level === 'danger').length,
    })
  }

  items.sort((a, b) => b.stars - a.stars || b.last30 - a.last30 || a.name.localeCompare(b.name, 'zh-CN'))
  items.forEach((item, index) => { item.rank = index + 1 })

  near.sort((a, b) => b.progress - a.progress)
  const nearMisses = near.slice(0, nearMissLimit).map(({ entry, progress }) => ({
    id: entry.package,
    name: entry.name || entry.package,
    package: entry.package,
    version: entry.version || '',
    description: entry.description || '',
    categoryLabel: entry.categoryLabel || '',
    stars: toNonNegativeNumber(entry.stars),
    last30: toNonNegativeNumber(entry.market30),
    gapStars: Math.max(0, minStars - toNonNegativeNumber(entry.stars)),
    gapDownloads: Math.max(0, minDownloads - toNonNegativeNumber(entry.market30)),
    progress: Math.min(0.999, progress),
    icon: safeHttpUrl(entry.icon || ''),
    npmUrl: `https://www.npmjs.com/package/${entry.package}`,
    installed: installed.has(entry.package),
  }))

  const stats = {
    included: items.length,
    starTotal: items.reduce((sum, item) => sum + item.stars, 0),
    downloadTotal: items.reduce((sum, item) => sum + item.last30, 0),
    byStars: items.filter(item => item.includedBy !== 'downloads').length,
    byDownloads: items.filter(item => item.includedBy !== 'stars').length,
    both: items.filter(item => item.includedBy === 'both').length,
    downloadOnly: items.filter(item => item.includedBy === 'downloads').length,
    installed: items.filter(item => item.installed).length,
    catalogNpm: catalogMeta && Number.isFinite(catalogMeta.npm) ? catalogMeta.npm : list.length,
    catalogTotal: catalogMeta && Number.isFinite(catalogMeta.total) ? catalogMeta.total : 0,
    topStars: items.length > 0 ? items[0].stars : 0,
    topDownloads: items.reduce((max, item) => Math.max(max, item.last30), 0),
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA,
    generatedAt,
    status: 'ready',
    message: '',
    metric: 'stars',
    window,
    rules: { minStars, minDownloads },
    buckets,
    categories: [...categories.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN')),
    items,
    nearMisses,
    stats,
    catalog: catalogMeta ? {
      source: catalogMeta.source || 'awesome-dsh-plugin',
      updated: catalogMeta.updated || '',
      fetchedAt: catalogMeta.fetchedAt || '',
      stale: catalogMeta.stale === true,
      total: stats.catalogTotal,
      npm: stats.catalogNpm,
    } : null,
    source: {
      catalog: catalogMeta && catalogMeta.source ? catalogMeta.source : 'awesome-dsh-plugin',
      stars: 'market index (GitHub stars)',
      downloads: 'market index (npm 30-day)',
      manifests: catalogMeta && Number.isFinite(catalogMeta.manifests) ? catalogMeta.manifests : 0,
    },
    host,
    notes: buildGlobalNotes({ window, minStars, minDownloads, intervalHours }),
    warnings: Array.isArray(warnings) ? warnings.slice(0, 20) : [],
  }
}

export function recomputeInstalled(snapshot, installedNames) {
  if (!snapshot || !Array.isArray(snapshot.items)) return snapshot
  const installed = installedNames instanceof Set ? installedNames : new Set()
  const items = snapshot.items.map(item => (item.installed === installed.has(item.package)
    ? item
    : { ...item, installed: installed.has(item.package) }))
  const nearMisses = Array.isArray(snapshot.nearMisses)
    ? snapshot.nearMisses.map(item => (item.installed === installed.has(item.package)
      ? item
      : { ...item, installed: installed.has(item.package) }))
    : []
  return {
    ...snapshot,
    items,
    nearMisses,
    stats: {
      ...snapshot.stats,
      installed: items.filter(item => item.installed).length,
    },
  }
}
