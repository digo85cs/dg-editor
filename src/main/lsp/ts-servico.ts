/**
 * LSP-lite para TypeScript via ts.LanguageService (sem tsserver externo).
 * Escopo: hover (quickinfo), go-to-definition e diagnósticos semânticos/sintáticos.
 * Um serviço por raiz de workspace; arquivos abertos são versionados em memória.
 */
import ts from 'typescript'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'

interface ArquivoAberto {
  versao: number
  conteudo: string
}

interface ServicoTs {
  raiz: string
  ls: ts.LanguageService
  abertos: Map<string, ArquivoAberto>
}

const servicos = new Map<string, ServicoTs>()

const OPCOES: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  allowJs: true,
  checkJs: false,
  strict: false,
  skipLibCheck: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  jsx: ts.JsxEmit.ReactJSX
}

function caminhoAbs(raiz: string, arquivo: string): string {
  return resolve(raiz, arquivo)
}

function criarServico(raiz: string): ServicoTs {
  const abertos = new Map<string, ArquivoAberto>()
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => OPCOES,
    getScriptFileNames: () => [...abertos.keys()],
    getScriptVersion: (f) => String(abertos.get(f)?.versao ?? 0),
    getScriptSnapshot: (f) => {
      const aberto = abertos.get(f)
      if (aberto) return ts.ScriptSnapshot.fromString(aberto.conteudo)
      if (!existsSync(f)) return undefined
      try {
        return ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8'))
      } catch {
        return undefined
      }
    },
    getCurrentDirectory: () => raiz,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath
  }
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry())
  const svc: ServicoTs = { raiz, ls, abertos }
  servicos.set(raiz, svc)
  return svc
}

export function obterServicoTs(raiz: string): ServicoTs {
  let s = servicos.get(raiz)
  if (!s) s = criarServico(raiz)
  return s
}

/** Registra conteúdo atual do arquivo (edições não salvas incluídas). */
export function lspAbrir(raiz: string, arquivo: string, conteudo?: string): void {
  const svc = obterServicoTs(raiz)
  const abs = caminhoAbs(raiz, arquivo)
  const atual = svc.abertos.get(abs)
  const texto = conteudo ?? (existsSync(abs) ? readFileSync(abs, 'utf8') : '')
  if (atual && atual.conteudo === texto) return
  svc.abertos.set(abs, { versao: (atual?.versao ?? 0) + 1, conteudo: texto })
}

export function lspFechar(raiz: string, arquivo: string): void {
  servicos.get(raiz)?.abertos.delete(caminhoAbs(raiz, arquivo))
}

function posicao(raiz: string, arquivo: string, linha: number, coluna: number): ts.LineAndCharacter | null {
  const svc = obterServicoTs(raiz)
  const abs = caminhoAbs(raiz, arquivo)
  if (!svc.abertos.has(abs)) lspAbrir(raiz, arquivo)
  if (!svc.abertos.has(abs)) return null
  return { line: Math.max(0, linha - 1), character: Math.max(0, coluna - 1) }
}

function offsetDe(svc: ServicoTs, abs: string, lc: ts.LineAndCharacter): number {
  const texto = svc.abertos.get(abs)?.conteudo ?? ''
  const linhas = texto.split('\n')
  let off = 0
  for (let i = 0; i < lc.line && i < linhas.length; i++) off += linhas[i].length + 1
  return off + lc.character
}

export function lspHover(
  raiz: string,
  arquivo: string,
  linha: number,
  coluna: number
): { ok: boolean; texto?: string; erro?: string } {
  try {
    const svc = obterServicoTs(raiz)
    const abs = caminhoAbs(raiz, arquivo)
    const lc = posicao(raiz, arquivo, linha, coluna)
    if (!lc) return { ok: false, erro: 'arquivo não encontrado' }
    const info = svc.ls.getQuickInfoAtPosition(abs, offsetDe(svc, abs, lc))
    if (!info) return { ok: true, texto: '' }
    return { ok: true, texto: ts.displayPartsToString(info.displayParts) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export function lspDefinicao(
  raiz: string,
  arquivo: string,
  linha: number,
  coluna: number
): { ok: boolean; local?: string; erro?: string } {
  try {
    const svc = obterServicoTs(raiz)
    const abs = caminhoAbs(raiz, arquivo)
    const lc = posicao(raiz, arquivo, linha, coluna)
    if (!lc) return { ok: false, erro: 'arquivo não encontrado' }
    const defs = svc.ls.getDefinitionAtPosition(abs, offsetDe(svc, abs, lc))
    const d = defs?.[0]
    if (!d) return { ok: true, local: '' }
    const sf = svc.ls.getProgram()?.getSourceFile(d.fileName)
    const lcDef = sf ? ts.getLineAndCharacterOfPosition(sf, d.textSpan.start) : { line: 0, character: 0 }
    const rel = d.fileName.startsWith(raiz) ? d.fileName.slice(raiz.length + 1) : d.fileName
    return { ok: true, local: rel + ':' + (lcDef.line + 1) + ':' + (lcDef.character + 1) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export interface DiagnosticoLsp {
  arquivo: string
  linha: number
  coluna: number
  severidade: 'erro' | 'aviso'
  codigo: number
  mensagem: string
}

export function lspDiagnosticos(
  raiz: string,
  arquivo?: string
): { ok: boolean; itens: DiagnosticoLsp[]; erro?: string } {
  try {
    const svc = obterServicoTs(raiz)
    const alvos = arquivo ? [caminhoAbs(raiz, arquivo)] : [...svc.abertos.keys()]
    const itens: DiagnosticoLsp[] = []
    for (const abs of alvos) {
      if (!svc.abertos.has(abs)) {
        if (!existsSync(abs)) continue
        lspAbrir(raiz, abs)
      }
      const synt = svc.ls.getSyntacticDiagnostics(abs)
      const sem = svc.ls.getSemanticDiagnostics(abs)
      for (const d of [...synt, ...sem]) {
        const sf = svc.ls.getProgram()?.getSourceFile(abs)
        if (!sf) continue
        const lc = ts.getLineAndCharacterOfPosition(sf, d.start ?? 0)
        itens.push({
          arquivo: abs.startsWith(raiz) ? abs.slice(raiz.length + 1) : abs,
          linha: lc.line + 1,
          coluna: lc.character + 1,
          severidade: d.category === ts.DiagnosticCategory.Error ? 'erro' : 'aviso',
          codigo: d.code,
          mensagem: ts.flattenDiagnosticMessageText(d.messageText, ' ')
        })
      }
    }
    return { ok: true, itens: itens.slice(0, 100) }
  } catch (e) {
    return { ok: false, itens: [], erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Diagnósticos dos arquivos abertos — injetável no contexto do agente. */
export function lspResumoDiagnosticos(raiz: string, limite = 20): string {
  const r = lspDiagnosticos(raiz)
  if (!r.ok || !r.itens.length) return ''
  const linhas = r.itens.slice(0, limite).map(
    (d) => `- ${d.arquivo}:${d.linha}:${d.coluna} [${d.severidade} TS${d.codigo}] ${d.mensagem}`
  )
  return 'Diagnósticos TS (arquivos abertos):\n' + linhas.join('\n')
}
