// preview-md.js — detecção de markdown/imagem, renderer sanitizado e
// alternância do preview dividido. Extraído de app.js.
// O editor (CodeMirror) é acessado via getEditor() registrado no boot,
// pois `editor` vive no app.js e é carregado sob demanda.
import { state } from '../../state/app-state.js'

const $ = (id) => document.getElementById(id)

let getEditor = () => null

/** Registra acesso ao editor do app.js. Chamar uma vez no boot. */
export function configurarPreviewMd(deps) {
  if (deps && typeof deps.getEditor === 'function') getEditor = deps.getEditor
}

export function extDe(caminho) {
  const m = String(caminho || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function ehMarkdown(caminho) {
  const e = extDe(caminho)
  return e === 'md' || e === 'markdown'
}

export function ehImagemExt(caminho) {
  return /^(png|jpe?g|gif|webp)$/.test(extDe(caminho))
}

/** Renderer markdown mínimo + sanitização (sem HTML arbitrário). */
export function sanitizarERenderMarkdown(src) {
  let t = String(src || '')
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  t = t.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  t = t.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  t = t.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  t = t.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  t = t.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  t = t.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
  t = t.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  t = t.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
  t = t.replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = String(inner).split('|')
    const alvo = parts[0].trim()
    const label = (parts[1] || parts[0]).trim()
    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
    return (
      '<a href="#" class="wiki-link" data-wiki-target="' +
      esc(alvo) +
      '">' +
      esc(label) +
      '</a>'
    )
  })
  t = t.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((c) => '<td>' + c.trim() + '</td>')
      .join('')
    return '<tr>' + cells + '</tr>'
  })
  t = t.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => '<table>' + m + '</table>')
  t = t.replace(/^(?!<[hupolt]|<li|<tr|<table|<pre)(.+)$/gm, '<p>$1</p>')
  // remove on* / script / iframe mesmo se vazarem
  t = t.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  t = t.replace(/<\/?(script|iframe|object|embed)[^>]*>/gi, '')
  return t
}

let mdPreviewOn = false

export function atualizarToolbarPreview(caminho) {
  const bar = $('editor-toolbar')
  const btn = $('btn-md-preview')
  const mdBox = $('md-preview')
  const imgBox = $('image-preview')
  if (!bar) return
  const md = ehMarkdown(caminho)
  const img = ehImagemExt(caminho)
  const temArquivo = !!caminho
  bar.classList.toggle('hidden', !temArquivo)
  if (btn) btn.classList.toggle('hidden', !md)
  if (!md) {
    mdPreviewOn = false
    mdBox?.classList.add('hidden')
    mdBox?.setAttribute('aria-hidden', 'true')
    $('editor-host')?.classList.remove('split-preview')
  }
  if (!img) {
    imgBox?.classList.add('hidden')
    imgBox?.setAttribute('aria-hidden', 'true')
  }
}

export function toggleMdPreview() {
  const caminho = state.abaAtiva
  const editor = getEditor()
  if (!ehMarkdown(caminho) || !editor) return
  mdPreviewOn = !mdPreviewOn
  const host = $('editor-host')
  const box = $('md-preview')
  if (!box || !host) return
  if (mdPreviewOn) {
    box.innerHTML = sanitizarERenderMarkdown(editor.getConteudo ? editor.getConteudo() : '')
    box.classList.remove('hidden')
    box.setAttribute('aria-hidden', 'false')
    host.classList.add('split-preview')
  } else {
    box.classList.add('hidden')
    box.setAttribute('aria-hidden', 'true')
    host.classList.remove('split-preview')
  }
}

/** Sincroniza o preview md ao trocar de aba (chamado por ativarAba). */
export function sincronizarPreviewMdAba(caminho, conteudo) {
  if (mdPreviewOn && ehMarkdown(caminho)) {
    const box = $('md-preview')
    if (box) box.innerHTML = sanitizarERenderMarkdown(conteudo)
  } else {
    mdPreviewOn = false
    $('md-preview')?.classList.add('hidden')
    $('editor-host')?.classList.remove('split-preview')
  }
}
