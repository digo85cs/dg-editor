/**
 * Linha do tempo de checkpoints — restore em qualquer id (Parity v2).
 */
import { pastasPermitidas } from './features/arquivos/index.js'

export async function mostrarTimelineCheckpoint() {
  try {
    const r = await window.api.invoke('agente:checkpoint-listar', 20)
    const list = r?.checkpoints || []
    if (!list.length) {
      alert('Nenhum checkpoint disponível')
      return
    }
    const modal = document.createElement('div')
    modal.className = 'modal checkpoint-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Timeline de checkpoints')

    const box = document.createElement('div')
    box.className = 'modal-box checkpoint-modal-box'

    const title = document.createElement('h3')
    title.className = 'checkpoint-modal-title'
    title.textContent = 'Timeline de Checkpoints'
    box.appendChild(title)

    const lista = document.createElement('div')
    lista.className = 'checkpoint-list'
    for (const c of list) {
      const row = document.createElement('div')
      row.className = 'checkpoint-row'
      const info = document.createElement('div')
      info.className = 'checkpoint-row-info'
      const strong = document.createElement('strong')
      strong.textContent = c.origem || 'checkpoint'
      const meta = document.createElement('span')
      meta.className = 'muted'
      meta.textContent =
        new Date(c.criadoEm).toLocaleString() +
        ' · ' +
        (c.arquivos?.length || 0) +
        ' arquivo(s) · ' +
        String(c.id || '').slice(0, 12)
      info.appendChild(strong)
      info.appendChild(meta)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'btn-small'
      btn.textContent = 'Restaurar'
      btn.dataset.restore = c.id
      btn.addEventListener('click', async () => {
        const r2 = await window.api.invoke('agente:checkpoint-restaurar', btn.dataset.restore, pastasPermitidas())
        alert(r2?.ok ? 'Restaurado (' + r2.restaurados + ')' : 'Falha')
        modal.remove()
      })
      row.appendChild(info)
      row.appendChild(btn)
      lista.appendChild(row)
    }
    box.appendChild(lista)

    const foot = document.createElement('div')
    foot.className = 'checkpoint-modal-foot'
    const close = document.createElement('button')
    close.type = 'button'
    close.id = 'tl-close'
    close.className = 'btn-ghost'
    close.textContent = 'Fechar'
    close.addEventListener('click', () => modal.remove())
    foot.appendChild(close)
    box.appendChild(foot)

    modal.appendChild(box)
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove()
    })
  } catch (e) {
    console.warn(e)
  }
}
