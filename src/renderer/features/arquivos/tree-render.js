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
    lista.innerHTML = '<p class="muted" style="padding:12px">Nenhum repositório. Clique em + para adicionar.</p>'
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
    header.tabIndex = -1
    header.setAttribute('role', 'treeitem')
    header.setAttribute('aria-level', '1')
    header.setAttribute('aria-expanded', String(!!st.expandida))
    header.appendChild(deps.criarBotaoRemoverPasta(p))
    const chev = header.querySelector('.chevron')
    if (st.expandida) chev.classList.add('open')

    const children = document.createElement('div')
    children.className = 'tree-children' + (st.expandida ? ' open' : '')

    header.addEventListener('click', async (e) => {
      if (e.target.closest('.pasta-remover')) return
      // Chevron = só expandir/retrair. Nome/ícone = contexto bloco 2/3 (sem exigir expandir).
      if (e.target.closest('.chevron')) {
        if (state.carregandoNos.has(children)) return
        st.expandida = !st.expandida
        chev.classList.toggle('open', st.expandida)
        children.classList.toggle('open', st.expandida)
        header.setAttribute('aria-expanded', String(st.expandida))
        if (!st.expandida) return
        if (children.childElementCount > 0) return
        state.carregandoNos.add(children)
        try {
          await deps.carregarFilhos(p, children, 1)
        } finally {
          state.carregandoNos.delete(children)
        }
        return
      }
      deps.selecionarPasta(p)
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
  row.draggable = true
  row.tabIndex = -1
  row.setAttribute('role', 'treeitem')
  row.setAttribute('aria-expanded', 'false')
  const kids = document.createElement('div')
  kids.className = 'tree-children'
  let aberto = false
  let carregado = false
  row.addEventListener('click', async (e) => {
    e.stopPropagation()
    const rz = typeof deps.raizWorkspaceDe === 'function' ? deps.raizWorkspaceDe(ent.caminho) : null
    if (e.target.closest('.chevron')) {
      if (state.carregandoNos.has(kids)) return
      aberto = !aberto
      row.querySelector('.chevron').classList.toggle('open', aberto)
      kids.classList.toggle('open', aberto)
      row.setAttribute('aria-expanded', String(aberto))
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
      return
    }
    // Clique no nome da pasta: contexto do workspace (bloco 2/3), sem expandir
    if (rz && typeof deps.definirContextoPasta === 'function') deps.definirContextoPasta(rz)
    else if (rz && typeof deps.selecionarPasta === 'function') deps.selecionarPasta(rz)
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
  const amigavel =
    typeof deps.nomeAmigavelArquivo === 'function'
      ? deps.nomeAmigavelArquivo(ent.nome, rel)
      : ent.nome
  const mostrar = amigavel && amigavel !== ent.nome ? amigavel : ent.nome
  row.innerHTML =
    deps.extIcon(ent.nome) +
    '<span class="tree-file-name" title="' +
    escapar(ent.nome) +
    '">' +
    escapar(mostrar) +
    '</span>' +
    (amigavel && amigavel !== ent.nome
      ? '<span class="tree-file-real muted" title="Nome real">' + escapar(ent.nome) + '</span>'
      : '') +
    badgeGitHtml(st)
  row.title = ent.caminho + (amigavel && amigavel !== ent.nome ? ' · ' + ent.nome : '')
  row.dataset.path = ent.caminho
  row.dataset.tipo = 'file'
  row.draggable = true
  row.tabIndex = -1
  row.setAttribute('role', 'treeitem')
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
