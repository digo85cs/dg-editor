/**
 * Agente de manutenção de dependências (estilo UniGetUI) — winget silencioso/oculto.
 * Mantém ferramentas externas do DG Editor atualizadas sem UI.
 */
import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { dglog } from './dglog'
import { userDataDir } from './paths'
import { ollamaInstalado, ensureOllama } from './ollama-keeper'

export type DepPacote = {
  id: string
  nome: string
  /** Se true, tenta instalar quando ausente */
  essencial: boolean
  /** Checagem rápida no PATH / pasta conhecida */
  binHint?: 'ollama' | 'git' | 'ffmpeg' | 'gh' | 'node' | 'comfyui'
}

export type DepItemStatus = {
  id: string
  nome: string
  instalado: boolean
  versaoAtual?: string
  versaoDisponivel?: string
  precisaAtualizar: boolean
  essencial: boolean
  ultimoErro?: string
}

export type DepManutencaoEstado = {
  ativo: boolean
  intervaloHoras: number
  ultimaVarredura?: string
  ultimaExecucao?: string
  ultimaMensagem?: string
  itens: DepItemStatus[]
}

export type DepManutencaoResultado = {
  ok: boolean
  mensagem: string
  itens: DepItemStatus[]
  atualizados: string[]
  instalados: string[]
  falhas: string[]
  pulado?: boolean
}

/** Catálogo alinhado às ferramentas que o DG usa no Windows. */
export const CATALOGO_DEPS: DepPacote[] = [
  { id: 'Ollama.Ollama', nome: 'Ollama', essencial: true, binHint: 'ollama' },
  { id: 'Git.Git', nome: 'Git', essencial: true, binHint: 'git' },
  { id: 'Gyan.FFmpeg', nome: 'FFmpeg', essencial: true, binHint: 'ffmpeg' },
  { id: 'GitHub.cli', nome: 'GitHub CLI', essencial: false, binHint: 'gh' },
  { id: 'Python.Python.3.12', nome: 'Python 3.12', essencial: false, binHint: undefined },
  { id: 'OpenJS.NodeJS.LTS', nome: 'Node.js LTS', essencial: false, binHint: 'node' },
  { id: 'Comfy.ComfyUI-Desktop', nome: 'ComfyUI Desktop', essencial: false, binHint: 'comfyui' }
]

const INTERVALO_PADRAO_H = 24
let emCurso = false
let bootAgendado = false

function estadoPath(): string {
  return join(userDataDir(), 'deps-manutencao.json')
}

function logPath(): string {
  const dir = join(userDataDir(), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'deps-manutencao.log')
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  dglog('[deps-manut] ' + msg)
  try {
    appendFileSync(logPath(), line + '\n', 'utf8')
  } catch {
    /* */
  }
}

function lerConfig(): { ativo: boolean; intervaloHoras: number; ultimaVarredura?: string; ultimaExecucao?: string; ultimaMensagem?: string } {
  try {
    const j = JSON.parse(readFileSync(estadoPath(), 'utf8')) as Record<string, unknown>
    return {
      ativo: j.ativo !== false,
      intervaloHoras: typeof j.intervaloHoras === 'number' && j.intervaloHoras > 0 ? j.intervaloHoras : INTERVALO_PADRAO_H,
      ultimaVarredura: typeof j.ultimaVarredura === 'string' ? j.ultimaVarredura : undefined,
      ultimaExecucao: typeof j.ultimaExecucao === 'string' ? j.ultimaExecucao : undefined,
      ultimaMensagem: typeof j.ultimaMensagem === 'string' ? j.ultimaMensagem : undefined
    }
  } catch {
    return { ativo: true, intervaloHoras: INTERVALO_PADRAO_H }
  }
}

function salvarConfig(parcial: Record<string, unknown>): void {
  const atual = lerConfig()
  const next = { ...atual, ...parcial }
  try {
    if (!existsSync(userDataDir())) mkdirSync(userDataDir(), { recursive: true })
    writeFileSync(estadoPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (e) {
    log('falha ao salvar config: ' + String(e))
  }
}

function comfyUiPresente(): boolean {
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const bases = [
    join(local, 'Programs', 'ComfyUI'),
    join(local, 'Programs', 'ComfyUI Desktop')
  ]
  for (const b of bases) {
    if (existsSync(join(b, 'ComfyUI.exe')) || existsSync(join(b, 'ComfyUI Desktop.exe'))) return true
  }
  return false
}

function binNoPath(hint: DepPacote['binHint']): boolean {
  if (!hint) return false
  if (hint === 'ollama') return ollamaInstalado()
  if (hint === 'comfyui') return comfyUiPresente()
  try {
    const cmd = process.platform === 'win32' ? `where ${hint}` : `which ${hint}`
    execSync(cmd, { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

function wingetDisponivel(): boolean {
  if (process.platform !== 'win32') return false
  try {
    execSync('where winget', { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

function runWinget(args: string[], timeoutMs = 180_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn('winget', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WINGET_DISABLE_INTERACTIVITY: '1' }
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* */
      }
      resolve({ code: -1, out, err: err + '\ntimeout' })
    }, timeoutMs)
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -2, out, err: String(e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -3, out, err })
    })
  })
}

function parseListagem(texto: string, id: string): { instalado: boolean; versaoAtual?: string; versaoDisponivel?: string } {
  const lines = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (!line.includes(id)) continue
    if (/^nome\b/i.test(line) || /^name\b/i.test(line) || /^-{3,}/.test(line)) continue
    // Formato tipico: Nome  ID  Versao  [Disponivel]  Origem
    const parts = line.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean)
    const idIdx = parts.findIndex((p) => p === id || p.startsWith(id))
    if (idIdx < 0) continue
    const versaoAtual = parts[idIdx + 1]
    let versaoDisponivel: string | undefined
    // Se houver coluna Disponível (não "winget")
    const talvezDisp = parts[idIdx + 2]
    if (talvezDisp && !/^winget$/i.test(talvezDisp) && /^\d/.test(talvezDisp)) {
      versaoDisponivel = talvezDisp
    }
    return {
      instalado: true,
      versaoAtual: versaoAtual && /^\d/.test(versaoAtual) ? versaoAtual : undefined,
      versaoDisponivel
    }
  }
  return { instalado: false }
}

export async function listarStatusDeps(): Promise<DepItemStatus[]> {
  const itens: DepItemStatus[] = []
  const temWinget = wingetDisponivel()
  for (const p of CATALOGO_DEPS) {
    const noPath = binNoPath(p.binHint)
    let instalado = noPath
    let versaoAtual: string | undefined
    let versaoDisponivel: string | undefined
    let ultimoErro: string | undefined
    if (temWinget) {
      const r = await runWinget(
        ['list', '--id', p.id, '--accept-source-agreements', '--disable-interactivity'],
        60_000
      )
      const parsed = parseListagem(r.out + '\n' + r.err, p.id)
      if (parsed.instalado) {
        instalado = true
        versaoAtual = parsed.versaoAtual
        versaoDisponivel = parsed.versaoDisponivel
      } else if (!noPath && r.code !== 0 && /no installed package/i.test(r.out + r.err) === false) {
        // list retorna  -1978335212 quando não acha — ok
        if (!/No installed package found|nenhum pacote/i.test(r.out + r.err)) {
          ultimoErro = (r.err || r.out).slice(0, 160)
        }
      }
    }
    const precisaAtualizar = !!(versaoDisponivel && versaoAtual && versaoDisponivel !== versaoAtual)
    itens.push({
      id: p.id,
      nome: p.nome,
      instalado,
      versaoAtual,
      versaoDisponivel,
      precisaAtualizar,
      essencial: p.essencial,
      ultimoErro
    })
  }
  return itens
}

export async function obterEstadoManutencao(): Promise<DepManutencaoEstado & { winget: boolean; emCurso: boolean }> {
  const cfg = lerConfig()
  let itens: DepItemStatus[] = []
  try {
    itens = await listarStatusDeps()
  } catch (e) {
    log('listarStatus falhou: ' + String(e))
  }
  salvarConfig({ ultimaVarredura: new Date().toISOString() })
  return {
    ativo: cfg.ativo,
    intervaloHoras: cfg.intervaloHoras,
    ultimaVarredura: new Date().toISOString(),
    ultimaExecucao: cfg.ultimaExecucao,
    ultimaMensagem: cfg.ultimaMensagem,
    itens,
    winget: wingetDisponivel(),
    emCurso
  }
}

export function configurarManutencao(opts: { ativo?: boolean; intervaloHoras?: number }): DepManutencaoEstado {
  const cfg = lerConfig()
  if (typeof opts.ativo === 'boolean') cfg.ativo = opts.ativo
  if (typeof opts.intervaloHoras === 'number' && opts.intervaloHoras >= 1) cfg.intervaloHoras = opts.intervaloHoras
  salvarConfig(cfg)
  return {
    ativo: cfg.ativo,
    intervaloHoras: cfg.intervaloHoras,
    ultimaVarredura: cfg.ultimaVarredura,
    ultimaExecucao: cfg.ultimaExecucao,
    ultimaMensagem: cfg.ultimaMensagem,
    itens: []
  }
}

function dentroDoIntervalo(cfg: ReturnType<typeof lerConfig>): boolean {
  if (!cfg.ultimaExecucao) return false
  const t = Date.parse(cfg.ultimaExecucao)
  if (!Number.isFinite(t)) return false
  return Date.now() - t < cfg.intervaloHoras * 3600_000
}

export async function rodarManutencaoDeps(opts?: {
  forcar?: boolean
  silencioso?: boolean
}): Promise<DepManutencaoResultado> {
  const cfg = lerConfig()
  if (!cfg.ativo && !opts?.forcar) {
    return {
      ok: true,
      mensagem: 'Manutenção automática desligada',
      itens: [],
      atualizados: [],
      instalados: [],
      falhas: [],
      pulado: true
    }
  }
  if (emCurso) {
    return {
      ok: false,
      mensagem: 'Manutenção já em andamento',
      itens: [],
      atualizados: [],
      instalados: [],
      falhas: [],
      pulado: true
    }
  }
  if (!opts?.forcar && dentroDoIntervalo(cfg)) {
    return {
      ok: true,
      mensagem: `Já rodou há menos de ${cfg.intervaloHoras}h — pulando`,
      itens: [],
      atualizados: [],
      instalados: [],
      falhas: [],
      pulado: true
    }
  }
  if (process.platform !== 'win32' || !wingetDisponivel()) {
    const msg = 'winget indisponível neste PC'
    salvarConfig({ ultimaMensagem: msg, ultimaExecucao: new Date().toISOString() })
    return { ok: false, mensagem: msg, itens: [], atualizados: [], instalados: [], falhas: [msg] }
  }

  emCurso = true
  log('início (forcar=' + !!opts?.forcar + ')')
  const atualizados: string[] = []
  const instalados: string[] = []
  const falhas: string[] = []
  let itens: DepItemStatus[] = []
  try {
    itens = await listarStatusDeps()
    for (const item of itens) {
      const pac = CATALOGO_DEPS.find((c) => c.id === item.id)
      if (!pac) continue
      if (!item.instalado) {
        if (!pac.essencial && !opts?.forcar) continue
        log('instalando ' + pac.id)
        const r = await runWinget(
          [
            'install',
            '--id',
            pac.id,
            '-e',
            '--silent',
            '--accept-package-agreements',
            '--accept-source-agreements',
            '--disable-interactivity'
          ],
          300_000
        )
        // 0 = ok; -1978335189 às vezes já instalado
        if (r.code === 0 || /successfully installed|já está instalado|already installed/i.test(r.out + r.err)) {
          instalados.push(pac.nome)
          item.instalado = true
        } else {
          falhas.push(pac.nome + ' install:' + r.code)
          log('install falhou ' + pac.id + ' code=' + r.code + ' ' + (r.err || r.out).slice(0, 200))
        }
        continue
      }
      if (item.precisaAtualizar || opts?.forcar) {
        log('atualizando ' + pac.id)
        const r = await runWinget(
          [
            'upgrade',
            '--id',
            pac.id,
            '-e',
            '--silent',
            '--accept-package-agreements',
            '--accept-source-agreements',
            '--disable-interactivity'
          ],
          300_000
        )
        // -1978335189 = No applicable update found
        if (r.code === 0 || /successfully installed|atualizado|upgraded/i.test(r.out + r.err)) {
          atualizados.push(pac.nome)
          item.precisaAtualizar = false
        } else if (r.code === -1978335189 || /No applicable update|nenhuma atualização/i.test(r.out + r.err)) {
          item.precisaAtualizar = false
        } else {
          falhas.push(pac.nome + ' upgrade:' + r.code)
          log('upgrade falhou ' + pac.id + ' code=' + r.code)
        }
      }
    }
    // Garante Ollama no ar após possível update
    try {
      await ensureOllama()
    } catch {
      /* */
    }
    itens = await listarStatusDeps()
    const msg =
      falhas.length === 0
        ? `OK — instalados: ${instalados.length}, atualizados: ${atualizados.length}`
        : `Parcial — falhas: ${falhas.join(', ')}`
    salvarConfig({
      ultimaExecucao: new Date().toISOString(),
      ultimaMensagem: msg,
      ultimaVarredura: new Date().toISOString()
    })
    log(msg)
    return { ok: falhas.length === 0, mensagem: msg, itens, atualizados, instalados, falhas }
  } catch (e) {
    const msg = 'Erro: ' + String(e)
    salvarConfig({ ultimaExecucao: new Date().toISOString(), ultimaMensagem: msg })
    log(msg)
    return { ok: false, mensagem: msg, itens, atualizados, instalados, falhas: [msg] }
  } finally {
    emCurso = false
  }
}

/** Agenda manutenção oculta ~45s após o boot (não bloqueia UI). */
export function agendarManutencaoNoBoot(): void {
  if (bootAgendado) return
  bootAgendado = true
  if (!app.isReady()) {
    app.whenReady().then(() => agendarManutencaoNoBoot())
    return
  }
  const delayMs = app.isPackaged ? 45_000 : 20_000
  setTimeout(() => {
    const cfg = lerConfig()
    if (!cfg.ativo) {
      log('boot: automático desligado')
      return
    }
    void rodarManutencaoDeps({ silencioso: true }).then((r) => {
      log('boot resultado: ' + r.mensagem + (r.pulado ? ' (pulado)' : ''))
    })
  }, delayMs)
  log('agendado em ' + delayMs + 'ms')
}
