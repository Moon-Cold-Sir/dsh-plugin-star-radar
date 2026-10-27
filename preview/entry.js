import './loader.js'
import '../lib/client.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import snapshot from './snapshot.json'

let current = snapshot

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

window.fetch = async function (input, options) {
  const url = String(input)
  if (url.indexOf('/dsh-plugin-star-radar/api/state') !== -1) {
    await delay(120)
    return jsonResponse(current)
  }
  if (url.indexOf('/dsh-plugin-star-radar/api/refresh') !== -1) {
    await delay(900)
    current = { ...current, generatedAt: new Date().toISOString() }
    return jsonResponse(current)
  }
  if (url.indexOf('/dsh-plugin-star-radar/api/install') !== -1) {
    let body = {}
    try { body = JSON.parse(options && options.body ? options.body : '{}') } catch (error) { /* ignore */ }
    await delay(1100)
    return jsonResponse({
      ok: true,
      installed: true,
      package: body.package || 'unknown',
      restartRequired: true,
      message: '安装完成。重启 DSH 后生效。',
    })
  }
  return jsonResponse({ ok: false, code: 'not-found', message: 'preview mock: unknown route' }, 404)
}

const definition = window.__radarDefinition
if (!definition) throw new Error('client bundle did not register a module definition')

const client = definition.factory(id => {
  if (id === 'react') return React
  throw new Error('preview cannot resolve ' + id)
})

const seats = []
const ctx = {
  slots: {
    inject(slot, callback) { return callback() },
    register(meta, component) {
      seats.push({ meta, component })
      return () => {}
    },
  },
  effect(callback) { callback() },
}
client.apply(ctx)

const seat = seats.find(item => item.meta.name === 'settings.section')
if (!seat) throw new Error('settings.section was not registered')

createRoot(document.getElementById('root')).render(React.createElement(seat.component))
