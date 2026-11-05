/**
 * Linha do tempo de checkpoints
 */
export async function mostrarTimelineCheckpoint() {
  try {
    const r = await window.api.invoke('agente:checkpoint-listar', 20)
    const list = r?.checkpoints || []
    if (!list.length) {
      alert('Nenhum checkpoint disponível')
      return
    }
    const html = list.map((c, idx) => 
      `<div style="padding:6px 8px;border-bottom:1px solid var(--dg-border)">
        <strong>${c.origem}</strong> - ${new Date(c.criadoEm).toLocaleString()}<br/>
        <small>${c.arquivos.length} arquivo(s) | ID: ${c.id.slice(0,12)}</small>
        ${idx === 0 ? '<button data-restore="'+c.id+'" class="btn-small" style="margin-top:4px">Restaurar este</button>' : ''}
      </div>`
    ).join('')
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.innerHTML = `<div class="modal-box" style="max-width:500px;max-height:400px;overflow:auto">
      <h3>Timeline de Checkpoints</h3>
      ${html}
      <div style="margin-top:12px;text-align:right">
        <button id="tl-close" class="btn-ghost">Fechar</button>
      </div>
    </div>`
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove() })
    modal.querySelector('#tl-close').addEventListener('click', () => modal.remove())
    modal.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r2 = await window.api.invoke('agente:checkpoint-restaurar', btn.dataset.restore)
        alert(r2?.ok ? 'Restaurado ('+r2.restaurados+')' : 'Falha')
        modal.remove()
      })
    })
  } catch(e) {
    console.warn(e)
  }
}
