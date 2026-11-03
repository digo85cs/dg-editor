/**
 * CodeMirror 6 — editor do DG Editor (offline, ESM via electron-vite).
 * Inclui seleção + marcações de diff (del/add) e painel side-by-side.
 */
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, StateField, StateEffect } from '@codemirror/state'
import { keymap, Decoration as CMDecoration } from '@codemirror/view'
import { searchKeymap, openSearchPanel } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'

const langCompartment = new Compartment()
const themeCompartment = new Compartment()

const setDiffMarks = StateEffect.define()

const delMark = CMDecoration.mark({ class: 'cm-diff-del' })
const addMark = CMDecoration.mark({ class: 'cm-diff-add' })

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
    if (r) ranges.push(delMark.range(r.from, r.to))
  }
  for (const n of linhasAdd || []) {
    const r = lineRange(doc, n)
    if (r) ranges.push(addMark.range(r.from, r.to))
  }
  ranges.sort((a, b) => a.from - b.from)
  return CMDecoration.of(ranges)
}

export function criarEditor(parent, { onChange, onSave } = {}) {
  let view = null
  let caminhoAtual = null
  let salvo = ''
  /** @type {EditorView | null} */
  let sideView = null

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
      keymap.of(searchKeymap),
      saveKey,
      langCompartment.of([]),
      themeCompartment.of(temaEscuro() ? oneDark : []),
      diffField,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && typeof onChange === 'function') {
          onChange(u.state.doc.toString())
        }
      }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: "var(--fonte-mono, 'Cascadia Code', Consolas, monospace)"
        },
        '.cm-diff-del': { backgroundColor: 'rgba(248, 81, 73, 0.22)' },
        '.cm-diff-add': { backgroundColor: 'rgba(61, 214, 140, 0.22)' }
      })
    ]
  })

  view = new EditorView({ state, parent })

  function limparDiff() {
    view.dispatch({ effects: setDiffMarks.of(CMDecoration.none) })
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
          '.cm-diff-add': { backgroundColor: 'rgba(61, 214, 140, 0.22)' }
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
    getConteudo: () => view.state.doc.toString(),
    getCaminho: () => caminhoAtual,
    getSalvo: () => salvo,
    getSelecao: () => {
      const sel = view.state.selection.main
      if (sel.empty) return ''
      return view.state.doc.sliceString(sel.from, sel.to)
    },
    isDirty: () => view.state.doc.toString() !== salvo,
    setSalvo: (texto) => {
      salvo = texto
    },
    marcarSalvo: () => {
      salvo = view.state.doc.toString()
    },
    abrir: (caminho, conteudo) => {
      limparDiff()
      caminhoAtual = caminho
      salvo = conteudo
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: conteudo },
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
    destruir: () => {
      limparDiff()
      view.destroy()
    }
  }
}
