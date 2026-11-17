// paleta.js — Paleta de comandos, Quick Open e Busca global.
// Extraído de app.js. Depende de callbacks registrados via configurarPaleta()
// para ações que vivem no app.js (abrirArquivoNaAba, executarComando).
import { state } from '../../state/app-state.js'
import { escapar } from '../../utils/dom.js'
import { nomeAmigavelArquivo } from '../../utils/nomes-amigaveis.js'
import { listarComandosLocais } from '../../comandos.js'

const $ = (id) => document.getElementById(id)

let paletaItens = []
let paletaSel = 0
let buscaAbortId = null
let modoPaleta = 'comandos' // 'comandos' | 'arquivos'

/** Registra callbacks do app.js necessários à paleta. Chamar uma vez no boot. */
export function configurarPaleta(deps) {
  paletaDeps = deps || {}
}

let paletaDeps = {}

export function abrirPaletaComandos() {
  modoPaleta = 'comandos'
  fecharBuscaGlobal()
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Digite um comando...'
  renderizarPaleta('')
  $('palette-input').focus()
}

export function abrirPaletaArquivos() {
  modoPaleta = 'arquivos'
  fecharBuscaGlobal()
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Abrir arquivo — digite o nome…'
  renderizarPaleta('')
  $('palette-input').focus()
}

export function fecharPaleta() {
  $('palette').classList.add('hidden')
}

export function abrirBuscaGlobal() {
  fecharPaleta()
  $('busca-global')?.classList.remove('hidden')
  const inp = $('busca-input')
  if (inp) {
    inp.value = ''
    inp.focus()
  }
  const box = $('busca-resultados')
  if (box) box.innerHTML = '<div class="palette-item muted">Digite para buscar no projeto</div>'
}

export function fecharBuscaGlobal() {
  $('busca-global')?.classList.add('hidden')
  if (buscaAbortId) {
    window.api.invoke('busca:cancelar', buscaAbortId).catch(() => {})
    buscaAbortId = null
  }
}

export async function renderizarPaleta(filtro) {
  const lista = $('palette-list')
  lista.innerHTML = ''
  paletaSel = 0
  const f = (filtro || '').trim()
  paletaItens = []

  if (modoPaleta === 'comandos') {
    let cmds = listarComandosLocais()
    try {
      const remoto = await window.api.invoke('comandos:listar')
      if (remoto?.ok && Array.isArray(remoto.comandos)) {
        for (const c of remoto.comandos) {
          const existente = cmds.find((x) => x.id === c.id)
          if (existente) {
            existente.hint = existente.hint || c.descricao || c.atalho || ''
          } else {
            cmds.push({ id: c.id, titulo: c.titulo, atalho: c.atalho, hint: c.descricao })
          }
        }
      }
    } catch {
      /* offline meta */
    }
    const fl = f.toLowerCase()
    cmds = cmds.filter((c) => !fl || (c.titulo || '').toLowerCase().includes(fl) || c.id.includes(fl))
    for (const c of cmds) {
        paletaItens.push({ tipo: 'cmd', id: c.id, label: c.titulo, hint: c.hint || c.atalho || '' })
      }
  } else {
    const raiz = state.pastaAtual || state.pastasRecentes[0]
    if (raiz) {
      try {
        const r = await window.api.invoke('busca:arquivos', raiz, f, 80)
        if (r?.ok && Array.isArray(r.itens)) {
          for (const e of r.itens) {
            const nome = e.nome || ''
            const rel = e.rel || nome
            const pasta = String(rel).replace(/[\\/][^\\/]+$/, '') || '.'
            paletaItens.push({
              tipo: 'file',
              caminho: e.caminho,
              label: nomeAmigavelArquivo(nome, rel),
              hint: pasta === '.' ? rel : pasta
            })
          }
        }
      } catch {
        /* fallback vazio */
      }
    }
  }

  if (paletaItens.length === 0) {
    lista.innerHTML = '<div class="palette-item muted">Nenhum resultado</div>'
    return
  }
  for (let i = 0; i < paletaItens.length; i++) {
    const c = paletaItens[i]
    const div = document.createElement('div')
    div.className = 'palette-item' + (i === 0 ? ' selecionado' : '')
    div.innerHTML =
      '<span class="palette-label">' +
      escapar(c.label) +
      '</span>' +
      (c.hint ? '<span class="palette-hint">' + escapar(c.hint) + '</span>' : '')
    div.addEventListener('click', () => {
      fecharPaleta()
      executarItemPaleta(c)
    })
    lista.appendChild(div)
  }
}

export function executarItemPaleta(c) {
  if (c.tipo === 'file') paletaDeps.abrirArquivoNaAba?.(c.caminho)
  else paletaDeps.executarComando?.(c.id)
}

export async function rodarBuscaGlobal() {
  const raiz = state.pastaAtual || state.pastasRecentes[0]
  const q = ($('busca-input')?.value || '').trim()
  const box = $('busca-resultados')
  if (!box) return
  if (!raiz) {
    box.innerHTML = '<div class="palette-item muted">Abra uma pasta primeiro</div>'
    return
  }
  if (!q) {
    box.innerHTML = '<div class="palette-item muted">Digite para buscar</div>'
    return
  }
  if (buscaAbortId) await window.api.invoke('busca:cancelar', buscaAbortId).catch(() => {})
  buscaAbortId = 'ui-' + Date.now()
  box.innerHTML = '<div class="palette-item muted">Buscando...</div>'
  const regex = !!$('busca-regex')?.checked
  try {
    const r = await window.api.invoke('busca:conteudo', raiz, q, {
      regex,
      limite: 50,
      id: buscaAbortId
    })
    box.innerHTML = ''
    if (!r?.ok) {
      box.innerHTML = '<div class="palette-item muted">' + escapar(r?.erro || 'falha') + '</div>'
      return
    }
    if (r.cancelado) {
      box.innerHTML = '<div class="palette-item muted">Cancelado</div>'
      return
    }
    const itens = Array.isArray(r.itens) ? r.itens : []
    if (!itens.length) {
      box.innerHTML = '<div class="palette-item muted">Nenhum resultado</div>'
      return
    }
    const grupos = new Map()
    for (const it of itens) {
      const rel = it.rel || it.caminho || ''
      if (!grupos.has(rel)) grupos.set(rel, { rel, arquivo: it.caminho || rel, hits: [] })
      grupos.get(rel).hits.push({ linha: Number(it.linha) || 1, texto: it.trecho || '' })
    }
    for (const g of grupos.values()) {
      const head = document.createElement('div')
      head.className = 'palette-item'
      head.innerHTML =
        '<span class="palette-label">' +
        escapar(g.rel) +
        '</span><span class="palette-hint">' +
        g.hits.length +
        '</span>'
      head.addEventListener('click', () => {
        fecharBuscaGlobal()
        paletaDeps.abrirArquivoNaAba?.(g.arquivo, g.hits[0]?.linha)
      })
      box.appendChild(head)
      for (const h of g.hits) {
        const hit = document.createElement('div')
        hit.className = 'busca-hit'
        hit.textContent = h.linha + ': ' + h.texto
        hit.title = h.texto
        hit.addEventListener('click', () => {
          fecharBuscaGlobal()
          paletaDeps.abrirArquivoNaAba?.(g.arquivo, h.linha)
        })
        box.appendChild(hit)
      }
    }
  } catch (e) {
    box.innerHTML = '<div class="palette-item muted">' + escapar(String(e)) + '</div>'
  }
}

export function destacarPaleta(itens) {
  itens.forEach((el, i) => el.classList.toggle('selecionado', i === paletaSel))
  itens[paletaSel]?.scrollIntoView({ block: 'nearest' })
}
