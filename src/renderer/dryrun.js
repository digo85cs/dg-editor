/**
 * Dry-run antes de aplicar
 */
export function mostrarDryRun(propostas) {
  if (!propostas || !propostas.length) {
    alert('Nenhuma proposta para dry-run')
    return
  }
  const totalArquivos = new Set(propostas.map(p => p.path || p.absPath)).size
  const totalDiff = propostas.reduce((acc,p) => acc + (p.unifiedDiff||'').split('\n').length, 0)
  const modal = document.createElement('div')
  modal.className = 'modal'
  modal.innerHTML = `<div class="modal-box" style="max-width:500px">
    <h3>Dry-run (pré-aplicação)</h3>
    <p><strong>Arquivos:</strong> ${totalArquivos}</p>
    <p><strong>Linhas no diff:</strong> ${totalDiff}</p>
    <p class="muted">Revise no painel Diff antes de aplicar.</p>
    <div style="margin-top:12px;text-align:right">
      <button id="dry-close" class="btn-primary">Entendi</button>
    </div>
  </div>`
  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove() })
  modal.querySelector('#dry-close').addEventListener('click', () => modal.remove())
}
