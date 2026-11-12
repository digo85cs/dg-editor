/**
 * CodeMirror 6 — editor do DG Editor (offline, ESM via electron-vite).
 * Inclui seleção + marcações de diff (del/add) e painel side-by-side.
 */
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, StateField, StateEffect, Prec } from '@codemirror/state'
import { keymap, Decoration as CMDecoration, WidgetType } from '@codemirror/view'
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
  return CMDecoration.of(ranges)
}

export function criarEditor(parent, { onChange, onSave } = {}) {
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
      themeCompartment.of(temaEscuro() ? oneDark : []),
      diffField,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && typeof onChange === 'function') {
          onChange(u.state.doc.toString())
        }
        if (u.docChanged) agendarSugestao(u.view)
        if (u.docChanged || u.selectionSet || u.geometryChanged) {
          overview?.refresh()
        }
      }),
      EditorView.theme({
        '&': { height: '100%', position: 'relative' },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: "var(--fonte-mono, 'Cascadia Code', Consolas, monospace)",
          paddingRight: '14px'
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
        '.cm-dg-ghost': { color: '#8b949e', fontStyle: 'italic' }
      })
    ]
  })

  view = new EditorView({ state, parent })

  overview = anexarOverviewRuler(view, {
    getSalvo: () => salvo
  })

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
        themeCompartment.of(temaEscuro() ? oneDark : []),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "var(--fonte-mono, 'Cascadia Code', Consolas, monospace)"
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
          themeCompartment.reconfigure(temaEscuro() ? oneDark : []),
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
        effects: themeCompartment.reconfigure(temaEscuro() ? oneDark : [])
      })
      if (sideView) {
        sideView.dispatch({
          effects: themeCompartment.reconfigure(temaEscuro() ? oneDark : [])
        })
      }
    },
    buscar: () => {
      openSearchPanel(view)
    },
    focar: () => view.focus(),
    overviewRefresh: () => overview?.refresh(),
    overviewDiff: (parcial) => overview?.setDiff(parcial || {}),
    destruir: () => {
      limparDiff()
      overview?.destroy()
      overview = null
      view.destroy()
    }
  }
}
