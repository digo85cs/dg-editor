/**
 * Cliente HTTP das tools MCP → servidor de controle do navegador (127.0.0.1:47821).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { projectStateDir, resolverRaizProjeto } from '../paths'

const HOST = '127.0.0.1'
const PORT = 47821
const TIMEOUT_MS = 15_000

function tokenPath(): string {
  return join(projectStateDir(resolverRaizProjeto()), 'nav-token')
}

/** Reler a CADA chamada — token rotaciona por sessão do app. */
function lerToken(): string {
  const p = tokenPath()
  if (!existsSync(p)) {
    throw new Error(
      'app não está aberto ou token expirado — abra o DG Editor (painel Navegador)'
    )
  }
  const t = readFileSync(p, 'utf8').trim()
  if (t.length < 32) throw new Error('nav-token inválido')
  return t
}

export async function chamarControle(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  let token: string
  try {
    token = lerToken()
  } catch (e) {
    return { status: 0, json: { erro: (e as Error).message } }
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`http://${HOST}:${PORT}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-DG-Token': token
      },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
      signal: ac.signal
    })
    const json = (await r.json()) as Record<string, unknown>
    return { status: r.status, json }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError'
      ? 'timeout 15s no servidor de controle do navegador'
      : String((e as Error).message || e)
    const offline =
      /ECONNREFUSED|fetch failed|network/i.test(msg) || (e as Error).name === 'TypeError'
    return {
      status: 0,
      json: {
        erro: offline
          ? 'app não está aberto ou token expirado — abra o DG Editor (painel Navegador)'
          : msg
      }
    }
  } finally {
    clearTimeout(timer)
  }
}
