'use strict'
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const ROOT = path.resolve(__dirname, '..')
const outfile = path.join(os.tmpdir(), 'dg-smoke-disco.cjs')
async function main() {
  const lines = [
    "import { buscarPastasProjeto, inspecionarProjeto, filtrarRuidoWindows, pareceRuidoWindows } from './src/main/disco-inventario.ts'",
    "const r = buscarPastasProjeto('DGEditor', 8)",
    "const okBusca = r.ok && Array.isArray(r.pastas)",
    "const amostraRuido = ['C:\\\\Windows\\\\System32\\\\Autopilot','C:\\\\Windows\\\\WinSxS','C:\\\\Windows\\\\System32\\\\Autoplay'].join('\\n')",
    "const ruido = pareceRuidoWindows(amostraRuido)",
    "const limpo = filtrarRuidoWindows(amostraRuido + '\\nC:\\\\dev\\\\DGEditor')",
    "const insp = inspecionarProjeto(process.cwd())",
    "const out = { okBusca, pastas: (r.pastas || []).slice(0, 5), ruido, limpoTemDg: /DGEditor/i.test(limpo || ''), inspExiste: insp.existe, git: insp.git, gitResumo: insp.gitResumo || null }",
    "process.stdout.write(JSON.stringify(out))"
  ]
  await esbuild.build({
    absWorkingDir: ROOT,
    stdin: { contents: lines.join('\n'), resolveDir: ROOT, sourcefile: 'smoke-disco-entry.ts', loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent',
    external: ['electron']
  })
  const raw = execFileSync(process.execPath, [outfile], { encoding: 'utf8', timeout: 60000 })
  fs.rmSync(outfile, { force: true })
  const j = JSON.parse(raw)
  const falhas = []
  if (!j.okBusca) falhas.push('busca')
  if (!j.ruido) falhas.push('detecta Autopilot')
  if (!j.limpoTemDg) falhas.push('filtro mantem DGEditor')
  if (!j.inspExiste) falhas.push('inspecionar cwd')
  if (!j.git) falhas.push('git flag')
  if (!j.gitResumo) falhas.push('gitResumo')
  console.log(JSON.stringify(j, null, 2))
  if (falhas.length) { console.log('SMOKE FALHOU: ' + falhas.join(', ')); process.exit(1) }
  console.log('SMOKE disco OK')
}
main().catch((e) => { console.error(e); process.exit(1) })
