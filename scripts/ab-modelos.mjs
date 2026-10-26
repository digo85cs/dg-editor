/**
 * A/B de modelos OpenRouter na posicao 1 (codigo).
 * Uso: MODELO_TESTADO=deepseek/deepseek-v3.2 node scripts/ab-modelos.mjs
 * Saida: .dg-editor/ab2-<modelo_sanitizado>.json
 *
 * Critério semântico: extrai linha (formatos variados) e confere se o trecho
 * citado bate com a linha real do arquivo — nao premia so o formato providers.ts:N.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(__dirname, '..')
process.chdir(RAIZ)
process.env.DG_ROOT = RAIZ
if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY ausente')
  process.exit(2)
}
process.env.DG_CURSOR_CLI_OK = process.env.DG_CURSOR_CLI_OK || '1'

const MODELO = process.env.MODELO_TESTADO
if (!MODELO) {
  console.error('Defina MODELO_TESTADO')
  process.exit(2)
}

const PEDIDO =
  'Leia src/main/brain/providers.ts e cite UMA linha do CORPO do arquivo (ignore o cabeçalho e comentários) com o numero de linha exato.'

const AGENTES = ['arquiteto', 'revisor', 'seguranca', 'testador', 'dg-engenheiro']
const ARQ = path.join(RAIZ, 'src', 'main', 'brain', 'providers.ts')
const LINHAS_ARQ = fs.readFileSync(ARQ, 'utf8').split(/\r?\n/)

const require = createRequire(import.meta.url)
const { executarAgente } = require(path.join(RAIZ, '.dg-editor/bin/main/brain/agent.js'))
const { garantirCatalogoOpenRouterSync, disponivel } = require(
  path.join(RAIZ, '.dg-editor/bin/main/brain/registry.js')
)

garantirCatalogoOpenRouterSync()
const probe = {
  id: 'probe',
  tipo: 'online',
  formato: 'openai',
  modelo: MODELO,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  numPredict: 256,
  timeoutMs: 60000
}
console.log('MODELO_TESTADO=' + MODELO)
console.log('disponivel_status=' + disponivel(probe))
console.log('providers.ts_linhas=' + LINHAS_ARQ.length)

function extrairLinha(texto) {
  const padroes = [
    /providers\.ts:(\d+)/i,
    /\blinha\s+(\d+)/i,
    /\blinhas\s+(\d+)/i,
    /\bline\s+(\d+)/i,
    /\bL(\d+)\b/,
    /:(\d+)\s*[—\-–]/
  ]
  for (const p of padroes) {
    const m = texto.match(p)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function normalizar(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Maior substring contígua comum; match se >= 15 chars. */
function matchConteudo(textoAgente, linhaReal) {
  const a = normalizar(textoAgente)
  const b = normalizar(linhaReal)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) >= 15 || b.length < 15
  }
  // procurar 15 chars contíguos da linha real no texto do agente (e vice-versa)
  const min = 15
  if (b.length >= min) {
    for (let i = 0; i <= b.length - min; i++) {
      if (a.includes(b.slice(i, i + min))) return true
    }
  }
  if (a.length >= min) {
    for (let i = 0; i <= a.length - min; i++) {
      if (b.includes(a.slice(i, i + min))) return true
    }
  }
  return false
}

function veredito(texto, ok) {
  const t = String(texto || '')
  const falhas = [
    'não encontrado',
    'nao encontrado',
    'não foi possível encontrar',
    'nao foi possivel encontrar',
    'não encontrei',
    'nao encontrei',
    'no such file'
  ]
  const frase = falhas.find((f) => t.toLowerCase().includes(f))
  const n = extrairLinha(t)
  const linhaReal = n != null && n >= 1 && n <= LINHAS_ARQ.length ? LINHAS_ARQ[n - 1] : null
  const match = linhaReal != null ? matchConteudo(t, linhaReal) : false
  const a = ok === true
  const b = n != null
  const c = linhaReal != null
  const d = match
  const e = !frase && t.trim().length > 0
  const aprovado = a && b && c && d && e
  let motivo = 'ok'
  if (!a) motivo = 'ok=false'
  else if (!e) motivo = frase || 'vazio'
  else if (!b) motivo = 'sem-numero-linha'
  else if (!c) motivo = 'n=' + n + ' fora-do-arquivo'
  else if (!d) motivo = 'conteudo-nao-bate-com-linha-' + n
  return {
    aprovado,
    nExtraido: n,
    linhaReal: linhaReal != null ? linhaReal.trim().slice(0, 120) : null,
    matchConteudo: match,
    motivo
  }
}

const rows = []
for (const agente of AGENTES) {
  console.error('... ' + agente + ' @ ' + MODELO)
  const t0 = Date.now()
  let r
  try {
    r = await executarAgente(RAIZ, PEDIDO, {
      agente,
      tarefa: 'codigo',
      modeloForcado: MODELO
    })
  } catch (e) {
    r = { ok: false, texto: '', modelo: '', erro: String(e.message || e) }
  }
  const ms = Date.now() - t0
  const texto = String(r.texto || '')
  const modeloUsado = r.modelo || ''
  const overrideOk = modeloUsado === MODELO || modeloUsado.startsWith(MODELO)
  if (!overrideOk) {
    console.error('ABORT: overrideOk=false agente=' + agente + ' modeloUsado=' + modeloUsado)
    const abort = {
      modelo: MODELO,
      abort: true,
      motivo: 'overrideOk=false',
      agente,
      modeloUsado,
      esperado: MODELO
    }
    const abortPath = path.join(RAIZ, '.dg-editor', 'ab2-' + MODELO.replace(/[\\/]/g, '_') + '.json')
    fs.writeFileSync(abortPath, JSON.stringify({ ...abort, rows }, null, 2))
    console.log(JSON.stringify(abort, null, 2))
    process.exit(3)
  }
  const v = veredito(texto, r.ok !== false && !!texto.trim())
  const row = {
    agente,
    ok: r.ok !== false && !!texto.trim(),
    modeloUsado,
    overrideOk,
    duracaoMs: ms,
    nExtraido: v.nExtraido,
    linhaReal: v.linhaReal,
    trechoCitado: texto.replace(/\s+/g, ' ').slice(0, 400),
    matchConteudo: v.matchConteudo,
    aprovado: v.aprovado && overrideOk,
    veredito: v.aprovado ? 'APROVADO' : 'FALHOU:' + v.motivo,
    erro: r.erro
  }
  rows.push(row)
  console.log(JSON.stringify(row, null, 2))
}

const aprovados = rows.filter((r) => r.aprovado).length
const latMedia = Math.round(rows.reduce((s, r) => s + r.duracaoMs, 0) / rows.length)
const out = {
  modelo: MODELO,
  pedido: PEDIDO,
  aprovados,
  total: rows.length,
  latenciaMediaMs: latMedia,
  rows
}
const outPath = path.join(RAIZ, '.dg-editor', 'ab2-' + MODELO.replace(/[\\/]/g, '_') + '.json')
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log('APROVADOS=' + aprovados + '/' + rows.length)
console.log('LAT_MEDIA_MS=' + latMedia)
console.log('SAIDA=' + outPath)
process.exit(0)
