/**
 * Liga UIs extras no painel Contas (skills, MCP presets, auditoria, modos, onboarding).
 * Substitui os IIFEs quebrados (template string) por montagem segura.
 */
import { initModesUI } from './modes-ui.js'

function hostContas() {
  return (
    document.getElementById('contas-diagnostico')?.parentElement ||
    document.querySelector('#modal-contas .config-body') ||
    document.getElementById('modal-contas') ||
    document.body
  )
}

function garantirSecao(id, titulo) {
  let el = document.getElementById(id)
  if (el) return el
  el = document.createElement('div')
  el.id = id
  el.className = 'config-section'
  el.innerHTML = '<h4>' + titulo + '</h4><div class="extras-corpo"></div>'
  hostContas()?.appendChild(el)
  return el
}

async function pintarSkills() {
  const sec = garantirSecao('skills-hub-section', 'Skills Hub')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML =
    '<button type="button" class="btn-small" id="skills-importar">Importar SKILL.md</button>' +
    '<div id="skills-list" class="lista muted" style="margin-top:8px">Carregando…</div>'
  document.getElementById('skills-importar')?.addEventListener('click', async () => {
    const txt = window.prompt('Cole o conteudo do SKILL.md')
    if (!txt) return
    const nome = window.prompt('Nome (opcional)') || ''
    try {
      await window.api.invoke('dg:skills:importar', txt, nome)
      await pintarSkills()
    } catch (e) {
      console.warn(e)
    }
  })
  try {
    const res = await window.api.invoke('dg:skills:listar')
    const list = document.getElementById('skills-list')
    const itens = res?.skills || []
    if (!list) return
    if (!itens.length) {
      list.textContent = 'Nenhum skill em .kilo/skills ou .agents/skills'
      return
    }
    list.innerHTML = ''
    for (const s of itens) {
      const row = document.createElement('div')
      row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--dg-border-subtle)'
      row.innerHTML =
        '<strong></strong> <small class="muted"></small><div class="muted" style="font-size:11px"></div>'
      row.querySelector('strong').textContent = s.nome || s.id
      row.querySelector('small').textContent = '[' + (s.origem || '') + ']'
      row.querySelector('div').textContent = (s.descricao || '').slice(0, 120)
      list.appendChild(row)
    }
  } catch (e) {
    const list = document.getElementById('skills-list')
    if (list) list.textContent = 'Falha ao listar skills'
    console.warn('[skills-hub]', e)
  }
}

async function pintarMcpPresets() {
  const sec = garantirSecao('mcp-presets-section', 'Presets de MCP')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML = '<div id="mcp-presets-list" class="lista muted">Carregando…</div>'
  try {
    const res = await window.api.invoke('dg:mcp-presets:listar')
    const list = document.getElementById('mcp-presets-list')
    const itens = res?.presets || []
    if (!list) return
    if (!itens.length) {
      list.textContent = 'Sem presets'
      return
    }
    list.innerHTML = ''
    for (const p of itens) {
      const row = document.createElement('label')
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:6px 0;cursor:pointer'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = p.ativo !== false
      cb.addEventListener('change', async () => {
        p.ativo = cb.checked
        await window.api.invoke('dg:mcp-presets:salvar', itens)
      })
      const txt = document.createElement('div')
      txt.innerHTML = '<strong></strong><div class="muted" style="font-size:11px"></div>'
      txt.querySelector('strong').textContent = p.nome || p.id
      txt.querySelector('div').textContent = p.descricao || ''
      row.appendChild(cb)
      row.appendChild(txt)
      list.appendChild(row)
    }
  } catch (e) {
    console.warn('[mcp-presets]', e)
  }
}

async function pintarAuditoria() {
  const sec = garantirSecao('auditoria-section', 'Auditoria rapida')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML = '<div id="auditoria-resumo" class="muted">Carregando…</div>'
  try {
    const imp = await window.api.invoke('auditoria:imports')
    const r = document.getElementById('auditoria-resumo')
    if (!r) return
    const qi = imp?.resumo?.quebrados?.length || 0
    const total = imp?.resumo?.total || 0
    r.textContent =
      'Integracao: ' + total + ' checagens · erros: ' + qi + (qi ? ' (veja Conectores/Diagnostico)' : ' — ok')
  } catch (e) {
    const r = document.getElementById('auditoria-resumo')
    if (r) r.textContent = 'Auditoria indisponivel'
    console.warn('[auditoria-ui]', e)
  }
}

function ligarOnboarding() {
  const api = window.api
  if (!api?.invoke) return
  api
    .invoke('onboarding:status')
    .then((st) => {
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


async function pintarSimbolos() {
  const sec = garantirSecao('simbolos-section', 'Simbolos do codigo')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML =
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<input id="simbolos-q" placeholder="Nome do simbolo…" style="flex:1;min-width:120px" />' +
    '<button type="button" class="btn-small" id="simbolos-buscar">Buscar</button>' +
    '<button type="button" class="btn-small" id="simbolos-indexar">Indexar</button></div>' +
    '<div id="simbolos-list" class="muted" style="margin-top:8px;max-height:160px;overflow:auto"></div>'
  const raiz = () => window.__DG_PASTA_ATUAL__ || null
  document.getElementById('simbolos-indexar')?.addEventListener('click', async () => {
    const r = raiz()
    const list = document.getElementById('simbolos-list')
    if (!r) { if (list) list.textContent = 'Abra uma pasta primeiro'; return }
    if (list) list.textContent = 'Indexando…'
    try {
      const res = await window.api.invoke('simbolos:indexar', r)
      if (list) list.textContent = res?.ok
        ? ('Indexado: ' + (res.total || res.n || res.count || 'ok'))
        : ('Falha: ' + (res?.erro || ''))
    } catch (e) { if (list) list.textContent = String(e) }
  })
  document.getElementById('simbolos-buscar')?.addEventListener('click', async () => {
    const r = raiz()
    const q = document.getElementById('simbolos-q')?.value?.trim()
    const list = document.getElementById('simbolos-list')
    if (!r || !q) { if (list) list.textContent = 'Informe pasta + nome'; return }
    try {
      const res = await window.api.invoke('simbolos:buscar', r, q)
      const itens = res?.simbolos || res?.itens || res?.resultados || []
      if (!list) return
      if (!itens.length) { list.textContent = 'Nenhum simbolo'; return }
      list.innerHTML = ''
      for (const s of itens.slice(0, 40)) {
        const d = document.createElement('div')
        d.style.cssText = 'padding:4px 0;font-size:12px;border-bottom:1px solid var(--dg-border-subtle)'
        d.textContent = (s.nome || s.name || q) + ' — ' + (s.arquivo || s.path || '') + (s.linha ? ':' + s.linha : '')
        list.appendChild(d)
      }
    } catch (e) { if (list) list.textContent = String(e) }
  })
}

async function pintarRota() {
  const sec = garantirSecao('rota-section', 'Roteador de agente')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML =
    '<textarea id="rota-txt" rows="2" style="width:100%" placeholder="Cole um pedido para ver a rota sugerida…"></textarea>' +
    '<button type="button" class="btn-small" id="rota-btn" style="margin-top:6px">Sugerir rota</button>' +
    '<pre id="rota-out" class="muted" style="margin-top:8px;white-space:pre-wrap;font-size:11px"></pre>'
  document.getElementById('rota-btn')?.addEventListener('click', async () => {
    const txt = document.getElementById('rota-txt')?.value || ''
    const out = document.getElementById('rota-out')
    try {
      const r = await window.api.invoke('dg:agente:rotasugerir', txt)
      if (out) out.textContent = JSON.stringify(r?.rota || r, null, 2)
    } catch (e) { if (out) out.textContent = String(e) }
  })
}

async function pintarPlanilha() {
  const sec = garantirSecao('planilha-section', 'Consulta de dados (CSV/JSON)')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML =
    '<input id="dados-arq" placeholder="arquivo relativo (ex: dados.csv)" style="width:100%;margin-bottom:6px" />' +
    '<input id="dados-perg" placeholder="pergunta / SQL opcional" style="width:100%;margin-bottom:6px" />' +
    '<button type="button" class="btn-small" id="dados-btn">Consultar</button>' +
    '<pre id="dados-out" class="muted" style="margin-top:8px;white-space:pre-wrap;font-size:11px"></pre>'
  document.getElementById('dados-btn')?.addEventListener('click', async () => {
    const arq = document.getElementById('dados-arq')?.value || ''
    const perg = document.getElementById('dados-perg')?.value || ''
    const out = document.getElementById('dados-out')
    try {
      const r = await window.api.invoke('dg:dados:consultar', arq, perg)
      if (out) out.textContent = JSON.stringify(r, null, 2)
    } catch (e) { if (out) out.textContent = String(e) }
  })
}

function pintarStatusUpdate(st) {
  const el = document.getElementById('sb-update')
  const btn = document.getElementById('btn-update-check')
  if (!el) return
  const msg = st?.mensagem || '—'
  const semFeed = /nenhuma release|sem feed de release/i.test(msg)
  el.textContent =
    st?.estado === 'pronta'
      ? 'Update pronta'
      : st?.estado === 'baixando'
        ? 'Update ' + (st.progresso || 0) + '%'
        : st?.estado === 'disponivel'
          ? 'Update ' + (st.versaoRemota || '')
          : st?.estado === 'atualizado'
            ? semFeed
              ? 'sem release'
              : 'v' + (st.versaoAtual || '')
            : st?.estado === 'erro'
              ? 'update erro'
              : st?.empacotado
                ? msg.slice(0, 28)
                : 'dev'
  el.title = msg + (st?.erro ? ' — ' + st.erro : '')
  if (btn) {
    btn.textContent = st?.estado === 'pronta' ? 'Reiniciar' : 'Update'
    btn.title =
      st?.estado === 'pronta'
        ? 'Reiniciar e aplicar atualização'
        : semFeed
          ? 'Ainda não há release no GitHub — publique com scripts/publicar-release.ps1'
          : 'Verificar atualização do DG Editor'
  }
}

function ligarPerfilUi() {
  const api = window.api
  if (!api?.invoke) return
  const stEl = document.getElementById('perfil-status')
  const pintar = async () => {
    try {
      const r = await api.invoke('perfil:status')
      if (stEl && r?.ok) {
        stEl.textContent =
          'Arquivos: ' + ((r.presentes || []).join(', ') || '(vazio)') + ' — ' + (r.userData || '')
      }
    } catch {
      /* */
    }
  }
  document.getElementById('btn-perfil-exportar')?.addEventListener('click', async () => {
    try {
      const r = await api.invoke('perfil:exportar')
      if (stEl) {
        stEl.textContent = r?.ok
          ? 'Exportado: ' + (r.caminho || '') + ' (' + (r.arquivos || []).join(', ') + ')'
          : 'Export: ' + (r?.erro || 'falhou')
      }
    } catch (e) {
      if (stEl) stEl.textContent = String(e)
    }
  })
  document.getElementById('btn-perfil-importar')?.addEventListener('click', async () => {
    try {
      const r = await api.invoke('perfil:importar')
      if (stEl) {
        stEl.textContent = r?.ok
          ? 'Importado: ' + ((r.arquivos || []).join(', ') || 'ok') + ' — reinicie o app se as chaves nao aparecerem'
          : 'Import: ' + (r?.erro || 'falhou')
      }
      await pintar()
    } catch (e) {
      if (stEl) stEl.textContent = String(e)
    }
  })
  void pintar()
}

function ligarAutoUpdateUi() {
  const api = window.api
  if (!api?.invoke) return
  const btn = document.getElementById('btn-update-check')
  btn?.addEventListener('click', async () => {
    try {
      const st = await api.invoke('update:status')
      if (st?.estado === 'pronta') {
        await api.invoke('update:instalar')
        return
      }
      pintarStatusUpdate({ mensagem: 'Verificando…', estado: 'checando' })
      const r = await api.invoke('update:verificar')
      pintarStatusUpdate(r)
    } catch (e) {
      pintarStatusUpdate({ estado: 'erro', mensagem: String(e), empacotado: false })
    }
  })
  api.invoke('update:status').then(pintarStatusUpdate).catch(() => {})
  try {
    api.on?.('update:status', (_e, st) => pintarStatusUpdate(st))
  } catch {
    /* */
  }
}

function pintarDepsManutencao(st) {
  const sb = document.getElementById('sb-deps')
  const statusEl = document.getElementById('deps-manut-status')
  const lista = document.getElementById('deps-manut-lista')
  const chk = document.getElementById('deps-manut-ativo')
  const itens = Array.isArray(st?.itens) ? st.itens : []
  const pend = itens.filter((i) => !i.instalado || i.precisaAtualizar).length
  if (sb) {
    sb.textContent = !st?.winget
      ? 'Deps: sem winget'
      : st?.emCurso
        ? 'Deps: atualizando…'
        : pend > 0
          ? 'Deps: ' + pend + ' pend.'
          : 'Deps: ok'
    sb.title = st?.ultimaMensagem || st?.mensagem || 'Ferramentas do sistema'
  }
  if (chk && typeof st?.ativo === 'boolean') chk.checked = st.ativo
  if (statusEl) {
    statusEl.textContent =
      (st?.ultimaMensagem || st?.mensagem || '—') +
      (st?.ultimaExecucao ? ' · ' + new Date(st.ultimaExecucao).toLocaleString() : '')
  }
  if (lista) {
    lista.innerHTML = itens
      .map((i) => {
        const estado = !i.instalado
          ? 'ausente'
          : i.precisaAtualizar
            ? 'atualizar → ' + (i.versaoDisponivel || '?')
            : 'ok ' + (i.versaoAtual || '')
        return '<li><strong>' + String(i.nome || i.id) + '</strong> — ' + estado + '</li>'
      })
      .join('')
  }
}

function ligarDepsManutencaoUi() {
  const api = window.api
  if (!api?.invoke) return
  const pintar = async () => {
    try {
      const st = await api.invoke('deps:manutencao-status')
      pintarDepsManutencao(st)
    } catch (e) {
      pintarDepsManutencao({ winget: false, mensagem: String(e), itens: [] })
    }
  }
  document.getElementById('deps-manut-ativo')?.addEventListener('change', async (e) => {
    const ativo = !!e.target?.checked
    try {
      await api.invoke('deps:manutencao-config', { ativo })
      await pintar()
    } catch {
      /* */
    }
  })
  document.getElementById('btn-deps-manut-rodar')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-deps-manut-rodar')
    const statusEl = document.getElementById('deps-manut-status')
    if (btn) btn.disabled = true
    if (statusEl) statusEl.textContent = 'Verificando e atualizando em segundo plano…'
    pintarDepsManutencao({ winget: true, emCurso: true, itens: [], mensagem: 'Em andamento…' })
    try {
      const r = await api.invoke('deps:manutencao-rodar', { forcar: true, silencioso: true })
      pintarDepsManutencao({ ...r, winget: true })
      if (statusEl) statusEl.textContent = r?.mensagem || 'Concluído'
    } catch (e) {
      if (statusEl) statusEl.textContent = String(e)
    } finally {
      if (btn) btn.disabled = false
      void pintar()
    }
  })
  void pintar()
  // refresh leve na statusbar a cada 10 min
  setInterval(() => {
    void pintar()
  }, 600_000)
}

export function ligarExtrasUi() {
  if (document.documentElement.dataset.dgExtras === '1') return
  document.documentElement.dataset.dgExtras = '1'
  void initModesUI()
  void pintarSkills()
  void pintarMcpPresets()
  void pintarAuditoria()
  void pintarSimbolos()
  void pintarRota()
  void pintarPlanilha()
  ligarOnboarding()
  ligarAutoUpdateUi()
  ligarPerfilUi()
  ligarDepsManutencaoUi()
  // Remonta ao abrir Contas
  document.getElementById('btn-contas')?.addEventListener('click', () => {
    setTimeout(() => {
      void pintarSkills()
      void pintarMcpPresets()
      void pintarAuditoria()
      void pintarSimbolos()
      void pintarRota()
      void pintarPlanilha()
      void window.api?.invoke?.('deps:manutencao-status').then(pintarDepsManutencao).catch(() => {})
    }, 200)
  })
}
