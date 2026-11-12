/**
 * Inventario de disco: busca projetos sem falso positivo Windows (Autopilot/Autoplay).
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

const IGNORAR_DIR = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  '$recycle.bin',
  'system volume information',
  'recovery',
  'perflogs',
  'winsxs',
  'node_modules',
  '.git',
  'appdata'
])

export function ehPedidoInventarioDisco(pedido: string): boolean {
  const p = String(pedido || '')
  return /invent[aá]rio|Get-ChildItem|Test-Path|app_quebrada|bloco\s*[abcd]|Select-String|caminho absoluto|N[AÃ]O ENCONTRADO|achar o projeto|partz|autopartz|s[oó] leitura/i.test(
    p
  )
}

export function pareceRuidoWindows(texto: string): boolean {
  const t = String(texto || '')
  const hits = (t.match(/\\Windows\\|Autopilot|Autoplay|WinSxS/gi) || []).length
  const uteis = (
    t.match(/composer\.json|public\\index\.php|app\\routes\.php|\.git|OneDrive|xampp|AUTO PARTS/gi) || []
  ).length
  return hits >= 3 && uteis === 0
}

export function filtrarRuidoWindows(texto: string): string {
  const linhas = String(texto || '').split(/\r?\n/)
  const limpas = linhas.filter((ln) => {
    const l = ln.toLowerCase()
    if (!l.trim()) return true
    if (l.includes('\\windows\\') || l.includes('/windows/')) return false
    if (l.includes('winsxs') || l.includes('autopilot') || l.includes('autoplay')) return false
    if (l.includes('systemresources\\windows')) return false
    return true
  })
  return limpas.join('\n').trim()
}

function deveIgnorarNome(nome: string): boolean {
  return IGNORAR_DIR.has(String(nome || '').toLowerCase())
}

function expandirPadrao(padrao: string): RegExp {
  const raw = String(padrao || '').trim() || 'autopartz|partz|auto.?parts'
  let src = raw
  if (/autopartz|partz/i.test(raw) && !/auto.?parts/i.test(raw)) {
    src = raw + '|auto\\s*parts|autoparts'
  }
  try {
    return new RegExp(src, 'i')
  } catch {
    return /autopartz|partz|auto\s*parts/i
  }
}

function raizesBusca(): string[] {
  const home = homedir()
  const candidatos = [
    'C:\\dev',
    'C:\\xampp\\htdocs',
    join(home, 'OneDrive'),
    join(home, 'OneDrive', 'CURSOR'),
    join(home, 'Documents'),
    'D:\\',
    'D:\\CURSOR',
    'C:\\AutoPartz'
  ]
  const out: string[] = []
  for (const c of candidatos) {
    try {
      const abs = resolve(c)
      if (existsSync(abs)) out.push(abs)
    } catch {
      /* */
    }
  }
  return out
}

function walkDirs(
  dir: string,
  depth: number,
  maxDepth: number,
  re: RegExp,
  achados: string[],
  limite: number
): void {
  if (achados.length >= limite || depth > maxDepth) return
  let nomes: string[] = []
  try {
    nomes = readdirSync(dir)
  } catch {
    return
  }
  for (const nome of nomes) {
    if (achados.length >= limite) return
    if (deveIgnorarNome(nome)) continue
    if (nome.startsWith('.') && nome !== '.dg-editor') continue
    const abs = join(dir, nome)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    if (re.test(nome)) achados.push(abs)
    if (depth < maxDepth) walkDirs(abs, depth + 1, maxDepth, re, achados, limite)
  }
}

export function buscarPastasProjeto(
  padrao: string,
  opts?: { profundidade?: number; limite?: number }
): { ok: true; pastas: string[]; raizes: string[] } {
  const re = expandirPadrao(padrao)
  const profundidade = Math.min(4, Math.max(1, opts?.profundidade ?? 3))
  const limite = Math.min(40, Math.max(1, opts?.limite ?? 20))
  const raizes = raizesBusca()
  const pastas: string[] = []
  for (const r of raizes) walkDirs(r, 0, profundidade, re, pastas, limite)
  const uniq = [...new Set(pastas.map((p) => resolve(p)))]
  // Preferir pastas que parecem app PHP/Node (nao pasta de imagens)
  uniq.sort((a, b) => {
    const score = (p: string) => {
      let s = 0
      if (existsSync(join(p, 'composer.json'))) s += 5
      if (existsSync(join(p, 'app', 'routes.php'))) s += 5
      if (existsSync(join(p, 'public', 'index.php'))) s += 3
      if (existsSync(join(p, 'package.json'))) s += 2
      if (existsSync(join(p, '.git'))) s += 1
      if (/imagens|images|logo/i.test(p)) s -= 4
      return s
    }
    return score(b) - score(a)
  })
  return { ok: true, pastas: uniq, raizes }
}

export type ChecagemProjeto = {
  caminho: string
  existe: boolean
  publicIndex: boolean
  routes: boolean
  config: boolean
  vendor: boolean
  composer: boolean
  env: boolean
  git: boolean
  gitResumo: string | null
  faltando: string[]
}

function gitResumoRapido(abs: string): string | null {
  if (!existsSync(join(abs, '.git'))) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require('child_process') as typeof import('child_process')
    const branch = execFileSync('git', ['-C', abs, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true
    }).trim()
    const dirty = execFileSync('git', ['-C', abs, 'status', '--porcelain'], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true
    })
    const n = dirty.split(/\r?\n/).filter((l) => l.trim()).length
    return branch + (n ? ' (' + n + ' alterado(s))' : ' limpo')
  } catch {
    return 'git presente'
  }
}

export function inspecionarProjeto(caminho: string): ChecagemProjeto {
  const abs = resolve(String(caminho || ''))
  const existe = existsSync(abs)
  const checar = (rel: string) => existe && existsSync(join(abs, rel))
  const publicIndex = checar(join('public', 'index.php'))
  const routes = checar(join('app', 'routes.php'))
  const config = checar('config')
  const vendor = checar('vendor')
  const composer = checar('composer.json')
  const env = checar('.env')
  const git = checar('.git')
  const faltando: string[] = []
  if (!publicIndex) faltando.push('public/index.php')
  if (!routes) faltando.push('app/routes.php')
  if (!config) faltando.push('config')
  if (!vendor) faltando.push('vendor')
  if (!composer) faltando.push('composer.json')
  return {
    caminho: abs,
    existe,
    publicIndex,
    routes,
    config,
    vendor,
    composer,
    env,
    git,
    gitResumo: existe ? gitResumoRapido(abs) : null,
    faltando
  }
}

export function blocoPromptInventario(): string {
  return (
    '\n\n### PROTOCOLO INVENTARIO DE DISCO (obrigatorio)\n' +
    '1. NUNCA varra C:\\ inteiro sem filtro. NUNCA aceite Autopilot/Autoplay/WinSxS como projeto.\n' +
    '2. Use a tool disco_buscar (padrao do nome) ANTES de Get-ChildItem em C:\\.\n' +
    '3. Raizes uteis: C:\\dev, C:\\xampp\\htdocs, OneDrive\\CURSOR, D:\\. Ignore C:\\Windows.\n' +
    '4. Se o Bloco A so trouxer ruido Windows: diga falso positivo e busque de novo com disco_buscar.\n' +
    '5. Complete TODOS os blocos pedidos (A/B/C/D). Nao pare no primeiro comando.\n' +
    '6. Resposta final: so as linhas pedidas. O que faltar = NÃO ENCONTRADO. Nao invente caminho.\n' +
    '7. AutoPartz pode estar como "AUTO PARTS APP" no OneDrive — aceite esse match.\n' +
    '8. Use disco_inspecionar no caminho achado para public/app/config/vendor e gitResumo.\n' +
    '9. Resposta final em UM bloco so (sem dump de tool/JSON). Inclua branch git se disco_inspecionar trouxer.\n'
  )
}
