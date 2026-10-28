/**
 * dsh-plugin-star-radar browser half.
 *
 * Hand-written __ModuleLoader__ bundle (no build-time framework): React is
 * resolved from the host's module table and every class is namespaced with
 * `dpr-`. The built file is produced from this source plus client.css by
 * scripts/build-client.mjs.
 *
 * The board lists every 收录 plugin (★ >= minStars OR 30-day downloads >=
 * minDownloads) and ranks them by GitHub stars; downloads are the secondary
 * number and an alternative sort order.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-star-radar',
  factory: function (require) {
    'use strict'

    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useMemo = React.useMemo
    var useRef = React.useRef
    var CSS = __DPR_CSS__
    var API = '/dsh-plugin-star-radar/api'
    var STYLE_ID = 'dsh-plugin-star-radar-style'

    function formatNumber(value) {
      var n = Number(value)
      if (!isFinite(n)) return '0'
      try { return Math.round(n).toLocaleString('zh-CN') } catch (error) { return String(Math.round(n)) }
    }

    function formatWan(value) {
      var n = Number(value)
      if (!isFinite(n) || n <= 0) return '0'
      if (n >= 100000000) {
        var yi = n / 100000000
        return (yi >= 100 ? Math.round(yi) : Math.round(yi * 100) / 100) + '亿'
      }
      if (n < 10000) return formatNumber(n)
      var wan = n / 10000
      var rounded = wan >= 100 ? Math.round(wan) : Math.round(wan * 10) / 10
      return rounded + '万'
    }

    function compact(value) {
      return formatWan(value)
    }

    function relativeTime(iso) {
      if (typeof iso !== 'string' || iso === '') return '尚未更新'
      var time = Date.parse(iso)
      if (!isFinite(time)) return '尚未更新'
      var diff = Math.max(0, Date.now() - time)
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
      if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + ' 天前'
      try { return new Date(time).toLocaleDateString('zh-CN') } catch (error) { return '较早' }
    }

    function formatDateTime(iso) {
      if (typeof iso !== 'string' || iso === '') return '—'
      var time = Date.parse(iso)
      if (!isFinite(time)) return '—'
      try {
        return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      } catch (error) { return '—' }
    }

    function safeHref(value) {
      if (typeof value !== 'string') return ''
      var text = value.trim()
      if (text === '') return ''
      return /^https?:\/\//i.test(text) ? text : ''
    }

    function hashString(text) {
      var hash = 0
      var value = String(text || '')
      for (var i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
      return Math.abs(hash)
    }

    function initial(name) {
      var value = String(name || '?').trim()
      if (value === '') return '?'
      var clean = value.replace(/^@[^/]+\//, '')
      var parts = clean.split(/[\s._/-]+/).filter(Boolean)
      while (parts.length > 1 && /^(dsh|dshweb|deepseek|better)$/i.test(parts[0])) parts.shift()
      if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
      var single = parts[0] || clean
      return single.slice(0, 2).toUpperCase()
    }

    function shortVersion(value, max) {
      var text = String(value || '')
      var limit = typeof max === 'number' ? max : 18
      if (text.length <= limit) return text
      return text.slice(0, limit - 1) + '…'
    }

    var ICONS = {
      refresh: ['M20 11a8 8 0 1 0-2.35 5.65', 'M20 4v7h-7'],
      search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M20 20l-4.3-4.3'],
      download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'],
      check: ['M4.5 12.5l4.5 4.5L19.5 6.5'],
      alert: ['M12 3l9 16H3z', 'M12 9v5', 'M12 17h.01'],
      info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 11v5', 'M12 8h.01'],
      chevronDown: ['m6 9 6 6 6-6'],
      chevronUp: ['m6 15 6-6 6 6'],
      close: ['M6 6l12 12', 'M18 6L6 18'],
      external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5'],
      shield: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'm9 12 2 2 4-4'],
      cpu: ['M8 8h8v8H8z', 'M4 9h2', 'M4 15h2', 'M18 9h2', 'M18 15h2', 'M9 4v2', 'M15 4v2', 'M9 18v2', 'M15 18v2'],
      monitor: ['M3 4h18v12H3z', 'M9 20h6', 'M12 16v4'],
      node: ['M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z', 'M12 7v10', 'M7.5 9.3l9 5.4'],
      layers: ['m12 3 9 5-9 5-9-5z', 'm3 12 9 5 9-5', 'm3 16 9 5 9-5'],
      spark: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
      arrowUp: ['M12 19V5', 'm5 12 7-7 7 7'],
      arrowDown: ['M12 5v14', 'm5 12 7 7 7-7'],
      clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 7v5l3 2'],
      globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M3 12h18', 'M12 3c3 3.5 3 14 0 18', 'M12 3c-3 3.5-3 14 0 18'],
      terminal: ['m4 6 4 4-4 4', 'M12 18h8'],
      file: ['M6 3h8l4 4v14H6z', 'M14 3v5h4'],
      star: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z'],
      chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
      tag: ['M3 12V4h8l10 10-8 8z', 'M7.5 8.5h.01'],
    }

    function Icon(props) {
      var paths = ICONS[props.name] || ICONS.spark
      var children = paths.map(function (d, index) { return h('path', { key: index, d: d }) })
      return h('svg', {
        className: 'dpr-icon' + (props.className ? ' ' + props.className : ''),
        width: props.size || 16,
        height: props.size || 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, children)
    }

    function ensureStyle() {
      if (typeof document === 'undefined') return
      var old = document.getElementById(STYLE_ID)
      if (old && old.parentNode) old.parentNode.removeChild(old)
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function dropStyle() {
      if (typeof document === 'undefined') return
      var old = document.getElementById(STYLE_ID)
      if (old && old.parentNode) old.parentNode.removeChild(old)
    }

    function cx() {
      var out = []
      for (var i = 0; i < arguments.length; i += 1) if (arguments[i]) out.push(arguments[i])
      return out.join(' ')
    }

    function request(path, options) {
      var opts = options || {}
      var timeout = typeof opts.timeout === 'number' ? opts.timeout : 30000
      var controller = new AbortController()
      var timer = setTimeout(function () { controller.abort() }, timeout)
      var headers = { accept: 'application/json' }
      if (opts.body !== undefined && opts.body !== null) headers['content-type'] = 'application/json'
      return fetch(API + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body === undefined ? undefined : opts.body,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      }).then(function (response) {
        return response.text().then(function (text) {
          var json
          try { json = text === '' ? {} : JSON.parse(text) } catch (error) { throw new Error('本地服务返回了非 JSON 响应') }
          if (!response.ok && json.ok !== false) throw new Error(json.message || ('HTTP ' + response.status))
          return json
        })
      }).catch(function (error) {
        if (error && error.name === 'AbortError') throw new Error('请求超时，请稍后重试')
        throw error
      }).finally(function () { clearTimeout(timer) })
    }

    function fallbackCopy(value) {
      return new Promise(function (resolve, reject) {
        try {
          var area = document.createElement('textarea')
          area.value = value
          area.setAttribute('readonly', 'readonly')
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          var ok = document.execCommand('copy')
          document.body.removeChild(area)
          ok ? resolve() : reject(new Error('复制失败'))
        } catch (error) { reject(error) }
      })
    }

    function copyText(text) {
      var value = String(text || '')
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(value).catch(function () { return fallbackCopy(value) })
      }
      return fallbackCopy(value)
    }

    function Avatar(props) {
      var failedState = useState(false)
      var failed = failedState[0]
      var setFailed = failedState[1]
      var hue = hashString(props.name) % 360
      var icon = safeHref(props.icon)
      return h('div', {
        className: cx('dpr-avatar', props.small && 'small'),
        style: { background: 'linear-gradient(135deg, hsl(' + hue + ' 72% 55%), hsl(' + ((hue + 34) % 360) + ' 78% 43%))' },
        'aria-hidden': 'true',
      }, [
        icon && !failed ? h('img', {
          key: 'img',
          src: icon,
          alt: '',
          loading: 'lazy',
          referrerPolicy: 'no-referrer',
          onError: function () { setFailed(true) },
        }) : null,
        (!icon || failed) ? h('span', { key: 'letter' }, initial(props.name)) : null,
      ])
    }

    function Tag(props) {
      return h('span', { className: cx('dpr-tag', props.tone), title: props.title }, [
        props.icon ? h(Icon, { key: 'i', name: props.icon, size: 11 }) : null,
        h('span', { key: 't' }, props.children),
      ])
    }

    var SORTS = [
      { key: 'stars', label: '按收藏', hint: 'GitHub 收藏数从高到低' },
      { key: 'downloads', label: '按下载', hint: '近 30 天下载量从高到低' },
      { key: 'name', label: '按名称', hint: '按插件名排序' },
    ]

    function inclusionLabel(includedBy, rules) {
      if (includedBy === 'both') return '收藏 + 下载双料'
      if (includedBy === 'stars') return '收藏 ≥ ' + formatNumber(rules.minStars)
      return '下载 ≥ ' + formatWan(rules.minDownloads)
    }

    function Hero(props) {
      var data = props.data
      var stats = data && data.stats ? data.stats : null
      var catalog = data && data.catalog ? data.catalog : null
      var rules = data && data.rules ? data.rules : { minStars: props.minStars, minDownloads: props.minDownloads }
      var stale = Boolean(data && data.catalog && data.catalog.stale)
      var busy = Boolean(props.refreshing || (data && data.refreshing))
      return h('section', { className: 'dpr-hero' }, [
        h('div', { className: 'dpr-hero-head', key: 'head' }, [
          h('div', { key: 'left' }, [
            h('div', { className: 'dpr-kicker', key: 'k' }, [
              h('i', { className: 'dpr-live-dot', key: 'dot' }),
              h('span', { key: 't' }, 'DSH PLUGIN RADAR'),
            ]),
            h('h1', { className: 'dpr-title', key: 'title' }, ['插件', h('span', { key: 's' }, '热度榜')]),
            h('p', { className: 'dpr-sub', key: 'sub' },
              '收藏 ≥ ' + formatNumber(rules.minStars) + ' 或近 30 天下载 ≥ ' + formatWan(rules.minDownloads) +
              ' 的插件会被收录，默认按收藏数排名——掉出前排也依然找得到。'),
          ]),
          h('div', { className: 'dpr-hero-actions', key: 'actions' }, [
            h('span', {
              className: 'dpr-live-pill',
              key: 'live',
              'data-stale': stale ? 'true' : 'false',
              'data-busy': busy ? 'true' : 'false',
            }, [
              h(Icon, { key: 'i', name: busy ? 'refresh' : 'spark', size: 12, className: busy ? 'dpr-spin' : '' }),
              h('span', { key: 't' }, busy ? '正在刷新' : stale ? '缓存数据' : '实时榜单'),
            ]),
            h('button', {
              className: 'dpr-hero-btn dpr-primary',
              key: 'refresh',
              type: 'button',
              onClick: props.onRefresh,
              disabled: busy,
              title: '重新读取市场索引',
            }, [
              h(Icon, { key: 'i', name: 'refresh', size: 14, className: busy ? 'dpr-spin' : '' }),
              h('span', { key: 't' }, busy ? '刷新中…' : '刷新数据'),
            ]),
          ]),
        ]),
        h('div', { className: 'dpr-hero-stats', key: 'stats' }, [
          stat(
            '收录插件',
            stats ? formatNumber(stats.included) : '—',
            stats && stats.retained > 0 ? '另保留 ' + formatNumber(stats.retained) + ' 个已跌出' : '收藏或下载达标',
          ),
          stat('收藏合计', stats ? formatNumber(stats.starTotal) : '—', '收录插件 ★ 总和'),
          stat('近 30 天下载', stats ? compact(stats.downloadTotal) : '—', '收录插件合计'),
          stat('下载入榜', stats ? formatNumber(stats.downloadOnly) : '—', '收藏未达门槛'),
        ]),
        h('div', { className: 'dpr-hero-foot', key: 'foot' }, [
          h('span', { key: 'w' }, [h(Icon, { key: 'i', name: 'clock', size: 12 }), ' 下载窗口 ', h('b', { key: 'b' }, data && data.window ? data.window.start + ' → ' + data.window.end : '—')]),
          h('i', { className: 'dpr-dot', key: 'd1' }),
          h('span', { key: 'c' }, ['收录 ', h('b', { key: 'b' }, catalog ? formatNumber(catalog.npm) : '—'), ' 个 npm 包']),
          h('i', { className: 'dpr-dot', key: 'd2' }),
          h('span', { key: 'v' }, ['环境信息 ', h('b', { key: 'b' }, data && data.source && typeof data.source.manifests === 'number' ? formatNumber(data.source.manifests) : '—')]),
          h('i', { className: 'dpr-dot', key: 'd3' }),
          h('span', { key: 'u' }, ['更新于 ', h('b', { key: 'b' }, data ? relativeTime(data.generatedAt) : '—')]),
          h('i', { className: 'dpr-dot', key: 'd4' }),
          h('span', { key: 'p' }, ['profile ', h('b', { key: 'b' }, (data && data.host && data.host.profile) || '当前')]),
        ]),
      ])
    }

    function stat(label, value, sub) {
      return h('div', { className: 'dpr-hero-stat', key: label }, [
        h('label', { key: 'l' }, label),
        h('b', { key: 'v' }, value),
        h('small', { key: 's' }, sub || ''),
      ])
    }

    function NoticeGrid(props) {
      var notes = props.data && props.data.notes ? props.data.notes : []
      function pick(key, fallbackTitle, fallbackText, fallbackTone) {
        var found = null
        for (var i = 0; i < notes.length; i += 1) if (String(notes[i].title || '').indexOf(key) !== -1) { found = notes[i]; break }
        return found || { level: fallbackTone || 'info', title: fallbackTitle, text: fallbackText }
      }
      var items = [
        pick('收录规则', '收录规则', '收藏数或下载量达标即收录，收录后不会因为排名变化被移出。', 'info'),
        pick('为什么两个指标', '为什么两个指标', '收藏代表持续关注，下载代表最近真被装；两个一起看才不漏人。', 'info'),
        pick('安全', '安全提示', '收藏与下载都高不等于安全。请核对仓库、作者与权限后再安装。', 'warn'),
      ]
      return h('div', { className: 'dpr-notice-grid' }, items.map(function (item, index) {
        return h('div', {
          className: 'dpr-notice-item',
          key: index,
          'data-tone': item.level === 'warn' || item.level === 'danger' ? 'warn' : 'info',
        }, [
          h('span', { className: 'dpr-notice-ico', key: 'ico' }, h(Icon, { name: index === 0 ? 'star' : index === 1 ? 'chart' : 'shield', size: 13 })),
          h('div', { key: 'body' }, [h('h4', { key: 't' }, item.title), h('p', { key: 'p' }, item.text)]),
        ])
      }))
    }

    function Toolbar(props) {
      return h('div', { className: 'dpr-toolbar' }, [
        h('label', { className: 'dpr-search', key: 'search' }, [
          h(Icon, { key: 'i', name: 'search', size: 15 }),
          h('input', {
            key: 'input',
            value: props.query,
            onChange: function (event) { props.setQuery(event.target.value) },
            placeholder: '搜索插件名、包名、描述或分类…',
            'aria-label': '搜索插件',
            type: 'search',
          }),
          props.query ? h('button', {
            key: 'clear',
            className: 'dpr-search-clear',
            type: 'button',
            onClick: function () { props.setQuery('') },
            'aria-label': '清空搜索',
          }, h(Icon, { name: 'close', size: 13 })) : null,
        ]),
        h('select', {
          className: 'dpr-select',
          key: 'category',
          value: props.category,
          onChange: function (event) { props.setCategory(event.target.value) },
          'aria-label': '分类筛选',
        }, [h('option', { value: 'all', key: 'all' }, '全部分类')].concat(
          (props.categories || []).map(function (item) {
            return h('option', { value: item.label, key: item.label }, item.label + '（' + item.count + '）')
          }),
        )),
        h('select', {
          className: 'dpr-select',
          key: 'sort',
          value: props.sort,
          onChange: function (event) { props.setSort(event.target.value) },
          'aria-label': '排序方式',
        }, SORTS.map(function (item) {
          return h('option', { value: item.key, key: item.key, title: item.hint }, item.label)
        })),
        h('button', {
          className: 'dpr-toggle',
          key: 'hide',
          type: 'button',
          'aria-pressed': props.hideInstalled ? 'true' : 'false',
          onClick: function () { props.setHideInstalled(!props.hideInstalled) },
          title: '隐藏已安装插件',
        }, [h(Icon, { key: 'i', name: 'check', size: 13 }), '隐藏已安装']),
        h('button', {
          className: 'dpr-refresh-btn',
          key: 'refresh',
          type: 'button',
          onClick: props.onRefresh,
          disabled: props.refreshing,
        }, [h(Icon, { key: 'i', name: 'refresh', size: 14, className: props.refreshing ? 'dpr-spin' : '' }), props.refreshing ? '刷新中…' : '刷新']),
      ])
    }

    function BucketLadder(props) {
      var items = props.items || []
      var counts = {}
      for (var i = 0; i < items.length; i += 1) counts[items[i].bucket] = (counts[items[i].bucket] || 0) + 1
      var chips = [h('button', {
        className: 'dpr-ladder-chip',
        key: 'all',
        type: 'button',
        'data-active': props.value === 'all' ? 'true' : 'false',
        style: { '--tier-color': '#4f74ff' },
        onClick: function () { props.onChange('all') },
        'aria-pressed': props.value === 'all' ? 'true' : 'false',
      }, [h('i', { className: 'dpr-ladder-dot', key: 'd' }), '全部', h('span', { className: 'dpr-ladder-count', key: 'c' }, items.length)])]
      for (var j = 0; j < props.buckets.length; j += 1) {
        var bucket = props.buckets[j]
        if (!counts[bucket.key]) continue
        chips.push(h('button', {
          className: 'dpr-ladder-chip',
          key: bucket.key,
          type: 'button',
          'data-active': String(props.value) === String(bucket.key) ? 'true' : 'false',
          style: { '--tier-color': bucket.key === 'downloads' ? '#0e9f9a' : bucket.key === 'retained' ? '#7c8698' : '#c58a00' },
          title: bucket.title,
          onClick: function (value) { return function () { props.onChange(String(value)) } }(bucket.key),
          'aria-pressed': String(props.value) === String(bucket.key) ? 'true' : 'false',
        }, [
          h('i', { className: 'dpr-ladder-dot', key: 'd' }),
          bucket.key === 'downloads' ? '下载入榜' : bucket.key === 'retained' ? '已跌出' : '★ ' + bucket.label,
          h('span', { className: 'dpr-ladder-count', key: 'c' }, counts[bucket.key]),
        ]))
      }
      return h('div', { className: 'dpr-ladder', role: 'group', 'aria-label': '按收藏分组筛选' }, chips)
    }

    function Banner(props) {
      return h('div', { className: 'dpr-banner', 'data-tone': props.tone || 'info', role: props.tone === 'danger' ? 'alert' : 'status' }, [
        h(Icon, { key: 'i', name: props.icon || 'info', size: 13 }),
        h('span', { key: 't' }, props.children),
        props.action ? h('span', { className: 'dpr-banner-action', key: 'a' }, props.action) : null,
      ])
    }

    function StatusBanners(props) {
      var data = props.data
      if (!data) return null
      var banners = []
      if (data.lastError) {
        banners.push(h(Banner, {
          key: 'err',
          tone: 'danger',
          icon: 'alert',
          action: h('button', { type: 'button', onClick: props.onRefresh }, '重试'),
        }, ['上次刷新失败：', data.lastError]))
      }
      if (data.catalog && data.catalog.stale) {
        banners.push(h(Banner, {
          key: 'stale',
          tone: 'warn',
          icon: 'clock',
        }, ['市场索引为缓存数据（' + (data.catalog.updated || '未知日期') + '）。刷新失败时榜单会保留上次成功快照。']))
      }
      if (data.refreshing) {
        banners.push(h(Banner, {
          key: 'busy',
          tone: 'info',
          icon: 'refresh',
        }, '正在后台读取最新的市场索引，榜单会在完成后自动更新。'))
      } else if (data.refreshDue) {
        banners.push(h(Banner, {
          key: 'due',
          tone: 'info',
          icon: 'clock',
          action: h('button', { type: 'button', onClick: props.onRefresh }, '立即刷新'),
        }, ['数据已超过刷新周期（上次更新 ' + relativeTime(data.generatedAt) + '）。']))
      }
      return banners.length ? h('div', null, banners) : null
    }

    function inclusionTone(includedBy) {
      if (includedBy === 'both') return 'ok'
      if (includedBy === 'downloads') return 'warn'
      return ''
    }

    function PluginCard(props) {
      var item = props.item
      var rules = props.rules
      var openState = useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var req = item.requirements || {}
      var notes = req.notes || []
      var tags = []
      var osText = req.os && req.os.length > 0 ? shortVersion(req.osLabel, 18) : '全平台'
      tags.push({ icon: 'monitor', text: osText, title: req.osLabel, tone: item.compatibleHere ? '' : 'danger' })
      if (req.node) tags.push({ icon: 'node', text: 'Node ' + shortVersion(req.node, 14), title: 'Node.js ' + req.node, tone: '' })
      if (req.dsh) tags.push({ icon: 'layers', text: 'DSH ' + shortVersion(req.dsh, 16), title: 'DSH ' + req.dsh, tone: '' })
      var caps = item.capabilities || []
      if (caps.indexOf('shell') !== -1) tags.push({ icon: 'terminal', text: '可执行命令', tone: 'warn' })
      if (caps.indexOf('fs-write') !== -1) tags.push({ icon: 'file', text: '写文件', tone: 'warn' })
      if (caps.indexOf('network') !== -1) tags.push({ icon: 'globe', text: '联网', tone: '' })
      var shownTags = tags.slice(0, 3)
      var moreTags = tags.length - shownTags.length
      var links = []
      if (item.npmUrl) links.push({ href: item.npmUrl, label: 'npm' })
      if (safeHref(item.repo)) links.push({ href: safeHref(item.repo), label: 'GitHub / 仓库' })
      if (safeHref(item.homepage)) links.push({ href: safeHref(item.homepage), label: '主页' })
      if (safeHref(item.page)) links.push({ href: safeHref(item.page), label: '市场页' })
      var delta = typeof item.starDelta === 'number' && item.starDelta !== 0 ? item.starDelta : null

      return h('article', {
        className: 'dpr-card',
        'data-installed': item.installed ? 'true' : 'false',
        'data-retained': item.retained ? 'true' : 'false',
        style: { '--tier-color': item.includedBy === 'downloads' ? '#0e9f9a' : '#c58a00' },
      }, [
        h('div', { className: 'dpr-card-top', key: 'top' }, [
          h(Avatar, { key: 'avatar', name: item.name, icon: item.icon }),
          h('div', { className: 'dpr-card-id', key: 'id' }, [
            h('div', { className: 'dpr-card-name', key: 'name' }, [
              h('h3', { key: 'h', title: item.name }, item.name),
              item.installed ? h('span', { className: 'dpr-tag ok', key: 'installed', style: { height: 18, padding: '0 5px' } }, '已安装') : null,
            ]),
            h('div', { className: 'dpr-card-package', key: 'pkg', title: item.package }, item.package),
          ]),
          h('div', { className: 'dpr-card-side', key: 'side' }, [
            h('span', { className: 'dpr-rank', key: 'rank' }, '#' + props.rank),
            h('span', { className: 'dpr-star-badge', key: 'stars', title: 'GitHub 收藏数' }, [
              h(Icon, { key: 'i', name: 'star', size: 10 }),
              formatNumber(item.stars),
            ]),
          ]),
        ]),
        h('p', { className: 'dpr-desc', key: 'desc' }, item.description || '暂无简介。'),
        h('div', { className: 'dpr-tags', key: 'tags' }, [
          h(Tag, { key: 'cat', icon: 'tag', tone: '' }, item.categoryLabel),
          item.retained
            ? h(Tag, {
              key: 'retained',
              icon: 'clock',
              tone: 'warn',
              title: '最后一次达标：' + (item.lastQualifiedAt || '未知'),
            }, '已跌出 · 保留')
            : null,
          delta !== null ? h(Tag, {
            key: 'delta',
            icon: delta > 0 ? 'arrowUp' : 'arrowDown',
            tone: delta > 0 ? 'ok' : '',
            title: '与上次快照相比的收藏变化',
          }, (delta > 0 ? '+' : '−') + formatNumber(Math.abs(delta)) + ' ★') : null,
        ].concat(shownTags.map(function (tag, index) {
          return h(Tag, { key: index, icon: tag.icon, tone: tag.tone, title: tag.title }, tag.text)
        })).concat(moreTags > 0 ? [h(Tag, { key: 'more', tone: '' }, '+' + moreTags)] : [])),
        h('div', { className: 'dpr-metrics', key: 'metrics' }, [
          h('div', { className: 'dpr-metric-main', key: 'main' }, [
            h('div', { className: 'dpr-metric-value', key: 'v' }, [h(Icon, { key: 's', name: 'star', size: 18, className: 'dpr-metric-star' }), formatNumber(item.stars)]),
            h('div', { className: 'dpr-metric-label', key: 'l' }, 'GitHub 收藏'),
            h('div', { className: 'dpr-metric-sub', key: 'sub' }, [
              h('span', { key: 'd' }, ['近 30 天下载 ', h('b', null, formatWan(item.last30))]),
              h('span', { key: 'w' }, ['窗口 ', h('b', null, item.downloadsEnd || '—')]),
            ]),
          ]),
          h('span', { className: 'dpr-inclusion ' + inclusionTone(item.includedBy), key: 'inc', title: '收录原因' },
            inclusionLabel(item.includedBy, rules)),
        ]),
        h('div', { className: 'dpr-card-foot', key: 'foot' }, [
          h('div', { className: 'dpr-meta', key: 'meta' }, [
            item.noticeCount > 0 ? h(Tag, { key: 'notice', icon: 'alert', tone: 'warn' }, item.noticeCount + ' 条注意') : null,
            !item.compatibleHere ? h(Tag, { key: 'os', icon: 'alert', tone: 'danger' }, '当前系统不支持') : null,
            req.client ? h(Tag, { key: 'web', icon: 'monitor' }, 'Web UI') : null,
            item.added ? h(Tag, { key: 'added', icon: 'clock', tone: '' }, '收录于 ' + item.added) : null,
          ]),
          h('div', { className: 'dpr-actions', key: 'actions' }, [
            h('button', {
              className: 'dpr-btn ghost',
              key: 'details',
              type: 'button',
              onClick: function () { setOpen(!open) },
              'aria-expanded': open ? 'true' : 'false',
            }, [h(Icon, { key: 'i', name: open ? 'chevronUp' : 'chevronDown', size: 13 }), open ? '收起' : '详情']),
            item.installed
              ? h('button', { className: 'dpr-btn installed', key: 'install', type: 'button', disabled: true }, [h(Icon, { key: 'i', name: 'check', size: 13 }), '已安装'])
              : h('button', {
                className: 'dpr-btn primary',
                key: 'install',
                type: 'button',
                disabled: !item.compatibleHere || props.busy,
                title: !item.compatibleHere ? '当前系统不在插件声明范围内' : props.busy ? '另一个安装任务正在进行' : '安装 ' + item.package,
                onClick: function () { props.onInstall(item) },
              }, [h(Icon, { key: 'i', name: props.installing ? 'refresh' : 'download', size: 13, className: props.installing ? 'dpr-spin' : '' }), props.installing ? '安装中…' : '安装']),
          ]),
        ]),
        open ? h('div', { className: 'dpr-details', key: 'details' }, [
          h('h4', { className: 'dpr-detail-title', key: 'statstitle' }, [h(Icon, { key: 'i', name: 'chart', size: 12 }), '热度与收录']),
          h('div', { className: 'dpr-kv', key: 'stats' }, [
            kv('GitHub 收藏', formatNumber(item.stars)),
            kv('近 30 天下载', formatNumber(item.last30)),
            kv('下载窗口', item.downloadsStart && item.downloadsEnd ? item.downloadsStart + ' → ' + item.downloadsEnd : '—'),
            kv('收录原因', inclusionLabel(item.includedBy, rules)),
            kv('市场收录日', item.added || '—'),
            kv('分类', item.categoryLabel || '未分类'),
          ]),
          h('h4', { className: 'dpr-detail-title', key: 'envtitle' }, [h(Icon, { key: 'i', name: 'cpu', size: 12 }), '环境与兼容']),
          h('div', { className: 'dpr-kv', key: 'kv' }, [
            kv('Node.js', req.node || '未声明'),
            kv('DSH', req.dsh || '未声明'),
            kv('系统', req.osLabel || '未声明'),
            kv('CPU', req.cpuLabel || '未声明'),
            kv('安装体积', req.size ? (req.size / 1024 / 1024).toFixed(1) + ' MB' : '未知'),
            kv('依赖', (req.dependencyCount || 0) + ' 个' + (req.peerDependencyCount ? ' · peer ' + req.peerDependencyCount : '')),
          ]),
          caps.length > 0 ? h('div', { className: 'dpr-tags', key: 'caps' }, caps.map(function (cap, index) {
            return h(Tag, { key: index, icon: cap === 'shell' ? 'terminal' : cap === 'fs-write' ? 'file' : cap === 'network' ? 'globe' : 'shield', tone: cap === 'shell' || cap === 'fs-write' ? 'warn' : '' }, capLabel(cap))
          })) : null,
          h('h4', { className: 'dpr-detail-title', key: 'notestitle' }, [h(Icon, { key: 'i', name: 'alert', size: 12 }), '注意事项']),
          h('div', { className: 'dpr-notes', key: 'notes' }, notes.map(function (note, index) {
            return h('div', { className: 'dpr-note ' + note.level, key: index }, [
              h('span', { className: 'dpr-note-icon', key: 'i' }, h(Icon, { name: note.level === 'warn' || note.level === 'danger' ? 'alert' : 'info', size: 13 })),
              h('div', { key: 'b' }, [h('b', { key: 't' }, note.title), h('p', { key: 'p' }, note.text)]),
            ])
          })),
          h('h4', { className: 'dpr-detail-title', key: 'cmdtitle' }, [h(Icon, { key: 'i', name: 'terminal', size: 12 }), '手动安装命令']),
          h('div', { className: 'dpr-code', key: 'cmd' }, [
            h('code', { key: 'c' }, 'pnpm add ' + item.package),
            h('button', { key: 'copy', type: 'button', onClick: function () { props.onCopy('pnpm add ' + item.package) } }, '复制'),
          ]),
          links.length > 0 ? h('div', { className: 'dpr-links', key: 'links' }, links.map(function (link, index) {
            return h('a', {
              className: 'dpr-link',
              key: index,
              href: link.href,
              target: '_blank',
              rel: 'noopener noreferrer',
            }, [link.label, h(Icon, { key: 'i', name: 'external', size: 10 })])
          })) : null,
        ]) : null,
      ])
    }

    function kv(label, value) {
      return h('div', { className: 'dpr-kv-item', key: label }, [
        h('label', { key: 'l' }, label),
        h('b', { key: 'v', title: value }, value),
      ])
    }

    function capLabel(cap) {
      var labels = {
        shell: '执行命令',
        'fs-write': '写入文件',
        'fs-read': '读取文件',
        network: '联网',
        credentials: '访问凭据',
        env: '读取环境变量',
        subagent: '子代理',
        'host-runtime': '宿主运行时',
        llm: '调用 LLM',
        'dynamic-code': '动态代码',
      }
      return labels[cap] || cap
    }

    function InstallDialog(props) {
      var item = props.item
      var busy = props.busy
      var result = props.result
      var req = item.requirements || {}
      var notes = (req.notes || []).filter(function (note) {
        return note.title !== '安装后生效' && (note.level === 'danger' || note.level === 'warn')
      }).slice(0, 3)
      var closeRef = useRef(null)
      useEffect(function () {
        var previous = document.activeElement
        try { closeRef.current && closeRef.current.focus() } catch (error) { /* ignore */ }
        return function () {
          try { previous && previous.focus && previous.focus() } catch (error) { /* ignore */ }
        }
      }, [])
      useEffect(function () {
        function onKey(event) {
          if (event.key === 'Escape' && !busy) props.onClose()
        }
        document.addEventListener('keydown', onKey)
        return function () { document.removeEventListener('keydown', onKey) }
      }, [busy])
      var command = 'pnpm add ' + item.package
      var title = result ? (result.ok ? '安装完成' : '安装未完成') : '安装 ' + item.name
      return h('div', {
        className: 'dpr-overlay',
        onMouseDown: function (event) { if (event.target === event.currentTarget && !busy) props.onClose() },
      }, h('div', {
        className: 'dpr-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dpr-modal-title',
      }, [
        h('div', { className: 'dpr-modal-head', key: 'head' }, [
          h(Avatar, { key: 'a', name: item.name, icon: item.icon }),
          h('div', { key: 't', style: { minWidth: 0 } }, [
            h('h3', { className: 'dpr-modal-title', id: 'dpr-modal-title', key: 'h' }, title),
            h('p', { className: 'dpr-modal-sub', key: 's' }, item.package + ' · ★ ' + formatNumber(item.stars)),
          ]),
          h('button', {
            ref: closeRef,
            className: 'dpr-modal-close',
            key: 'close',
            type: 'button',
            onClick: props.onClose,
            disabled: busy,
            'aria-label': '关闭',
          }, h(Icon, { name: 'close', size: 14 })),
        ]),
        h('div', { className: 'dpr-modal-body', key: 'body' }, result ? h('div', { className: 'dpr-result' }, [
          h('div', { className: 'dpr-result-icon ' + (result.ok ? 'ok' : 'fail'), key: 'i' }, h(Icon, { name: result.ok ? 'check' : 'alert', size: 26 })),
          h('h3', { key: 'h' }, result.ok ? '安装完成' : '安装未完成'),
          h('p', { key: 'p' }, result.message || (result.ok ? '插件已写入当前 profile。' : '请查看详情或到 DSH 的插件设置中重试。')),
          result.ok && result.restartRequired !== false && String(result.message || '').indexOf('重启') === -1
            ? h('p', { key: 'r', style: { marginTop: 6, color: 'var(--dpr-warn)' } }, '重启或重载 DSH 后生效。')
            : null,
          !result.ok && result.detail ? h('div', { className: 'dpr-result-detail', key: 'd' }, result.detail) : null,
        ]) : [
          busy ? h('div', { className: 'dpr-loading-row', key: 'busy' }, [
            h(Icon, { name: 'refresh', size: 15, className: 'dpr-spin' }),
            h('span', null, '正在安装，首次下载可能需要 1–3 分钟…'),
          ]) : null,
          h('div', { className: 'dpr-warning', key: 'warn' }, [
            h(Icon, { key: 'i', name: 'alert', size: 14 }),
            h('div', { key: 'b' }, [
              h('b', { key: 't' }, '安装前须知'),
              h('ul', { key: 'ul' }, [
                h('li', { key: 'p' }, '将写入当前 DSH profile「' + (props.profile || 'desktop') + '」并更新依赖。'),
                h('li', { key: 'r' }, '安装完成后通常需要重启或重载 DSH 才会加载。'),
                notes.map(function (note, index) { return h('li', { key: 'n' + index }, [note.title + '：' + note.text]) }),
                h('li', { key: 's' }, '第三方插件，请确认仓库、作者与权限可信。'),
              ]),
            ]),
          ]),
          h('div', { className: 'dpr-kv', key: 'kv' }, [
            kv('目标 profile', props.profile || 'desktop'),
            kv('当前系统', (req.osLabel || '未声明')),
            kv('Node.js', req.node || '未声明'),
            kv('DSH', req.dsh || '未声明'),
          ]),
          h('div', { className: 'dpr-code', key: 'cmd' }, [
            h('code', null, command),
            h('button', { type: 'button', onClick: function () { props.onCopy(command) } }, '复制'),
          ]),
        ]),
        h('div', { className: 'dpr-modal-foot', key: 'foot' }, result
          ? [
              result.ok && props.canOpenPackage
                ? h('button', { className: 'dpr-btn', key: 'open', type: 'button', onClick: props.onOpenPackage }, '去插件页查看')
                : null,
              !result.ok ? h('button', { className: 'dpr-btn', key: 'copy', type: 'button', onClick: function () { props.onCopy(command) } }, '复制命令') : null,
              h('button', { className: 'dpr-btn primary', key: 'done', type: 'button', onClick: props.onClose }, result.ok ? '完成' : '关闭'),
            ]
          : [
              h('button', { className: 'dpr-btn', key: 'cancel', type: 'button', onClick: props.onClose, disabled: busy }, '取消'),
              h('button', {
                className: 'dpr-btn primary',
                key: 'ok',
                type: 'button',
                onClick: props.onConfirm,
                disabled: busy,
              }, busy ? '安装中…' : '确认安装'),
            ]),
      ]))
    }

    function Toast(props) {
      var toast = props.toast
      return h('div', { className: 'dpr-toast ' + (toast.tone || ''), role: 'status', 'aria-live': 'polite' }, [
        h(Icon, { key: 'i', name: toast.tone === 'ok' ? 'check' : 'alert', size: 14 }),
        h('span', { key: 't' }, toast.text),
      ])
    }

    function GlobalNotes(props) {
      var notes = props.notes || []
      return h('section', { className: 'dpr-notes-panel' }, [
        h('h3', { key: 'h' }, [h(Icon, { key: 'i', name: 'info', size: 13 }), '数据与安全说明']),
        h('div', { className: 'dpr-notes-grid', key: 'grid' }, notes.map(function (note, index) {
          return h('div', { className: 'dpr-note ' + note.level, key: index }, [
            h('span', { className: 'dpr-note-icon', key: 'i' }, h(Icon, { name: note.level === 'warn' || note.level === 'danger' ? 'alert' : 'info', size: 13 })),
            h('div', { key: 'b' }, [h('b', { key: 't' }, note.title), h('p', { key: 'p' }, note.text)]),
          ])
        })),
      ])
    }

    function Footer(props) {
      var data = props.data
      return h('footer', { className: 'dpr-footer' }, [
        h('span', { key: 'l' }, [
          '数据源 ',
          h('a', { key: 'a', href: 'https://awesome-dsh-plugin.com', target: '_blank', rel: 'noopener noreferrer' }, 'awesome-dsh-plugin.com'),
          ' · ',
          h('a', { key: 'b', href: 'https://www.npmjs.com', target: '_blank', rel: 'noopener noreferrer' }, 'npm'),
          data && data.generatedAt ? ' · 更新于 ' + formatDateTime(data.generatedAt) : '',
        ]),
        h('span', { key: 'r' }, [
          'dsh-plugin-star-radar ',
          data && data.version ? 'v' + data.version : '',
          ' · 缓存于当前 profile，不上传本地数据',
        ]),
      ])
    }

    function NearMisses(props) {
      var items = props.items || []
      if (items.length === 0) return null
      return h('section', { className: 'dpr-near' }, [
        h('div', { className: 'dpr-near-head', key: 'h' }, [
          h('h3', { key: 't' }, '差点收录'),
          h('p', { key: 'p' }, '收藏或下载最接近门槛的插件，暂未进入榜单。'),
        ]),
        h('div', { className: 'dpr-near-grid', key: 'g' }, items.map(function (item) {
          var closer = item.gapStars <= 0 ? '下载' : (item.gapStars / Math.max(1, props.rules.minStars)) <= (item.gapDownloads / Math.max(1, props.rules.minDownloads)) ? '收藏' : '下载'
          return h('div', { className: 'dpr-near-item', key: item.package }, [
            h(Avatar, { key: 'a', name: item.name, icon: item.icon, small: true }),
            h('div', { className: 'dpr-near-id', key: 'id' }, [
              h('div', { className: 'dpr-near-name', key: 'n', title: item.name }, item.name),
              h('div', { className: 'dpr-near-meta', key: 'm' }, '★ ' + formatNumber(item.stars) + ' · 下载 ' + formatWan(item.last30)),
              h('div', { className: 'dpr-near-bar', key: 'bar' }, h('i', { style: { width: Math.max(2, Math.round(item.progress * 100)) + '%' } })),
            ]),
            h('span', { className: 'dpr-near-gap', key: 'g' },
              closer === '收藏' ? '差 ' + formatNumber(item.gapStars) + ' ★' : '差 ' + formatWan(item.gapDownloads)),
          ])
        })),
      ])
    }

    function Skeleton() {
      return h('div', null, [
        h('div', { className: 'dpr-loading-row', key: 'l', style: { margin: '4px 0 10px' } }, [
          h(Icon, { name: 'refresh', size: 14, className: 'dpr-spin' }),
          h('span', null, '正在连接本地服务并读取缓存…'),
        ]),
        h('div', { className: 'dpr-grid', key: 'g' }, [0, 1, 2, 3].map(function (index) {
          return h('div', { className: 'dpr-skeleton dpr-skeleton-card', key: index })
        })),
      ])
    }

    function Warming(props) {
      return h('div', { className: 'dpr-empty' }, [
        h('div', { className: 'dpr-empty-icon', key: 'i' }, h(Icon, { name: 'star', size: 20 })),
        h('h3', { key: 'h' }, '正在读取插件市场'),
        h('p', { key: 'p' }, props.message || '正在拉取市场索引并计算收录名单，通常几秒钟。'),
        h('div', { className: 'dpr-empty-actions', key: 'a' }, h('button', {
          className: 'dpr-btn primary',
          type: 'button',
          onClick: props.onRefresh,
        }, [h(Icon, { key: 'i', name: 'refresh', size: 13 }), '立即刷新'])),
      ])
    }

    function ErrorPanel(props) {
      return h('div', { className: 'dpr-empty' }, [
        h('div', { className: 'dpr-empty-icon', key: 'i' }, h(Icon, { name: 'alert', size: 20 })),
        h('h3', { key: 'h' }, '暂时读不到数据'),
        h('p', { key: 'p' }, props.message || '本地服务尚未就绪，或市场索引不可达。'),
        h('div', { className: 'dpr-empty-actions', key: 'a' }, h('button', {
          className: 'dpr-btn primary',
          type: 'button',
          onClick: props.onRetry,
        }, [h(Icon, { key: 'i', name: 'refresh', size: 13 }), '重试'])),
      ])
    }

    function RadarApp(props) {
      var dataState = useState(null)
      var data = dataState[0]
      var setData = dataState[1]
      var loadingState = useState(true)
      var loading = loadingState[0]
      var setLoading = loadingState[1]
      var refreshingState = useState(false)
      var refreshing = refreshingState[0]
      var setRefreshing = refreshingState[1]
      var errorState = useState('')
      var error = errorState[0]
      var setError = errorState[1]
      var queryState = useState('')
      var query = queryState[0]
      var setQuery = queryState[1]
      var sortState = useState('stars')
      var sort = sortState[0]
      var setSort = sortState[1]
      var bucketState = useState('all')
      var bucketFilter = bucketState[0]
      var setBucketFilter = bucketState[1]
      var categoryState = useState('all')
      var category = categoryState[0]
      var setCategory = categoryState[1]
      var hideState = useState(false)
      var hideInstalled = hideState[0]
      var setHideInstalled = hideState[1]
      var confirmState = useState(null)
      var confirmItem = confirmState[0]
      var setConfirmItem = confirmState[1]
      var resultState = useState(null)
      var installResult = resultState[0]
      var setInstallResult = resultState[1]
      var installingState = useState(false)
      var installing = installingState[0]
      var setInstalling = installingState[1]
      var toastState = useState(null)
      var toast = toastState[0]
      var setToast = toastState[1]

      var rules = (data && data.rules) || { minStars: props.minStars, minDownloads: props.minDownloads }
      var buckets = (data && data.buckets) || []
      var groupRefs = useRef({})
      var listTopRef = useRef(null)

      // The chips above the list are navigation, not a filter: each one scrolls
      // the matching group section into view inside the settings scroll pane.
      function jumpToGroup(key) {
        setBucketFilter(key)
        try {
          if (key === 'all') {
            var top = listTopRef.current
            if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
          var node = groupRefs.current[key]
          if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } catch (error) {
          // Scrolling is a nicety; never let it break the click.
        }
      }

      function showToast(tone, text) {
        setToast({ id: Date.now(), tone: tone, text: text })
      }

      useEffect(function () {
        if (!toast) return undefined
        var timer = setTimeout(function () { setToast(null) }, 4200)
        return function () { clearTimeout(timer) }
      }, [toast])

      useEffect(function () {
        var cancelled = false
        setLoading(true)
        request('/state', { timeout: 30000 }).then(function (json) {
          if (cancelled) return
          if (json && json.ok === false) throw new Error(json.message || '读取失败')
          setData(json)
          setError('')
        }).catch(function (reason) {
          if (!cancelled) setError(reason && reason.message ? reason.message : String(reason))
        }).finally(function () {
          if (!cancelled) setLoading(false)
        })
        return function () { cancelled = true }
      }, [])

      var isHostRefreshing = Boolean(data && (data.refreshing || (data.status === 'warming' && !data.generatedAt)))
      useEffect(function () {
        if (!isHostRefreshing) return undefined
        var timer = setInterval(function () {
          request('/state', { timeout: 30000 }).then(function (json) {
            if (json && json.ok === false) return
            setData(json)
            if (!json.refreshing) setError('')
          }).catch(function () { /* polling is best effort */ })
        }, 4000)
        return function () { clearInterval(timer) }
      }, [isHostRefreshing])

      function refresh() {
        if (refreshing) return
        setRefreshing(true)
        setError('')
        request('/refresh', { method: 'POST', body: '{}', timeout: 180000 }).then(function (json) {
          if (json.ok === false) throw new Error((json.message || '刷新失败') + (json.detail ? '（' + json.detail + '）' : ''))
          setData(json)
          showToast('ok', '数据已更新')
        }).catch(function (reason) {
          var message = reason && reason.message ? reason.message : String(reason)
          setError(message)
          showToast('err', '刷新失败：' + message)
        }).finally(function () { setRefreshing(false) })
      }

      function markInstalled(packageName) {
        setData(function (previous) {
          if (!previous) return previous
          var items = (previous.items || []).map(function (item) {
            return item.package === packageName ? Object.assign({}, item, { installed: true }) : item
          })
          var nearMisses = (previous.nearMisses || []).map(function (item) {
            return item.package === packageName ? Object.assign({}, item, { installed: true }) : item
          })
          var installedCount = items.filter(function (item) { return item.installed }).length
          return Object.assign({}, previous, {
            items: items,
            nearMisses: nearMisses,
            stats: Object.assign({}, previous.stats, { installed: installedCount }),
          })
        })
      }

      function openInstall(item) {
        setConfirmItem(item)
        setInstallResult(null)
      }

      function closeInstall() {
        if (installing) return
        setConfirmItem(null)
        setInstallResult(null)
      }

      function confirmInstall() {
        if (!confirmItem || installing) return
        var target = confirmItem
        setInstalling(true)
        setInstallResult(null)
        request('/install', {
          method: 'POST',
          body: JSON.stringify({ package: target.package }),
          timeout: 420000,
        }).then(function (json) {
          if (json && json.installed === true && json.ok !== true) {
            json = Object.assign({}, json, {
              ok: true,
              restartRequired: false,
              message: json.message || '该插件已经安装。',
            })
          }
          setInstallResult(json)
          if (json.ok === true || json.installed === true) {
            markInstalled(target.package)
            showToast('ok', json.message || '安装完成')
          }
        }).catch(function (reason) {
          setInstallResult({
            ok: false,
            code: 'network',
            message: '无法连接本地安装服务。',
            detail: reason && reason.message ? reason.message : String(reason),
          })
        }).finally(function () { setInstalling(false) })
      }

      function copy(value) {
        copyText(value).then(function () {
          showToast('ok', '已复制安装命令')
        }).catch(function () {
          showToast('err', '复制失败，请手动选择命令')
        })
      }

      var items = useMemo(function () {
        var list = (data && data.items) || []
        var q = query.trim().toLowerCase()
        if (q !== '') {
          list = list.filter(function (item) {
            return [item.name, item.package, item.description, item.categoryLabel].join(' ').toLowerCase().indexOf(q) !== -1
          })
        }
        if (category !== 'all') list = list.filter(function (item) { return item.categoryLabel === category })
        if (hideInstalled) list = list.filter(function (item) { return !item.installed })
        list = list.slice()
        if (sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-CN') })
        else if (sort === 'downloads') list.sort(function (a, b) { return b.last30 - a.last30 || b.stars - a.stars })
        else list.sort(function (a, b) { return b.stars - a.stars || b.last30 - a.last30 })
        return list
      }, [data, query, category, hideInstalled, sort])

      var grouped = sort === 'stars'
      var groups = useMemo(function () {
        if (!grouped) return []
        var map = {}
        var order = []
        for (var i = 0; i < items.length; i += 1) {
          var key = items[i].bucket
          if (!map[key]) {
            var meta = null
            for (var j = 0; j < buckets.length; j += 1) if (buckets[j].key === key) meta = buckets[j]
            map[key] = {
              key: key,
              title: meta
                ? (key === 'downloads' ? '下载入榜' : key === 'retained' ? '已跌出（保留展示）' : '★ ' + meta.label)
                : key,
              hint: meta ? meta.title : '',
              items: [],
            }
            order.push(key)
          }
          map[key].items.push(items[i])
        }
        var rank = 0
        var out = buckets.filter(function (bucket) { return map[bucket.key] }).map(function (bucket) {
          return map[bucket.key]
        })
        for (var k = 0; k < out.length; k += 1) {
          out[k].items.forEach(function (item) { rank += 1; item.__rank = rank })
        }
        return out
      }, [items, grouped, buckets])

      var nearMisses = useMemo(function () {
        var list = (data && data.nearMisses) || []
        if (hideInstalled) list = list.filter(function (item) { return !item.installed })
        var q = query.trim().toLowerCase()
        if (q !== '') list = list.filter(function (item) { return [item.name, item.package, item.description].join(' ').toLowerCase().indexOf(q) !== -1 })
        return list
      }, [data, hideInstalled, query])

      var totalItems = data && data.items ? data.items.length : 0

      function renderCards(list) {
        return list.map(function (item) {
          return h(PluginCard, {
            key: item.package,
            item: item,
            rank: item.__rank || 0,
            rules: rules,
            installing: installing && confirmItem && confirmItem.package === item.package,
            busy: installing,
            onInstall: openInstall,
            onCopy: copy,
          })
        })
      }

      var content
      if (loading && !data) {
        content = h(Skeleton, { key: 'skeleton' })
      } else if (!data) {
        content = h(ErrorPanel, { key: 'error', message: error, onRetry: refresh })
      } else if ((data.status === 'warming' || !data.generatedAt) && totalItems === 0) {
        content = h(Warming, { key: 'warming', message: data.message, onRefresh: refresh })
      } else if (data.status === 'error' && totalItems === 0) {
        content = h(ErrorPanel, { key: 'error', message: data.message || error, onRetry: refresh })
      } else if (items.length === 0) {
        content = h('div', { className: 'dpr-empty', key: 'empty' }, [
          h('div', { className: 'dpr-empty-icon', key: 'i' }, h(Icon, { name: 'search', size: 20 })),
          h('h3', { key: 'h' }, '没有匹配的插件'),
          h('p', { key: 'p' }, '试试清空搜索、切换分类，或关闭「隐藏已安装」。'),
          h('div', { className: 'dpr-empty-actions', key: 'a' }, h('button', {
            className: 'dpr-btn',
            key: 'clear',
            type: 'button',
            onClick: function () { setQuery(''); setCategory('all'); setBucketFilter('all'); setHideInstalled(false) },
          }, '清空筛选')),
        ])
      } else if (grouped) {
        content = h('div', { key: 'groups' }, groups.map(function (group) {
          return h('section', {
            className: 'dpr-tier-section',
            key: group.key,
            id: 'dpr-group-' + group.key,
            ref: function (node) { if (node) groupRefs.current[group.key] = node },
            style: { '--tier-color': group.key === 'downloads' ? '#0e9f9a' : group.key === 'retained' ? '#7c8698' : '#c58a00' },
          }, [
            h('div', { className: 'dpr-tier-head', key: 'head' }, [
              h('i', { className: 'dpr-tier-stripe', key: 'stripe' }),
              h('span', { className: 'dpr-tier-id', key: 'id' }, group.key === 'downloads' ? '↓' : '★'),
              h('div', { key: 'label' }, [
                h('div', { className: 'dpr-tier-label', key: 'l' }, group.title),
                h('div', { className: 'dpr-tier-range', key: 'r' }, group.key === 'downloads'
                  ? '收藏未达标，但近 30 天下载 ≥ ' + formatWan(rules.minDownloads)
                  : group.key === 'retained'
                    ? '曾达标，当前低于门槛；保留展示，方便复查'
                    : 'GitHub 收藏达到这一档'),
              ]),
              h('span', { className: 'dpr-tier-count', key: 'count' }, [h('b', null, group.items.length), ' 个插件']),
            ]),
            h('div', { className: 'dpr-grid', key: 'grid' }, renderCards(group.items)),
          ])
        }))
      } else {
        content = h('div', { className: 'dpr-grid', key: 'flat' }, renderCards(items))
      }

      return h('div', {
        className: 'dpr-root',
        'data-surface': props.surface || 'settings',
        translate: 'no',
      }, [
        h('div', { className: 'dpr-shell', key: 'shell' }, [
          h(Hero, { data: data, refreshing: refreshing, onRefresh: refresh, key: 'hero', minStars: rules.minStars, minDownloads: rules.minDownloads }),
          h(NoticeGrid, { data: data, key: 'notice' }),
          h(Toolbar, {
            query: query,
            setQuery: setQuery,
            sort: sort,
            setSort: function (value) { setSort(value); if (value !== 'stars') setBucketFilter('all') },
            category: category,
            setCategory: setCategory,
            categories: (data && data.categories) || [],
            hideInstalled: hideInstalled,
            setHideInstalled: setHideInstalled,
            onRefresh: refresh,
            refreshing: refreshing,
            key: 'toolbar',
          }),
          grouped && data && data.items && data.items.length > 0 ? h(BucketLadder, {
            items: data.items,
            buckets: buckets,
            value: bucketFilter,
            onChange: jumpToGroup,
            key: 'ladder',
          }) : null,
          h(StatusBanners, { data: data, onRefresh: refresh, key: 'banners' }),
          h('div', { key: 'list-top', ref: listTopRef, 'aria-hidden': 'true' }),
          content,
          data ? h(NearMisses, { items: nearMisses, rules: rules, key: 'near' }) : null,
          data ? h(GlobalNotes, { notes: data.notes, key: 'notes' }) : null,
          h(Footer, { data: data, key: 'footer' }),
        ]),
        confirmItem ? h(InstallDialog, {
          item: confirmItem,
          profile: (data && data.host && data.host.profile) || 'desktop',
          busy: installing,
          result: installResult,
          onClose: closeInstall,
          onConfirm: confirmInstall,
          onCopy: copy,
          canOpenPackage: typeof props.openPackage === 'function',
          onOpenPackage: function () {
            try { props.openPackage(confirmItem.package) } catch (error) { /* ignore */ }
            closeInstall()
          },
          key: 'dialog',
        }) : null,
        toast ? h(Toast, { toast: toast, key: 'toast-' + toast.id }) : null,
      ])
    }

    class RadarErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error: error }
      }

      componentDidCatch(error, info) {
        try { console.error('[dsh-plugin-star-radar] render failed', error, info) } catch (ignored) { /* ignore */ }
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'dpr-root' }, h('div', { className: 'dpr-shell' }, h('div', { className: 'dpr-empty' }, [
            h('div', { className: 'dpr-empty-icon', key: 'i' }, h(Icon, { name: 'alert', size: 20 })),
            h('h3', { key: 'h' }, '插件热度榜加载失败'),
            h('p', { key: 'p' }, String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)),
            h('div', { className: 'dpr-empty-actions', key: 'a' }, h('button', {
              className: 'dpr-btn primary',
              type: 'button',
              onClick: function () { try { window.location.reload() } catch (error) { /* ignore */ } },
            }, '重新加载页面')),
          ])))
        }
        return this.props.children
      }
    }

    function Seat(props) {
      return h(RadarErrorBoundary, null, h(RadarApp, {
        surface: props.surface,
        openPackage: props.openPackage,
        minStars: props.minStars,
        minDownloads: props.minDownloads,
      }))
    }

    function apply(ctx) {
      ensureStyle()
      var disposers = []
      function registerSeat(slot, meta, surface) {
        try {
          if (!ctx.slots) return
          var component = function (ownerProps) {
            return h(Seat, {
              surface: surface,
              openPackage: ownerProps && typeof ownerProps.openPackage === 'function' ? ownerProps.openPackage : undefined,
            })
          }
          var off
          if (typeof ctx.slots.inject === 'function') {
            off = ctx.slots.inject(slot, function () { return ctx.slots.register(meta, component) })
          } else if (typeof ctx.slots.register === 'function') {
            off = ctx.slots.register(meta, component)
          }
          if (typeof off === 'function') disposers.push(off)
        } catch (error) {
          try { console.warn('[dsh-plugin-star-radar] register ' + slot + ' failed', error) } catch (ignored) { /* ignore */ }
        }
      }
      registerSeat('settings.section', {
        name: 'settings.section',
        id: 'plugin-radar',
        order: 46,
        label: function () { return '热度榜' },
      }, 'settings')
      registerSeat('plugins.tab', {
        name: 'plugins.tab',
        id: 'plugin-radar',
        order: 9,
        label: function () { return '热度榜' },
      }, 'plugins')
      var dispose = function () {
        while (disposers.length > 0) {
          var off = disposers.pop()
          try { off && off() } catch (error) { /* ignore */ }
        }
        dropStyle()
      }
      if (typeof ctx.effect === 'function') {
        ctx.effect(function () { return dispose }, 'dsh-plugin-star-radar: settings UI')
      }
    }

    return {
      name: 'plugin-radar',
      inject: ['slots'],
      apply: apply,
    }
  },
})
