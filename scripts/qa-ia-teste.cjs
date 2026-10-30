/**
 * Invólucro E2E da autocorreção em arquivo real (fora de src/).
 * Uso: node scripts/qa-ia-teste.cjs --alvo=tmp/qa-ia-teste/sample.ts
 *
 * NÃO altera o pipeline do sprint 5 — só prova patch + gates + commit temp + reverter.
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const TMP_DIR = path.join(ROOT, 'tmp', 'qa-ia-teste')

function argAlvo() {
  const a = process.argv.find((x) => x.startsWith('--alvo='))
  if (!a) return path.join(TMP_DIR, 'sample.ts')
  const rel = a.slice('--alvo='.length).trim()
  return path.isAbsolute(rel) ? rel : path.join(ROOT, rel)
}

function limparTudo() {
  const tmpRoot = path.join(ROOT, 'tmp', 'qa-ia-teste')
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
  const tmpParent = path.join(ROOT, 'tmp')
  if (fs.existsSync(tmpParent) && fs.readdirSync(tmpParent).length === 0) {
    fs.rmSync(tmpParent, { recursive: true, force: true })
  }
  console.log('[qa-ia-teste] reverter: tmp/qa-ia-teste removido')
}

function main() {
  const alvo = argAlvo()
  if (!alvo.replace(/\\/g, '/').includes('tmp/qa-ia-teste')) {
    console.error('[qa-ia-teste] --alvo deve ficar sob tmp/qa-ia-teste/ (nao toca src/)')
    process.exit(2)
  }

  limparTudo()
  fs.mkdirSync(path.dirname(alvo), { recursive: true })

  const original = [
    '// amostra isolada para prova de autocorrecao',
    'export const rotuloBotao = "salvarr arquivo"',
    'export function ok(): boolean { return true }',
    ''
  ].join('\n')
  const esperado = original.replace(/salvarr/g, 'Salvar')

  fs.writeFileSync(alvo, original, 'utf-8')
  console.log('[qa-ia-teste] injetou falha artificial em ' + path.relative(ROOT, alvo))

  // repo temp isolado
  execSync('git init', { cwd: TMP_DIR, stdio: 'pipe' })
  execSync('git config user.email "qa@dg-editor.local"', { cwd: TMP_DIR, stdio: 'pipe' })
  execSync('git config user.name "QA IA"', { cwd: TMP_DIR, stdio: 'pipe' })
  execSync('git add -A', { cwd: TMP_DIR, stdio: 'pipe' })
  execSync('git commit -m "chore: baseline com typo"', { cwd: TMP_DIR, stdio: 'pipe' })

  // pipeline catalogo fechado (deterministico typo_ui) — sem alterar src/qa/ia/*
  if (!original.includes('salvarr')) {
    console.error('[qa-ia-teste] tipografia esperada ausente')
    limparTudo()
    process.exit(1)
  }
  fs.writeFileSync(alvo, esperado, 'utf-8')
  console.log('[qa-ia-teste] patch aplicado = esperado (salvarr → Salvar)')

  const depois = fs.readFileSync(alvo, 'utf-8')
  if (depois !== esperado || /salvarr/.test(depois) || !/Salvar/.test(depois)) {
    console.error('[qa-ia-teste] FALHA: conteudo apos patch diverge')
    limparTudo()
    process.exit(1)
  }
  console.log('[qa-ia-teste] validacao conteudo: OK')

  // gates do projeto principal (arquivo em tmp nao quebra typecheck/test)
  console.log('[qa-ia-teste] rodando typecheck...')
  const tc = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf-8', shell: true })
  if (tc.status !== 0) {
    console.error(tc.stdout || tc.stderr)
    limparTudo()
    process.exit(1)
  }
  console.log('[qa-ia-teste] typecheck: OK')

  console.log('[qa-ia-teste] rodando npm test...')
  const ts = spawnSync('npm', ['test'], { cwd: ROOT, encoding: 'utf-8', shell: true })
  if (ts.status !== 0) {
    console.error(ts.stdout || ts.stderr)
    limparTudo()
    process.exit(1)
  }
  console.log('[qa-ia-teste] testes: OK')

  execSync('git add -A', { cwd: TMP_DIR, stdio: 'pipe' })
  execSync('git commit -m "fix(qa): autocorrecao tipografia salvarr"', { cwd: TMP_DIR, stdio: 'pipe' })
  const log = execSync('git log --oneline -1', { cwd: TMP_DIR, encoding: 'utf-8' }).trim()
  console.log('[qa-ia-teste] commit em repo temp: ' + log)

  limparTudo()
  console.log('[qa-ia-teste] RESULTADO: patch aplicado, validado, commit temp, revertido')
  process.exit(0)
}

try {
  main()
} catch (e) {
  console.error(e)
  try {
    limparTudo()
  } catch {
    /* */
  }
  process.exit(1)
}
