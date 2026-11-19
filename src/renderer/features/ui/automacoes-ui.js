// Secao "Automacoes" do painel Contas: jobs do agendador + credenciais (cofre).
// Extraida de extras-ui.js. Recebe garantirSecao injetada para nao duplicar hostContas.
import { state } from '../../state/app-state.js'

export async function pintarAutomacoes(garantirSecao) {
  const sec = garantirSecao('automacoes-section', 'Automações')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML =
    '<div class="muted" style="font-size:11px;margin-bottom:6px">Jobs agendados (prompt recorrente no chat)</div>' +
    '<div id="agendador-list" class="lista muted">Carregando…</div>' +
    '<div id="agendador-form" style="display:flex;gap:6px;margin:6px 0;flex-wrap:wrap"></div>' +
    '<div class="muted" style="font-size:11px;margin:10px 0 6px">Credenciais (cofre local — valores nunca exibidos)</div>' +
    '<div id="credenciais-list" class="lista muted">Carregando…</div>' +
    '<div id="credenciais-form" style="display:flex;gap:6px;margin:6px 0;flex-wrap:wrap"></div>'

  // ---- Agendador ----
  const lista = document.getElementById('agendador-list')
  const form = document.getElementById('agendador-form')
  const raizAtual = () => state.pastaAtual || state.pastasRecentes?.[0] || ''
  const pintarJobs = async () => {
    if (!lista) return
    try {
      const r = await window.api.invoke('agendador:listar')
      const itens = r?.itens || []
      lista.innerHTML = ''
      if (!itens.length) {
        lista.textContent = 'Nenhum job agendado'
        return
      }
      for (const j of itens) {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:4px 0;font-size:12px'
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = j.ativo !== false
        cb.title = 'Ativar/desativar'
        cb.addEventListener('change', async () => {
          await window.api.invoke('agendador:alternar', { id: j.id })
        })
        const txt = document.createElement('span')
        txt.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
        txt.textContent = (j.prompt || '') + ' · a cada ' + (j.cadaMin || '?') + 'min'
        const btn = document.createElement('button')
        btn.className = 'btn-mini'
        btn.textContent = 'Remover'
        btn.addEventListener('click', async () => {
          await window.api.invoke('agendador:remover', { id: j.id })
          void pintarJobs()
        })
        row.appendChild(cb); row.appendChild(txt); row.appendChild(btn)
        lista.appendChild(row)
      }
    } catch {
      lista.textContent = 'Agendador indisponível'
    }
  }
  if (form) {
    const inpPrompt = document.createElement('input')
    inpPrompt.placeholder = 'Prompt recorrente…'
    inpPrompt.style.cssText = 'flex:2;min-width:160px'
    const inpMin = document.createElement('input')
    inpMin.type = 'number'
    inpMin.min = '5'
    inpMin.value = '60'
    inpMin.title = 'Intervalo em minutos (mín. 5)'
    inpMin.style.cssText = 'width:70px'
    const btnAdd = document.createElement('button')
    btnAdd.className = 'btn-mini'
    btnAdd.textContent = 'Agendar'
    btnAdd.addEventListener('click', async () => {
      const prompt = inpPrompt.value.trim()
      const raiz = raizAtual()
      if (!prompt || !raiz) {
        if (window.dgToast) window.dgToast('Defina prompt e uma pasta ativa', 'aviso')
        return
      }
      const r = await window.api.invoke('agendador:adicionar', {
        prompt, raiz, cadaMin: Number(inpMin.value) || 60
      })
      if (r?.ok) { inpPrompt.value = ''; void pintarJobs() }
      else if (window.dgToast) window.dgToast('Falha ao agendar: ' + (r?.erro || ''), 'erro')
    })
    form.appendChild(inpPrompt); form.appendChild(inpMin); form.appendChild(btnAdd)
  }
  void pintarJobs()

  // ---- Credenciais ----
  const clista = document.getElementById('credenciais-list')
  const cform = document.getElementById('credenciais-form')
  const pintarCreds = async () => {
    if (!clista) return
    try {
      const r = await window.api.invoke('credenciais:listar')
      const itens = r?.itens || []
      clista.innerHTML = ''
      if (!itens.length) {
        clista.textContent = 'Nenhuma credencial configurada'
        return
      }
      for (const id of itens) {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:4px 0;font-size:12px'
        const nome = document.createElement('code')
        nome.textContent = id
        nome.style.flex = '1'
        const btn = document.createElement('button')
        btn.className = 'btn-mini'
        btn.textContent = 'Remover'
        btn.addEventListener('click', async () => {
          await window.api.invoke('credenciais:remover', { id })
          void pintarCreds()
        })
        row.appendChild(nome); row.appendChild(btn)
        clista.appendChild(row)
      }
    } catch {
      clista.textContent = 'Credenciais indisponíveis'
    }
  }
  if (cform) {
    const inpId = document.createElement('input')
    inpId.placeholder = 'ID (ex.: devin, openrouter)'
    inpId.style.cssText = 'flex:1;min-width:140px'
    const inpChave = document.createElement('input')
    inpChave.type = 'password'
    inpChave.placeholder = 'Valor (não exibido depois)'
    inpChave.style.cssText = 'flex:2;min-width:160px'
    const btnAdd = document.createElement('button')
    btnAdd.className = 'btn-mini'
    btnAdd.textContent = 'Salvar'
    btnAdd.addEventListener('click', async () => {
      const id = inpId.value.trim()
      const chave = inpChave.value
      if (!id || !chave) return
      const r = await window.api.invoke('credenciais:definir', { id, chave })
      if (r?.ok) { inpId.value = ''; inpChave.value = ''; void pintarCreds() }
      else if (window.dgToast) window.dgToast('Falha: ' + (r?.erro || ''), 'erro')
    })
    cform.appendChild(inpId); cform.appendChild(inpChave); cform.appendChild(btnAdd)
  }
  void pintarCreds()
}
