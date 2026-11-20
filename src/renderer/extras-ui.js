/**
 * Liga UIs extras no painel Contas (skills, MCP presets, auditoria, modos, onboarding).
 * Substitui os IIFEs quebrados (template string) por montagem segura.
 */
import { initModesUI } from './modes-ui.js'
import { state } from './state/app-state.js'
import { rotuloStatusUpdate, resumoDepsManutencao, htmlItensDeps } from './features/ui/status-mappers.js'
import { pintarAutomacoes } from './features/ui/automacoes-ui.js'
import { ligarOnboarding } from './features/ui/onboarding-ui.js'

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
  const r = rotuloStatusUpdate(st)
  el.textContent = r.texto
  el.title = r.title
  if (btn) {
    btn.textContent = r.botao
    btn.title = r.botaoTitle
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
  const r = resumoDepsManutencao(st)
  if (sb) {
    sb.textContent = r.badge
    sb.title = r.badgeTitle
  }
  if (chk && typeof st?.ativo === 'boolean') chk.checked = st.ativo
  if (statusEl) {
    statusEl.textContent = r.statusTexto
  }
  if (lista) {
    lista.innerHTML = htmlItensDeps(st?.itens)
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

async function pintarMcps() {
  const sec = garantirSecao('mcps-marketplace-section', 'Marketplace MCP')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML = '<div id="mcps-market-list" class="lista muted">Carregando…</div>'
  const list = document.getElementById('mcps-market-list')
  if (!list) return
  const raiz = state.pastaAtual || state.pastasRecentes?.[0] || ''
  try {
    const r = await window.api.invoke('mcp:catalogo', raiz)
    const itens = r?.itens || []
    list.innerHTML = ''
    if (!itens.length) {
      list.textContent = 'Catálogo vazio'
      return
    }
    for (const it of itens) {
      const row = document.createElement('div')
      row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border, #30363d)'
      const head = document.createElement('div')
      head.style.cssText = 'display:flex;gap:8px;align-items:center'
      const nome = document.createElement('strong')
      nome.textContent = it.nome || it.id
      const badge = document.createElement('span')
      badge.className = 'muted'
      badge.style.cssText = 'font-size:10px;border:1px solid currentColor;border-radius:8px;padding:0 6px'
      badge.textContent = it.ativo ? 'ativo' : 'disponível'
      head.appendChild(nome); head.appendChild(badge)
      const desc = document.createElement('div')
      desc.className = 'muted'
      desc.style.cssText = 'font-size:11px;margin:2px 0 4px'
      desc.textContent = it.descricao || ''
      const cmd = document.createElement('code')
      cmd.className = 'muted'
      cmd.style.cssText = 'font-size:10px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      cmd.textContent = it.comando || ''
      const btn = document.createElement('button')
      btn.className = 'btn-mini'
      btn.textContent = it.ativo ? 'Instalado' : 'Instalar'
      btn.disabled = !!it.ativo
      btn.addEventListener('click', async () => {
        btn.disabled = true
        btn.textContent = 'Instalando…'
        const res = await window.api.invoke('mcp:instalar', { raiz, id: it.id })
        if (res?.ok) {
          btn.textContent = 'Instalado'
          badge.textContent = 'ativo'
          if (window.dgToast) window.dgToast('MCP ' + it.id + ' instalado — recarregue para carregar tools', 'ok')
        } else {
          btn.disabled = false
          btn.textContent = 'Instalar'
          if (window.dgToast) window.dgToast('Falha: ' + (res?.erro || ''), 'erro')
        }
      })
      head.appendChild(btn)
      row.appendChild(head); row.appendChild(desc); row.appendChild(cmd)
      list.appendChild(row)
    }
  } catch (e) {
    list.textContent = 'Marketplace indisponível'
    console.warn('[mcps-ui]', e)
  }
}

async function pintarProviders() {
  const sec = garantirSecao('providers-section', 'Provedores de IA')
  const corpo = sec.querySelector('.extras-corpo') || sec
  corpo.innerHTML =
    '<div id="providers-resumo" class="muted" style="font-size:11px;margin-bottom:6px">Carregando…</div>' +
    '<div id="providers-list" class="lista"></div>' +
    '<div style="margin-top:6px"><button id="providers-testar-todos" class="btn-mini">Testar todos</button></div>'
  const resumo = document.getElementById('providers-resumo')
  const list = document.getElementById('providers-list')
  if (!list) return
  try {
    const [r, gasto] = await Promise.all([
      window.api.invoke('providers:listar'),
      window.api.invoke('providers:gasto').catch(() => null)
    ])
    const itens = r?.providers || []
    if (resumo) {
      const usd = gasto?.usd
      resumo.textContent = itens.length + ' provedores' +
        (typeof usd === 'number' ? ' · gasto hoje: $' + usd.toFixed(4) : '')
    }
    list.innerHTML = ''
    for (const p of itens.slice(0, 20)) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border, #30363d)'
      const nome = document.createElement('span')
      nome.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      nome.textContent = (p.label || p.id) + (p.tier ? ' · ' + p.tier : '')
      const badges = document.createElement('span')
      badges.className = 'muted'
      badges.style.cssText = 'font-size:10px;display:flex;gap:6px'
      const bAtivo = document.createElement('span')
      bAtivo.textContent = p.ativo ? 'ativo' : 'inativo'
      const bKey = document.createElement('span')
      bKey.textContent = p.chaveConfigurada ? 'chave ok' : 'sem chave'
      const bEsg = document.createElement('span')
      bEsg.textContent = p.esgotadoAte ? 'cota esgotada' : ''
      badges.appendChild(bAtivo); badges.appendChild(bKey); badges.appendChild(bEsg)
      row.appendChild(nome); row.appendChild(badges)
      list.appendChild(row)
    }
    if (!itens.length) list.innerHTML = '<div class="muted">Nenhum provider</div>'
  } catch (e) {
    if (list) list.innerHTML = '<div class="muted">Providers indisponíveis</div>'
    console.warn('[providers-ui]', e)
  }
  const btn = document.getElementById('providers-testar-todos')
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = 'Testando…'
      try {
        const r = await window.api.invoke('providers:testar-todos')
        if (window.dgToast) {
          window.dgToast('Testes: ' + (r?.okN ?? 0) + ' ok / ' + (r?.falhas ?? 0) + ' falhas', r?.falhas ? 'aviso' : 'ok')
        }
      } finally {
        btn.disabled = false
        btn.textContent = 'Testar todos'
      }
    })
  }
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
  void pintarMcps()
  void pintarProviders()
  void pintarAutomacoes(garantirSecao)
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
      void pintarMcps()
      void pintarProviders()
      void pintarAutomacoes(garantirSecao)
      void window.api?.invoke?.('deps:manutencao-status').then(pintarDepsManutencao).catch(() => {})
    }, 200)
  })
}
