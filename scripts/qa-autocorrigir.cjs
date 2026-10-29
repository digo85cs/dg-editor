/**
 * CLI: node scripts/qa-autocorrigir.cjs [--dry-run] [--fixture]
 */
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const outDir = path.join(root, 'qa-artifacts')
const outfile = path.join(outDir, '_qa-ia.cjs')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'qa', 'ia', 'cli-autocorrigir.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  external: ['electron', 'node-pty', 'playwright-core'],
  logLevel: 'silent'
})

require(outfile)
