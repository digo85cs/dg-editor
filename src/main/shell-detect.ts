/**
 * Detecção de shell em cascata: pwsh (maior versão) → preview → PATH → WindowsApps → powershell → cmd.
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { execFileSync, spawnSync } from 'child_process'

export interface ShellInfo {
  exe: string
  args: string[]
  versao: string | null
  tipo: 'pwsh' | 'pwsh-preview' | 'powershell' | 'cmd'
  origem: string
}

let cache: ShellInfo | null = null

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
  try {
    const r = spawnSync(
      exe,
      ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
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
    const r = execFileSync('where.exe', [cmd], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
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

  for (const c of candidatosProgramFiles('pwsh.exe')) {
    push(montar(c.exe, 'pwsh', 'ProgramFiles', lerVersaoPwsh(c.exe)))
  }
  for (const c of candidatosProgramFiles('pwsh-preview.exe')) {
    push(montar(c.exe, 'pwsh-preview', 'ProgramFiles', lerVersaoPwsh(c.exe)))
  }

  const pathPwsh = which('pwsh.exe') || which('pwsh')
  if (pathPwsh) push(montar(pathPwsh, 'pwsh', 'PATH'))

  const wa = join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WindowsApps',
    'pwsh.exe'
  )
  if (wa && existsSync(wa)) push(montar(wa, 'pwsh', 'WindowsApps'))

  const ps = which('powershell.exe') || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (ps && existsSync(ps)) push(montar(ps, 'powershell', 'fallback', lerVersaoPwsh(ps)))

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
}
