/**
 * Colar conteúdo rico da área de transferência como Markdown (estilo Notion).
 *
 * Usa turndown + GFM (tabelas, riscado, task lists) no processo principal,
 * onde o Electron expõe o clipboard com HTML e texto.
 */
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export type ResultadoColar = {
  ok: true
  markdown: string
  origem: 'html' | 'texto'
  caracteres: number
}

function normalizarMarkdown(md: string): string {
  return String(md || '')
    .replace(/\u00a0/g, ' ')
    .replace(/^([ \t]*)[-*+]\s{2,}/gm, '$1- ')
    .replace(/^([ \t]*)(\d+)\.\s{2,}/gm, '$1$2. ')
    .replace(/^(\s*)- \[([ xX])\]\s{2,}/gm, '$1- [$2] ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function htmlParaMarkdown(html: string): string {
  const entrada = String(html || '').trim()
  if (!entrada) return ''
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })
  td.use(gfm)
  td.remove(['script', 'style', 'noscript', 'meta', 'link', 'title', 'template'])
  td.addRule('imagemBase64', {
    filter: (node) => node.nodeName === 'IMG' && /^data:/i.test(node.getAttribute('src') || ''),
    replacement: () => ''
  })
  td.addRule('imagemSemSrc', {
    filter: (node) => node.nodeName === 'IMG' && !(node.getAttribute('src') || '').trim(),
    replacement: () => ''
  })
  return normalizarMarkdown(td.turndown(entrada))
}

export function lerClipboardMarkdown(
  lerHtml: () => string,
  lerTexto: () => string
): ResultadoColar | { ok: false; erro: string } {
  const html = String(lerHtml() || '')
  if (html.replace(/<!--[\s\S]*?-->/g, '').trim()) {
    const markdown = htmlParaMarkdown(html)
    if (markdown) return { ok: true, markdown, origem: 'html', caracteres: markdown.length }
  }
  const texto = String(lerTexto() || '').trim()
  if (!texto) return { ok: false, erro: 'a área de transferência está vazia' }
  return { ok: true, markdown: texto, origem: 'texto', caracteres: texto.length }
}
