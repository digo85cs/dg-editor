import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, watch } from 'fs'
import { join, basename } from 'path'
import { scanFolder } from './scanner'
import { readRules } from './dgrules'
import { dglog } from './dglog'
import { normalizarRelatorio } from '@shared/schemas/relatorio'
import { getBrain } from './brain/module'
import type { AnalysisReport, AnalysisCache, AnalysisRunResult, EscopoAnalise, FolderScanResult } from '@shared/types'

const CACHE_DIR = '.dg-editor'
const CACHE_FILE = 'analise.json'
const MAX_KEY_FILES = 6
const MAX_FILE_READ = 4000
const MAX_CONTEXT_LENGTH = 19000

const KEY_FILE_PATTERNS = ['README.md', 'package.json', 'DESIGN.md', '.dgrules']
const COMPLETE_KEY_FILE_PATTERNS = [
  'README.md', 'readme.md', 'README.txt',
  'package.json', 'composer.json', 'requirements.txt',
  'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
  'index.php', 'index.ts', 'index.js', 'main.ts', 'main.py',
  'app.py', 'app.ts', 'Dockerfile', '.env.example'
]

let watchers: Map<string, ReturnType<typeof watch>> = new Map()

/** Inicia watch de arquivos-chave para invalidar cache de analise automaticamente. */
export function inicializarWatchAnalise(root: string): void {
  if (watchers.has(root)) return
  const w = watch(root, { recursive: true }, (eventType, filename) => {
    if (!filename) return
    const nome = basename(filename!)
    const ehChave = KEY_FILE_PATTERNS.includes(nome) || COMPLETE_KEY_FILE_PATTERNS.includes(nome)
    if (eventType === 'change' && ehChave) {
      dglog('[analysis] watch: arquivo chave alterado=' + nome + ' — invalido cache')
      invalidarCacheAnalise(root)
    }
  })
  watchers.set(root, w)
}

/** Para o watch de um root (ex.: ao fechar workspace). */
export function pararWatchAnalise(root: string): void {
  const w = watchers.get(root)
  if (w) {
    try { w.close() } catch { /* */ }
    watchers.delete(root)
  }
}

function cacheDir(root: string): string {
  return join(root, CACHE_DIR)
}

function cachePath(root: string, escopo: EscopoAnalise): string {
  return join(cacheDir(root), escopo === 'completa' ? 'analise-completa.json' : CACHE_FILE)
}

function hashFile(path: string): string {
  try {
    const content = readFileSync(path)
    return createHash('md5').update(content).digest('hex')
  } catch {
    return 'unreadable'
  }
}

const HASH_IGNORAR = /(^|[\\/])(\.dg-editor|node_modules|\.git|dist|out|build|chats?)([\\/]|$)|\.log$|boot-silent\.flag$|analise\.json$/i

export function computeFileHashes(root: string, scan: FolderScanResult, escopo: EscopoAnalise): Record<string, string> {
  const hashes: Record<string, string> = {}
  const paths = new Set(KEY_FILE_PATTERNS.map((pattern) => join(root, pattern)))
  if (escopo === 'completa' && Array.isArray(scan && scan.topFiles)) {
    for (const file of scan.topFiles.slice(0, 50)) {
      if (file && typeof file.path === 'string' && file.path.length > 0) paths.add(file.path)
    }
  }
  for (const filePath of paths) {
    if (escopo === 'completa' && HASH_IGNORAR.test(filePath)) continue
    hashes[filePath] = existsSync(filePath) ? hashFile(filePath) : 'missing'
  }
  return hashes
}

function collectKeyFiles(root: string, scan: FolderScanResult, escopo: EscopoAnalise): { name: string; content: string }[] {
  const found: { name: string; content: string }[] = []
  const patterns = escopo === 'rapida' ? KEY_FILE_PATTERNS : COMPLETE_KEY_FILE_PATTERNS
  for (const pattern of patterns) {
    const p = join(root, pattern)
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8').slice(0, MAX_FILE_READ)
        found.push({ name: pattern, content })
      } catch {
        // ignore
      }
      if (found.length >= MAX_KEY_FILES) break
    }
  }
  if (escopo === 'completa') {
    // adiciona ate 3 arquivos de codigo principais do scan
    for (const f of scan.topFiles) {
      if (found.length >= MAX_KEY_FILES) break
      if (!found.some((k) => k.name === f.path)) {
        try {
          const content = readFileSync(f.path, 'utf-8').slice(0, MAX_FILE_READ)
          found.push({ name: f.path, content })
        } catch {
          // ignore
        }
      }
    }
  }
  return found
}

function buildPrompt(root: string, scan: FolderScanResult, keyFiles: { name: string; content: string }[], rules: string, escopo: EscopoAnalise): { prompt: string; context: string } {
  const extSummary = Object.entries(scan.extensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([e, c]) => `${e}=${c}`)
    .join(', ')
  const prompt = escopo === 'rapida'
    ? `Analise este sistema e responda EXATAMENTE neste formato (em português brasileiro):

O QUE É: (1 frase)
STACK: (linguagens, frameworks, banco, ferramentas — em 1 linha)
ESTRUTURA: (1 linha por pasta principal, máximo 3 pastas)
PONTOS DE ATENÇÃO: (2-3 itens; uma por linha começando com "- ")
SUGESTÕES: (2-3 itens; uma por linha começando com "- ")`
    : `Analise este sistema e responda EXATAMENTE neste formato (em portugues brasileiro):

O QUE E: (1-2 frases: o que o sistema faz)
STACK: (linguagens, frameworks, banco, ferramentas)
ESTRUTURA: (o que tem nas pastas principais, 1 linha por pasta)
PONTOS DE ATENCAO: (3-5 itens: seguranca, codigo suspeito, dependencias velhas; uma por linha comecando com "- ")
SUGESTOES: (3-5 melhorias praticas; uma por linha comecando com "- ")`

  let context = escopo === 'rapida'
    ? `Pasta: ${root}\nArquivos-chave incluídos: ${keyFiles.length}\n`
    : `Pasta: ${root}\nArquivos: ${scan.totalFiles} em ${scan.totalDirs} diretorios\nTipos: ${extSummary}\n`
  if (rules) context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules}\n`
  context = context.slice(0, MAX_CONTEXT_LENGTH)
  for (const k of keyFiles) {
    if (context.length >= MAX_CONTEXT_LENGTH) break
    const bloco = `\n--- ${k.name} ---\n${k.content}\n`
    context += bloco.slice(0, MAX_CONTEXT_LENGTH - context.length)
  }
  const tamanhoTotal = prompt.length + context.length
  const tokensEstimados = Math.ceil(tamanhoTotal / 4)
  const usoContextoPct = Math.round((tokensEstimados / 8192) * 100)
  dglog(
    '[analysis] prompt.length=' + prompt.length + ' context.length=' + context.length +
    ' total.length=' + tamanhoTotal + ' tokens_estimados=' + tokensEstimados +
    '/8192 (' + usoContextoPct + '%)'
  )
  if (tokensEstimados > 8192 * 0.7) {
    dglog('[analysis] prompt acima de 70% do num_ctx; avaliar num_ctx=16384 ou reduzir MAX_KEY_FILES')
  }
  return { prompt, context }
}

export function parseReport(raw: string, root: string, provider: string, model?: string): AnalysisReport {
  const base: AnalysisReport = {
    root, analyzedAt: Date.now(), provider, model,
    oQueE: '', stack: '', estrutura: '', pontosAtencao: [], sugestoes: [], raw: String(raw ?? '')
  }
  const text = String(raw ?? '')
  const sections = text.split(/\n(?=[A-Z\u00C0-\u00DA]{2,}[A-Z\u00C0-\u00DA\s]+:)/m)
  for (const s of sections) {
    const t = s.trim()
    const separator = t.indexOf(':')
    const label = separator < 0 ? '' : t.slice(0, separator).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    if (label === 'O QUE E') base.oQueE = t.slice(separator + 1).trim()
    else if (label === 'STACK') base.stack = t.slice(separator + 1).trim()
    else if (label === 'ESTRUTURA') base.estrutura = t.slice(separator + 1).trim()
    else if (label === 'PONTOS DE ATENCAO') {
      base.pontosAtencao = t.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.trim().slice(1).trim())
    } else if (label === 'SUGESTOES') {
      base.sugestoes = t.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.trim().slice(1).trim())
    }
  }
  return normalizarRelatorio(base) as AnalysisReport
}

function loadCache(root: string, escopo: EscopoAnalise): AnalysisCache | null {
  const p = cachePath(root, escopo)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as AnalysisCache
  } catch {
    return null
  }
}

function saveCache(root: string, escopo: EscopoAnalise, cache: AnalysisCache): void {
  const dir = cacheDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(cachePath(root, escopo), JSON.stringify(cache, null, 2), 'utf-8')
}

export function runAnalysis(root: string, escopo?: EscopoAnalise, force?: boolean): Promise<AnalysisRunResult>
export function runAnalysis(root: string, force?: boolean): Promise<AnalysisRunResult>
export async function runAnalysis(
  root: string,
  escopoOrForce: EscopoAnalise | boolean = 'rapida',
  force = false
): Promise<AnalysisRunResult> {
  inicializarWatchAnalise(root)
  const escopo = typeof escopoOrForce === 'string' ? escopoOrForce : 'rapida'
  const forceAtual = typeof escopoOrForce === 'boolean' ? escopoOrForce : force
  const inicioMs = Date.now()
  const scan: FolderScanResult = escopo === 'completa'
    ? scanFolder(root)
    : {
        root,
        totalFiles: 0,
        totalDirs: 0,
        skippedDirs: 0,
        extensions: {},
        topFiles: [],
        scannedAt: inicioMs,
        durationMs: 0
      }
  if (escopo === 'completa') {
    if (!Array.isArray(scan.topFiles)) {
      throw new Error('scanFolder retornou varredura invalida para: ' + root)
    }
    dglog('[analysis] scan: ' + scan.totalFiles + ' arquivos, ' + scan.totalDirs + ' pastas, ' + scan.topFiles.length + ' na lista top escopo=' + escopo)
  } else {
    dglog('[analysis] scan ignorado escopo=rapida')
  }
  const hashes = computeFileHashes(root, scan, escopo)

  if (!forceAtual) {
    const cached = loadCache(root, escopo)
    if (cached && cached.root === root && cached.escopo === escopo) {
      const keys = new Set([...Object.keys(cached.fileHashes), ...Object.keys(hashes)])
      const changed = [...keys].filter((key) => cached.fileHashes[key] !== hashes[key])
      if (changed.length === 0) {
        dglog('[analysis] tempo_ms=' + (Date.now() - inicioMs) + ' cache=hit')
        return { fromCache: true, changedFiles: [], report: cached.report }
      }
      // mudou algo: re-analisa (analise sempre completa nesta fase; cache guarda historico)
    }
  }

  const rules = readRules(root)
  const keyFiles = collectKeyFiles(root, scan, escopo)
  const { prompt, context } = buildPrompt(root, scan, keyFiles, rules, escopo)
  const brain = getBrain()
  const response = await brain.ask(prompt, context, undefined, 'analise')
  const report = parseReport(response.text, root, response.provider, response.model)
  const vazio = !report.oQueE && !report.stack && !report.estrutura
  if (vazio) {
    dglog('[analysis] modelo respondeu vazio; report descartado')
    throw new Error('modelo respondeu vazio ou invalido')
  }

  saveCache(root, escopo, { root, escopo, analyzedAt: report.analyzedAt, provider: report.provider, report, fileHashes: hashes })
  dglog(
    '[analysis] tempo_ms=' + (Date.now() - inicioMs) + ' cache=miss provider=' + report.provider +
    ' modelo=' + (report.model || 'desconhecido')
  )
  return { fromCache: false, changedFiles: [], report }
}

export function getCachedAnalysis(root: string, escopo: EscopoAnalise = 'rapida'): AnalysisReport | null {
  const cached = loadCache(root, escopo)
  return cached && cached.escopo === escopo ? cached.report : null
}

/** Invalida os caches de análise rápida e completa (ex.: após edição). */
export function invalidarCacheAnalise(root: string): void {
  for (const escopo of ['rapida', 'completa'] as const) {
    const p = cachePath(root, escopo)
    try {
      if (existsSync(p)) unlinkSync(p)
    } catch {
      /* */
    }
  }
}
