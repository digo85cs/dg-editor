import { spawn, execFile, execFileSync, type ChildProcess } from 'child_process'
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
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [ollamaBin()], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Lista modelos locais sem bloquear o event loop. */
export function listarModelosOllama(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      ollamaBin(),
      ['list'],
      { encoding: 'utf8', timeout: 15000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([])
          return
        }
        const linhas = stdout.split(/\r?\n/).filter((l) => l.trim())
        const nomes: string[] = []
        for (const l of linhas.slice(1)) {
          const nome = l.split(/\s+/)[0]
          if (nome && !/^NAME$/i.test(nome)) nomes.push(nome)
        }
        resolve(nomes)
      }
    )
  })
}

function modeloCorresponde(nomeLocal: string, modelo: string): boolean {
  if (nomeLocal === modelo) return true
  if (!modelo.includes(':') && (nomeLocal === modelo + ':latest' || nomeLocal.split(':')[0] === modelo)) return true
  return false
}

/** Verifica se o modelo esta presente localmente (async, sem travar o main). */
export async function modeloOllamaLocal(modelo: string): Promise<boolean> {
  const lista = await listarModelosOllama()
  return lista.some((n) => modeloCorresponde(n, modelo))
}

export type PullProgresso = {
  modelo: string
  fase: 'iniciando' | 'baixando' | 'verificando' | 'sucesso' | 'erro'
  percentual: number | null
  status: string
  erro?: string
}

type PullState = { modelo: string; proc: ChildProcess; inicio: number; ultimo: PullProgresso }

let pullAtual: PullState | null = null

export function pullEmAndamento(): string | null {
  return pullAtual?.modelo ?? null
}

export function estadoPull(): PullProgresso | null {
  return pullAtual?.ultimo ?? null
}

function interpretarLinhaPull(modelo: string, linha: string): PullProgresso | null {
  const t = linha.replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!t) return null
  const pct = t.match(/(\d{1,3})%/)
  const percentual = pct ? Math.min(100, Number(pct[1])) : null
  if (/^success/i.test(t)) return { modelo, fase: 'sucesso', percentual: 100, status: 'concluído' }
  if (/verifying|writing manifest/i.test(t)) return { modelo, fase: 'verificando', percentual, status: t }
  return { modelo, fase: 'baixando', percentual, status: t }
}

/**
 * Baixa um modelo com progresso incremental (`ollama pull`).
 * Nao bloqueia o processo principal e permite apenas um pull simultaneo.
 */
export function pullModelo(
  modelo: string,
  onProgress?: (p: PullProgresso) => void
): Promise<{ ok: boolean; erro?: string }> {
  if (pullAtual) {
    return Promise.resolve({ ok: false, erro: 'Já existe um download em andamento: ' + pullAtual.modelo })
  }
  if (!ollamaInstalado()) {
    return Promise.resolve({ ok: false, erro: 'Ollama não está instalado (não encontrado no PATH).' })
  }
  return new Promise((resolve) => {
    dglog('[keeper] pull iniciado: ' + modelo)
    const proc = spawn(ollamaBin(), ['pull', modelo], {
      env: Object.assign({}, process.env, {
        OLLAMA_NUM_PARALLEL: '1',
        OLLAMA_MAX_LOADED_MODELS: '1'
      }),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const estado: PullState = {
      modelo,
      proc,
      inicio: Date.now(),
      ultimo: { modelo, fase: 'iniciando', percentual: null, status: 'pulling manifest' }
    }
    pullAtual = estado
    const emitir = (p: PullProgresso | null) => {
      if (!p) return
      estado.ultimo = p
      try { onProgress?.(p) } catch { /* ignora */ }
    }
    emitir(estado.ultimo)

    let buffer = ''
    const consumir = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const partes = buffer.split(/[\r\n]+/)
      buffer = partes.pop() ?? ''
      let ultima: PullProgresso | null = null
      for (const parte of partes) {
        const p = interpretarLinhaPull(modelo, parte)
        if (p) ultima = p
      }
      emitir(ultima)
    }
    proc.stdout?.on('data', consumir)
    proc.stderr?.on('data', consumir)

    let finalizado = false
    const finalizar = (ok: boolean, erro?: string) => {
      if (finalizado) return
      finalizado = true
      pullAtual = null
      emitir({
        modelo,
        fase: ok ? 'sucesso' : 'erro',
        percentual: ok ? 100 : estado.ultimo.percentual,
        status: ok ? 'concluído' : 'falhou',
        erro
      })
      dglog('[keeper] pull ' + modelo + (ok ? ' ok' : ' falhou: ' + (erro || '')))
      resolve(ok ? { ok: true } : { ok: false, erro: erro || 'falha no download' })
    }

    proc.on('error', (e) => finalizar(false, String((e as Error)?.message || e)))
    proc.on('close', async (code) => {
      if (code === 0) {
        const presente = await modeloOllamaLocal(modelo)
        finalizar(presente, presente ? undefined : 'download terminou mas o modelo não aparece em ollama list')
      } else {
        finalizar(false, 'ollama pull saiu com código ' + code)
      }
    })
  })
}

/** Garante que o modelo esteja baixado; se nao estiver, faz `ollama pull` async. */
export async function garantirModelo(
  modelo: string,
  onProgress?: (p: PullProgresso) => void
): Promise<boolean> {
  if (await modeloOllamaLocal(modelo)) return true
  const r = await pullModelo(modelo, onProgress)
  return r.ok
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

/**
 * Garante Ollama no ar; se parado e instalado, sobe `ollama serve` automaticamente.
 * O modelo so e baixado quando explicitamente informado (evita pull surpresa de 4 GB no boot).
 */
export async function ensureOllama(modeloDefault?: string): Promise<boolean> {
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
  if (modeloDefault) {
    try {
      await garantirModelo(modeloDefault)
    } catch { /* nao bloqueia o boot por pull de modelo */ }
  }
  return true
}