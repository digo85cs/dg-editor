// arvore-acoes.js — menu de contexto, teclado e drag-and-drop da árvore de arquivos.
// Extraído de app.js. recarregarArvore/garantirTerminal injetados via configurarArvore().
import { state } from '../../state/app-state.js'
import { pastasPermitidas } from './index.js'
import { mostrarToast } from '../ui/toast.js'

const $ = (id) => document.getElementById(id)

let deps = {}

/** Registra callbacks do app.js. Chamar uma vez no boot. */
export function configurarArvore(d) {
  deps = d || {}
}

function dirPaiDe(caminho) {
  const n = String(caminho || '').replace(/[/\\]+$/, '')
  const i = Math.max(n.lastIndexOf('\\'), n.lastIndexOf('/'))
  return i > 0 ? n.slice(0, i) : n
}

let menuCtxArvore = null
let menuCtxFocoAnterior = null

/**
 * @param {boolean} [restaurarFoco] devolve o foco à linha que abriu o menu
 */
function fecharMenuCtxArvore(restaurarFoco = false) {
  const menu = menuCtxArvore
  const foco = menuCtxFocoAnterior
  menuCtxArvore = null
  menuCtxFocoAnterior = null
  if (menu) menu.remove()
  if (restaurarFoco && foco && foco.isConnected) {
    try {
      foco.focus()
    } catch {
      /* */
    }
  }
}

function juntarCaminho(base, nome) {
  const b = String(base || '').replace(/[/\\]+$/, '')
  const sep = b.includes('\\') ? '\\' : '/'
  return b + sep + String(nome || '').replace(/^[/\\]+/, '')
}

async function recarregarArvoreExplorer() {
  await deps.recarregarArvore?.()
}

function erroOperacao(titulo, r) {
  alert(titulo + ': ' + ((r && r.erro) || 'erro desconhecido'))
}

async function criarNoExplorer(baseDir, tipo) {
  const nome = window.prompt(tipo === 'dir' ? 'Nome da nova pasta:' : 'Nome do novo arquivo:')
  if (nome == null) return
  const limpo = String(nome).trim()
  if (!limpo) return
  const r = await window.api.invoke(
    'arquivo:criar',
    juntarCaminho(baseDir, limpo),
    tipo,
    pastasPermitidas()
  )
  if (!r || !r.ok) return erroOperacao('Falha ao criar', r)
  await recarregarArvoreExplorer()
}

async function renomearExplorer(alvoPath) {
  const linha = Array.from(document.querySelectorAll('.tree-item[data-path]')).find(
    (el) => el.dataset.path === alvoPath
  )
  if (linha) return renomearInlineNaArvore(linha)
  await dgAlert('Abra a árvore de arquivos e use F2 sobre o item para renomear.', 'Renomear')
}

function renomearInlineNaArvore(linha) {
  const alvoPath = linha.dataset.path || ''
  if (!alvoPath || (linha.dataset.tipo !== 'file' && linha.dataset.tipo !== 'dir')) return
  const atual = alvoPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || ''
  const htmlOriginal = linha.innerHTML
  linha.innerHTML = ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tree-rename-input'
  input.value = atual
  input.setAttribute('aria-label', 'Novo nome para ' + atual)
  linha.appendChild(input)
  input.focus()
  input.select()
  let concluido = false
  const finalizar = async (salvar) => {
    if (concluido) return
    concluido = true
    const limpo = input.value.trim()
    linha.innerHTML = htmlOriginal
    if (!salvar || !limpo || limpo === atual) return
    const r = await window.api.invoke('arquivo:renomear', alvoPath, limpo, pastasPermitidas())
    if (!r || !r.ok) return erroOperacao('Falha ao renomear', r)
    await recarregarArvoreExplorer()
  }
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation()
    if (ev.key === 'Enter') {
      ev.preventDefault()
      void finalizar(true)
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      void finalizar(false)
    }
  })
  input.addEventListener('blur', () => void finalizar(true))
}

const SELETOR_LINHA_ARVORE = '.tree-root-header[data-path], .tree-item[data-path]'

function linhasArvore(lista) {
  return Array.from(lista.querySelectorAll(SELETOR_LINHA_ARVORE)).filter((el) => el.getClientRects().length > 0)
}

function garantirLinhaFocavel(lista) {
  if (!lista) return
  const linhas = lista.querySelectorAll(SELETOR_LINHA_ARVORE)
  if (!linhas.length) return
  if (Array.from(linhas).some((l) => l.tabIndex === 0)) return
  linhas[0].tabIndex = 0
}

function focarLinhaArvore(lista, linha) {
  if (!linha || !lista.contains(linha)) return
  for (const l of lista.querySelectorAll(SELETOR_LINHA_ARVORE)) l.tabIndex = -1
  linha.tabIndex = 0
  try {
    linha.focus()
  } catch {
    /* */
  }
}

function linhaAncestralArvore(linhas, indice) {
  const alvo = (linhas[indice]?.dataset.path || '').toLowerCase()
  for (let i = indice - 1; i >= 0; i--) {
    const l = linhas[i]
    if (l.dataset.tipo !== 'dir') continue
    const base = (l.dataset.path || '').toLowerCase()
    if (alvo.startsWith(base + '\\') || alvo.startsWith(base + '/')) return l
  }
  return null
}

function nomeBaseArvore(linha) {
  return String(linha.dataset.path || '')
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .pop()
    .toLowerCase()
}

/** Próxima linha (com wrap) cujo nome começa pelo termo digitado. */
function indiceTypeaheadArvore(linhas, inicio, termo) {
  const t = String(termo || '').toLowerCase()
  if (!t) return -1
  for (let k = 1; k <= linhas.length; k++) {
    const idx = (inicio + k) % linhas.length
    if (nomeBaseArvore(linhas[idx]).startsWith(t)) return idx
  }
  return -1
}

function ligarTecladoArvore(lista) {
  if (!lista || lista.dataset.tecladoPronto) return
  lista.dataset.tecladoPronto = '1'
  lista.setAttribute('role', 'tree')
  lista.setAttribute('aria-label', 'Arquivos do repositório')
  lista.tabIndex = -1
  let bufferTypeahead = ''
  let timerTypeahead = null
  lista.addEventListener('focus', () => {
    if (document.activeElement !== lista) return
    const linhas = linhasArvore(lista)
    const alvo = linhas.find((l) => l.tabIndex === 0) || linhas[0]
    if (alvo) focarLinhaArvore(lista, alvo)
  })
  lista.addEventListener(
    'click',
    (e) => {
      const linha = e.target.closest?.(SELETOR_LINHA_ARVORE)
      if (linha && !e.target.closest('.pasta-remover')) focarLinhaArvore(lista, linha)
    },
    true
  )
  lista.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const atual = e.target.closest?.(SELETOR_LINHA_ARVORE)
    if (!atual) return
    const linhas = linhasArvore(lista)
    const i = linhas.indexOf(atual)
    if (i < 0) return
    const dir = atual.dataset.tipo === 'dir'
    const chevron = atual.querySelector('.chevron')
    const aberto = !!chevron?.classList.contains('open')
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault()
      const r = atual.getBoundingClientRect()
      const tipo = atual.dataset.tipo || (atual.classList.contains('tree-root-header') ? 'dir' : 'file')
      abrirMenuCtxArvore(r.left + 24, r.bottom, { path: atual.dataset.path || '', tipo }, atual)
      return
    }
    if (e.key.length === 1 && !/[\u0000-\u001f]/.test(e.key)) {
      e.preventDefault()
      bufferTypeahead += e.key.toLowerCase()
      clearTimeout(timerTypeahead)
      timerTypeahead = setTimeout(() => {
        bufferTypeahead = ''
      }, 800)
      const alvoIdx = indiceTypeaheadArvore(linhas, i, bufferTypeahead)
      if (alvoIdx >= 0) focarLinhaArvore(lista, linhas[alvoIdx])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[Math.min(i + 1, linhas.length - 1)])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[Math.max(i - 1, 0)])
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (dir && chevron && !aberto) chevron.click()
      else focarLinhaArvore(lista, linhas[Math.min(i + 1, linhas.length - 1)])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (dir && chevron && aberto) chevron.click()
      else focarLinhaArvore(lista, linhaAncestralArvore(linhas, i) || atual)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[linhas.length - 1])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (dir && chevron) chevron.click()
      else atual.click()
    } else if (e.key === 'F2') {
      e.preventDefault()
      if (atual.classList.contains('tree-item')) void renomearInlineNaArvore(atual)
      else mostrarToast('A raiz não pode ser renomeada aqui', 'aviso')
    }
  })
}

async function excluirExplorer(alvoPath) {
  const nome = String(alvoPath).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || alvoPath
  if (!window.confirm('Excluir "' + nome + '"? O item vai para a lixeira do sistema.')) return
  const r = await window.api.invoke('arquivo:excluir', alvoPath, pastasPermitidas())
  if (!r || !r.ok) return erroOperacao('Falha ao excluir', r)
  await recarregarArvoreExplorer()
}

export function abrirMenuCtxArvore(x, y, alvo, focoRetorno = null) {
  fecharMenuCtxArvore()
  const alvoPath = String(alvo.path || '')
  const tipo = alvo.tipo === 'file' ? 'file' : 'dir'
  const pastaBase = tipo === 'file' ? dirPaiDe(alvoPath) : alvoPath
  const ehRaiz = (state.pastasRecentes || []).some((p) => String(p) === alvoPath)
  const menu = document.createElement('div')
  menu.className = 'tree-ctx-menu'
  menu.setAttribute('role', 'menu')
  menuCtxFocoAnterior = focoRetorno || document.activeElement
  const add = (label, fn, opts = {}) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'tree-ctx-item' + (opts.perigo ? ' is-perigo' : '')
    item.setAttribute('role', 'menuitem')
    item.textContent = label
    item.addEventListener('click', (e) => {
      e.stopPropagation()
      fecharMenuCtxArvore()
      fn()
    })
    menu.appendChild(item)
  }
  const sep = () => {
    const d = document.createElement('div')
    d.className = 'tree-ctx-sep'
    d.setAttribute('role', 'separator')
    menu.appendChild(d)
  }
  add('Novo arquivo…', () => void criarNoExplorer(pastaBase, 'file'))
  add('Nova pasta…', () => void criarNoExplorer(pastaBase, 'dir'))
  if (!ehRaiz) {
    sep()
    add('Renomear…', () => void renomearExplorer(alvoPath))
    add('Excluir…', () => void excluirExplorer(alvoPath), { perigo: true })
  }
  sep()
  add('Abrir terminal nesta pasta', () => {
    void deps.garantirTerminal?.().then(() => {
      const api = window.dgTerminal
      if (api && typeof api.abrirEm === 'function') {
        void api.abrirEm(pastaBase)
      } else {
        console.warn('[arvore] dgTerminal.abrirEm indisponivel')
      }
    })
  })
  document.body.appendChild(menu)
  const pad = 4
  const rect = menu.getBoundingClientRect()
  let left = x
  let top = y
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad
  menu.style.left = Math.max(pad, left) + 'px'
  menu.style.top = Math.max(pad, top) + 'px'
  menu.addEventListener('keydown', (e) => {
    const itens = Array.from(menu.querySelectorAll('.tree-ctx-item'))
    if (!itens.length) return
    const i = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      itens[(i + 1) % itens.length].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      itens[(i - 1 + itens.length) % itens.length].focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itens[0].focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itens[itens.length - 1].focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fecharMenuCtxArvore(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      fecharMenuCtxArvore(true)
    }
  })
  menuCtxArvore = menu
  const primeiro = menu.querySelector('.tree-ctx-item')
  try {
    primeiro?.focus()
  } catch {
    /* */
  }
}

function limparDropArvore() {
  document.querySelectorAll('.tree-item.drag-over, .tree-root-header.drag-over').forEach((el) =>
    el.classList.remove('drag-over')
  )
  document.querySelectorAll('.tree-item.dragging').forEach((el) => el.classList.remove('dragging'))
}

async function moverArvore(origem, destinoPasta) {
  if (!origem || !destinoPasta) return
  if (String(origem).toLowerCase() === String(destinoPasta).toLowerCase()) return
  const r = await window.api.invoke('arquivo:mover', origem, destinoPasta, pastasPermitidas())
  if (!r || !r.ok) return erroOperacao('Falha ao mover', r)
  await recarregarArvoreExplorer()
}

export function initMenuCtxArvore() {
  ligarTecladoArvore($('files-list'))
  for (const id of ['folder-list', 'files-list']) {
    const lista = $(id)
    if (!lista) continue
    lista.addEventListener('contextmenu', (e) => {
      const alvo =
        e.target.closest('.tree-item[data-path]') || e.target.closest('.tree-root-header[data-path]')
      if (!alvo) return
      e.preventDefault()
      e.stopPropagation()
      const path = alvo.dataset.path
      if (!path) return
      const tipo = alvo.dataset.tipo || (alvo.classList.contains('tree-root-header') ? 'dir' : 'file')
      abrirMenuCtxArvore(e.clientX, e.clientY, { path, tipo }, alvo)
    })
  }
  const listas = ['folder-list', 'files-list'].map((id) => $(id)).filter(Boolean)
  for (const lista of listas) {
    lista.addEventListener('dragstart', (e) => {
      const alvo = e.target.closest?.('.tree-item[data-path], .tree-root-header[data-path]')
      if (!alvo) return
      if (alvo.classList.contains('tree-root-header')) return
      e.dataTransfer.setData('text/plain', alvo.dataset.path || '')
      e.dataTransfer.effectAllowed = 'move'
      alvo.classList.add('dragging')
    })
    lista.addEventListener('dragend', limparDropArvore)
    lista.addEventListener('dragover', (e) => {
      const destino = e.target.closest?.('.tree-root-header[data-path], .tree-item[data-tipo="dir"][data-path]')
      if (!destino) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!destino.classList.contains('drag-over')) {
        document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
        destino.classList.add('drag-over')
      }
    })
    lista.addEventListener('dragleave', (e) => {
      const destino = e.target.closest?.('.drag-over')
      if (destino && !destino.contains(e.relatedTarget)) destino.classList.remove('drag-over')
    })
    lista.addEventListener('drop', (e) => {
      const destino = e.target.closest?.('.tree-root-header[data-path], .tree-item[data-tipo="dir"][data-path]')
      if (!destino) return
      e.preventDefault()
      const origem = e.dataTransfer.getData('text/plain')
      const pastaDestino = destino.dataset.path || ''
      limparDropArvore()
      void moverArvore(origem, pastaDestino)
    })
  }
  document.addEventListener('click', (e) => {
    if (menuCtxArvore && !menuCtxArvore.contains(e.target)) fecharMenuCtxArvore()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenuCtxArvore()
  })
  window.addEventListener('blur', () => fecharMenuCtxArvore())
}

