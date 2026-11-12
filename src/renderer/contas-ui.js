/**
 * Contas vinculadas (Google, Microsoft, Apple, GitHub, Adapta) — multi-conta no modal Contas.
 */
(function () {
  const api = window.api
  if (!api || typeof api.invoke !== 'function') return

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function host() {
    return document.getElementById('contas-conectores')
  }

  async function statusTodos() {
    const [g, m, gh, a, ad, clients] = await Promise.all([
      api.invoke('auth:google:status').catch(() => ({ conectado: false })),
      api.invoke('auth:microsoft:status').catch(() => ({ conectado: false })),
      api.invoke('auth:github:status').catch(() => ({ conectado: false })),
      api.invoke('auth:apple:status').catch(() => ({ conectado: false })),
      api.invoke('auth:adapta:status').catch(() => ({ conectado: false })),
      api.invoke('auth:oauth-clients:get').catch(() => ({ ok: false }))
    ])
    return { g, m, gh, a, ad, clients: clients || {} }
  }

  function card(id, titulo, st, extrasHtml) {
    const ok = !!st.conectado
    const who = st.email || st.nome || st.usuario || ''
    const extras = Array.isArray(st.contas) && st.contas.length > 1
      ? '<div class="muted" style="font-size:11px;margin-top:4px">Contas: ' + esc(st.contas.join(', ')) + '</div>'
      : ''
    return (
      '<div class="conta-card" data-svc="' + id + '">' +
      '<div><b>' + esc(titulo) + '</b><div class="conta-status" id="st-' + id + '">' +
      (ok ? 'Conectado' + (who ? ' · ' + esc(who) : '') : 'Não conectado') +
      '</div>' + extras + (extrasHtml || '') + '</div>' +
      '<div class="conta-acoes">' +
      '<button type="button" class="btn-small btn-conn" data-conn="' + id + '"' + (ok && id !== 'apple' ? ' style="display:none"' : '') + '>' +
      (id === 'apple' ? 'Vincular' : ok ? 'Trocar' : 'Conectar') + '</button>' +
      '<button type="button" class="btn-small btn-disc" data-disc="' + id + '"' + (ok ? '' : ' style="display:none"') + '>Desconectar</button>' +
      '</div></div>'
    )
  }

  async function pintar() {
    const el = host()
    if (!el) return
    el.innerHTML = '<h4>Contas vinculadas</h4><p class="muted">Conecte 1 ou mais identidades (OAuth gratuito).</p>Carregando...'
    try {
      const s = await statusTodos()
      const c = s.clients
      el.innerHTML =
        '<h4>Contas</h4>' +
        '<p class="muted" style="margin-bottom:8px;font-size:12px">OAuth gratis · salve Client IDs abaixo.</p>' +
        card('google', 'Google', s.g) +
        card('microsoft', 'Microsoft / OneDrive', s.m) +
        card('apple', 'Apple ID', s.a) +
        card('github', 'GitHub', s.gh) +
        card('adapta', 'Adapta', s.ad) +
        '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--dg-border-subtle)">' +
        '<div class="muted" style="font-size:11px;margin-bottom:6px">OAuth Client IDs (gratis — app proprio)</div>' +
        '<label style="display:block;font-size:11px;margin:4px 0">Google <input id="oauth-google" class="whereis-input" style="width:100%" value="' + esc(c.googleClientId || '') + '" placeholder="xxx.apps.googleusercontent.com" /></label>' +
        '<label style="display:block;font-size:11px;margin:4px 0">Microsoft <input id="oauth-ms" class="whereis-input" style="width:100%" value="' + esc(c.microsoftClientId || '') + '" placeholder="Azure app client id" /></label>' +
        '<label style="display:block;font-size:11px;margin:4px 0">GitHub ID <input id="oauth-gh-id" class="whereis-input" style="width:100%" value="' + esc(c.githubClientId || '') + '" /></label>' +
        '<label style="display:block;font-size:11px;margin:4px 0">GitHub Secret <input id="oauth-gh-sec" class="whereis-input" type="password" style="width:100%" value="' + esc(c.githubClientSecret || '') + '" /></label>' +
        '<button type="button" class="btn-small" id="btn-oauth-salvar" style="margin-top:6px">Salvar Client IDs</button>' +
        '</div>'
      bind(el)
    } catch (e) {
      el.innerHTML = '<h4>Contas vinculadas</h4><span style="color:#f85149">' + esc(String(e)) + '</span>'
    }
  }

  function bind(el) {
    el.querySelectorAll('[data-conn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-conn')
        btn.disabled = true
        const old = btn.textContent
        btn.textContent = '...'
        try {
          let r
          if (id === 'google') r = await api.invoke('auth:google:conectar')
          else if (id === 'microsoft') r = await api.invoke('auth:microsoft:conectar')
          else if (id === 'github') r = await api.invoke('auth:github:conectar')
          else if (id === 'adapta') r = await api.invoke('auth:adapta:conectar')
          else if (id === 'apple') {
            const email = window.prompt('E-mail do Apple ID para vincular (pode repetir para varias contas):', '')
            if (!email) { btn.disabled = false; btn.textContent = old; return }
            r = await api.invoke('auth:apple:conectar', { email: email.trim() })
          }
          if (r && r.ok === false && window.dgToast) window.dgToast(r.erro || 'Falha ao conectar', 'erro')
          else if (r && r.ok && window.dgToast) window.dgToast('Conta conectada' + (r.email ? ': ' + r.email : ''), 'ok')
        } catch (e) {
          if (window.dgToast) window.dgToast(String(e), 'erro')
        }
        btn.disabled = false
        btn.textContent = old
        void pintar()
      })
    })
    el.querySelectorAll('[data-disc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-disc')
        try {
          if (id === 'google') await api.invoke('auth:google:desconectar')
          else if (id === 'microsoft') await api.invoke('auth:microsoft:desconectar')
          else if (id === 'github') await api.invoke('auth:github:desconectar')
          else if (id === 'adapta') await api.invoke('auth:adapta:desconectar')
          else if (id === 'apple') await api.invoke('auth:apple:desconectar')
          if (window.dgToast) window.dgToast('Desconectado', 'ok')
        } catch (e) {
          if (window.dgToast) window.dgToast(String(e), 'erro')
        }
        void pintar()
      })
    })
    el.querySelector('#btn-oauth-salvar')?.addEventListener('click', async () => {
      const r = await api.invoke('auth:oauth-clients:set', {
        googleClientId: document.getElementById('oauth-google')?.value || '',
        microsoftClientId: document.getElementById('oauth-ms')?.value || '',
        githubClientId: document.getElementById('oauth-gh-id')?.value || '',
        githubClientSecret: document.getElementById('oauth-gh-sec')?.value || ''
      })
      if (window.dgToast) window.dgToast(r?.ok ? 'Client IDs salvos' : (r?.erro || 'Falha'), r?.ok ? 'ok' : 'erro')
    })
  }

  window.dgPintarContasVinculadas = pintar
})()