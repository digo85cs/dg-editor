/**
 * Gate H1 — prova que a raiz resolve sem DG_ROOT e que codigo_ler/buscar acham providers.ts
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ_ESPERADA = path.resolve(__dirname, '..')

// limpa DG_ROOT para forçar cascata
delete process.env.DG_ROOT

const require = createRequire(import.meta.url)
const pathsJs = path.join(RAIZ_ESPERADA, '.dg-editor', 'bin', 'main', 'paths.js')
const { resolverRaizProjeto, fonteRaizResolvida } = require(pathsJs)

const raiz = resolverRaizProjeto()
const fonte = fonteRaizResolvida()
console.log('RAIZ_RESOLVIDA=' + raiz)
console.log('FONTE=' + fonte)
console.log('MATCH_ESPERADA=' + (path.resolve(raiz) === path.resolve(RAIZ_ESPERADA)))

async function withMcp(fn) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
  const serverJs = path.join(RAIZ_ESPERADA, '.dg-editor', 'bin', 'main', 'mcp', 'server.js')
  // sobe SEM DG_ROOT no env do filho — o server deve resolver sozinho
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  delete env.DG_ROOT
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverJs],
    env,
    stderr: 'pipe'
  })
  let stderr = ''
  transport.stderr?.on?.('data', (d) => { stderr += d.toString() })
  const client = new Client({ name: 'teste-raiz', version: '1' }, { capabilities: {} })
  await client.connect(transport)
  try {
    return { result: await fn(client), stderr }
  } finally {
    try { await client.close() } catch {}
  }
}

function parseText(call) {
  return ((call.content || []).map((p) => p.text || '').join('\n'))
}

const { result, stderr } = await withMcp(async (c) => {
  const ler = await c.callTool({
    name: 'codigo_ler',
    arguments: { nome: 'src/main/brain/providers.ts' }
  })
  const buscar = await c.callTool({
    name: 'codigo_buscar',
    arguments: { termo: 'filaDeModelos', tipo: 'todos' }
  })
  // tambem busca por nome de arquivo
  const buscarArq = await c.callTool({
    name: 'codigo_buscar',
    arguments: { termo: 'providers.ts', tipo: 'todos' }
  })
  return { ler: parseText(ler), buscar: parseText(buscar), buscarArq: parseText(buscarArq), isError: ler.isError }
})

console.log('=== STDERR (raiz log) ===')
console.log(stderr.trim().split(/\r?\n/).filter((l) => /dg-paths|raiz=/i.test(l)).join('\n') || stderr.slice(0, 400))

let parsed
try { parsed = JSON.parse(result.ler) } catch { parsed = { raw: result.ler.slice(0, 300) } }
console.log('=== codigo_ler providers.ts ===')
console.log('arquivo=' + (parsed.arquivo || '?'))
console.log('totalLinhas=' + (parsed.totalLinhas || '?'))
console.log('modo=' + (parsed.modo || '?'))
const primeiras = String(parsed.corpo || '').split(/\r?\n/).slice(0, 3)
console.log('primeiras3=')
primeiras.forEach((l, i) => console.log('  ' + (i + 1) + '| ' + l))

let hits
try { hits = JSON.parse(result.buscar) } catch { hits = [] }
console.log('=== codigo_buscar filaDeModelos ===')
console.log('hits=' + (Array.isArray(hits) ? hits.length : 0))
if (Array.isArray(hits) && hits[0]) console.log('primeiro=' + hits[0].arquivo + ':' + hits[0].linha + ' ' + hits[0].nome)

let hitsArq
try { hitsArq = JSON.parse(result.buscarArq) } catch { hitsArq = [] }
console.log('=== codigo_buscar providers.ts ===')
console.log('hits=' + (Array.isArray(hitsArq) ? hitsArq.length : 0))

const ok =
  path.resolve(raiz) === path.resolve(RAIZ_ESPERADA) &&
  parsed.arquivo &&
  String(parsed.corpo || '').includes('ProviderConfig') &&
  Array.isArray(hits) && hits.length > 0

console.log('GATE_H1=' + (ok ? 'PASS' : 'FAIL'))
process.exit(ok ? 0 : 1)
