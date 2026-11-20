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
  ['resultado_avaliar', { pedido: 'diga ok', textoFinal: 'ok', criterios: ['respondeu'] }],
  // sem args obrigatorios, somente leitura/diagnostico (nada que escreva, instale ou gaste)
  ['git_diff', {}],
  ['projeto_smoke', {}],
  ['midia_custo', {}],
  ['midia_comfyui_status', {}],
  ['midia_memes_listar', {}],
  ['midia_hardware', {}],
  ['midia_atualizacoes', {}],
  ['midia_musicas_livres', {}],
  ['imagens_iso', {}],
  ['notas_mapa_mental', {}],
  ['tela_gravacoes', {}],
  ['receber_lan', {}],
  ['reversa_status', {}],
  ['apps_status', {}],
  ['qualidade_checar', {}],
  ['testes_rodar', {}],
  ['dossie_snapshot', {}]
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

  // Fase 2: prova de alcance — tools COM args obrigatorios recebem {} e devem
  // falhar na validacao zod (prova que o dispatch existe); "tool desconhecida"
  // = bug. Tools sem obrigatorios so rodam se estiverem na lista segura acima.
  const schemaPorNome = new Map(tools.map(t => [t.name, t.inputSchema || {}]))
  const nomesValidacao = tools
    .map(t => t.name)
    .filter(n => {
      const req = schemaPorNome.get(n)?.required || []
      return req.length > 0 && !TOOLS.some(([tn]) => tn === n)
    })
  console.log(`\n== fase validacao: ${nomesValidacao.length} tools com args obrigatorios ==`)
  let alcanceOk = 0
  const inalcancaveis = []
  for (const name of nomesValidacao) {
    try {
      const r = await enviar('tools/call', { name, arguments: {} })
      const txt = JSON.stringify(r.result || r.error || '')
      if (/tool desconhecida/i.test(txt)) { inalcancaveis.push(name); console.log(`  [ERRO] ${name}: tool desconhecida`) }
      else { alcanceOk++; }
    } catch (e) {
      if (/tool desconhecida/i.test(e.message)) { inalcancaveis.push(name); console.log(`  [ERRO] ${name}: ${e.message}`) }
      else alcanceOk++
    }
  }
  console.log(`alcance: ${alcanceOk}/${nomesValidacao.length} respondem (validacao ou execucao)`)
  if (inalcancaveis.length) console.log('INALCANCAVEIS:', inalcancaveis.join(', '))

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
  const semObrigatorios = tools
    .map(t => t.name)
    .filter(n => !(schemaPorNome.get(n)?.required || []).length && !TOOLS.some(([tn]) => tn === n))
  console.log(`tools sem args obrigatorios fora da lista segura (nao chamadas): ${semObrigatorios.length}`)
  if (semObrigatorios.length) console.log('  ' + semObrigatorios.join(', '))
  console.log(`\nRESUMO: ${ok}/${TOOLS.length} tools OK, alcance ${alcanceOk}/${nomesValidacao.length}` + (falhas.length || inalcancaveis.length ? ` | falhas: ${falhas.concat(inalcancaveis).join(', ')}` : ''))
  proc.kill()
  process.exit(falhas.length ? 1 : 0)
})().catch((e) => { console.error('fatal:', e); proc.kill(); process.exit(1) })
