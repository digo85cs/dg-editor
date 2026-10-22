import { spawn } from 'child_process'
import { request } from 'http'

const OLLAMA_URL = 'http://127.0.0.1:11434'

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
  console.log('[keeper] Ollama morto - subindo oculto e persistente...')
  const exe = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  keeperProc = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true })
  keeperProc.unref()
  // espera subir (ate 10s)
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await ollamaAlive()) {
      console.log('[keeper] Ollama no ar')
      return true
    }
  }
  console.log('[keeper] Ollama nao subiu')
  return false
}