/** Build lib/client.js from lib/client.src.js + lib/client.css. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sourcePath = path.join(root, 'lib', 'client.src.js')
const cssPath = path.join(root, 'lib', 'client.css')
const outputPath = path.join(root, 'lib', 'client.js')

const [source, css] = await Promise.all([
  fs.readFile(sourcePath, 'utf8'),
  fs.readFile(cssPath, 'utf8'),
])

if (!source.includes('__DPR_CSS__')) {
  throw new Error('client.src.js is missing the __DPR_CSS__ placeholder')
}

const output = source.replace('__DPR_CSS__', JSON.stringify(css))
await fs.writeFile(outputPath, output, 'utf8')

const size = Buffer.byteLength(output)
console.log(`built ${path.relative(root, outputPath)} (${(size / 1024).toFixed(1)} KiB, css ${(Buffer.byteLength(css) / 1024).toFixed(1)} KiB)`)
