/**
 * scripts/testar-fila.mjs
 * Valida a fila real de provedores de IA fazendo uma chamada de 1 token em cada
 * provider ativo que tenha chave configurada (via variavel de ambiente apiKeyEnv,
 * ja que o cofre de segredos depende do safeStorage do Electron e nao esta
 * disponivel em Node puro).
 *
 * Nao imprime valores de chave. Nao grava nada em disco.
 *
 * Uso:
 *   node scripts/testar-fila.mjs
 *   node scripts/testar-fila.mjs --json
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = process.cwd()
const CATALOGO_TS = join(RAIZ, 'src', 'main', 'brain', 'providers-registry.ts')

const argJson = process.argv.includes('--json')

function extrairProvedores(texto) {
  // Extrai blocos desc(...) do arquivo .ts para reconstruir o catalogo sem importar TS
  const provedores = []
  const blocos = texto.match(/desc\([\s\S]*?\),/g) || []
  for (const bloco of blocos) {
    const idMatch = bloco.match(/desc\(\s*'([^']+)'/)
    if (!idMatch) continue
    const id = idMatch[1]

    const formatoMatch = bloco.match(/'(openai|ollama|cursor-cli|codex-cli)'\s*,/)
    const formato = formatoMatch ? formatoMatch[1] : 'openai'

    const baseUrlMatch = bloco.match(/'([^']*:\/\/[^']+)'\s*,\s*\{/)
    const baseUrl = baseUrlMatch ? baseUrlMatch[1] : ''

    const apiKeyRefMatch = bloco.match(/apiKeyRef:\s*'([^']+)'/)
    const apiKeyRef = apiKeyRefMatch ? apiKeyRefMatch[1] : null

    const apiKeyEnvMatch = bloco.match(/apiKeyEnv:\s*'([^']+)'/)
    const apiKeyEnv = apiKeyEnvMatch ? apiKeyEnvMatch[1] : null

    const tierMatch = bloco.match(/tier:\s*(\d+)/)
    const tier = tierMatch ? Number(tierMatch[1]) : 0

    const ativoMatch = bloco.match(/ativo:\s*(true|false)/)
    const ativo = ativoMatch ? ativoMatch[1] === 'true' : true

    const ordemMatch = bloco.match(/ordem:\s*(\d+)/)
    const ordem = ordemMatch ? Number(ordemMatch[1]) : 0

    const modelosMatch = bloco.match(/modelos:\s*\[([\s\S]*?)\]/)
    let modelos = []
    if (modelosMatch) {
      const ids = modelosMatch[1].match(/'([^']+)'/g) || []
      modelos = ids.map((m) => m.replace(/'/g, ''))
    }

    provedores.push({ id, formato, baseUrl, apiKeyRef, apiKeyEnv, tier, ativo, ordem, modelos })
  }
  return provedores.sort((a, b) => a.ordem - b.ordem)
}

function mascararChave(chave) {
  if (!chave) return '—'
  return chave.slice(0, 4) + '****'
}

async function testeUmProvider(p) {
  const chave = p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined
  if (!chave) {
    return { id: p.id, status: 'SKIP', motivo: 'sem chave', latenciaMs: null }
  }

  const url = new URL(p.baseUrl.replace(/\/$/, '') + '/chat/completions')
  const body = JSON.stringify({
    model: p.modelos[0] || 'modelo',
    messages: [{ role: 'user', content: 'oi' }],
    max_tokens: 1,
    temperature: 0,
  })

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + chave,
      },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const ms = Date.now() - t0
    const texto = await res.text().catch(() => '')

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after') || res.headers.get('Retry-After')
      return { id: p.id, status: '429', motivo: `rate_limit${retryAfter ? ' (retry-after: ' + retryAfter + ')' : ''}`, latenciaMs: ms }
    }
    if (res.status === 401 || res.status === 403) {
      return { id: p.id, status: 'AUTH', motivo: `chave invalida (HTTP ${res.status})`, latenciaMs: ms }
    }
    if (res.status === 402) {
      return { id: p.id, status: '402', motivo: `cota/pagamento (HTTP 402)`, latenciaMs: ms }
    }
    if (!res.ok) {
      return { id: p.id, status: 'FAIL', motivo: `HTTP ${res.status}`, latenciaMs: ms }
    }
    return { id: p.id, status: 'OK', motivo: `200`, latenciaMs: ms }
  } catch (e) {
    const ms = Date.now() - t0
    const msg = e instanceof Error ? e.message : String(e)
    return { id: p.id, status: 'FAIL', motivo: `erro de rede: ${msg.slice(0, 120)}`, latenciaMs: ms }
  }
}

async function main() {
  let texto
  try {
    texto = readFileSync(CATALOGO_TS, 'utf-8')
  } catch (e) {
    console.error('Nao foi ler ' + CATALOGO_TS + ': ' + String(e))
    process.exit(1)
  }

  const provedores = extrairProvedores(texto)
  const resultados = []

  for (const p of provedores) {
    if (!p.ativo) {
      resultados.push({ id: p.id, status: 'SKIP', motivo: 'desativado', latenciaMs: null })
      continue
    }
    const r = await testeUmProvider(p)
    resultados.push(r)

    const chave = p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined
    let linha = ''
    if (r.status === 'OK') {
      linha = `[OK ] ${p.id} — 200 — ${r.latenciaMs}ms`
    } else if (r.status === '429') {
      linha = `[429] ${p.id} — rate_limit${r.motivo.includes('retry-after') ? ' (' + r.motivo.match(/retry-after: (\d+)/)?.[1] + 's)' : ''} — ${r.latenciaMs}ms`
    } else if (r.status === 'AUTH') {
      linha = `[AUTH] ${p.id} — ${r.motivo}`
    } else if (r.status === '402') {
      linha = `[402] ${p.id} — ${r.motivo}`
    } else if (r.status === 'SKIP') {
      linha = `[SKIP] ${p.id} — ${r.motivo}`
    } else {
      linha = `[FAIL] ${p.id} — ${r.motivo}`
    }
    console.log(linha)
  }

  if (argJson) {
    console.log(JSON.stringify({ provedores: resultados.length, resultados }, null, 2))
  }
}

main().catch((e) => {
  console.error('Erro fatal: ' + String(e))
  process.exit(1)
})
