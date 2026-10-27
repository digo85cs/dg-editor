/**
 * Compila src/qa/index.ts com esbuild e executa (sem tsx).
 * Uso: node scripts/run-qa.cjs [--suite=ipc|e2e|perf|all] ...
 */
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const outDir = path.join(root, 'qa-artifacts')
const outfile = path.join(outDir, '_qa-runner.cjs')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'qa', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  external: [
    'electron',
    'node-pty',
    'playwright-core',
    'playwright',
    'playwright-core/*'
  ],
  logLevel: 'silent'
})

const qa = require(outfile)
const opts = qa.parseArgs(process.argv.slice(2))
qa
  .executarQA(process.cwd(), opts)
  .then((r) => {
    process.exit(r.porSeveridade.erro > 0 ? 1 : 0)
  })
  .catch((e) => {
    console.error('[qa] falha fatal:', e)
    process.exit(1)
  })
