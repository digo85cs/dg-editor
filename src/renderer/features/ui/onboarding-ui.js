// Wizard de primeiro acesso (onboarding). Extraido de extras-ui.js.
// Sem dependencias de outros modulos: usa apenas window.api + DOM.

export function ligarOnboarding() {
  const api = window.api
  if (!api?.invoke) return
  api
    .invoke('app:qa-mode')
    .then((qa) => (qa?.e2e ? null : api.invoke('onboarding:status')))
    .then((st) => {
      if (!st) return
      if (st?.temContasOuIas || (st?.completed && !st?.resetadoEm)) return
      if (!st?.primeiroAcesso && st?.completed) return
      criarOnboarding()
    })
    .catch(() => {
      /* IPC ausente: nao força */
    })
}

function criarOnboarding() {
  if (document.getElementById('onb-overlay')) return
  const overlay = document.createElement('div')
  overlay.id = 'onb-overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center'
  overlay.innerHTML =
    '<div class="onb-modal" style="background:var(--dg-surface);color:var(--dg-text);border-radius:12px;padding:20px;max-width:440px;width:90%;border:1px solid var(--dg-border)">' +
    '<div class="onb-header" style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><span class="onb-logo-wrap" style="display:inline-flex;align-items:center;background:#121214;border-radius:8px;padding:6px 12px;border:1px solid rgba(255,255,255,.06)"><img class="onb-logo" src="../../resources/logo-wide-lg.png" height="36" alt="DG Editor" style="display:block;object-fit:contain;max-width:220px" /></span><div><div class="muted" style="font-size:12px">Primeiro acesso</div></div></div>' +
    '<div class="onb-body" id="onb-body"></div>' +
    '<div class="onb-footer" style="display:flex;gap:8px;margin-top:16px"><button type="button" id="onb-prev" class="btn-ghost" hidden>Voltar</button><div style="flex:1"></div><button type="button" id="onb-next" class="btn-primary">Comecar</button></div>' +
    '</div>'
  document.body.appendChild(overlay)
  let step = 0
  const body = () => document.getElementById('onb-body')
  const nextBtn = () => document.getElementById('onb-next')
  const prevBtn = () => document.getElementById('onb-prev')
  async function salvarChavesOnboarding() {
    const api = window.api
    if (!api?.invoke) return
    const or = document.getElementById('onb-key-openrouter')?.value?.trim()
    const oa = document.getElementById('onb-key-openai')?.value?.trim()
    const gm = document.getElementById('onb-key-gemini')?.value?.trim()
    if (or) await api.invoke('providers:configurar', { id: 'openrouter-inkling', chave: or, ativo: true }).catch(() => {})
    if (oa) await api.invoke('providers:configurar', { id: 'openai', chave: oa, ativo: true }).catch(() => {})
    if (gm) await api.invoke('providers:configurar', { id: 'gemini-flash-lite', chave: gm, ativo: true }).catch(() => {})
  }
  function render() {
    if (step === 0) {
      body().innerHTML =
        '<h3>Bem-vindo</h3><p class="muted">Configure o ambiente em poucos passos. Contas, chaves de IA e layout ficam no perfil deste PC (sobrevivem a updates).</p>'
      nextBtn().textContent = 'Comecar'
      prevBtn().hidden = true
    } else if (step === 1) {
      body().innerHTML =
        '<h3>Chaves online (opcional)</h3>' +
        '<p class="muted" style="margin:0 0 10px">Cole agora para priorizar IAs online. Pode pular e configurar depois em Contas / Provedores.</p>' +
        '<label class="muted" style="font-size:12px">OpenRouter</label>' +
        '<input id="onb-key-openrouter" type="password" placeholder="sk-or-…" style="width:100%;margin:4px 0 10px;box-sizing:border-box" />' +
        '<label class="muted" style="font-size:12px">OpenAI</label>' +
        '<input id="onb-key-openai" type="password" placeholder="sk-…" style="width:100%;margin:4px 0 10px;box-sizing:border-box" />' +
        '<label class="muted" style="font-size:12px">Gemini</label>' +
        '<input id="onb-key-gemini" type="password" placeholder="AIza…" style="width:100%;margin:4px 0 4px;box-sizing:border-box" />'
      nextBtn().textContent = 'Continuar'
      prevBtn().hidden = false
    } else if (step === 2) {
      body().innerHTML =
        '<h3>Hardware</h3><p class="muted">O DG mede RAM/CPU e escolhe modelos locais e timeouts automaticamente (leve/medio/forte). Voce nao precisa configurar isso.</p>'
      nextBtn().textContent = 'Continuar'
      prevBtn().hidden = false
      window.api.invoke('hardware:atualizar').catch(() => {})
    } else {
      body().innerHTML =
        '<h3>Pronto</h3><p class="muted">Updates via GitHub Releases (Sobre → Update ou botão Update na barra). Em outro PC, o app instalado em Program Files baixa a versão nova sozinho. Export/import de perfil: Contas → Saúde.</p>'
      nextBtn().textContent = 'Abrir DG Editor'
      prevBtn().hidden = false
    }
  }
  nextBtn().onclick = async () => {
    if (step === 1) {
      try {
        await salvarChavesOnboarding()
      } catch {
        /* */
      }
    }
    if (step === 3) {
      try {
        await window.api.invoke('onboarding:concluir')
      } catch {
        /* */
      }
      overlay.remove()
      return
    }
    step++
    render()
  }
  prevBtn().onclick = () => {
    if (step > 0) {
      step--
      render()
    }
  }
  render()
}
