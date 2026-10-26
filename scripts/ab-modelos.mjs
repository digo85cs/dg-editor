/**
 * A/B de modelos OpenRouter na posicao 1 (codigo).
 * Uso: MODELO_TESTADO=deepseek/deepseek-v3.2 node scripts/ab-modelos.mjs
 *
 * Nota: invocarAgente() so usa Ollama local — nao permite override OpenRouter.
 * Este harness usa executarAgente({ modeloForcado, agente }) para forcar o modelo.
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
  const m = t.match(/providers\.ts:(\d+)/i)
  const n = m ? parseInt(m[1], 10) : null
  const a = ok === true
  const b = n != null && n > 20
  const c = !frase && t.trim().length > 0
  const aprovado = a && b && c
  return {
    aprovado,
    n,
    motivo: !a
      ? 'ok=false'
      : !c
        ? frase || 'vazio'
        : !b
          ? n == null
            ? 'sem-cite providers.ts:N'
            : 'cite N=' + n + ' (<=20, cabeçalho/inicio)'
          : 'ok'
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
  const v = veredito(texto, r.ok !== false && !!texto.trim())
  const row = {
    agente,
    ok: r.ok !== false && !!texto.trim(),
    modeloUsado,
    overrideOk,
    duracaoMs: ms,
    veredito: v.aprovado ? 'APROVADO' : 'FALHOU:' + v.motivo,
    aprovado: v.aprovado && overrideOk,
    n: v.n,
    trecho: texto.replace(/\s+/g, ' ').slice(0, 400),
    erro: r.erro
  }
  if (!overrideOk) {
    row.veredito = 'FALHOU:modeloUsado!=' + MODELO + ' (foi ' + modeloUsado + ')'
    row.aprovado = false
  }
  rows.push(row)
  console.log(JSON.stringify(row, null, 2))
}

const aprovados = rows.filter((r) => r.aprovado).length
const out = {
  modelo: MODELO,
  pedido: PEDIDO,
  aprovados,
  total: rows.length,
  rows
}
const outPath = path.join(RAIZ, '.dg-editor', 'ab-' + MODELO.replace(/[\\/]/g, '_') + '.json')
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log('APROVADOS=' + aprovados + '/' + rows.length)
console.log('SAIDA=' + outPath)
process.exit(0)
