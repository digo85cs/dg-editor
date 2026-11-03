/**
 * Detecção de shell em cascata: pwsh (maior versão) → preview → PATH → WindowsApps → powershell → cmd.
 */
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execFileSync, spawnSync } from 'child_process'
import { appDataDir } from './paths'

export interface ShellInfo {
  exe: string
  args: string[]
  versao: string | null
  tipo: 'pwsh' | 'pwsh-preview' | 'powershell' | 'cmd'
  origem: string
}

export interface ShellOpcao {
  id: string
  rotulo: string
  exe: string
  args: string[]
  tipo: 'pwsh' | 'pwsh-preview' | 'powershell' | 'cmd'
}

let cache: ShellInfo | null = null
let listaShellsCache: { at: number; itens: ShellOpcao[] } | null = null
const LISTA_SHELLS_TTL_MS = 60_000

function compararSemver(a: string, b: string): number {
  const pa = a.split(/[^\d]+/).filter(Boolean).map((n) => parseInt(n, 10) || 0)
  const pb = b.split(/[^\d]+/).filter(Boolean).map((n) => parseInt(n, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da !== db) return da - db
  }
  return 0
}

function lerVersaoPwsh(exe: string): string | null {
  // Timeout curto: spawnSync bloqueia o event loop do Electron (IPC/terminal).
  try {
    const r = spawnSync(
      exe,
      ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      { encoding: 'utf8', timeout: 800, windowsHide: true }
    )
    const out = String(r.stdout || '').trim()
    if (out && /^\d+\.\d+/.test(out)) return out.split(/\r?\n/)[0].trim()
  } catch {
    /* ignora */
  }
  return null
}

function candidatosProgramFiles(nomeExe: 'pwsh.exe' | 'pwsh-preview.exe'): { exe: string; pastaVer: string }[] {
  const bases = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  ]
  const out: { exe: string; pastaVer: string }[] = []
  for (const base of bases) {
    const root = join(base, 'PowerShell')
    if (!existsSync(root)) continue
    let dirs: string[] = []
    try {
      dirs = readdirSync(root)
    } catch {
      continue
    }
    for (const d of dirs) {
      const exe = join(root, d, nomeExe)
      try {
        if (existsSync(exe) && statSync(exe).isFile()) out.push({ exe, pastaVer: d })
      } catch {
        /* ignora */
      }
    }
  }
  out.sort((a, b) => compararSemver(b.pastaVer, a.pastaVer))
  return out
}

function which(cmd: string): string | null {
  try {
    const r = execFileSync('where.exe', [cmd], { encoding: 'utf8', windowsHide: true, timeout: 1000 })
    const line = String(r)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().endsWith('.exe'))
    return line || null
  } catch {
    return null
  }
}

function montar(
  exe: string,
  tipo: ShellInfo['tipo'],
  origem: string,
  versaoHint?: string | null
): ShellInfo {
  const args = tipo === 'cmd' ? [] : ['-NoLogo']
  const versao =
    tipo === 'cmd' ? null : versaoHint !== undefined ? versaoHint : lerVersaoPwsh(exe)
  return { exe, args, versao, tipo, origem }
}

/** Lista candidatos na ordem da cascata (para fallback em spawn). */
export function listarCandidatosShell(): ShellInfo[] {
  const lista: ShellInfo[] = []
  const vistos = new Set<string>()

  const push = (info: ShellInfo) => {
    const key = info.exe.toLowerCase()
    if (vistos.has(key)) return
    // App Execution Alias (WindowsApps): existsSync no Node costuma ser false,
    // mas where/spawn ainda resolvem o pwsh real.
    const aliasOk =
      info.origem === 'PATH' ||
      info.origem === 'WindowsApps' ||
      key.includes('\\windowsapps\\')
    if (!existsSync(info.exe) && !aliasOk) return
    vistos.add(key)
    lista.push(info)
  }

  // Usa pastaVer do Program Files — sem spawnSync (nao bloqueia o event loop).
  for (const c of candidatosProgramFiles('pwsh.exe')) {
    push(montar(c.exe, 'pwsh', 'ProgramFiles', c.pastaVer))
  }
  for (const c of candidatosProgramFiles('pwsh-preview.exe')) {
    push(montar(c.exe, 'pwsh-preview', 'ProgramFiles', c.pastaVer))
  }

  const pathPwsh = which('pwsh.exe') || which('pwsh')
  if (pathPwsh) push(montar(pathPwsh, 'pwsh', 'PATH', null))

  const wa = join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WindowsApps',
    'pwsh.exe'
  )
  if (wa && existsSync(wa)) push(montar(wa, 'pwsh', 'WindowsApps', null))

  const ps = which('powershell.exe') || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (ps && existsSync(ps)) push(montar(ps, 'powershell', 'fallback', '5.1'))

  const cmd = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
  push(montar(cmd, 'cmd', 'fallback', null))

  return lista
}

export function detectarShell(): ShellInfo {
  const lista = listarCandidatosShell()
  const escolhido = lista[0] || montar(
    join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
    'cmd',
    'fallback',
    null
  )
  console.log(
    `[shell] ${escolhido.tipo} ${escolhido.versao || '?'} em ${escolhido.exe} (origem: ${escolhido.origem})`
  )
  return escolhido
}

export function getShellCache(): ShellInfo {
  if (!cache) cache = detectarShell()
  return cache
}

export function limparCacheShell(): void {
  cache = null
  listaShellsCache = null
}

function slugShellId(tipo: ShellInfo['tipo'], versao: string | null): string {
  if (tipo === 'cmd') return 'cmd'
  if (tipo === 'powershell') return 'powershell-' + (versao || '5.1').replace(/\s+/g, '')
  if (tipo === 'pwsh-preview') return 'pwsh-preview-' + (versao || 'x').replace(/\s+/g, '')
  return 'pwsh-' + (versao || 'x').replace(/\s+/g, '')
}

function rotuloShell(tipo: ShellInfo['tipo'], versao: string | null): string {
  if (tipo === 'cmd') return 'Prompt de Comando'
  if (tipo === 'powershell') return 'Windows PowerShell ' + (versao || '5.1')
  if (tipo === 'pwsh-preview') return ('PowerShell Preview ' + (versao || '')).trim()
  return ('PowerShell ' + (versao || '')).trim()
}

function infoParaOpcao(info: ShellInfo): ShellOpcao {
  return {
    id: slugShellId(info.tipo, info.versao),
    rotulo: rotuloShell(info.tipo, info.versao),
    exe: info.exe,
    args: info.args,
    tipo: info.tipo
  }
}

/**
 * Lista todos os shells utilizáveis (sob demanda, TTL 60s).
 * Ordem: pwsh ProgramFiles (maior→menor) → PATH/WindowsApps → preview → powershell → cmd.
 */
export function listarShells(): ShellOpcao[] {
  try {
    if (listaShellsCache && Date.now() - listaShellsCache.at < LISTA_SHELLS_TTL_MS) {
      return listaShellsCache.itens
    }
    const out: ShellOpcao[] = []
    const pathSeen = new Set<string>()
    const verSeen = new Set<string>()

    const push = (info: ShellInfo) => {
      try {
        const key = info.exe.toLowerCase()
        if (pathSeen.has(key)) return
        const aliasOk =
          info.origem === 'PATH' ||
          info.origem === 'WindowsApps' ||
          key.includes('\\windowsapps\\')
        if (!existsSync(info.exe) && !aliasOk) return
        if (info.tipo === 'pwsh' || info.tipo === 'pwsh-preview') {
          const vk = info.tipo + ':' + (info.versao || key)
          if (verSeen.has(vk)) return
          verSeen.add(vk)
        }
        pathSeen.add(key)
        out.push(infoParaOpcao(info))
      } catch {
        /* ignora item */
      }
    }

    // Versão via nome da pasta (Program Files) — evita spawnSync no caminho quente do terminal.
    for (const c of candidatosProgramFiles('pwsh.exe')) {
      push(montar(c.exe, 'pwsh', 'ProgramFiles', c.pastaVer))
    }

    const pathPwsh = which('pwsh.exe') || which('pwsh')
    if (pathPwsh) push(montar(pathPwsh, 'pwsh', 'PATH', null))

    const wa = join(
      process.env.LOCALAPPDATA || '',
      'Microsoft',
      'WindowsApps',
      'pwsh.exe'
    )
    if (wa) push(montar(wa, 'pwsh', 'WindowsApps', null))

    for (const c of candidatosProgramFiles('pwsh-preview.exe')) {
      push(montar(c.exe, 'pwsh-preview', 'ProgramFiles', c.pastaVer))
    }

    const ps =
      which('powershell.exe') ||
      join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
      )
    if (ps) push(montar(ps, 'powershell', 'fallback', '5.1'))

    const cmd = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    push(montar(cmd, 'cmd', 'fallback', null))

    listaShellsCache = { at: Date.now(), itens: out }
    return out
  } catch {
    return listaShellsCache?.itens ? [...listaShellsCache.itens] : []
  }
}

export function acharShellPorId(id: string): ShellOpcao | null {
  if (!id) return null
  try {
    return listarShells().find((s) => s.id === id) || null
  } catch {
    return null
  }
}

function configPath(): string {
  return join(appDataDir(), 'dg-editor.json')
}

/** Preferência de shell padrão (userData/dg-editor.json). */
export function lerShellPadrao(): string | null {
  try {
    const p = configPath()
    if (!existsSync(p)) return null
    const data = JSON.parse(readFileSync(p, 'utf-8')) as { shellPadraoId?: string | null }
    const id = data.shellPadraoId
    return typeof id === 'string' && id.trim() ? id.trim() : null
  } catch {
    return null
  }
}

/** Persiste shellPadraoId sem apagar outras chaves do JSON. id=null remove a preferência. */
export function salvarShellPadrao(id: string | null): void {
  try {
    const p = configPath()
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    let data: Record<string, unknown> = {}
    if (existsSync(p)) {
      try {
        data = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
      } catch {
        data = {}
      }
    }
    if (id && String(id).trim()) data.shellPadraoId = String(id).trim()
    else delete data.shellPadraoId
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[shell] salvarShellPadrao falhou:', String((e as Error)?.message || e))
  }
}
