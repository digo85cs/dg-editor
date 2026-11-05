/**
 * UI para gravar .dgrules da pasta aberta.
 */
export async function mostrarRegrasUI(raiz) {
  if (!raiz) {
    alert('Abra uma pasta de trabalho antes de editar as regras.')
    return
  }
  const modal = document.createElement('div')
  modal.className = 'modal'
  modal.innerHTML = `<div class="modal-box" style="max-width:640px;max-height:80vh;overflow:auto">
    <h3>Regras do projeto</h3>
    <p class="muted">Arquivo .dgrules na raiz aberta. O chat e o Agent leem este texto.</p>
    <textarea id="rules-text" style="width:100%;height:280px;font-family:monospace" placeholder="# Regras"></textarea>
    <p id="rules-status" class="muted"></p>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="rules-close" class="btn-ghost" type="button">Fechar</button>
      <button id="rules-save" class="btn-primary" type="button">Salvar .dgrules</button>
    </div>
  </div>`
  document.body.appendChild(modal)
  const box = modal.querySelector('#rules-text')
  const status = modal.querySelector('#rules-status')
  try {
    const atual = await window.api.invoke('rules:read', raiz)
    box.value = typeof atual === 'string' ? atual : ''
  } catch (e) {
    status.textContent = 'Nao foi possivel ler .dgrules.'
    console.warn(e)
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove()
  })
  modal.querySelector('#rules-close').addEventListener('click', () => modal.remove())
  modal.querySelector('#rules-save').addEventListener('click', async () => {
    const txt = box.value
    try {
      const r = await window.api.invoke('rules:write', raiz, txt)
      if (!r || r.ok === false) {
        status.textContent = 'Falha ao salvar: ' + (r && r.erro ? r.erro : 'resposta vazia')
        return
      }
      status.textContent = 'Salvo em .dgrules'
    } catch (e) {
      status.textContent = 'Falha ao salvar.'
      console.warn(e)
    }
  })
}
