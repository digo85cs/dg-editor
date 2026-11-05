/**
 * UI para Custom Modes
 */
export async function initModesUI() {
  try {
    const r = await window.api.invoke('dg:modes:listar')
    const modos = r?.modos || []
    const sel = document.getElementById('agent-select') || document.getElementById('chat-agent-select')
    if (!sel) return
    // adicionar modos customizados
    for (const m of modos) {
      if ([...sel.options].find(o => o.value === m.id)) continue
      const opt = document.createElement('option')
      opt.value = m.id
      opt.textContent = m.nome
      opt.dataset.custom = '1'
      sel.appendChild(opt)
    }
  } catch(e) {
    console.warn('[modes-ui]', e)
  }
}
