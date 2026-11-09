(function () {
  const api = window.api || {}
  const $ = (id) => document.getElementById(id)
  let ultimo = null
  let verificando = false
  let pastaAtual = null

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function host() {
    return document.querySelector('#modal-config .modal-box, #modal-config') || document.body
  }

  function ensure() {
    if ($('dg-diagnostico')) return
    const box = document.createElement('section')
    box.id = 'dg-diagnostico'
    box.className = 'config-section dg-diag'
    box.setAttribute('aria-label', 'Diagnóstico do Sistema')
    box.innerHTML =
      '<div class="dg-diag__head">' +
        '<div><h4>Diagnóstico do Sistema</h4><p class="muted" style="margin:2px 0 0">Verificação do ambiente local (Ollama, disco, pasta, encoding, build).</p></div>' +
        '<button type="button" id="dg-diag-refresh" class="btn-small">Verificar novamente</button>' +
      '</div>' +
      '<div id="dg-diag-grid" class="dg-diag__grid" aria-live="polite"></div>' +
      '<div id="dg-diag-foot" class="dg-diag__foot muted" role="status"></div>'
    host().appendChild(box)
    $('dg-diag-refresh').addEventListener('click', () => { void verificar(true) })
    renderSkeleton()
  }

  function semaforo(ok) {
    if (ok === true) return { cls: 'ok', txt: 'OK', label: 'verde' }
    if (ok === false) return { cls: 'err', txt: 'Atenção', label: 'vermelho' }
    return { cls: 'warn', txt: 'Parcial', label: 'amarelo' }
  }

  function card(c) {
    const s = semaforo(c.ok)
    const acao = c.acao
      ? '<button type="button" class="btn-small dg-diag__acao" data-action="' + esc(c.action || '') + '" data-card="' + esc(c.id) + '">' + esc(c.acao) + '</button>'
      : ''
    return '<article class="dg-diag-card dg-diag-card--' + s.cls + '" aria-label="' + esc(c.titulo + ': ' + c.status) + '">' +
      '<div class="dg-diag-card__top"><span class="dg-diag-dot dg-diag-dot--' + s.cls + '" role="status" aria-label="Semáforo ' + s.label + '"></span><strong>' + esc(c.titulo) + '</strong></div>' +
      '<div class="dg-diag-card__status">' + esc(c.status) + '</div>' +
      (c.detalhe ? '<div class="dg-diag-card__det muted">' + esc(c.detalhe) + '</div>' : '') +
      acao +
      '</article>'
  }

  function renderSkeleton() {
    const grid = $('dg-diag-grid')
    if (!grid) return
    grid.innerHTML = ['Ollama', 'Licença/API', 'Disco', 'Pasta', 'Encoding', 'Build'].map((t) =>
      '<article class="dg-diag-card dg-diag-card--warn"><div class="dg-diag-card__top"><span class="dg-diag-dot dg-diag-dot--warn" role="status" aria-label="Carregando"></span><strong>' + t + '</strong></div><div class="dg-diag-card__status muted">Verificando…</div></article>'
    ).join('')
  }

  function cardsFrom(d) {
    const oll = d.ollama || {}
    const disc = d.disco || {}
    const perm = d.permissaoPasta || {}
    const enc = d.encoding || {}
    const build = d.build || {}
    return [
      { id: 'ollama', titulo: 'Ollama', ok: !!oll.ativo || !!d.llmApiKey, status: oll.ativo ? 'Ativo' : (d.llmApiKey ? 'Offline (API key disponível)' : 'Offline'), detalhe: (oll.modelos && oll.modelos.length ? 'Modelos: ' + oll.modelos.slice(0, 3).join(', ') : (oll.modeloEscolhido ? 'Modelo: ' + oll.modeloEscolhido : '')), acao: (!oll.ativo && oll.instalado && !d.llmApiKey) ? 'Iniciar Ollama' : '', action: 'ollama-start' },
      { id: 'licenca', titulo: 'Licença/API', ok: !!d.llmApiKey || !!oll.ativo, status: d.llmApiKey ? 'API key configurada' : (oll.ativo ? 'Ollama local ativo' : 'Sem LLM disponível'), detalhe: d.llmApiKey ? 'LLM_API_KEY/OPENAI_API_KEY presente.' : 'Configure uma API key ou inicie o Ollama.' },
      { id: 'disco', titulo: 'Disco', ok: !!disc.ok, status: typeof disc.espacoLivreMB === 'number' ? Math.round(disc.espacoLivreMB / 1024 * 10) / 10 + ' GB livres' : 'Indisponível', detalhe: typeof disc.espacoMinimoMB === 'number' ? 'Mínimo recomendado: ' + disc.espacoMinimoMB + ' MB.' : '' },
      { id: 'pasta', titulo: 'Pasta', ok: perm.pastaAtual ? !!perm.ok : null, status: perm.pastaAtual ? (perm.ok ? 'Acesso OK' : 'Sem permissão') : 'Nenhuma pasta atual', detalhe: perm.pastaAtual ? String(perm.pastaAtual) : 'Abra uma pasta no projeto.', acao: perm.pastaAtual && !perm.ok ? 'Escolher pasta' : '', action: 'folder-select' },
      { id: 'encoding', titulo: 'Encoding', ok: typeof enc.achados === 'number' ? enc.achados === 0 : !!enc.ok, status: typeof enc.achados === 'number' ? (enc.achados === 0 ? '0 achados' : enc.achados + ' achado(s)') : 'Indisponível', detalhe: enc.ok ? 'UTF-8 sem BOM.' : 'Execute: npm run verificar:encoding', acao: enc.achados > 0 ? 'Rever encoding' : '', action: 'encoding-info' },
      { id: 'build', titulo: 'Build', ok: !!build.ok, status: build.ok ? 'OK' : 'Não encontrado', detalhe: (build.versao ? 'v' + build.versao : '') + (build.timestamp ? ' · ' + new Date(build.timestamp).toLocaleString('pt-BR') : '') },
    ]
  }

  function render(d) {
    ultimo = d
    const grid = $('dg-diag-grid')
    if (grid) {
      grid.innerHTML = cardsFrom(d).map(card).join('')
      grid.querySelectorAll('.dg-diag__acao').forEach((btn) => btn.addEventListener('click', () => void acao(btn.dataset.action, btn.dataset.card)))
    }
    const foot = $('dg-diag-foot')
    if (foot) foot.textContent = 'Última verificação: ' + new Date().toLocaleString('pt-BR') + (d.build && d.build.versao ? ' · build v' + d.build.versao : '')
  }

  async function verificar(force) {
    ensure()
    if (verificando) return
    verificando = true
    if (force || !ultimo) renderSkeleton()
    try {
      const d = await api.invoke('deps:diagnostico', pastaAtual)
      render(d && typeof d === 'object' ? d : { llmApiKey: false, ollama: {}, disco: {}, permissaoPasta: {}, encoding: {}, build: {} })
    } catch (e) {
      render({ llmApiKey: false, ollama: { ok: false }, disco: { ok: false }, permissaoPasta: { ok: false, pastaAtual }, encoding: { ok: false, achados: -1 }, build: { ok: false, versao: '' } })
      const foot = $('dg-diag-foot')
      if (foot) foot.textContent = 'Falha ao verificar: ' + String(e && e.message ? e.message : e)
    } finally {
      verificando = false
    }
  }

  async function revalidarCard(id) {
    if (!id) return void verificar(false)
    await verificar(false)
  }

  async function acao(action, cardId) {
    try {
      if (action === 'ollama-start') {
        await api.invoke('deps:ollama:start')
      } else if (action === 'folder-select') {
        const r = await api.invoke('folder:select')
        if (r && !r.canceled && r.path) pastaAtual = r.path
      } else if (action === 'encoding-info') {
        const enc = ultimo && ultimo.encoding ? ultimo.encoding : {}
        const foot = $('dg-diag-foot')
        if (foot) foot.textContent = 'Encoding: ' + (typeof enc.achados === 'number' ? enc.achados : '?') + ' achado(s). Rode: npm run verificar:encoding (não executado automaticamente).'
        return
      }
    } catch { /* */ }
    await revalidarCard(cardId)
  }

  function onOpenConfig() {
    ensure()
    try { pastaAtual = (window.__DG_PASTA_ATUAL__ || window.pastaAtual || null) } catch { /* */ }
    void verificar(false)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { ensure(); })
  else ensure()

  const btn = $('btn-config')
  if (btn) btn.addEventListener('click', onOpenConfig)
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'btn-config') onOpenConfig() }, true)
})()
