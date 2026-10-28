import { spawn } from 'child_process'
import { request } from 'http'
import { dglog } from './dglog'
import { OLLAMA_URL, listarModelosResidentes } from './brain/ollama'

export function ollamaAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(`${OLLAMA_URL}/api/tags`, { method: 'GET', timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

const WARMUP_MODELO = 'qwen2.5-coder:7b'

/**
 * Warm-up nao bloqueante do 7b apos a UI/auditoria.
 * Prompt nao vazio + keep_alive 24h — prompt "" nao mantem o modelo em /api/ps.
 */
export function agendarWarmup7b(atrasoMs = 10_000): void {
  setTimeout(() => {
    void (async () => {
      try {
        if (!(await ollamaAlive())) {
          dglog('[keeper] warm-up 7b pulado — Ollama offline')
          return
        }
        const residentes = await listarModelosResidentes()
        const ja =
          residentes.some((r) => r === WARMUP_MODELO || r.startsWith(WARMUP_MODELO))
        if (ja) {
          dglog('[keeper] warm-up 7b pulado — ja residente')
          return
        }
        dglog('[keeper] warm-up 7b iniciando...')
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 180_000)
        try {
          const res = await fetch(OLLAMA_URL + '/api/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: WARMUP_MODELO,
              prompt: 'ok',
              stream: false,
              keep_alive: '24h',
              options: { num_predict: 1 }
            }),
            signal: ac.signal
          })
          if (!res.ok) {
            dglog('[keeper] warm-up 7b HTTP ' + res.status)
          } else {
            dglog('[keeper] warm-up 7b ok')
          }
        } finally {
          clearTimeout(timer)
        }
      } catch (e) {
        dglog('[keeper] warm-up 7b falhou: ' + String((e as Error)?.message || e))
      }
    })()
  }, atrasoMs)
}

let keeperProc: ReturnType<typeof spawn> | null = null

export async function ensureOllama(): Promise<boolean> {
  if (await ollamaAlive()) return true
  dglog('[keeper] Ollama morto - subindo oculto e persistente...')
  const exe = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  keeperProc = spawn(exe, ['serve'], { env: Object.assign({}, process.env, { OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_KEEP_ALIVE: '5m' }), detached: true, stdio: 'ignore', windowsHide: true })
  keeperProc.unref()
  // espera subir (ate 10s)
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await ollamaAlive()) {
      dglog('[keeper] Ollama no ar')
      return true
    }
  }
  dglog('[keeper] Ollama nao subiu')
  return false
}