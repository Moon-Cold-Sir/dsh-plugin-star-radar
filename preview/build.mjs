import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [path.join(here, 'entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(here, 'dist', 'app.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
})
