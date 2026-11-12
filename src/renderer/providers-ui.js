/**
 * UI de configuracao de provedores de IA (FASE 3).
 * Segue o padrao de contas-ui.js / modes-ui.js: modulo JS puro, autocontido,
 * consome apenas canais IPC da camada principal (sem logica de negocio).
 * Textos em pt-BR.
 */
(function () {
  const api = window.api || {};
  let modal = null;
  let btnAbrir = null;

  function esc(texto) {
    const d = document.createElement('div');
    d.textContent = texto == null ? '' : String(texto);
    return d.innerHTML;
  }

  function criacaoModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'modal-provedores';
    modal.className = 'modal modal-float hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'modal-provedores-title');
    modal.innerHTML =
      '<div class="modal-box" data-float-box>' +
      '<header class="modal-titlebar" data-float-handle>' +
      '<h3 id="modal-provedores-title">Provedores de IA</h3>' +
      '<button type="button" id="btn-provedores-x" class="btn-icon modal-titlebar-close" title="Fechar" aria-label="Fechar provedores de IA">×</button>' +
      '</header>' +
      '<div class="modal-body config-body" style="max-width:720px">' +
      '<p id="providers-sync-banner" class="prov-sync-banner" aria-live="polite"></p>' +
      '<div class="prov-toolbar">' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px">' +
      '<input type="checkbox" id="filtro-so-disponiveis"> Só disponíveis' +
      '</label>' +
      '<span style="flex:1"></span>' +
      '<button type="button" id="btn-provedores-sync" class="btn-small">Sincronizar env</button>' +
      '<button type="button" id="btn-provedores-testar-todos" class="btn-small">Testar IAs</button>' +
      '</div>' +
      '<div class="config-section">' +
      '<h4>Fila de provedores</h4>' +
      '<div id="providers-fila"></div>' +
      '</div>' +
      '<div class="config-section">' +
      '<h4>Configurar chaves</h4>' +
      '<div id="providers-config"></div>' +
      '</div>' +
      '<div class="config-section">' +
      '<h4>Cotas / esgotamentos</h4>' +
      '<div style="margin-bottom:8px;padding:8px;border:1px solid var(--dg-border-subtle);border-radius:6px;background:var(--dg-sidebar)">' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px">' +
      '<input type="checkbox" id="toggle-permitir-pago"> Permitir pagos (tier 2)' +
      '<span style="margin-left:auto;font-weight:normal;color:var(--dg-text-muted);font-size:11px">Desligado por padrão</span>' +
      '</label>' +
      '<div style="margin-top:6px">' +
       '<label style="display:flex;align-items:center;gap:8px;font-size:12px">Teto diário (USD): ' +
       '<input type="number" id="teto-diario" min="0" step="0.01" style="width:100px" placeholder="sem teto"> ' +
       '<span id="teto-aviso" style="font-size:11px;color:#b45309;margin-left:8px;display:none">O teto só protege provedores com preço conhecido.</span>' +
       '</label>' +
      '</div>' +
      '<div id="gasto-hoje" style="margin-top:8px;font-family:var(--fonte-mono);font-size:12px"></div>' +
      '</div>' +
      '<div id="providers-cotas"></div>' +
      '</div>' +
      '<div class="config-actions config-actions--footer">' +
      '<button type="button" id="btn-provedores-fechar" class="btn-ghost">Fechar</button>' +
      '</div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('btn-provedores-x').onclick = fechar;
    document.getElementById('btn-provedores-fechar').onclick = fechar;
    document.getElementById('btn-provedores-sync').onclick = async () => {
      const btn = document.getElementById('btn-provedores-sync');
      if (btn) { btn.disabled = true; btn.textContent = 'Sync…'; btn.classList.add('is-loading'); }
      try {
        const r = await api.invoke('providers:sincronizar-env');
        const n = (r && r.gravadas && r.gravadas.length) || 0;
        const ja = (r && r.jaTinham && r.jaTinham.length) || 0;
        const banner = document.getElementById('providers-sync-banner');
        if (banner) banner.textContent = 'Sync: ' + n + ' novas · ' + ja + ' já ok';
        mostrarToast('Sync: ' + n + ' novas · ' + ja + ' já ok', r && r.ok === false ? 'erro' : 'ok');
        void render();
      } catch (e) {
        mostrarToast('Falha no sync: ' + String(e), 'erro');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar env'; btn.classList.remove('is-loading'); }
    };
    const filtro = document.getElementById('filtro-so-disponiveis');
    if (filtro) filtro.onchange = () => void render();
    document.getElementById('btn-provedores-testar-todos').onclick = async () => {
      const btn = document.getElementById('btn-provedores-testar-todos');
      if (btn) { btn.disabled = true; btn.textContent = 'Testando…'; }
      try {
        const r = await api.invoke('providers:testar-todos');
        mostrarToast(
          'Teste: ' + (r.okN || 0) + ' ok · ' + (r.falhas || 0) + ' falha(s)',
          (r.falhas || 0) > 0 ? 'erro' : 'ok'
        );
        void render();
      } catch (e) {
        mostrarToast('Falha nos testes: ' + String(e), 'erro');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Testar IAs'; }
    };
    modal.onclick = (ev) => { if (ev.target === modal) fechar(); };

    // Guardrail de custo: toggle permitir pago + teto diario
    const togglePago = document.getElementById('toggle-permitir-pago');
    const tetoInput = document.getElementById('teto-diario');
    if (togglePago) {
      togglePago.onchange = async () => {
        try {
          await api.invoke('providers:permitir-pago', { v: togglePago.checked });
          render();
        } catch (e) { mostrarToast('Erro ao alterar guardrail: ' + String(e), 'erro'); }
      };
    }
    if (tetoInput) {
      tetoInput.onchange = async () => {
        const v = tetoInput.value.trim();
        const teto = v === '' ? undefined : Number(v);
        if (isNaN(teto)) return;
        try {
          await api.invoke('providers:teto-diario', { teto });
          render();
        } catch (e) { mostrarToast('Erro ao definir teto: ' + String(e), 'erro'); }
      };
    }

    return modal;
  }

  function abrir() {
    if (!modal) criacaoModal();
    modal.classList.remove('hidden');
    modal.hidden = false;
    void api.invoke('providers:sincronizar-env').catch(() => null).then(() => render());
  }

  function fechar() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.hidden = true;
  }

  window.dgAbrirProvedores = abrir;

  function badgeTier(tier) {
    const cores = { 1: '#1e5a32', 2: '#5a4a1e', 3: '#6b1e1e' };
    const rotulos = { 1: 'gratuito', 2: 'pago', 3: 'local' };
    const cor = cores[tier] || '#555';
    return '<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:11px;background:' + cor + ';color:#fff">' + (rotulos[tier] || 'tier ' + tier) + '</span>';
  }

  function badgeDisponivel(it) {
    const motivo = (it && it.motivo) || (it && it.disponivel ? 'ok' : 'sem-chave');
    const map = {
      ok: ['#1e5a32', 'disponível'],
      local: ['#1e5a32', 'local ok'],
      'sem-chave': ['#8b1e1e', 'sem chave'],
      'chave-invalida': ['#9a3412', 'chave inválida'],
      esgotado: ['#854d0e', 'cota esgotada'],
      desativado: ['#666', 'desativado']
    };
    const [cor, lab] = map[motivo] || ['#6b1e1e', it && it.disponivel ? 'disponível' : 'indisponível'];
    const lat = it && it.latenciaMs != null ? ' · ' + it.latenciaMs + 'ms' : '';
    return '<span style="color:' + cor + '">● ' + lab + lat + '</span>';
  }

  async function renderFila(fila) {
    const el = document.getElementById('providers-fila');
    if (!el) return;
    if (!Array.isArray(fila) || fila.length === 0) {
      el.innerHTML = '<p class="muted">Nenhum provedor na fila.</p>';
      return;
    }
    const soDisp = !!(document.getElementById('filtro-so-disponiveis') || {}).checked;
    const lista = soDisp
      ? fila.filter((it) => {
          const m = (it && it.motivo) || (it && it.disponivel ? 'ok' : 'sem-chave');
          return m === 'ok' || m === 'local';
        })
      : fila;
    if (!lista.length) {
      el.innerHTML = '<p class="muted">Nenhum provedor disponível com o filtro atual.</p>';
      return;
    }
    let html = '<div class="prov-list">';
    for (const it of lista) {
      const motivo = (it && it.motivo) || (it && it.disponivel ? 'ok' : 'sem-chave');
      html +=
        '<div class="prov-row" data-motivo="' + esc(motivo) + '">' +
        '<div class="prov-row-bar" aria-hidden="true"></div>' +
        '<div class="prov-row-main">' +
        '<div class="prov-row-title">' + esc(it.id) + ' ' + badgeTier(it.tier) + '</div>' +
        '<div class="prov-row-meta">#' + esc(it.ordem) + ' · ' + esc(it.modelo || '—') + '</div>' +
        '<div style="margin-top:4px">' + badgeDisponivel(it) + '</div>' +
        '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  async function renderConfig(providers) {
    const el = document.getElementById('providers-config');
    if (!el) return;
    let html = '<p class="muted" style="margin-bottom:8px">Chaves no cofre local — nunca exibidas depois de salvas.</p>';
    for (const p of providers) {
      const temChave = p.chaveConfigurada;
      html +=
        '<div class="prov-config-row">' +
        '<div><b>' + esc(p.label) + '</b><div class="muted" style="font-size:11px">' + esc(p.id) +
        (p.ativo === false ? ' · desativado' : '') +
        (temChave ? ' · chave ok' : ' · sem chave') +
        '</div></div>' +
        '<div>' +
        '<input type="password" id="pk-' + esc(p.id) + '" placeholder="' +
        (temChave ? 'Já configurada — cole para trocar' : 'Cole a chave') +
        '" autocomplete="off">' +
        '<label style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:11px">' +
        '<input type="checkbox" id="atv-' + esc(p.id) + '" ' + (p.ativo !== false ? 'checked' : '') + '> Ativo</label>' +
        '</div>' +
        '<div class="prov-row-actions">' +
        '<button type="button" class="btn-small btn-provedores-testar" data-id="' + esc(p.id) + '">Testar</button>' +
        '<button type="button" class="btn-small btn-provedores-salvar" data-id="' + esc(p.id) + '">Salvar</button>' +
        '</div></div>';
    }
    el.innerHTML = html;

    el.querySelectorAll('.btn-provedores-testar').forEach((b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-id');
        b.disabled = true;
        b.textContent = 'Testando…';
        try {
          const r = await api.invoke('providers:testar', { id });
          if (r.ok) mostrarToast('Teste OK: ' + id + ' (' + r.latenciaMs + ' ms)', 'ok');
          else mostrarToast('Falha no teste ' + id + ': ' + (r.erro || ''), 'erro');
        } catch (e) {
          mostrarToast('Erro ao testar ' + id + ': ' + String(e), 'erro');
        } finally {
          b.disabled = false;
          b.textContent = 'Testar';
        }
      };
    });
    el.querySelectorAll('.btn-provedores-salvar').forEach((b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-id');
        const chaveEl = document.getElementById('pk-' + esc(id));
        const atvEl = document.getElementById('atv-' + esc(id));
        const chave = chaveEl ? chaveEl.value : undefined;
        const ativo = atvEl ? atvEl.checked : true;
        try {
          const r = await api.invoke('providers:configurar', { id, chave, ativo });
          if (r.ok) {
            mostrarToast('Salvo: ' + id, 'ok');
            render();
          } else mostrarToast('Falha ao salvar ' + id + ': ' + (r.erro || ''), 'erro');
        } catch (e) {
          mostrarToast('Erro ao salvar ' + id + ': ' + String(e), 'erro');
        }
      };
    });
  }

  function formatarData(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { hour12: false }); } catch { return iso; }
  }

  async function renderCotas(cotas) {
    const el = document.getElementById('providers-cotas');
    if (!el) return;
    if (!Array.isArray(cotas) || cotas.length === 0) {
      el.innerHTML = '<p class="muted">Nenhum esgotamento de cota no momento.</p>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
      '<th style="text-align:left">Provedor</th>' +
      '<th style="text-align:left">Modelo</th>' +
      '<th style="text-align:left">Esgotado até</th>' +
      '<th style="text-align:left">Motivo</th>' +
      '<th style="text-align:left">Ocorrências</th>' +
      '<th style="text-align:left">Ação</th>' +
      '</tr></thead><tbody>';
    for (const c of cotas) {
      html += '<tr>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #ddd">' + esc(c.providerId) + '</td>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #ddd;font-family:monospace,monospace;font-size:12px">' + esc(c.modelo || '—') + '</td>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #ddd">' + formatarData(c.esgotadoAte) + '</td>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #ddd">' + esc(c.motivo || '—') + '</td>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #ddd">' + esc(c.ocorrencias || 0) + '</td>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #ddd">' +
        '<button type="button" class="btn-small btn-provedores-resetar" data-id="' + esc(c.providerId) + '">Resetar</button>' +
        '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    el.querySelectorAll('.btn-provedores-resetar').forEach((b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-id');
        try {
          const r = await api.invoke('providers:resetar', { id });
          if (r.ok) { mostrarToast('Cota resetada: ' + id, 'ok'); render(); }
          else mostrarToast('Falha ao resetar ' + id + ': ' + (r.erro || ''), 'erro');
        } catch (e) {
          mostrarToast('Erro ao resetar ' + id + ': ' + String(e), 'erro');
        }
      };
    });
  }

  async function renderGasto(gasto) {
    const el = document.getElementById('gasto-hoje');
    const toggle = document.getElementById('toggle-permitir-pago');
    const tetoInput = document.getElementById('teto-diario');
    const tetoAviso = document.getElementById('teto-aviso');
    if (!el) return;

    // Atualiza toggle
    if (toggle) {
      // Ler estado atual via IPC nao e necessario aqui; o toggle reflete a ultima acao do usuario
      // Mas para consistencia, nao forçamos o estado do toggle a partir do gasto
    }
    if (tetoInput) {
      tetoInput.value = (gasto && typeof gasto.teto === 'number') ? gasto.teto : '';
    }

    // Mostra/oculta aviso sobre teto nao cobrir providers sem preco
    if (tetoAviso) {
      const temTeto = gasto && typeof gasto.teto === 'number';
      const naoRastreados = gasto && Array.isArray(gasto.naoRastreados) ? gasto.naoRastreados : [];
      tetoAviso.style.display = (temTeto && naoRastreados.length > 0) ? '' : 'none';
    }

    if (!gasto) {
      el.innerHTML = '<span style="color:#666">Hoje: sem dados</span>';
      return;
    }

    const usd = typeof gasto.usd === 'number' ? gasto.usd : 0;
    const teto = typeof gasto.teto === 'number' ? gasto.teto : null;
    const naoRastreados = Array.isArray(gasto.naoRastreados) ? gasto.naoRastreados : [];
    const temPorProvider = gasto.porProvider && typeof gasto.porProvider === 'object';
    const trackedProviders = temPorProvider ? Object.entries(gasto.porProvider).filter(([, v]) => v && v > 0) : [];

    const todosNaoRastreados = naoRastreados.length > 0 && trackedProviders.length === 0;
    const haMistura = naoRastreados.length > 0 && trackedProviders.length > 0;

    // Formata valor rastreado: 2 casas se >= 0.01, 4 casas se > 0 e < 0.01 (evita $0,00 enganoso)
    let usdStr;
    if (usd > 0 && usd < 0.01) {
      usdStr = '$' + usd.toFixed(4);
    } else {
      usdStr = '$' + usd.toFixed(2);
    }

    if (todosNaoRastreados) {
      el.innerHTML = '<strong>Hoje:</strong> <span style="color:#b45309">Gasto não rastreado — ' + naoRastreados.length + ' provedor(es) sem preço configurado</span>';
      return;
    }

    let html = '<strong>Hoje:</strong> ' + usdStr;
    let tetoAviso80 = '';
    if (teto !== null) {
      html += ' / teto $' + teto.toFixed(2);
      if (usd > 0 && teto > 0 && usd / teto >= 0.8) {
        tetoAviso80 = ' <span style="color:#b45309">Teto a ' + Math.round((usd / teto) * 100) + '% — gasto $' + usd.toFixed(4) + ' de $' + teto.toFixed(2) + '</span>';
      }
    } else {
      html += ' / teto sem teto';
    }

    if (haMistura) {
      html += ' <span style="color:#b45309">+ ' + naoRastreados.length + ' provedor(es) sem preço</span>';
    }

    if (tetoAviso80) html += tetoAviso80;

    if (trackedProviders.length > 0) {
      html += ' | por provider: ' + trackedProviders.map(([id, v]) => {
        const vv = Number(v);
        const vStr = vv > 0 && vv < 0.01 ? vv.toFixed(4) : vv.toFixed(2);
        return esc(id) + ' $' + vStr;
      }).join(', ');
    }

    el.innerHTML = html;
  }

  async function render() {
    let fila = [], providers = [], cotas = [], gasto = null;
    try {
      const rFila = await api.invoke('providers:fila');
      fila = rFila && rFila.fila ? rFila.fila : [];
    } catch {}
    try {
      const rList = await api.invoke('providers:listar');
      providers = rList && rList.providers ? rList.providers : [];
    } catch {}
    try {
      const rCotas = await api.invoke('providers:cotas');
      cotas = rCotas && rCotas.cotas ? rCotas.cotas : [];
    } catch {}
    try {
      const rGasto = await api.invoke('providers:gasto');
      gasto = rGasto && rGasto.ok ? { usd: rGasto.usd, teto: rGasto.teto, porProvider: rGasto.porProvider, naoRastreados: rGasto.naoRastreados } : null;
    } catch {}
    renderFila(fila);
    renderConfig(providers);
    renderCotas(cotas);
    renderGasto(gasto);
  }

  function mostrarToast(mensagem, tipo) {
    if (typeof window.dgToast === 'function') window.dgToast(mensagem, tipo);
  }

  if (typeof api.on === 'function') {
    api.on('brain:cota', (_evt, payload) => {
      const st = payload && payload.status;
      if (Array.isArray(st)) renderCotas(st);
      const g = payload && payload.gasto;
      if (g) renderGasto(g);
    });
  }

  function init() {
    const ref = document.getElementById('btn-config');
    if (!ref || !ref.parentNode) return;
    if (document.getElementById('btn-provedores-ia')) {
      btnAbrir = document.getElementById('btn-provedores-ia');
      btnAbrir.onclick = abrir;
      return;
    }
    btnAbrir = document.createElement('button');
    btnAbrir.id = 'btn-provedores-ia';
    btnAbrir.type = 'button';
    btnAbrir.className = 'btn-ghost';
    btnAbrir.title = 'Provedores de IA';
    btnAbrir.textContent = 'Provedores IA';
    ref.parentNode.insertBefore(btnAbrir, ref);
    btnAbrir.onclick = abrir;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
