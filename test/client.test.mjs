import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import vm from 'node:vm'

const code = await fs.readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function fakeDocument() {
  const styles = []
  const head = {
    appendChild(element) {
      element.parentNode = head
      styles.push(element)
    },
    removeChild(element) {
      const index = styles.indexOf(element)
      if (index !== -1) styles.splice(index, 1)
      element.parentNode = null
    },
  }
  const document = {
    head,
    body: { appendChild() {}, removeChild() {} },
    activeElement: null,
    getElementById(id) {
      return styles.find(element => element.id === id) || null
    },
    createElement(tag) {
      return {
        tagName: tag,
        id: '',
        style: {},
        textContent: '',
        parentNode: null,
        setAttribute() {},
        appendChild() {},
        select() {},
      }
    },
    addEventListener() {},
    removeEventListener() {},
    execCommand() { return true },
  }
  return { document, styles }
}

function loadClient() {
  const { document, styles } = fakeDocument()
  let captured = null
  const window = {
    __ModuleLoader__: {
      load(definition) {
        captured = definition
      },
    },
  }
  const context = {
    window,
    document,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => ({ ok: true, text: async () => '{}' }),
    AbortController,
    navigator: {},
    location: { reload() {} },
    Promise,
    Object,
    Array,
    String,
    Number,
    Math,
    Date,
    JSON,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
  }
  window.location = context.location
  vm.runInNewContext(code, context, { filename: 'client.js' })
  assert.ok(captured, 'client bundle did not call __ModuleLoader__.load')
  return { captured, document, styles }
}

function fakeReact() {
  class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }
  }
  return {
    createElement(type, props) {
      return { type, props, children: Array.prototype.slice.call(arguments, 2) }
    },
    useState(value) { return [value, function () {}] },
    useEffect() {},
    useMemo(factory) { return factory() },
    useRef(value) { return { current: value } },
    useId() { return 'test-id' },
    Component,
  }
}

function fakeRequire(id) {
  if (id === 'react') return fakeReact()
  throw new Error(`unexpected require: ${id}`)
}

function fakeContext(options = {}) {
  const seats = []
  const effects = []
  const slots = {
    register(meta, component) {
      seats.push({ meta, component })
      return () => { meta.disposed = true }
    },
  }
  if (options.withInject !== false) {
    slots.inject = (slot, callback) => callback()
  }
  const ctx = {
    slots,
    effect(callback) {
      effects.push(callback())
    },
  }
  return { ctx, seats, effects }
}

test('the client bundle registers under the package name and fills both seats', () => {
  const { captured, styles } = loadClient()
  assert.equal(captured.id, 'dsh-plugin-star-radar')
  const client = captured.factory(fakeRequire)
  assert.equal(client.name, 'plugin-radar')
  assert.deepEqual(Array.from(client.inject), ['slots'])
  assert.equal(typeof client.apply, 'function')

  const { ctx, seats, effects } = fakeContext()
  client.apply(ctx)
  assert.equal(seats.length, 2)
  assert.deepEqual(seats.map(seat => seat.meta.name), ['settings.section', 'plugins.tab'])
  assert.deepEqual(seats.map(seat => seat.meta.id), ['plugin-radar', 'plugin-radar'])
  assert.equal(seats[0].meta.label(), '热度榜')
  assert.equal(seats[0].meta.order, 46)
  assert.equal(seats[1].meta.order, 9)
  assert.equal(typeof seats[0].component, 'function')
  assert.equal(styles.length, 1, 'one scoped style element should be injected')
  assert.equal(styles[0].id, 'dsh-plugin-star-radar-style')
  assert.match(styles[0].textContent, /\.dpr-root/)
  assert.doesNotMatch(styles[0].textContent, /dsw-alias-label-tertiary/)

  assert.equal(effects.length, 1)
  effects[0]()
  assert.equal(styles.length, 0, 'dispose should remove the style element')
  assert.equal(seats[0].meta.disposed, true)
  assert.equal(seats[1].meta.disposed, true)
})

test('the client bundle degrades to slots.register when inject is absent', () => {
  const { captured } = loadClient()
  const client = captured.factory(fakeRequire)
  const { ctx, seats } = fakeContext({ withInject: false })
  client.apply(ctx)
  assert.equal(seats.length, 2)
  assert.equal(seats[0].meta.name, 'settings.section')
})

test('apply does not throw when slots are unavailable', () => {
  const { captured } = loadClient()
  const client = captured.factory(fakeRequire)
  assert.doesNotThrow(() => client.apply({ effect() {} }))
})

test('the bundle ships the three ranking metrics', () => {
  const { captured } = loadClient()
  const source = captured.factory.toString()
  for (const label of ['按收藏', '按下载', '按名称']) {
    assert.ok(source.includes(label), `bundle should render ${label}`)
  }
  assert.ok(source.includes('/dsh-plugin-star-radar/api'), 'bundle should call the renamed API')
  assert.ok(source.includes('https?'), 'links should be scheme-checked in the browser too')
  assert.ok(source.includes('scrollIntoView'), 'group chips should navigate to their section')
})
