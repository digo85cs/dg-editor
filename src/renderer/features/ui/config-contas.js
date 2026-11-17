// config-contas.js — modal Config (perfil/Ollama/Adapta) e modal Contas
// (identidade/maquina/IA/guardian/FTP/diagnostico). Extraido de app.js.
import { state } from '../../state/app-state.js'
import { escapar } from '../../utils/dom.js'
import { mostrarToast } from './toast.js'
import { abrirJanelaFlutuante } from './janelas-flutuantes.js'

let deps = {}

/** Registra callbacks do app.js (ex.: config do OpenClaw). Chamar no boot. */
export function configurarConfigContas(d) {
  deps = d || {}
}

export function formatarForcaPerfil(v) {
  if (v == null) return '—'
  if (typeof v === 'string') {
    if (v === 'strong') return 'forte'
    if (v === 'medium') return 'média'
    if (v === 'light') return 'leve'
    return v
  }
  if (typeof v === 'object') {
    if (typeof v.label === 'string') return v.label
    if (typeof v.forca === 'string') return formatarForcaPerfil(v.forca)
  }
  return String(v)
}

export function htmlMaquinaDeProfile(p, forcaRaw) {
  const cores = Array.isArray(p?.cpus) ? p.cpus.length : Number(p?.cpus)
  const total = Number(p?.totalMemory)
  const ram =
    Number.isFinite(total) && total > 0 ? (total / 1024 / 1024 / 1024).toFixed(1) + ' GB' : '? GB'
  return (
    '<h4>Máquina</h4>' +
    escapar(p?.hostname || '—') +
    ' — ' +
    escapar(p?.platform || '') +
    ' ' +
    escapar(p?.arch || '') +
    '<br>' +
    (Number.isFinite(cores) && cores > 0 ? cores : '?') +
    ' núcleos — ' +
    ram +
    ' RAM<br>' +
    'Força: <strong>' +
    escapar(formatarForcaPerfil(forcaRaw)) +
    '</strong>'
  )
}

export async function abrirConfig() {
  $('modal-contas')?.classList.add('hidden')
  abrirJanelaFlutuante($('modal-config'))
  try {
    const p = await window.api.invoke('system:get-profile')
    const forca = await window.api.invoke('system:profile-strength')
    $('config-profile').innerHTML = htmlMaquinaDeProfile(p && p.ok === false ? {} : p, forca)
  } catch (e) {
    $('config-profile').innerHTML = '<h4>Máquina</h4>' + escapar(String(e))
  }
  await renderizarConfigOllama()
  await deps.carregarOpenClaw?.()
  await atualizarPainelAdapta('adapta-status-cfg')
}

const OLLAMA_SUGERIDOS = [
  { id: 'qwen2.5-coder:1.5b', rotulo: 'qwen2.5-coder:1.5b — leve (~1 GB)' },
  { id: 'qwen2.5-coder:3b', rotulo: 'qwen2.5-coder:3b — equilíbrio (~2 GB)' },
  { id: 'qwen2.5-coder:7b', rotulo: 'qwen2.5-coder:7b — melhor qualidade (~4,7 GB)' }
]

/** @type {any} */
let ollamaPullCache = null

function desenharProgressoOllama(p) {
  const box = $('cfg-ollama-progresso')
  if (!box) return
  if (!p) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  const pct = typeof p.percentual === 'number' ? p.percentual : null
  box.hidden = false
  box.innerHTML =
    '<div class="cfg-pull-linha"><span>' +
    escapar(p.modelo || '') +
    '</span><span>' +
    (pct == null ? '' : pct + '%') +
    '</span></div>' +
    '<div class="cfg-pull-barra"><span style="width:' +
    (pct == null ? 12 : pct) +
    '%"></span></div>' +
    '<div class="cfg-pull-status">' +
    escapar(p.status || '') +
    (p.erro ? ' — ' + escapar(p.erro) : '') +
    '</div>'
}

function atualizarProgressoOllama(p) {
  if (!p || typeof p !== 'object') return
  ollamaPullCache = p
  desenharProgressoOllama(p)
  const btn = $('cfg-ollama-baixar')
  if (btn) btn.disabled = p.fase !== 'sucesso' && p.fase !== 'erro'
  if (p.fase === 'sucesso') {
    mostrarToast('Modelo pronto: ' + p.modelo, 'ok')
    setTimeout(() => void renderizarConfigOllama(), 400)
  } else if (p.fase === 'erro') {
    mostrarToast('Falha ao baixar ' + (p.modelo || 'modelo') + ': ' + (p.erro || 'erro'), 'erro')
    if (btn) btn.disabled = false
  }
}

export async function renderizarConfigOllama() {
  const el = $('config-ollama')
  if (!el) return
  let o = null
  let st = null
  try { o = await window.api.invoke('brain:ollama-status') } catch { /* offline */ }
  try { st = await window.api.invoke('ollama:pull-status') } catch { /* offline */ }
  const locais = (st && Array.isArray(st.modelos) && st.modelos.length
    ? st.modelos
    : ((o && Array.isArray(o.models) ? o.models : []).map((m) => m && m.name).filter(Boolean))
  ).filter(Boolean)
  const locaisSet = new Set(locais)
  const emBaixa = st && st.estado && (st.estado.fase === 'baixando' || st.estado.fase === 'iniciando' || st.estado.fase === 'verificando')
  const opcoes = OLLAMA_SUGERIDOS.filter((s) => !locaisSet.has(s.id))
  let status
  if (!o || o.installed === false) {
    status = 'Não instalado. Baixe em <code>ollama.com</code> e rode <code>ollama serve</code>.'
  } else if (!o.reachable) {
    status = 'Instalado, mas parado. Use "Iniciar Ollama" na barra de status ou rode <code>ollama serve</code>.'
  } else {
    status = 'Rodando — ' + locais.length + ' modelo(s) local(is).'
  }
  el.innerHTML =
    '<h4>Ollama (IA local)</h4>' +
    '<div class="cfg-ollama-status">' + status + '</div>' +
    '<div class="cfg-ollama-locais"><strong>Instalados:</strong> ' +
    escapar(locais.join(', ') || 'nenhum') +
    '</div>' +
    (locais.length === 0 && o && o.reachable
      ? '<div class="cfg-ollama-aviso">Nenhum modelo baixado ainda — a IA local precisa de pelo menos um.</div>'
      : '') +
    (opcoes.length
      ? '<div class="config-actions"><select id="cfg-ollama-modelo" class="cfg-ollama-select">' +
        opcoes.map((s) => '<option value="' + escapar(s.id) + '">' + escapar(s.rotulo) + '</option>').join('') +
        '</select><button id="cfg-ollama-baixar" class="btn-small">Baixar modelo</button></div>'
      : '') +
    '<div id="cfg-ollama-progresso" class="cfg-ollama-progresso" hidden></div>'
  const btn = $('cfg-ollama-baixar')
  if (btn) {
    btn.disabled = !!emBaixa
    btn.addEventListener('click', async () => {
      const sel = $('cfg-ollama-modelo')
      const modelo = sel && sel.value
      if (!modelo) return
      btn.disabled = true
      desenharProgressoOllama({ modelo, percentual: null, status: 'iniciando download…' })
      const r = await window.api.invoke('ollama:pull', modelo)
      if (!r || !r.ok) {
        btn.disabled = false
        desenharProgressoOllama(null)
        mostrarToast((r && r.erro) || 'Não foi possível iniciar o download', 'erro')
      }
    })
  }
  desenharProgressoOllama(emBaixa ? st.estado : null)
}

window.api.on('ollama:pull-progresso', (_e, p) => atualizarProgressoOllama(p))


/** @type {object | null} */
let adaptaStatusCache = null

export async function atualizarPainelAdapta(elId) {
  const el = $(elId)
  if (!el) return
  try {
    const st = await window.api.invoke('adapta:status', state.pastaAtual || undefined)
    adaptaStatusCache = st
    el.innerHTML =
      'Conta: <strong>digo85cs@gmail.com</strong><br>' +
      'Dossiê: ' +
      (st.dossieExiste ? 'ok' : 'ausente') +
      ' · Continuidade: ' +
      (st.continuidadeExiste ? 'ok' : 'ausente') +
      ' · MCP: ' +
      (st.mcpExiste ? 'compilado' : 'rode npm run build:mcp') +
      '<br><code style="font-size:11px">' +
      escapar(st.caminhoContinuidade || '') +
      '</code>'
  } catch (e) {
    el.textContent = 'Falha ao ler status Adapta: ' + String(e)
  }
}

export async function copiarContinuidadeAdapta(regenerar) {
  const r = await window.api.invoke('adapta:ler-continuidade', !!regenerar)
  if (!r?.ok || !r.texto) {
    if (!regenerar) {
      const g = await window.api.invoke('adapta:gerar')
      if (!g?.ok) {
        alert('Continuidade indisponível: ' + (g?.erro || r?.erro || 'sem dossiê — use o chat primeiro'))
        return
      }
      return copiarContinuidadeAdapta(false)
    }
    alert('Continuidade indisponível: ' + (r?.erro || 'erro'))
    return
  }
  try {
    await navigator.clipboard.writeText(r.texto)
    alert('Continuidade copiada. No Adapta ONE: + → Contextos → cole.')
  } catch (e) {
    alert('Não foi possível copiar: ' + String(e))
  }
  await atualizarPainelAdapta('adapta-status')
  await atualizarPainelAdapta('adapta-status-cfg')
}

export async function copiarMcpAdapta() {
  const st =
    adaptaStatusCache || (await window.api.invoke('adapta:status', state.pastaAtual || undefined))
  adaptaStatusCache = st
  if (!st?.mcpComando) {
    alert('Comando MCP indisponível')
    return
  }
  if (!st.mcpExiste) {
    alert('MCP ainda não compilado. Rode: npm run build:mcp\n\nO JSON será copiado mesmo assim.')
  }
  try {
    await navigator.clipboard.writeText(st.mcpComando)
    alert('JSON MCP copiado. Cole no conector MCP do Maestro (ver docs/adapta.md).')
  } catch (e) {
    alert('Não foi possível copiar: ' + String(e))
  }
}

async function pintarConectoresContas() {
  // Contas OAuth (Google/MS/Apple/GitHub) pintadas por contas-ui.js em #contas-conectores
  if (typeof window.dgPintarContasVinculadas === 'function') {
    try { await window.dgPintarContasVinculadas() } catch {}
  }
}

async function pintarFtpDeploy() {
  const el = $('contas-ftp')
  if (!el) return
  el.innerHTML = '<h4>Deploy FTP</h4>Carregando...'
  try {
    const r = await window.api.invoke('deploy:ftp-listar')
    const sites = (r && r.sites) || []
    let html =
      '<h4>Deploy FTP</h4>' +
      '<p class="muted">Senha fica no cofre local. Use Dry-run antes do deploy.</p>' +
      '<div class="ftp-form-grid">' +
      '<input id="ftp-id" class="whereis-input" placeholder="id (ex: producao)" />' +
      '<input id="ftp-nome" class="whereis-input" placeholder="nome" />' +
      '<input id="ftp-host" class="whereis-input" placeholder="host" />' +
      '<input id="ftp-user" class="whereis-input" placeholder="usuário" />' +
      '<input id="ftp-pass" class="whereis-input ftp-span-2" type="password" placeholder="senha" />' +
      '<input id="ftp-remote" class="whereis-input" placeholder="remotePath (/public_html)" />' +
      '<input id="ftp-local" class="whereis-input" placeholder="localPath (pasta do projeto)" />' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
      '<button type="button" class="btn-small" id="btn-ftp-salvar">Salvar</button>' +
      '<button type="button" class="btn-small" id="btn-ftp-testar">Testar</button>' +
      '<button type="button" class="btn-small" id="btn-ftp-dry">Dry-run</button>' +
      '<button type="button" class="btn-small btn-primary" id="btn-ftp-deploy">Deploy</button>' +
      '</div>'
    if (sites.length) {
      html += '<div class="muted" style="font-size:12px;margin-bottom:6px">Sites salvos</div><div class="ftp-sites">'
      for (const s of sites) {
        html +=
          '<button type="button" class="ftp-chip btn-ftp-pick" data-id="' + escapar(s.id) + '" title="' + escapar(s.host || '') + '">' +
          escapar(s.nome || s.id) + (s.temSenha ? ' · ✓' : '') +
          '</button>'
      }
      html += '</div>'
    }
    el.innerHTML = html
    const val = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.value?.trim() || ''
    el.querySelector('#btn-ftp-salvar')?.addEventListener('click', async () => {
      const id = val('ftp-id') || 'site-1'
      const r2 = await window.api.invoke('deploy:ftp-salvar', {
        id,
        nome: val('ftp-nome') || id,
        host: val('ftp-host'),
        user: val('ftp-user'),
        password: val('ftp-pass'),
        remotePath: val('ftp-remote') || '/',
        localPath: val('ftp-local') || state.pastaAtual || ''
      })
      if (window.dgToast) window.dgToast(r2?.ok ? 'Site FTP salvo' : (r2?.erro || 'Falha'), r2?.ok ? 'ok' : 'erro')
      void pintarFtpDeploy()
    })
    el.querySelector('#btn-ftp-testar')?.addEventListener('click', async () => {
      const id = val('ftp-id')
      if (!id) { if (window.dgToast) window.dgToast('Informe o id do site', 'erro'); return }
      const r2 = await window.api.invoke('deploy:ftp-testar', id)
      if (window.dgToast) window.dgToast(r2?.ok ? ('FTP OK · ' + (r2.pwd || '')) : (r2?.erro || 'Falha'), r2?.ok ? 'ok' : 'erro')
    })
    el.querySelector('#btn-ftp-dry')?.addEventListener('click', async () => {
      const id = val('ftp-id')
      if (!id) { if (window.dgToast) window.dgToast('Informe o id do site', 'erro'); return }
      const localPath = val('ftp-local') || state.pastaAtual || ''
      const r2 = await window.api.invoke('deploy:ftp-deploy', { id, localPath, remotePath: val('ftp-remote') || undefined, dryRun: true })
      if (window.dgToast) window.dgToast(r2?.ok ? ('Dry-run: ' + (r2.previstos || 0) + ' arquivos') : (r2?.erro || 'Falha'), r2?.ok ? 'ok' : 'erro')
    })
    el.querySelector('#btn-ftp-deploy')?.addEventListener('click', async () => {
      const id = val('ftp-id')
      if (!id) { if (window.dgToast) window.dgToast('Informe o id do site', 'erro'); return }
      const localPath = val('ftp-local') || state.pastaAtual || ''
      const r2 = await window.api.invoke('deploy:ftp-deploy', { id, localPath, remotePath: val('ftp-remote') || undefined })
      if (window.dgToast) {
        window.dgToast(
          r2?.ok ? ('Deploy OK · ' + (r2.enviados || 0) + ' arquivos') : (r2?.erro || 'Deploy falhou'),
          r2?.ok ? 'ok' : 'erro'
        )
      }
    })
    el.querySelectorAll('.btn-ftp-pick').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id')
        const s = sites.find((x) => x.id === id)
        if (!s) return
        const set = (i, v) => { const eln = document.getElementById(i); if (eln) eln.value = v || '' }
        set('ftp-id', s.id)
        set('ftp-nome', s.nome)
        set('ftp-host', s.host)
        set('ftp-user', s.user)
        set('ftp-remote', s.remotePath || '/')
        set('ftp-local', s.localPath || state.pastaAtual || '')
      })
    })
  } catch (err) {
    el.innerHTML = '<h4>Deploy FTP</h4><span style="color:#f85149">' + escapar(String(err)) + '</span>'
  }
}

function ativarAbaContas(tab) {
  const id = tab === 'ftp' || tab === 'saude' ? tab : 'contas'
  document.querySelectorAll('#modal-contas [data-contas-tab]').forEach((btn) => {
    const on = btn.getAttribute('data-contas-tab') === id
    btn.setAttribute('aria-selected', on ? 'true' : 'false')
  })
  document.querySelectorAll('#modal-contas [data-contas-panel]').forEach((panel) => {
    const on = panel.getAttribute('data-contas-panel') === id
    panel.hidden = !on
  })
}

function initContasTabs() {
  const modal = $('modal-contas')
  if (!modal || modal.dataset.tabsWired === '1') return
  modal.dataset.tabsWired = '1'
  modal.querySelectorAll('[data-contas-tab]').forEach((btn) => {
    btn.addEventListener('click', () => ativarAbaContas(btn.getAttribute('data-contas-tab')))
  })
}

export async function abrirContas() {
  $('modal-config')?.classList.add('hidden')
  initContasTabs()
  ativarAbaContas('contas')
  abrirJanelaFlutuante($('modal-contas'))
  $('contas-identidade').innerHTML = '<h4>Identidade</h4>Carregando...'
  $('contas-maquina').innerHTML = '<h4>Máquina</h4>Carregando...'
  $('contas-ia').innerHTML = '<h4>IA</h4>Carregando...'
  $('contas-guardian').innerHTML = '<h4>Guardião de recursos</h4>Carregando...'
  void atualizarPainelAdapta('adapta-status')
  void pintarConectoresContas()
  try {
    if (typeof window.dgPintarContasVinculadas === 'function') void window.dgPintarContasVinculadas()
  } catch {}
  void pintarFtpDeploy()
  try {
    const s = await window.api.invoke('accounts:get-state')
    const id = (s && s.identidade) || {}
    const maq = (s && s.maquina) || {}
    const ia = (s && s.ia) || {}
    $('contas-identidade').innerHTML =
      '<h4>Identidade</h4>' +
      'Usuário: <strong>' +
      escapar(id.username || 'digo85cs') +
      '</strong><br>' +
      'E-mail: <strong>' +
      escapar(id.email || 'digo85cs@gmail.com') +
      '</strong><br>' +
      (id.tokenPrefix ? 'Token: <code>' + escapar(id.tokenPrefix) + '...</code><br>' : '') +
      'Desde: ' +
      (id.criadoEm ? new Date(id.criadoEm).toLocaleDateString('pt-BR') : '—')
    const coresM = Number(maq.cpus)
    const ramM = maq.ramGB && String(maq.ramGB) !== 'NaN' ? String(maq.ramGB) : '?'
    $('contas-maquina').innerHTML =
      '<h4>Máquina</h4>' +
      escapar(maq.hostname || '—') +
      ' — ' +
      escapar(maq.plataforma || '') +
      '<br>' +
      (Number.isFinite(coresM) && coresM > 0 ? coresM : '?') +
      ' núcleos — ' +
      escapar(ramM) +
      ' GB RAM<br>' +
      'Força: <strong>' +
      escapar(formatarForcaPerfil(maq.forca)) +
      '</strong>'
    const provs = Array.isArray(ia.provedores)
      ? ia.provedores.map((p) => escapar(p.name) + ': ' + (p.available ? 'OK (' + escapar(String(p.models)) + ')' : 'off')).join('<br>')
      : '—'
    $('contas-ia').innerHTML =
      '<h4>IA</h4>' +
      'Ollama: ' +
      (ia.ollamaInstalado ? (ia.ollamaRodando ? 'rodando' : 'instalado, parado') : 'não instalado') +
      '<br>' +
      'Modelos: ' +
      escapar((ia.modelos || []).join(', ') || 'nenhum') +
      '<br>' +
      'Provedores:<br>' +
      provs
    const g = (s && s.guardian) || {}
    const usedMem = (g.totalMemory || 0) - (g.freeMemory || 0)
    const usedMB = Math.round(usedMem / 1048576)
    const usedPct = g.totalMemory > 0 ? Math.round((usedMem / g.totalMemory) * 100) : 0
    $('contas-guardian').innerHTML =
      '<h4>Guardião de recursos</h4>' +
      'RAM: ' +
      usedMB +
      ' MB usados (' +
      usedPct +
      '% de ' +
      Math.round((g.totalMemory || 0) / 1048576) +
      ' MB)<br>' +
      'CPU: ' +
      (Number.isFinite(g.cpuPercent) ? g.cpuPercent : 0) +
      '%<br>' +
      'Operações pesadas: ' +
      (g.ramOk ? 'liberadas' : 'pausadas (RAM baixa)')
  } catch (err) {
    $('contas-ia').innerHTML = '<h4>Erro</h4>' + escapar(String(err))
  }
}

export async function rodarBackupOneDrive() {
  const st = $('backup-onedrive-status')
  const btn = $('btn-backup-onedrive')
  if (btn) btn.disabled = true
  if (st) st.textContent = 'Backup OneDrive em andamento…'
  try {
    const r = await window.api.invoke('backup:onedrive')
    if (st) {
      st.textContent = r?.ok
        ? 'Backup OK — OneDrive\\BACKUP_DG_EDITOR (espelho + ZIP ATUAL).'
        : 'Falha: ' + (r?.erro || 'desconhecida')
    }
    mostrarToast?.(r?.ok ? 'Backup OneDrive OK' : 'Backup OneDrive falhou', r?.ok ? 'ok' : 'erro')
  } catch (e) {
    if (st) st.textContent = 'Erro: ' + String(e)
  } finally {
    if (btn) btn.disabled = false
  }
}

export async function rodarDiagnostico() {
  const alvo = $('contas-diagnostico')
  if (!alvo) return
  alvo.innerHTML =
    '<h4>Diagnóstico</h4><p class="muted">Rodando checagens...</p>' +
    '<button type="button" id="btn-diag" class="btn-small">Rodar diagnóstico</button>' +
    '<button type="button" id="btn-backup-onedrive" class="btn-small" style="margin-left:8px">Backup OneDrive</button>' +
    '<p id="backup-onedrive-status" class="muted" style="margin:8px 0 0;font-size:12px"></p>'
  $('btn-diag')?.addEventListener('click', () => { void rodarDiagnostico() })
  $('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
  const t0 = Date.now()
  try {
    const r = await window.api.invoke('diagnostico:rodar', state.pastaAtual || null)
    const total = Date.now() - t0
    let html =
      '<h4>Diagnóstico — ' +
      (r?.ok ?? 0) +
      '/' +
      (r?.total ?? 0) +
      ' OK (' +
      total +
      ' ms)</h4><button type="button" id="btn-diag" class="btn-small">Rodar de novo</button>' +
      '<button type="button" id="btn-backup-onedrive" class="btn-small" style="margin-left:8px">Backup OneDrive</button>' +
      '<p id="backup-onedrive-status" class="muted" style="margin:8px 0 0;font-size:12px"></p>'
    for (const m of r?.modulos || []) {
      const icone = m.ok ? '\u2713' : '\u2717'
      const cor = m.ok ? '#3fb950' : '#f85149'
      html +=
        '<div style="margin:8px 0 0"><span style="color:' +
        cor +
        ';font-weight:bold">' +
        icone +
        '</span> ' +
        '<strong>' +
        escapar(m.nome) +
        '</strong> <span class="muted">(' +
        m.ms +
        ' ms)</span><br>' +
        '<span style="margin-left:18px;font-size:12px">' +
        escapar(m.detalhe) +
        '</span></div>'
    }
    alvo.innerHTML = html
    $('btn-diag')?.addEventListener('click', () => { void rodarDiagnostico() })
    $('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
  } catch (err) {
    alvo.innerHTML =
      '<h4>Diagnóstico</h4><span style="color:#f85149">' +
      escapar(String(err)) +
      '</span><div style="margin-top:8px"><button type="button" id="btn-diag" class="btn-small">Tentar de novo</button>' +
      '<button type="button" id="btn-backup-onedrive" class="btn-small" style="margin-left:8px">Backup OneDrive</button></div>'
    $('btn-diag')?.addEventListener('click', () => { void rodarDiagnostico() })
    $('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
  }
}

