/**
 * CodeMirror 6 — editor do DG Editor (offline, ESM via electron-vite).
 */
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { keymap } from '@codemirror/view'
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

export function criarEditor(parent, { onChange, onSave } = {}) {
  let view = null
  let caminhoAtual = null
  let salvo = ''

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
        }
      })
    ]
  })

  view = new EditorView({ state, parent })

  return {
    view,
    getConteudo: () => view.state.doc.toString(),
    getCaminho: () => caminhoAtual,
    getSalvo: () => salvo,
    isDirty: () => view.state.doc.toString() !== salvo,
    setSalvo: (texto) => {
      salvo = texto
    },
    marcarSalvo: () => {
      salvo = view.state.doc.toString()
    },
    abrir: (caminho, conteudo) => {
      caminhoAtual = caminho
      salvo = conteudo
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: conteudo },
        effects: [
          langCompartment.reconfigure(langPorExt(caminho)),
          themeCompartment.reconfigure(temaEscuro() ? oneDark : [])
        ]
      })
    },
    limpar: () => {
      caminhoAtual = null
      salvo = ''
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' },
        effects: [langCompartment.reconfigure([])]
      })
    },
    aplicarTema: () => {
      // escuro → oneDark; claro → [] (tema padrão do CodeMirror)
      view.dispatch({
        effects: themeCompartment.reconfigure(temaEscuro() ? oneDark : [])
      })
    },
    buscar: () => {
      openSearchPanel(view)
    },
    focar: () => view.focus(),
    destruir: () => view.destroy()
  }
}
