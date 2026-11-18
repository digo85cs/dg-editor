/**
 * Conversor de documentos via pandoc (local, gratuito).
 * Suporta md/html/docx/odt/rtf/latex/typst; PDF quando há engine
 * (weasyprint, wkhtmltopdf, typst, tectonic, pdflatex/xelatex/lualatex).
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  previewDe,
  rodar,
  type RespostaMidia
} from './core'

const FORMATOS_ENTRADA = new Set(['.md', '.markdown', '.html', '.htm', '.docx', '.odt', '.rtf', '.tex', '.typ'])
const FORMATOS_SAIDA = new Set(['.md', '.html', '.docx', '.odt', '.rtf', '.tex', '.pdf', '.epub', '.pptx'])
const MIME_SAIDA: Record<string, string> = {
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.tex': 'application/x-tex',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}
// pandoc 3.x: "md"/"tex" nao sao aliases validos de -f/-t
const FORMATO_PANDOC: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  docx: 'docx',
  odt: 'odt',
  rtf: 'rtf',
  tex: 'latex',
  typ: 'typst',
  pdf: 'pdf',
  epub: 'epub',
  pptx: 'pptx'
}

function acharPandoc(): string | null {
  const custom = process.env.DG_PANDOC
  if (custom && existsSync(custom)) return custom
  for (const p of [
    'pandoc',
    resolve(process.env.LOCALAPPDATA || '', 'Pandoc', 'pandoc.exe'),
    resolve(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'pandoc.exe'),
    'C:\\Program Files\\Pandoc\\pandoc.exe'
  ]) {
    try {
      execFileSync(p, ['--version'], { stdio: 'pipe', timeout: 5000, windowsHide: true })
      return p
    } catch {
      /* tenta o próximo */
    }
  }
  return null
}

function acharEnginePdf(): { nome: string; dir?: string } | null {
  // pandoc --pdf-engine aceita: weasyprint, wkhtmltopdf, typst, tectonic, context, prince, pagedjs-cli, pdfroff, pdflatex, xelatex, lualatex
  const candidatos: Record<string, string[]> = {
    typst: [
      'typst',
      resolve(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'typst.exe'),
      ...globTypst()
    ],
    weasyprint: ['weasyprint'],
    wkhtmltopdf: ['wkhtmltopdf'],
    tectonic: ['tectonic'],
    xelatex: ['xelatex'],
    pdflatex: ['pdflatex'],
    lualatex: ['lualatex']
  }
  for (const [eng, cmds] of Object.entries(candidatos)) {
    for (const cmd of cmds) {
      try {
        execFileSync(cmd, ['--version'], { stdio: 'pipe', timeout: 5000, windowsHide: true })
        return { nome: eng, dir: cmd.includes('\\') || cmd.includes('/') ? dirname(cmd) : undefined }
      } catch {
        /* tenta o próximo */
      }
    }
  }
  return null
}

function globTypst(): string[] {
  // winget instala em Packages\<id>\<versao-pasta>\typst.exe
  const base = resolve(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages')
  const out: string[] = []
  try {
    for (const pkg of readdirSync(base)) {
      if (!pkg.toLowerCase().startsWith('typst')) continue
      const pkgDir = resolve(base, pkg)
      for (const sub of readdirSync(pkgDir)) {
        const cand = resolve(pkgDir, sub, 'typst.exe')
        if (existsSync(cand)) out.push(cand)
      }
    }
  } catch {
    /* sem acesso */
  }
  return out
}

export async function converterDocumento(
  raiz: string,
  opts: { entrada: string; formato: string; saida?: string }
): Promise<RespostaMidia> {
  const entrada = typeof opts.entrada === 'string' ? opts.entrada.trim() : ''
  if (!entrada) return { ok: false, erro: 'informe o caminho do documento' }
  const abs = resolve(raiz, entrada)
  if (!existsSync(abs) || !statSync(abs).isFile()) return { ok: false, erro: 'arquivo não encontrado: ' + entrada }
  const extIn = extname(abs).toLowerCase()
  if (!FORMATOS_ENTRADA.has(extIn)) {
    return { ok: false, erro: 'formato de entrada não suportado (' + extIn + '). Use: ' + [...FORMATOS_ENTRADA].join(', ') }
  }
  const formato = String(opts.formato || '').trim().toLowerCase().replace(/^\./, '')
  const extOut = '.' + formato
  if (!FORMATOS_SAIDA.has(extOut)) {
    return { ok: false, erro: 'formato de saída não suportado (' + formato + '). Use: md, html, docx, odt, rtf, tex, pdf, epub, pptx' }
  }
  if (extIn === extOut) return { ok: false, erro: 'entrada e saída no mesmo formato (' + extOut + ')' }

  const pandoc = acharPandoc()
  if (!pandoc) {
    return {
      ok: false,
      erro: 'pandoc não encontrado. Instale com `winget install JohnMacFarlane.Pandoc` ou baixe em pandoc.org.'
    }
  }
  const t0 = Date.now()
  const nomeBase = nomeArquivo('doc', extOut).replace(/\.\w+$/, '')
  let destino = destinoArquivo(raiz, nomeBase + extOut, opts.saida)
  if (!destino.toLowerCase().endsWith(extOut)) destino += extOut

  const fmtIn = FORMATO_PANDOC[extIn.slice(1)] || extIn.slice(1)
  const fmtOut = FORMATO_PANDOC[formato] || formato
  const args = [abs, '-f', fmtIn, '-t', fmtOut, '-o', destino, '--standalone']
  let env = process.env
  if (extOut === '.pdf') {
    const engine = acharEnginePdf()
    if (!engine) {
      return {
        ok: false,
        erro: 'nenhuma engine de PDF encontrada (typst/weasyprint/wkhtmltopdf/LaTeX). Instale typst via `winget install Typst.Typst` ou use HTML como saída.'
      }
    }
    args.push('--pdf-engine=' + engine.nome)
    if (engine.dir) env = { ...process.env, PATH: engine.dir + ';' + process.env.PATH }
  }
  const r = await rodar(pandoc, args, 180_000, env)
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'pandoc falhou: ' + (r.erro || r.stderr || r.stdout || 'erro desconhecido').slice(0, 400) }
  }
  const bytes = statSync(destino).size
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime: MIME_SAIDA[extOut] || 'application/octet-stream',
    previewBase64: extOut === '.pdf' || extOut === '.html' || extOut === '.md' ? previewDe(destino) : undefined,
    detalhes: { motor: 'pandoc', formato: extIn + '→' + extOut, segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1) },
    aviso: 'Documento convertido localmente via pandoc (gratuito).'
  }
}
