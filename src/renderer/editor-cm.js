/**
 * CodeMirror 6 — editor do DG Editor (offline, ESM via electron-vite).
 * Inclui seleção + marcações de diff (del/add) e painel side-by-side.
 */
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, StateField, StateEffect, Prec } from '@codemirror/state'
import { keymap, Decoration as CMDecoration, WidgetType, ViewPlugin } from '@codemirror/view'
import { searchKeymap, openSearchPanel } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'
import { detectarFimDeLinha, paraDisco, paraDocumento } from './editor-texto.js'
import { anexarOverviewRuler } from './features/editor/overview-ruler.js'
import { anexarMinimapa } from './features/editor/minimap.js'

const langCompartment = new Compartment()
const themeCompartment = new Compartment()

const setDiffMarks = StateEffect.define()

const delMark = CMDecoration.line({ class: 'cm-diff-del-line' })
const addMark = CMDecoration.line({ class: 'cm-diff-add-line' })

class GhostTexto extends WidgetType {
  constructor(texto) {
    super()
    this.texto = texto
  }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-dg-ghost'
    s.textContent = this.texto
    return s
  }
  ignoreEvent() {
    return true
  }
}

const setGhost = StateEffect.define()
const ghostField = StateField.define({
  create() {
    return CMDecoration.none
  },
  update(v, tr) {
    let next = v.map(tr.changes)
    const temEfeito = tr.effects.some((e) => e.is(setGhost))
    if ((tr.docChanged || tr.selection) && !temEfeito) next = CMDecoration.none
    for (const e of tr.effects) if (e.is(setGhost)) next = e.value
    return next
  },
  provide: (f) => EditorView.decorations.from(f)
})

const diffField = StateField.define({
  create() {
    return CMDecoration.none
  },
  update(ds, tr) {
    ds = ds.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setDiffMarks)) ds = e.value
    }
    return ds
  },
  provide: (f) => EditorView.decorations.from(f)
})

function langPorExt(caminho) {
  const m = String(caminho || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m ? m[1] : ''
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript()
    case 'ts':
    case 'tsx':
    case 'jsx':
      return javascript({
        typescript: ext === 'ts' || ext === 'tsx',
        jsx: ext === 'tsx' || ext === 'jsx'
      })
    case 'json':
      return json()
    case 'html':
    case 'htm':
      return html()
    case 'css':
      return css()
    case 'md':
    case 'markdown':
      return markdown()
    case 'py':
      return python()
    case 'xml':
    case 'svg':
      return xml()
    default:
      return []
  }
}

function temaEscuro() {
  return document.body.classList.contains('tema-escuro')
}

/** Tema do CodeMirror: alto contraste tem precedência sobre claro/escuro. */
function temaEditor() {
  if (document.body.classList.contains('dg-alto-contraste')) return temaAltoContraste()
  return temaEscuro() ? oneDark : []
}

function temaAltoContraste() {
  return EditorView.theme(
    {
      '&': { backgroundColor: 'var(--dg-bg)', color: 'var(--dg-text)' },
      '.cm-content': { caretColor: 'var(--dg-accent)' },
      '.cm-gutters': {
        backgroundColor: 'var(--dg-bg)',
        color: 'var(--dg-text)',
        borderRight: '2px solid var(--dg-border)'
      },
      '.cm-lineNumbers .cm-gutterElement': { color: 'var(--dg-text)' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--dg-text)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--dg-selection)'
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dg-text)' },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'transparent',
        outline: '2px solid var(--dg-accent)'
      },
      '.cm-gutterElement': { color: 'var(--dg-text)' }
    },
    { dark: temaEscuro() }
  )
}

function lineRange(doc, line1based) {
  if (line1based < 1 || line1based > doc.lines) return null
  const line = doc.line(line1based)
  return { from: line.from, to: line.to }
}

function buildDiffDecorations(doc, linhasDel, linhasAdd) {
  const ranges = []
  for (const n of linhasDel || []) {
    const r = lineRange(doc, n)
    if (r) ranges.push(delMark.range(r.from))
  }
  for (const n of linhasAdd || []) {
    const r = lineRange(doc, n)
    if (r) ranges.push(addMark.range(r.from))
  }
  ranges.sort((a, b) => a.from - b.from)
  return CMDecoration.set(ranges)
}

const ABERTURAS = { '(': ')', '[': ']', '{': '}' }
const FECHAMENTOS = { ')': '(', ']': '[', '}': '{' }
const EXT_CODIGO = new Set(['js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'css'])

function extDe(caminho) {
  const m = String(caminho || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function diagEquilibrio(doc, ext) {
  const diags = []
  const pilha = []
  let emStr = null
  let emBloco = false
  let emLinha = false
  const texto = doc.toString()
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    const prox = texto[i + 1]
    if (emLinha) {
      if (ch === '\n') emLinha = false
      continue
    }
    if (emBloco) {
      if (ch === '*' && prox === '/') {
        emBloco = false
        i++
      }
      continue
    }
    if (emStr) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === emStr) emStr = null
      continue
    }
    if (ch === '"' || ch === "'" || (ext !== 'css' && ch === '`')) {
      emStr = ch
      continue
    }
    if (ch === '/' && prox === '/') {
      emLinha = true
      i++
      continue
    }
    if (ch === '/' && prox === '*') {
      emBloco = true
      i++
      continue
    }
    if (ABERTURAS[ch]) {
      pilha.push({ ch, pos: i })
      continue
    }
    if (FECHAMENTOS[ch]) {
      const topo = pilha.pop()
      if (!topo || topo.ch !== FECHAMENTOS[ch]) {
        diags.push({
          linha: doc.lineAt(i).number,
          severidade: 'erro',
          mensagem: 'Fechamento "' + ch + '" sem abertura correspondente'
        })
        if (diags.length >= 50) return diags
      }
    }
  }
  for (const p of pilha.slice(0, 5)) {
    diags.push({
      linha: doc.lineAt(p.pos).number,
      severidade: 'aviso',
      mensagem: 'Abertura "' + p.ch + '" sem fechamento'
    })
  }
  return diags
}

function diagJson(doc) {
  try {
    JSON.parse(doc.toString())
    return []
  } catch (e) {
    const msg = String((e && e.message) || e)
    let linha = 1
    const l = /line (\d+)/i.exec(msg)
    const p = /position (\d+)/i.exec(msg)
    if (l) linha = Number(l[1]) || 1
    else if (p) {
      const pos = Math.min(Number(p[1]) || 0, doc.length)
      linha = doc.lineAt(pos).number
    }
    return [{ linha, severidade: 'erro', mensagem: msg }]
  }
}

function calcularDiagnosticos(view, caminho) {
  const doc = view.state.doc
  if (doc.length > 300_000) return []
  const ext = extDe(caminho)
  if (ext === 'json') {
    const errosJson = diagJson(doc)
    return errosJson.length ? errosJson : diagEquilibrio(doc, ext)
  }
  if (EXT_CODIGO.has(ext)) return diagEquilibrio(doc, ext)
  return []
}

function decoDiagnosticos(doc, diags) {
  const ranges = []
  const vistos = new Set()
  for (const d of diags) {
    const ln = Math.min(Math.max(1, Number(d.linha) || 1), doc.lines)
    if (vistos.has(ln)) continue
    vistos.add(ln)
    const cls = d.severidade === 'erro' ? 'cm-diag-erro' : 'cm-diag-aviso'
    ranges.push(CMDecoration.line({ class: cls }).range(doc.line(ln).from))
  }
  ranges.sort((a, b) => a.from - b.from)
  return CMDecoration.set(ranges)
}

function formatarJsonTexto(texto) {
  return JSON.stringify(JSON.parse(texto), null, 2) + '\n'
}

const PARSER_PRETTIER = {
  js: 'babel',
  mjs: 'babel',
  cjs: 'babel',
  jsx: 'babel',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css'
}

const OPCOES_PRETTIER = {
  printWidth: 100,
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  arrowParens: 'avoid'
}

async function formatarComPrettier(texto, ext) {
  const parser = PARSER_PRETTIER[ext]
  if (!parser) return null
  const prettier = await import('prettier/standalone')
  const estree = await import('prettier/plugins/estree')
  const plugins = [estree]
  if (parser === 'babel') plugins.push(await import('prettier/plugins/babel'))
  else if (parser === 'typescript') plugins.push(await import('prettier/plugins/typescript'))
  else plugins.push(await import('prettier/plugins/postcss'))
  return prettier.format(texto, { parser, plugins, ...OPCOES_PRETTIER })
}

export function criarEditor(parent, { onChange, onSave, onDiagnostics } = {}) {
  let view = null
  let caminhoAtual = null
  let salvo = ''
  let fimDeLinha = '\n'
  let sugestao = ''
  let pedidoSug = 0
  let timerSug = null

  function agendarSugestao(ed) {
    if (timerSug) clearTimeout(timerSug)
    sugestao = ''
    timerSug = setTimeout(() => {
      const pos = ed.state.selection.main.head
      const doc = ed.state.doc.toString()
      if (pos < 2 || !window.api) return
      const id = ++pedidoSug
      const prefixo = doc.slice(Math.max(0, pos - 1200), pos)
      const sufixo = doc.slice(pos, pos + 240)
      window.api.invoke('editor:completar', prefixo, sufixo).then((r) => {
        if (id !== pedidoSug) return
        if (ed.state.selection.main.head !== pos) return
        let t = String((r && r.texto) || '').trim()
        if (!t || t.length > 80) t = t.slice(0, 80).trim()
        if (!t) return
        sugestao = t
        const deco = CMDecoration.set([
          CMDecoration.widget({ widget: new GhostTexto(t), side: 1 }).range(pos)
        ])
        ed.dispatch({ effects: setGhost.of(deco) })
      }).catch(() => {})
    }, 700)
  }

  const tabSugestao = Prec.highest(keymap.of([
    {
      key: 'Tab',
      run: (ed) => {
        if (!sugestao) return false
        const pos = ed.state.selection.main.head
        const texto = sugestao
        sugestao = ''
        ed.dispatch({
          changes: { from: pos, insert: texto },
          selection: { anchor: pos + texto.length },
          effects: setGhost.of(CMDecoration.none)
        })
        return true
      }
    },
    {
      key: 'Escape',
      run: (ed) => {
        if (!sugestao) return false
        sugestao = ''
        ed.dispatch({ effects: setGhost.of(CMDecoration.none) })
        return true
      }
    }
  ]))
  /** @type {EditorView | null} */
  let sideView = null
  /** @type {{ refresh: Function, setDiff: Function, destroy: Function } | null} */
  let overview = null

  const saveKey = keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        if (typeof onSave === 'function') onSave()
        return true
      }
    }
  ])

  const emitirDiagnosticos = (lista) => {
    if (typeof onDiagnostics === 'function') onDiagnostics(lista, caminhoAtual)
  }

  const diagPlugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.diags = calcularDiagnosticos(view, caminhoAtual)
        this.decorations = decoDiagnosticos(view.state.doc, this.diags)
        queueMicrotask(() => emitirDiagnosticos(this.diags))
      }
      update(u) {
        if (!u.docChanged && !u.viewportChanged) return
        this.diags = calcularDiagnosticos(u.view, caminhoAtual)
        this.decorations = decoDiagnosticos(u.state.doc, this.diags)
        if (u.docChanged) emitirDiagnosticos(this.diags)
      }
    },
    { decorations: (v) => v.decorations }
  )

  const state = EditorState.create({
    doc: '',
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      keymap.of(searchKeymap),
      saveKey,
      tabSugestao,
      ghostField,
      langCompartment.of([]),
      themeCompartment.of(temaEditor()),
      diffField,
      diagPlugin,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && typeof onChange === 'function') {
          onChange(u.state.doc.toString())
        }
        if (u.docChanged) agendarSugestao(u.view)
        if (u.docChanged || u.selectionSet || u.geometryChanged) {
          overview?.refresh()
        }
        if (u.docChanged || u.geometryChanged || u.viewportChanged) minimapa.atualizar()
      }),
      EditorView.theme({
        '&': { height: '100%', position: 'relative' },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: "var(--dg-editor-fonte, var(--fonte-mono, 'Cascadia Code', Consolas, monospace))",
          fontSize: 'var(--dg-editor-fs, 13px)',
          paddingRight: 'var(--dg-editor-pad-right, 14px)'
        },
        '.cm-content': { wordBreak: 'break-word' },
        '.cm-diff-del-line': {
          backgroundColor: 'rgba(248, 81, 73, 0.14)'
        },
        '.cm-diff-del-line .cm-gutterElement': {
          borderLeft: '3px solid #f85149'
        },
        '.cm-diff-add-line': {
          backgroundColor: 'rgba(61, 214, 140, 0.14)'
        },
        '.cm-diff-add-line .cm-gutterElement': {
          borderLeft: '3px solid #3dd68c'
        },
        '.cm-dg-ghost': { color: '#8b949e', fontStyle: 'italic' },
        '.cm-line.cm-diag-erro': {
          backgroundColor: 'rgba(248, 81, 73, 0.1)',
          boxShadow: 'inset 2px 0 0 #f85149'
        },
        '.cm-line.cm-diag-aviso': {
          backgroundColor: 'rgba(210, 153, 34, 0.09)',
          boxShadow: 'inset 2px 0 0 #d29922'
        }
      })
    ]
  })

  view = new EditorView({ state, parent })

  overview = anexarOverviewRuler(view, {
    getSalvo: () => salvo
  })
  const minimapa = anexarMinimapa(view, { temaEscuro })

  function limparDiff() {
    view.dispatch({ effects: setDiffMarks.of(CMDecoration.none) })
    overview?.setDiff({ del: [], add: [], ia: [] })
    if (sideView) {
      sideView.destroy()
      sideView = null
    }
    const host = document.getElementById('editor-host')
    const side = document.getElementById('editor-diff-side')
    if (host) host.classList.remove('split-diff')
    if (side) {
      side.innerHTML = ''
      side.hidden = true
      side.setAttribute('aria-hidden', 'true')
    }
  }

  /**
   * Marca linhas del no editor atual e mostra "depois" no painel direito.
   * @param {{ linhasDel?: number[], linhasAdd?: number[], depois?: string, caminho?: string }} opts
   */
  function mostrarDiffProposta(opts) {
    limparDiff()
    const dec = buildDiffDecorations(view.state.doc, opts.linhasDel || [], [])
    view.dispatch({ effects: setDiffMarks.of(dec) })
    overview?.setDiff({
      del: opts.linhasDel || [],
      add: opts.linhasAdd || [],
      ia: [...(opts.linhasDel || []), ...(opts.linhasAdd || [])]
    })

    const side = document.getElementById('editor-diff-side')
    const host = document.getElementById('editor-host')
    if (!side || !host || opts.depois == null) return
    side.hidden = false
    side.setAttribute('aria-hidden', 'false')
    host.classList.add('split-diff')
    side.innerHTML = ''
    const sideState = EditorState.create({
      doc: opts.depois,
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        langCompartment.of(langPorExt(opts.caminho || caminhoAtual)),
        themeCompartment.of(temaEditor()),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "var(--dg-editor-fonte, var(--fonte-mono, 'Cascadia Code', Consolas, monospace))",
            fontSize: 'var(--dg-editor-fs, 13px)'
          },
          '.cm-diff-add-line': {
            backgroundColor: 'rgba(61, 214, 140, 0.16)'
          },
          '.cm-diff-add-line .cm-gutterElement': {
            borderLeft: '3px solid #3dd68c'
          },
          '.cm-dg-ghost': { color: '#8b949e', fontStyle: 'italic' }
        }),
        (() => {
          const field = StateField.define({
            create: (s) => buildDiffDecorations(s.doc, [], opts.linhasAdd || []),
            update(ds, tr) {
              return ds.map(tr.changes)
            },
            provide: (f) => EditorView.decorations.from(f)
          })
          return field
        })()
      ]
    })
    sideView = new EditorView({ state: sideState, parent: side })
  }

  return {
    view,
    getConteudo: () => paraDisco(view.state.doc.toString(), fimDeLinha),
    getDocumento: () => view.state.doc.toString(),
    getCaminho: () => caminhoAtual,
    getSalvo: () => salvo,
    getSelecao: () => {
      const sel = view.state.selection.main
      if (sel.empty) return ''
      return view.state.doc.sliceString(sel.from, sel.to)
    },
    isDirty: () => view.state.doc.toString() !== salvo,
    setSalvo: (texto) => {
      salvo = paraDocumento(texto)
    },
    marcarSalvo: () => {
      salvo = view.state.doc.toString()
    },
    abrir: (caminho, conteudo) => {
      limparDiff()
      caminhoAtual = caminho
      fimDeLinha = detectarFimDeLinha(conteudo)
      const doc = paraDocumento(conteudo)
      salvo = doc
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: doc },
        effects: [
          langCompartment.reconfigure(langPorExt(caminho)),
          themeCompartment.reconfigure(temaEditor()),
          setDiffMarks.of(CMDecoration.none)
        ]
      })
    },
    limpar: () => {
      limparDiff()
      caminhoAtual = null
      salvo = ''
      fimDeLinha = '\n'
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' },
        effects: [langCompartment.reconfigure([]), setDiffMarks.of(CMDecoration.none)]
      })
    },
    limparDiff,
    mostrarDiffProposta,
    aplicarTema: () => {
      view.dispatch({
        effects: themeCompartment.reconfigure(temaEditor())
      })
      minimapa.atualizar()
      if (sideView) {
        sideView.dispatch({
          effects: themeCompartment.reconfigure(temaEditor())
        })
      }
    },
    buscar: () => {
      openSearchPanel(view)
    },
    irParaLinha: (ln) => {
      const total = view.state.doc.lines
      const n = Math.max(1, Math.min(total, Number(ln) || 1))
      const linha = view.state.doc.line(n)
      view.dispatch({
        selection: { anchor: linha.from },
        effects: EditorView.scrollIntoView(linha.from, { y: 'center' })
      })
      view.focus()
    },
    diagnosticos: () => calcularDiagnosticos(view, caminhoAtual),
    formatar: async () => {
      const ext = extDe(caminhoAtual)
      const atual = view.state.doc.toString()
      try {
        let novo
        if (ext === 'json') {
          novo = formatarJsonTexto(atual)
        } else {
          novo = await formatarComPrettier(atual, ext)
          if (novo == null) {
            return { ok: false, erro: 'tipo nao suportado: .' + (ext || '?') }
          }
        }
        if (novo === atual) return { ok: true, alterado: false }
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: novo } })
        return { ok: true, alterado: true }
      } catch (e) {
        const msg = String((e && e.message) || e).split('\n')[0]
        return { ok: false, erro: msg }
      }
    },
    minimapaAlternar: (mostrar) => minimapa.alternar(mostrar),
    minimapaVisivel: () => minimapa.visivel(),
    focar: () => view.focus(),
    requestMeasure: () => view.requestMeasure(),
    overviewRefresh: () => overview?.refresh(),
    overviewDiff: (parcial) => overview?.setDiff(parcial || {}),
    destruir: () => {
      limparDiff()
      minimapa.destroy()
      overview?.destroy()
      overview = null
      view.destroy()
    }
  }
}
