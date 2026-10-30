import { spawn } from 'child_process'
import { request } from 'http'
import { dglog } from './dglog'
import { OLLAMA_URL } from './brain/ollama'

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

let keeperProc: ReturnType<typeof spawn> | null = null

export async function ensureOllama(): Promise<boolean> {
  if (await ollamaAlive()) return true
  dglog('[keeper] Ollama morto - subindo oculto e persistente...')
  const exe = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  try {
    keeperProc = spawn(exe, ['serve'], {
      env: Object.assign({}, process.env, {
        OLLAMA_NUM_PARALLEL: '1',
        OLLAMA_MAX_LOADED_MODELS: '1',
        OLLAMA_KEEP_ALIVE: '5m'
      }),
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    // Sem isto, spawn ENOENT vira dialog modal e trava a UI.
    keeperProc.on('error', (err) => {
      dglog('[keeper] spawn ollama falhou: ' + String((err as NodeJS.ErrnoException)?.message || err))
      keeperProc = null
    })
    keeperProc.unref()
  } catch (e) {
    dglog('[keeper] nao foi possivel iniciar ollama: ' + String(e))
    return false
  }
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