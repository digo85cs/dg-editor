// Roda a Auto-auditoria no app EMPACOTADO (win-unpacked) com userData isolado.
// Uso: node scripts/auditoria-packaged.cjs
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const exe = path.join(root, 'dist-app', 'win-unpacked', 'DG Editor.exe')
const userData = path.join(root, 'qa-artifacts', 'userdata-audit')

;(async () => {
  if (!fs.existsSync(exe)) { console.error('exe nao encontrado:', exe); process.exit(1) }
  fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(path.join(userData, '.dg-editor'), { recursive: true })
  // Copia skills/agentes do repo para o userData isolado (override local vence o pacote)
  for (const sub of ['skills', 'agentes', 'regras']) {
    const src = path.join(root, '.dg-editor', sub)
    if (fs.existsSync(src)) fs.cpSync(src, path.join(userData, '.dg-editor', sub), { recursive: true })
  }

  const env = { ...process.env, DG_QA_E2E: '1', DG_ALLOW_MULTI: '1', DG_QA_USERDATA: userData }
  delete env.ELECTRON_RUN_AS_NODE

  const app = await _electron.launch({ executablePath: exe, args: [], env, timeout: 30000 })
  const win = await app.firstWindow({ timeout: 25000 })
  await win.waitForLoadState('domcontentloaded')
  console.log('[auditoria] app empacotado aberto')

  const rel = await win.evaluate(async () => {
    const r = await window.api.invoke('auditoria:rodar', { autoAtualizar: false, reiniciarAoFim: false, bootLeve: false })
    return r
  })

  if (!rel || rel.ok === false) {
    console.log('[auditoria] FALHOU:', JSON.stringify(rel).slice(0, 500))
  } else {
    const itens = rel.itens || rel.checks || rel.pendencias || []
    const porSev = {}
    for (const i of itens) porSev[i.severidade || i.nivel || '?'] = (porSev[i.severidade || i.nivel || '?'] || 0) + 1
    console.log('[auditoria] resumo:', JSON.stringify({ ok: rel.ok, total: itens.length, porSev, chaves: Object.keys(rel) }))
    const ruins = itens.filter(i => /erro|error|falha/i.test(String(i.severidade || i.nivel || '')))
    for (const i of ruins.slice(0, 30)) console.log('  ERRO:', i.id || i.nome || '', '-', String(i.titulo || i.mensagem || i.detalhe || '').slice(0, 140))
    fs.writeFileSync(path.join(userData, 'auditoria-result.json'), JSON.stringify(rel, null, 2))
  }
  await app.close().catch(() => {})
  try { app.process()?.kill() } catch {}
  process.exit(0)
})().catch((e) => { console.error('fatal:', e); process.exit(1) })
