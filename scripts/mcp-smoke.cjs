// Smoke do bundle MCP: initialize + tools/list + tools/call em tools seguras.
// Uso: node scripts/mcp-smoke.cjs [bundle]
const { spawn } = require('child_process')
const path = require('path')

const bundle = process.argv[2] || path.join(__dirname, '..', 'resources', 'mcp-server.cjs')
const RAIZ = process.cwd()

const TOOLS = [
  ['projeto_arvore', { maxProfundidade: 2 }],
  ['codigo_buscar', { termo: 'function', limite: 5 }],
  ['skill_listar', {}],
  ['agente_listar', {}],
  ['dossie_read', {}],
  ['vault_list', {}],
  ['git_status', {}],
  ['midia_status', {}],
  ['portabilidade_status', {}],
  ['agentes_externos_status', {}],
  ['provisionamento_status', {}],
  ['automacao_listar', {}],
  ['midia_vozes_listar', {}],
  ['midia_musicas', {}],
  ['conector_listar', {}],
  ['resultado_avaliar', { pedido: 'diga ok', textoFinal: 'ok', criterios: ['respondeu'] }]
]

let nextId = 1
const pendentes = new Map()
let linhaBuf = ''

const proc = spawn(process.execPath, [bundle], {
  cwd: RAIZ,
  env: { ...process.env, DG_ROOT: RAIZ, DG_QA_E2E: '1' },
  stdio: ['pipe', 'pipe', 'inherit']
})

proc.stdout.on('data', (d) => {
  linhaBuf += d.toString()
  let idx
  while ((idx = linhaBuf.indexOf('\n')) >= 0) {
    const linha = linhaBuf.slice(0, idx).trim()
    linhaBuf = linhaBuf.slice(idx + 1)
    if (!linha) continue
    try {
      const msg = JSON.parse(linha)
      if (msg.id !== undefined && pendentes.has(msg.id)) {
        pendentes.get(msg.id)(msg)
        pendentes.delete(msg.id)
      }
    } catch { /* log nao-json */ }
  }
})

function enviar(method, params) {
  const id = nextId++
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((res, rej) => {
    pendentes.set(id, res)
    setTimeout(() => { if (pendentes.has(id)) { pendentes.delete(id); rej(new Error('timeout ' + method)) } }, 30000)
  })
}

const notificacao = (method, params) => {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

;(async () => {
  const init = await enviar('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '1.0' }
  })
  console.log('initialize:', init.result ? 'OK' : JSON.stringify(init.error))
  notificacao('notifications/initialized', {})

  const list = await enviar('tools/list', {})
  const tools = list.result?.tools || []
  console.log(`tools/list: ${tools.length} tools`)

  let ok = 0
  const falhas = []
  for (const [name, args] of TOOLS) {
    try {
      const r = await enviar('tools/call', { name, arguments: args })
      if (r.error) { falhas.push(name); console.log(`  [ERRO] ${name}: ${r.error.message}`) }
      else {
        const txt = (r.result?.content || []).map(c => c.text || '').join(' ').slice(0, 160).replace(/\n/g, ' ')
        console.log(`  [OK] ${name}: ${txt}`)
        ok++
      }
    } catch (e) {
      falhas.push(name)
      console.log(`  [ERRO] ${name}: ${e.message}`)
    }
  }
  console.log(`\nRESUMO: ${ok}/${TOOLS.length} tools OK` + (falhas.length ? ` | falhas: ${falhas.join(', ')}` : ''))
  proc.kill()
  process.exit(falhas.length ? 1 : 0)
})().catch((e) => { console.error('fatal:', e); proc.kill(); process.exit(1) })
