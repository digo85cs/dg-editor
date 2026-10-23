import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { scanFolder } from './scanner'
import { readRules } from './dgrules'
import { getBrain } from './brain/module'
import type { AnalysisReport, AnalysisCache, AnalysisRunResult, FolderScanResult } from '@shared/types'

const CACHE_DIR = '.dg-editor'
const CACHE_FILE = 'analise.json'
const MAX_KEY_FILES = 8
const MAX_FILE_READ = 4 * 1024

const KEY_FILE_PATTERNS = [
  'README.md', 'readme.md', 'README.txt',
  'package.json', 'composer.json', 'requirements.txt',
  'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
  'index.php', 'index.ts', 'index.js', 'main.ts', 'main.py',
  'app.py', 'app.ts', 'Dockerfile', '.env.example'
]

function cacheDir(root: string): string {
  return join(root, CACHE_DIR)
}

function cachePath(root: string): string {
  return join(cacheDir(root), CACHE_FILE)
}

function hashFile(path: string): string {
  try {
    const content = readFileSync(path)
    return createHash('md5').update(content).digest('hex')
  } catch {
    return 'unreadable'
  }
}

export function computeFileHashes(root: string, scan: FolderScanResult): Record<string, string> {
  const hashes: Record<string, string> = {}
  hashes['__scan__'] = `${scan.totalFiles}:${scan.totalDirs}`
  for (const f of scan.topFiles.slice(0, 50)) {
    hashes[f.path] = hashFile(f.path)
  }
  return hashes
}

function collectKeyFiles(root: string, scan: FolderScanResult): { name: string; content: string }[] {
  const found: { name: string; content: string }[] = []
  for (const pattern of KEY_FILE_PATTERNS) {
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
  return found
}

function buildPrompt(root: string, scan: FolderScanResult, keyFiles: { name: string; content: string }[], rules: string): { prompt: string; context: string } {
  const extSummary = Object.entries(scan.extensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([e, c]) => `${e}=${c}`)
    .join(', ')
  const prompt = `Analise este sistema e responda EXATAMENTE neste formato (em portugues brasileiro):

O QUE E: (1-2 frases: o que o sistema faz)
STACK: (linguagens, frameworks, banco, ferramentas)
ESTRUTURA: (o que tem nas pastas principais, 1 linha por pasta)
PONTOS DE ATENCAO: (3-5 itens: seguranca, codigo suspeito, dependencias velhas; uma por linha comecando com "- ")
SUGESTOES: (3-5 melhorias praticas; uma por linha comecando com "- ")`

  let context = `Pasta: ${root}\nArquivos: ${scan.totalFiles} em ${scan.totalDirs} diretorios\nTipos: ${extSummary}\n`
  if (rules) context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules}\n`
  for (const k of keyFiles) {
    context += `\n--- ${k.name} ---\n${k.content}\n`
  }
  return { prompt, context }
}

export function parseReport(raw: string, root: string, provider: string, model?: string): AnalysisReport {
  const report: AnalysisReport = {
    root, analyzedAt: Date.now(), provider, model,
    oQueE: '', stack: '', estrutura: '', pontosAtencao: [], sugestoes: [], raw
  }
  const sections = raw.split(/\n(?=[A-Z\u00C0-\u00DA]{2,}[A-Z\u00C0-\u00DA\s]+:)/m)
  for (const s of sections) {
    const t = s.trim()
    if (/^O QUE E:/i.test(t)) report.oQueE = t.replace(/^O QUE E:/i, '').trim()
    else if (/^STACK:/i.test(t)) report.stack = t.replace(/^STACK:/i, '').trim()
    else if (/^ESTRUTURA:/i.test(t)) report.estrutura = t.replace(/^ESTRUTURA:/i, '').trim()
    else if (/^PONTOS DE ATENCAO:/i.test(t)) {
      report.pontosAtencao = t.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.trim().slice(1).trim())
    } else if (/^SUGESTOES:/i.test(t)) {
      report.sugestoes = t.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.trim().slice(1).trim())
    }
  }
  return report
}

function loadCache(root: string): AnalysisCache | null {
  const p = cachePath(root)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as AnalysisCache
  } catch {
    return null
  }
}

function saveCache(root: string, cache: AnalysisCache): void {
  const dir = cacheDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(cachePath(root), JSON.stringify(cache, null, 2), 'utf-8')
}

export async function runAnalysis(root: string, force = false): Promise<AnalysisRunResult> {
  const scan = scanFolder(root)
  const hashes = computeFileHashes(root, scan)

  if (!force) {
    const cached = loadCache(root)
    if (cached && cached.root === root) {
      const changed = Object.keys(hashes).filter((k) => cached.fileHashes[k] !== hashes[k])
      if (changed.length === 0) {
        return { fromCache: true, changedFiles: [], report: cached.report }
      }
      // mudou algo: re-analisa (analise sempre completa nesta fase; cache guarda historico)
    }
  }

  const rules = readRules(root)
  const keyFiles = collectKeyFiles(root, scan)
  const { prompt, context } = buildPrompt(root, scan, keyFiles, rules)
  const brain = getBrain()
  const response = await brain.ask(prompt, context)
  const report = parseReport(response.text, root, response.provider, response.model)

  saveCache(root, { root, analyzedAt: report.analyzedAt, provider: report.provider, report, fileHashes: hashes })
  return { fromCache: false, changedFiles: [], report }
}

export function getCachedAnalysis(root: string): AnalysisReport | null {
  const cached = loadCache(root)
  return cached ? cached.report : null
}