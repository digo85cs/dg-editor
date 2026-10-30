#!/usr/bin/env node
/**
 * Rotina de limpeza do workspace DG Editor.
 *
 * Remove artefatos gerados, logs, dumps de QA, imagens/tmp de agente e
 * relatórios runtime em .dg-editor — sem tocar em código, skills, agentes
 * ou baseline de QA.
 *
 * Uso:
 *   node scripts/limpeza-workspace.cjs           # executa (completa)
 *   node scripts/limpeza-workspace.cjs --leve    # rotina segura (auditoria/boot)
 *   node scripts/limpeza-workspace.cjs --dry-run # só lista
 *   npm run limpeza
 *   npm run limpeza:dry
 *   npm run limpeza:leve
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry-run') || process.argv.includes('-n')
const LEVE = process.argv.includes('--leve')

/** @type {{ path: string, bytes: number, ok: boolean, erro?: string }[]} */
const removidos = []
/** @type {string[]} */
const pulados = []

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

function main() {
  console.log(
    'DG Editor — limpeza de workspace' +
      (LEVE ? ' [leve]' : ' [completa]') +
      (DRY ? ' (dry-run)' : '')
  )
  console.log('raiz: ' + ROOT)

  // --- sempre: logs soltos, tmp, dumps de QA ---
  limparGlobDir(ROOT, (n) => /^smoke-.*\.log$/i.test(n) || /^dg-.*\.log$/i.test(n), 'log raiz')
  limparGlobDir(ROOT, (n) => /^fase0-snapshot\.txt$/i.test(n), 'snapshot')
  rm('tmp', 'pasta tmp/')
  if (existe(path.join(ROOT, 'logs'))) {
    limparGlobDir(path.join(ROOT, 'logs'), () => true, 'logs/')
  }
  limparGlobDir(
    path.join(ROOT, 'qa-artifacts'),
    (n) => n !== 'baseline.json' && n !== '.gitkeep',
    'qa-artifacts'
  )

  // --- temp do agente / sessão ---
  limparGlobDir('/tmp', (n) => /^dg-/i.test(n) || /^menubar/i.test(n), '/tmp dg')
  rm('/tmp/computer-use', '/tmp/computer-use screenshots')
  rm('/opt/cursor/artifacts/screenshots', 'artifacts screenshots')
  limparGlobDir('/opt/cursor/artifacts', (n) => /\.(png|webp|mp4|webm|jpg|jpeg)$/i.test(n), 'artifacts midia')

  const dg = path.join(ROOT, '.dg-editor')
  // leve: só lixo claro (A/B, tokens, dumps) — não apaga auditoria recém-gerada / modelos
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
      (!LEVE &&
        (/^auditoria-.*\.md$/i.test(n) ||
          /^dossie\.txt$/i.test(n) ||
          /^modelos\.json$/i.test(n) ||
          /^modelos\.json\.bak/i.test(n) ||
          /^modelos-stats\.json$/i.test(n) ||
          /^cursor-cli-status\.json$/i.test(n) ||
          /^chat\.json$/i.test(n) ||
          /^indice-codigo\.json$/i.test(n))),
    '.dg-editor runtime'
  )

  if (!LEVE) {
    for (const sub of ['bin', 'backup', '_backups', 'chats', 'avaliacoes', 'memoria', 'logs', 'downloads']) {
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
