import { spawn, execSync, execFileSync } from 'child_process'
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

export function ollamaBin(): string {
  return process.platform === 'win32' ? 'ollama.exe' : 'ollama'
}

export function ollamaInstalado(): boolean {
  try {
    if (process.platform === 'win32') execSync('where ollama', { stdio: 'ignore' })
    else execSync('which ollama', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Verifica se o modelo esta presente localmente via `ollama list`. */
export function modeloOllamaLocal(modelo: string): boolean {
  try {
    const saida = execFileSync(ollamaBin(), ['list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const linhas = saida.split('\n').filter((l) => l.trim())
    // primeira linha e cabeçalho 'NAME ...'
    for (const l of linhas.slice(1)) {
      const nome = l.split(/\s+/)[0]
      if (nome === modelo || nome === modelo + ':latest') return true
    }
    return false
  } catch {
    return false
  }
}

/** Garante que o modelo esteja baixado; se nao estiver, faz `ollama pull`. */
export async function garantirModelo(modelo: string): Promise<boolean> {
  if (modeloOllamaLocal(modelo)) return true
  if (!ollamaInstalado()) return false
  dglog('[keeper] modelo ausente, fazendo ollama pull ' + modelo)
  try {
    execFileSync(ollamaBin(), ['pull', modelo], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600_000,
    })
    return modeloOllamaLocal(modelo)
  } catch (e) {
    dglog('[keeper] ollama pull falhou para ' + modelo + ': ' + String((e as Error)?.message || e))
    return false
  }
}

export type OllamaCheck = { ativo: boolean; instalado: boolean }

let keeperProc: ReturnType<typeof spawn> | null = null

export async function checkOllama(): Promise<OllamaCheck> {
  const ativo = await ollamaAlive()
  return { ativo, instalado: ativo ? true : ollamaInstalado() }
}

export async function startOllama(): Promise<OllamaCheck> {
  const ativo = await ollamaAlive()
  if (ativo) return { ativo: true, instalado: true }
  const instalado = ollamaInstalado()
  if (!instalado) return { ativo: false, instalado: false }
  dglog('[keeper] startOllama solicitado pelo usuário...')
  const exe = ollamaBin()
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
    keeperProc.on('error', (err) => {
      dglog('[keeper] spawn ollama falhou: ' + String((err as NodeJS.ErrnoException)?.message || err))
      keeperProc = null
    })
    keeperProc.unref()
  } catch (e) {
    dglog('[keeper] nao foi possivel iniciar ollama: ' + String(e))
    return { ativo: false, instalado: true }
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await ollamaAlive()) {
      dglog('[keeper] Ollama no ar')
      return { ativo: true, instalado: true }
    }
  }
  dglog('[keeper] Ollama nao subiu')
  return { ativo: false, instalado: true }
}

/** Garante Ollama no ar e o modelo default disponível; se parado e instalado, sobe `ollama serve` automaticamente. */
export async function ensureOllama(modeloDefault = 'qwen2.5-coder:7b'): Promise<boolean> {
  const st = await checkOllama()
  if (!st.ativo) {
    if (!st.instalado) {
      dglog('[keeper] Ollama nao instalado no PATH')
      return false
    }
    dglog('[keeper] Ollama parado — auto-start')
    const up = await startOllama()
    if (!up.ativo) return false
  }
  // Garante o modelo default baixado no piso Ollama
  try {
    await garantirModelo(modeloDefault)
  } catch { /* nao bloqueia o boot por pull de modelo */ }
  return true
}