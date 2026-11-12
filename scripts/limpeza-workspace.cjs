#!/usr/bin/env node
/**
 * Rotina de limpeza do workspace DG Editor.
 *
 * Remove artefatos gerados, logs, dumps de QA, caches e pastas de packaging —
 * sem tocar em código-fonte, skills, agentes ou baseline de QA.
 *
 * Uso:
 *   node scripts/limpeza-workspace.cjs              # completa
 *   node scripts/limpeza-workspace.cjs --leve       # segura (auditoria/boot)
 *   node scripts/limpeza-workspace.cjs --organica   # faxina para uso diario
 *   node scripts/limpeza-workspace.cjs --dry-run    # só lista
 *   npm run limpeza / limpeza:dry / limpeza:leve / limpeza:organica
 *
 * --organica = completa + dist-app/caches/lixo Windows + relatório do que fica.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry-run') || process.argv.includes('-n')
const LEVE = process.argv.includes('--leve')
const ORGANICA = process.argv.includes('--organica') || process.argv.includes('--faxina')

/** @type {{ path: string, bytes: number, ok: boolean, erro?: string }[]} */
const removidos = []
/** @type {string[]} */
const pulados = []

/** Pastas/arquivos de topo que o DG Editor precisa para rodar no dia a dia. */
const ESSENCIAIS_TOPO = new Set([
  '.dg-editor',
  '.dg-root',
  '.dgrules',
  '.env',
  '.env.example',
  '.git',
  '.gitignore',
  'abrir-dg-editor.bat',
  'abrir-dg-editor.vbs',
  'atualizar-atalho-desktop.bat',
  'corrigir-atalho-desktop.bat',
  'DESIGN.md',
  'dg-boot.bat',
  'dg-boot.ps1',
  'docs',
  'electron-vite.config.ts',
  'electron.vite.config.ts',
  'faxina.bat',
  'node_modules',
  'out',
  'package-lock.json',
  'package.json',
  'qa-artifacts',
  'README.md',
  'resources',
  'scripts',
  'src',
  'test',
  'tsconfig.json',
  'vitest.config.ts',
  'ARQUITETURA.md',
  'MIGRACAO.md',
  'SINCRONIZAR.bat',
  'dg-config.json',
  '.github',
  '.agents',
  '.gitattributes',
  '.dgignore',
  'dist-app'
])

/** Em .dg-editor, o que fica após faxina orgânica. */
const ESSENCIAIS_DG = new Set([
  'agentes',
  'skills',
  'regras',
  'bin',
  'modelos.default.json',
  'mcp-config.json',
  'modelos.json'
])

function existe(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function tamanho(p) {
  try {
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      let total = 0
      for (const nome of fs.readdirSync(p)) {
        total += tamanho(path.join(p, nome))
      }
      return total
    }
    return st.size
  } catch {
    return 0
  }
}

function rm(alvo, motivo) {
  const abs = path.isAbsolute(alvo) ? alvo : path.join(ROOT, alvo)
  if (!existe(abs)) {
    pulados.push(abs + ' (ausente)')
    return
  }
  const bytes = tamanho(abs)
  if (DRY) {
    removidos.push({ path: abs, bytes, ok: true })
    console.log('[dry] ' + motivo + ': ' + abs + ' (' + fmt(bytes) + ')')
    return
  }
  try {
    fs.rmSync(abs, { recursive: true, force: true })
    removidos.push({ path: abs, bytes, ok: true })
    console.log('[ok]  ' + motivo + ': ' + abs + ' (' + fmt(bytes) + ')')
  } catch (e) {
    removidos.push({ path: abs, bytes, ok: false, erro: String(e && e.message ? e.message : e) })
    console.warn('[err] ' + abs + ' → ' + e)
  }
}

function limparGlobDir(dirAbs, pred, motivo) {
  if (!existe(dirAbs)) {
    pulados.push(dirAbs + ' (ausente)')
    return
  }
  let nomes = []
  try {
    nomes = fs.readdirSync(dirAbs)
  } catch (e) {
    console.warn('[err] readdir ' + dirAbs + ' → ' + e)
    return
  }
  for (const nome of nomes) {
    if (!pred(nome)) continue
    rm(path.join(dirAbs, nome), motivo)
  }
}

function fmt(n) {
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}

function limpezaBase() {
  // --- sempre: logs soltos, tmp, dumps de QA ---
  limparGlobDir(ROOT, (n) => /^smoke-.*\.log$/i.test(n) || /^dg-.*\.log$/i.test(n), 'log raiz')
  limparGlobDir(
    ROOT,
    (n) =>
      /^boot(-.*)?\.log$/i.test(n) ||
      /^boot-.*\.stdout\.log$/i.test(n) ||
      /^boot-.*\.stderr\.log$/i.test(n) ||
      /^debug\.log$/i.test(n),
    'log boot/debug'
  )
  limparGlobDir(ROOT, (n) => /^fase0-snapshot\.txt$/i.test(n), 'snapshot')
  limparGlobDir(
    ROOT,
    (n) =>
      /^tmp-.*\.(cjs|mjs|js|log)$/i.test(n) ||
      /^teste-.*\.(cjs|log)$/i.test(n) ||
      /^diag-.*\.cjs$/i.test(n) ||
      /^_test-.*\.mjs$/i.test(n) ||
      /_teste_.*\.mjs$/i.test(n) ||
      /^_tmp_/i.test(n) ||
      /^\d{1,3}$/.test(n),
    'lixo raiz'
  )
  rm('_logos_preview', 'preview logos obsoleto')
  rm('tmp', 'pasta tmp/')
  // aliases icon-* duplicam dg-editor-* (regeneráveis via npm run branding)
  limparGlobDir(
    path.join(ROOT, 'resources'),
    (n) => /^icon-\d+\.png$/i.test(n),
    'resources icon-* duplicado'
  )
  // build Linux incompleto no Windows (symlink) — regenerável
  rm(path.join('dist-app', 'linux-unpacked'), 'dist-app linux-unpacked')
  limparGlobDir(
    path.join(ROOT, 'dist-app'),
    (n) => /^__appImage/i.test(n) || /^builder-debug\.yml$/i.test(n),
    'dist-app restos'
  )
  if (existe(path.join(ROOT, 'logs'))) {
    limparGlobDir(path.join(ROOT, 'logs'), () => true, 'logs/')
    rm('logs', 'pasta logs/')
  }
  limparGlobDir(
    path.join(ROOT, 'qa-artifacts'),
    (n) => n !== 'baseline.json' && n !== '.gitkeep',
    'qa-artifacts'
  )

  // --- temp do agente / sessão (só em ambientes que existem) ---
  if (existe('/tmp')) {
    limparGlobDir('/tmp', (n) => /^dg-/i.test(n) || /^menubar/i.test(n), '/tmp dg')
    rm('/tmp/computer-use', '/tmp/computer-use screenshots')
  }
  if (existe('/opt/cursor/artifacts')) {
    rm('/opt/cursor/artifacts/screenshots', 'artifacts screenshots')
    limparGlobDir('/opt/cursor/artifacts', (n) => /\.(png|webp|mp4|webm|jpg|jpeg)$/i.test(n), 'artifacts midia')
  }

  const dg = path.join(ROOT, '.dg-editor')
  limparGlobDir(
    dg,
    (n) =>
      /^ab[-_].*\.json$/i.test(n) ||
      /^ab2[-_].*\.json$/i.test(n) ||
      /^ab-relatorio\.md$/i.test(n) ||
      /^navegador-relatorio\.md$/i.test(n) ||
      /^dossie-estado-pronto\.txt$/i.test(n) ||
      /^nav-token$/i.test(n) ||
      /^nav-ultima-url/i.test(n) ||
      /^agent-last-plan\.json$/i.test(n) ||
      (!LEVE &&
        (/^auditoria-.*\.md$/i.test(n) ||
          /^dossie\.txt$/i.test(n) ||
          /^modelos\.json\.bak/i.test(n) ||
          /^modelos-stats\.json$/i.test(n) ||
          /^cursor-cli-status\.json$/i.test(n) ||
          /^chat\.json$/i.test(n) ||
          /^indice-codigo\.json$/i.test(n))),
    '.dg-editor runtime'
  )

  if (!LEVE) {
    // bin/ = MCP compilado (npm run build:mcp) — nao apagar
    for (const sub of ['backup', '_backups', 'chats', 'avaliacoes', 'memoria', 'logs', 'downloads']) {
      rm(path.join('.dg-editor', sub), '.dg-editor/' + sub)
    }
  } else {
    for (const sub of ['logs', 'downloads']) {
      rm(path.join('.dg-editor', sub), '.dg-editor/' + sub)
    }
  }

  if (process.argv.includes('--com-out')) {
    rm('out', 'out/ (rebuild)')
  }
}

function limpezaOrganica() {
  // packaging / caches — NÃO apaga instaladores finais em dist-app/*.exe
  for (const pasta of [
    'dist',
    'release',
    'release-builds',
    'coverage',
    '.vite',
    '.turbo',
    'playwright-report',
    'test-results',
    '.cache',
    'electron-builder-cache',
    '.vs'
  ]) {
    rm(pasta, 'cache/packaging')
  }
  // win-unpacked é regenerável; mantém NSIS/Portable/latest.yml
  rm(path.join('dist-app', 'win-unpacked'), 'dist-app win-unpacked')
  rm(path.join('dist-app', 'linux-unpacked'), 'dist-app linux-unpacked')

  // pasta "electron" na raiz = cópia errada (nunca node_modules\electron)
  const electronRaiz = path.join(ROOT, 'electron')
  if (existe(electronRaiz)) {
    rm(electronRaiz, 'electron/ na raiz (errado — use o atalho)')
  }

  // lixo de SO / editor
  limparGlobDir(
    ROOT,
    (n) =>
      /^\.DS_Store$/i.test(n) ||
      /^Thumbs\.db$/i.test(n) ||
      /^desktop\.ini$/i.test(n) ||
      /~$/.test(n) ||
      /\.bak$/i.test(n) ||
      /^package\.json\.bak$/i.test(n),
    'lixo SO'
  )

  // executáveis / zips soltos na raiz (instaladores antigos)
  limparGlobDir(
    ROOT,
    (n) =>
      /^DG[- ]?Editor.*\.(exe|zip|7z|msi)$/i.test(n) ||
      /^setup.*\.exe$/i.test(n) ||
      /^.*-portable\.exe$/i.test(n),
    'instalador solto'
  )

  // scripts soltos de sessão (add-*.cjs, fix*.cjs, run.cjs) — não fazem parte do app
  limparGlobDir(
    ROOT,
    (n) =>
      /^add-.*\.cjs$/i.test(n) ||
      /^fix.*\.cjs$/i.test(n) ||
      /^run\.cjs$/i.test(n),
    'script solto'
  )

  // caches dentro de node_modules (seguro)
  const nm = path.join(ROOT, 'node_modules')
  if (existe(nm)) {
    for (const c of ['.cache', '.vite', 'electron/dist/chrome_debug.log']) {
      rm(path.join('node_modules', c), 'cache node_modules')
    }
  }

  // .dg-editor: apaga tudo que não é essencial para rodar
  const dg = path.join(ROOT, '.dg-editor')
  if (existe(dg)) {
    let nomes = []
    try {
      nomes = fs.readdirSync(dg)
    } catch (e) {
      console.warn('[err] readdir .dg-editor → ' + e)
      nomes = []
    }
    for (const nome of nomes) {
      if (ESSENCIAIS_DG.has(nome)) continue
      // modelos.json é estado do usuário — manter
      rm(path.join('.dg-editor', nome), '.dg-editor extras')
    }
  }

  // relatar o que sobrou na raiz e não é essencial
  console.log('')
  console.log('— inventário da raiz (após faxina) —')
  let extras = 0
  try {
    for (const nome of fs.readdirSync(ROOT).sort()) {
      if (nome === '.' || nome === '..') continue
      const ok = ESSENCIAIS_TOPO.has(nome)
      const abs = path.join(ROOT, nome)
      let tipo = '?'
      try {
        tipo = fs.statSync(abs).isDirectory() ? 'dir' : 'file'
      } catch {}
      if (ok) {
        console.log('  [ok]  ' + tipo.padEnd(4) + ' ' + nome)
      } else {
        extras++
        console.log('  [? ]  ' + tipo.padEnd(4) + ' ' + nome + '  ← não essencial; revise')
      }
    }
  } catch (e) {
    console.warn('[err] inventário → ' + e)
  }
  if (extras === 0) {
    console.log('  pasta orgânica: só o necessário para o DG Editor.')
  } else {
    console.log('  itens fora da lista essencial: ' + extras + ' (não removidos automaticamente)')
  }
}

function main() {
  const modo = LEVE ? 'leve' : ORGANICA ? 'organica' : 'completa'
  console.log(
    'DG Editor — limpeza de workspace [' + modo + ']' + (DRY ? ' (dry-run)' : '')
  )
  console.log('raiz: ' + ROOT)

  limpezaBase()
  if (ORGANICA && !LEVE) {
    limpezaOrganica()
  }

  const bytes = removidos.filter((r) => r.ok).reduce((a, r) => a + r.bytes, 0)
  const falhas = removidos.filter((r) => !r.ok)
  console.log('')
  console.log(
    (DRY ? 'Seriam removidos: ' : 'Removidos: ') +
      removidos.filter((r) => r.ok).length +
      ' itens · ' +
      fmt(bytes)
  )
  if (falhas.length) console.log('Falhas: ' + falhas.length)
  if (process.argv.includes('--verbose')) {
    for (const p of pulados.slice(0, 20)) console.log('skip ' + p)
  }
  process.exit(falhas.length ? 1 : 0)
}

main()
