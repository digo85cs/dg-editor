import { state } from '../../state/app-state.js'
import { escapar } from '../../utils/dom.js'
import { caminhoSobPasta } from './recentes.js'

export function pastasPermitidas() {
  const s = new Set(state.pastasRecentes)
  if (state.vaultRaiz) s.add(state.vaultRaiz)
  return [...s]
}

/**
 * Carrega filhos de um diretório no container (DOM). Mantém contrato atual.
 * @param {string} dir
 * @param {HTMLElement} container
 * @param {number} nivel
 * @param {object} deps
 */
export async function carregarFilhos(dir, container, nivel, deps) {
  console.time('carregarFilhos')
  try {
    const r = await window.api.invoke('arquivo:listar', dir, pastasPermitidas())
    container.innerHTML = ''
    if (!r.ok) {
      const msg = escapar(r.erro || 'erro')
      const naoEncontrado = /diret[óo]rio n[ãa]o encontrado|ENOENT|not found/i.test(String(r.erro || ''))
      let acoes = ''
      if (naoEncontrado && state.pastasRecentes.includes(dir)) {
        acoes =
          ' <button type="button" class="btn-small pasta-acao-remover" data-path="' + escapar(dir) + '">Remover da lista</button>' +
          ' <button type="button" class="btn-small pasta-acao-reapontar" data-path="' + escapar(dir) + '">Escolher novo caminho</button>'
      }
      container.innerHTML =
        '<div class="muted" style="padding:4px 12px;font-size:11px">' + msg + acoes + '</div>'
      if (acoes) {
        container.querySelector('.pasta-acao-remover')?.addEventListener('click', (e) => {
          e.stopPropagation()
          void deps.removerPasta(dir, { skipConfirm: true })
        })
        container.querySelector('.pasta-acao-reapontar')?.addEventListener('click', (e) => {
          e.stopPropagation()
          void deps.escolherNovoCaminhoPasta(dir)
        })
      }
      return false
    }
    const st = state.estadoArvore.get(dir)
    if (st) st.filhosCarregados = true
    for (const ent of r.entradas || []) {
      if (ent.tipo === 'dir') {
        container.appendChild(deps.criarNoDir(ent, nivel))
      } else {
        container.appendChild(deps.criarNoFile(ent, nivel))
      }
    }
    return true
  } catch (e) {
    container.innerHTML =
      '<div class="muted" style="padding:4px 12px;font-size:11px">erro ao listar: ' +
      escapar(String(e && e.message ? e.message : e)) +
      '</div>'
    return false
  } finally {
    console.timeEnd('carregarFilhos')
  }
}

/** Exported for app.js orchestration that remains UI-coupled. */
export { caminhoSobPasta }
