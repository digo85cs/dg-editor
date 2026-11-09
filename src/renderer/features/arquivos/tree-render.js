import { state } from '../../state/app-state.js'
import { escapar } from '../../utils/dom.js'
import { badgeGitHtml, gitStatusMap, relPosix } from './git-helpers.js'

export const CHEV =
  '<span class="chevron"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>'

/**
 * @param {HTMLElement} lista
 * @param {object} deps
 * @param {() => Promise<void>} deps.renderizarPastas - rerender lists (for remover/reapontar flows may call back via carregarFilhos)
 * @param {(dir:string, container:HTMLElement, nivel:number)=>Promise<boolean>} deps.carregarFilhos
 * @param {(p:string)=>void} deps.selecionarPasta
 * @param {(p:string)=>HTMLElement} deps.criarBotaoRemoverPasta
 * @param {(p:string)=>string} deps.nomeArquivo
 */
export async function renderizarArvoreEm(lista, deps) {
  if (!lista) return
  lista.innerHTML = ''
  if (state.pastasRecentes.length === 0) {
    lista.innerHTML = '<p class="muted" style="padding:12px">Nenhuma pasta. Clique em + para abrir.</p>'
    return
  }
  const promessasFilhos = []
  for (const p of state.pastasRecentes) {
    const root = document.createElement('div')
    root.className = 'tree-root' + (p === state.pastaAtual ? ' selected' : '')
    root.dataset.path = p
    const st = state.estadoArvore.get(p) || { expandida: false, filhosCarregados: false }
    state.estadoArvore.set(p, st)

    const header = document.createElement('div')
    header.className = 'tree-root-header'
    header.dataset.path = p
    header.dataset.tipo = 'dir'
    header.innerHTML =
      CHEV +
      '<span class="file-icon">📁</span><span class="tab-name" style="overflow:hidden;text-overflow:ellipsis">' +
      escapar(deps.nomeArquivo(p)) +
      '</span>'
    header.title = p
    header.appendChild(deps.criarBotaoRemoverPasta(p))
    const chev = header.querySelector('.chevron')
    if (st.expandida) chev.classList.add('open')

    const children = document.createElement('div')
    children.className = 'tree-children' + (st.expandida ? ' open' : '')

    header.addEventListener('click', async (e) => {
      if (e.target.closest('.pasta-remover')) return
      if (state.carregandoNos.has(children)) return
      const noChevron = !e.target.closest('.chevron')
      if (st.expandida && noChevron && e.target.closest('.tab-name, .file-icon')) {
        deps.selecionarPasta(p)
        return
      }
      st.expandida = !st.expandida
      chev.classList.toggle('open', st.expandida)
      children.classList.toggle('open', st.expandida)
      if (!st.expandida) return
      if (children.childElementCount > 0) return
      state.carregandoNos.add(children)
      try {
        await deps.carregarFilhos(p, children, 1)
      } finally {
        state.carregandoNos.delete(children)
      }
    })
    root.appendChild(header)
    root.appendChild(children)
    lista.appendChild(root)

    if (st.expandida && children.childElementCount === 0) {
      state.carregandoNos.add(children)
      promessasFilhos.push(
        deps.carregarFilhos(p, children, 1)
          .catch(() => false)
          .finally(() => state.carregandoNos.delete(children))
      )
    }
  }
  if (promessasFilhos.length) await Promise.all(promessasFilhos)
}

/**
 * @param {{nome:string,caminho:string}} ent
 * @param {number} nivel
 * @param {object} deps
 */
export function criarNoDir(ent, nivel, deps) {
  const wrap = document.createElement('div')
  const row = document.createElement('div')
  row.className = 'tree-item'
  row.style.paddingLeft = 8 + nivel * 16 + 'px'
  row.innerHTML = CHEV + '<span class="file-icon">📁</span><span>' + escapar(ent.nome) + '</span>'
  row.title = ent.caminho
  row.dataset.path = ent.caminho
  row.dataset.tipo = 'dir'
  const kids = document.createElement('div')
  kids.className = 'tree-children'
  let aberto = false
  let carregado = false
  row.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (state.carregandoNos.has(kids)) return
    aberto = !aberto
    row.querySelector('.chevron').classList.toggle('open', aberto)
    kids.classList.toggle('open', aberto)
    if (!aberto) return
    if (carregado || kids.childElementCount > 0) {
      carregado = kids.childElementCount > 0
      return
    }
    state.carregandoNos.add(kids)
    try {
      carregado = await deps.carregarFilhos(ent.caminho, kids, nivel + 1)
    } finally {
      state.carregandoNos.delete(kids)
    }
  })
  wrap.appendChild(row)
  wrap.appendChild(kids)
  return wrap
}

/**
 * @param {{nome:string,caminho:string,editavel?:boolean}} ent
 * @param {number} nivel
 * @param {object} deps
 */
export function criarNoFile(ent, nivel, deps) {
  const row = document.createElement('div')
  row.className = 'tree-item'
  row.style.paddingLeft = 8 + nivel * 16 + 16 + 'px'
  const raiz = deps.raizWorkspaceDe(ent.caminho) || state.pastaAtual
  const rel = raiz ? relPosix(ent.caminho, raiz) : ''
  const st = rel ? gitStatusMap.get(rel) : null
  row.innerHTML =
    deps.extIcon(ent.nome) + '<span>' + escapar(ent.nome) + '</span>' + badgeGitHtml(st)
  row.title = ent.caminho
  row.dataset.path = ent.caminho
  row.dataset.tipo = 'file'
  row.addEventListener('click', (e) => {
    e.stopPropagation()
    if (e.target?.closest?.('.git-badge')) {
      void deps.abrirPainelDiff(ent.caminho)
      return
    }
    if (!ent.editavel) {
      alert('Extensão não editável: ' + ent.nome)
      return
    }
    document.querySelectorAll('.tree-item.active').forEach((el) => el.classList.remove('active'))
    row.classList.add('active')
    const rz = deps.raizWorkspaceDe(ent.caminho)
    if (rz) deps.definirContextoPasta(rz)
    deps.abrirArquivoNaAba(ent.caminho)
    if (st) void deps.abrirPainelDiff(ent.caminho)
  })
  return row
}
