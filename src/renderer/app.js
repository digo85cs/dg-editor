// DG Editor - renderer (Fase 2)
const $ = (id) => document.getElementById(id)

let pastaAtual = null
const pastasRecentes = []

// ---------- Pastas ----------
async function abrirPasta() {
  const r = await window.api.invoke('folder:select')
  if (r.canceled) return
  adicionarPasta(r.path)
  await selecionarPasta(r.path)
}

function adicionarPasta(path) {
  if (!pastasRecentes.includes(path)) pastasRecentes.push(path)
  renderizarPastas()
  salvarPastas()
}

function renderizarPastas() {
  const lista = $('folder-list')
  lista.innerHTML = ''
  for (const p of pastasRecentes) {
    const div = document.createElement('div')
    div.className = 'folder-item' + (p === pastaAtual ? ' active' : '')
    div.textContent = p.split('\\').pop() || p
    div.title = p
    div.addEventListener('click', () => selecionarPasta(p))
    lista.appendChild(div)
  }
}


function salvarPastas() {
  localStorage.setItem('dg-pastas', JSON.stringify(pastasRecentes))
}

function carregarPastas() {
  const salvas = localStorage.getItem('dg-pastas')
  if (salvas) {
    try { pastasRecentes.push(...JSON.parse(salvas)) } catch { /* ignora */ }
  }
}

// ---------- Selecionar pasta ----------
async function selecionarPasta(path) {
  pastaAtual = path
  $('chat-title').textContent = path.split('\\').pop() || path
  $('empty-state')?.remove()
  $('chat-send').disabled = false
  $('btn-reanalyze').classList.remove('hidden')
  renderizarPastas()

  const msgs = await window.api.invoke('chat:load', path)
  renderizarChat(msgs)

  const cached = await window.api.invoke('analysis:cached', path)
  if (cached) {
    renderizarAnalise(cached, true)
  } else {
    $('analysis-content').innerHTML = '<p class="muted">Pasta aberta. Clique em <strong>Analisar agora</strong> (canto superior do painel) quando quiser a analise.</p>'
  }

  const temRegras = await window.api.invoke('rules:exists', path)
  if (!temRegras) await window.api.invoke('rules:create-template', path)
}

// ---------- Analise ----------
async function rodarAnalise(root, force) {
  $('analysis-progress').classList.remove('hidden')
  $('progress-text').textContent = force ? 'Analisando de novo...' : 'Analisando...'
  $('analysis-content').innerHTML = '<p class="muted">Lendo o sistema, lendo arquivos-chave e perguntando a IA...</p>'
  try {
    const r = await window.api.invoke('analysis:run', root, force)
    renderizarAnalise(r.report, r.fromCache)
  } catch (err) {
    $('analysis-content').innerHTML =
      '<p class="muted">Nao consegui analisar agora: ' + escapar(String(err)) +
      '</p><p class="muted">Dica: instale o Ollama (ollama.com) e baixe um modelo (ex.: ollama pull llama3.2), ou configure LLM_API_KEY no ambiente.</p>'
  } finally {
    $('analysis-progress').classList.add('hidden')
  }
}

function renderizarAnalise(report, fromCache) {
  const badge = fromCache ? ' <span class="muted">(do cache)</span>' : ''
  let html = ''
  html += secao('O que é', report.oQueE || '—”')
  html += secao('Stack', report.stack || '—”')
  html += secao('Estrutura', report.estrutura || '—”')
  html += secaoLista('Pontos de atenção', report.pontosAtencao)
  html += secaoLista('Sugestões', report.sugestoes)
  if (report.provider) {
    html += '<p class="muted">Analisado por: ' + escapar(report.provider) +
      (report.model ? ' (' + escapar(report.model) + ')' : '') + ' —” ' +
      new Date(report.analyzedAt).toLocaleString('pt-BR') + badge + '</p>'
  }
  $('analysis-content').innerHTML = html
}

function secao(titulo, texto) {
  return '<div class="analysis-section"><h4>' + titulo + '</h4><p>' + escapar(texto) + '</p></div>'
}

function secaoLista(titulo, itens) {
  if (!itens || itens.length === 0) return secao(titulo, '—”')
  return '<div class="analysis-section"><h4>' + titulo + '</h4><ul>' +
    itens.map((i) => '<li>' + escapar(i) + '</li>').join('') + '</ul></div>'
}

function escapar(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

// ---------- Chat ----------
function renderizarChat(msgs) {
  const area = $('chat-messages')
  area.innerHTML = ''
  for (const m of msgs) adicionarBolha(m.role, m.content, m.provider)
  area.scrollTop = area.scrollHeight
  return div
}

function adicionarBolha(role, content, provider) {
  const area = $('chat-messages')
  const div = document.createElement('div')
  div.className = 'msg ' + role
  const span = document.createElement('span')
  span.className = 'msg-text'
  span.textContent = content
  div.appendChild(span)
  if (provider) {
    const tag = document.createElement('span')
    tag.className = 'msg-provider'
    tag.textContent = provider
    div.appendChild(tag)
  }
  area.appendChild(div)
  area.scrollTop = area.scrollHeight
  return div
}

async function enviarMensagem() {
  if (!pastaAtual) return
  const input = $('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  input.value = ''
  adicionarBolha('user', texto)
  $('chat-send').disabled = true
  const bolhaProc = adicionarBolha('assistant', 'bolando a resposta—¦')
  try {
    const r = await window.api.invoke('chat:send', pastaAtual, texto)
    bolhaProc.querySelector('.msg-text').textContent = r.message.content
    if (r.message.provider) atualizarBadgeProvedor(r.message.provider)
  } catch (err) {
    adicionarBolha('assistant', 'Erro ao enviar: ' + String(err), 'erro')
  } finally {
    $('chat-send').disabled = false
    input.focus()
  }
}


// ---------- Configuracoes ----------
async function abrirConfig() {
  $('modal-config').classList.remove('hidden')
  const p = await window.api.invoke('system:get-profile')
  const forca = await window.api.invoke('system:profile-strength')
  const gb = (b) => (b / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  $('config-profile').innerHTML =
    '<h4>Maquina</h4>' +
    escapar(p.hostname) + ' —” ' + escapar(p.platform) + ' ' + escapar(p.arch) + '<br>' +
    (p.cpus ? p.cpus.length : '?') + ' nucleos —” ' + gb(p.totalMemory) + ' RAM<br>' +
    'Forca: <strong>' + escapar(forca) + '</strong>'
  const o = await window.api.invoke('brain:ollama-status')
  $('config-ollama').innerHTML =
    '<h4>Ollama (IA local)</h4>' +
    (o.installed
      ? (o.reachable
        ? 'Instalado e rodando —” ' + o.models.length + ' modelo(s): ' + escapar(o.models.map((m) => m.name).join(', ') || '—”')
        : 'Instalado, mas parado. Rode: ollama serve')
      : 'Nao instalado. Baixe em ollama.com')
}

// ---------- Contas (Fase 2) ----------
async function abrirContas() {
  $('modal-contas').classList.remove('hidden')
  $('contas-identidade').innerHTML = '<h4>Identidade</h4>Carregando...'
  $('contas-maquina').innerHTML = '<h4>Maquina</h4>Carregando...'
  $('contas-ia').innerHTML = '<h4>IA</h4>Carregando...'
  $('contas-guardian').innerHTML = '<h4>Guardiao de recursos</h4>Carregando...'
  try {
    const s = await window.api.invoke('accounts:get-state')
    $('contas-identidade').innerHTML =
      '<h4>Identidade</h4>' +
      'Usuario: <strong>owner</strong> (device-token)<br>' +
      'Token: <code>' + escapar(s.identidade.tokenPrefix) + '...</code><br>' +
      'Desde: ' + (s.identidade.criadoEm ? new Date(s.identidade.criadoEm).toLocaleDateString('pt-BR') : '—”')
    $('contas-maquina').innerHTML =
      '<h4>Maquina</h4>' +
      escapar(s.maquina.hostname) + ' —” ' + escapar(s.maquina.plataforma) + '<br>' +
      s.maquina.cpus + ' nucleos —” ' + escapar(s.maquina.ramGB) + ' GB RAM<br>' +
      'Forca: <strong>' + escapar(s.maquina.forca) + '</strong>'
    const provs = s.ia.provedores.map((p) => p.name + ': ' + (p.available ? 'OK (' + p.models + ')' : 'off')).join('<br>')
    $('contas-ia').innerHTML =
      '<h4>IA</h4>' +
      'Ollama: ' + (s.ia.ollamaInstalado ? (s.ia.ollamaRodando ? 'rodando' : 'instalado, parado') : 'nao instalado') + '<br>' +
      'Modelos: ' + escapar(s.ia.modelos.join(', ') || 'nenhum') + '<br>' +
      'Provedores: <br>' + provs
    $('contas-guardian').innerHTML =
      '<h4>Guardiao de recursos</h4>' +
      'RAM livre: ' + Math.round(s.guardian.freeMemory / 1048576) + ' MB (' + s.guardian.freePct + '%)<br>' +
      'CPU: ' + s.guardian.cpuPercent + '%<br>' +
      'Operacoes pesadas: ' + (s.guardian.ramOk ? 'LIBERADAS' : 'PAUSADAS (RAM baixa)')
  } catch (err) {
    $('contas-ia').innerHTML = '<h4>Erro</h4>' + escapar(String(err))
  }
}


// ---------- Diagnostico ao vivo ----------
async function rodarDiagnostico() {
  const alvo = $('contas-diagnostico')
  alvo.innerHTML = '<h4>Diagnostico ao vivo</h4>Rodando 8 testes...'
  const t0 = Date.now()
  try {
    const r = await window.api.invoke('diagnostico:rodar', pastaAtual || null)
    const total = Date.now() - t0
    let html = '<h4>Diagnostico ao vivo - ' + r.ok + '/' + r.total + ' OK (' + total + ' ms)</h4>'
    for (const m of r.modulos) {
      const icone = m.ok ? '\u2713' : '\u2717'
      const cor = m.ok ? '#3fb950' : '#f85149'
      html += '<div style="margin:4px 0"><span style="color:' + cor + ';font-weight:bold">' + icone + '</span> ' +
        '<strong>' + escapar(m.nome) + '</strong> <span class="muted">(' + m.ms + ' ms)</span><br>' +
        '<span style="margin-left:18px;font-size:12px">' + escapar(m.detalhe) + '</span></div>'
    }
    alvo.innerHTML = html
  } catch (err) {
    alvo.innerHTML = '<h4>Diagnostico</h4><span style="color:#f85149">' + escapar(String(err)) + '</span>'
  }
}
// ---------- Tema (Fase 2) ----------
async function alternarTema() {
  const atual = document.body.classList.contains('tema-escuro') ? 'escuro' : 'claro'
  const novo = atual === 'claro' ? 'escuro' : 'claro'
  try { await window.api.invoke('tema:set', novo) } catch (e) { console.warn('[tema] set:', e) }
  aplicarTema(novo)
}

function aplicarTema(tema) {
  document.body.classList.toggle('tema-escuro', tema === 'escuro')
  document.body.classList.toggle('tema-claro', tema !== 'escuro')
  const b = document.getElementById('btn-tema')
  if (b) b.textContent = tema === 'escuro' ? '\u2600' : '\u263D'
  try { localStorage.setItem('dg-tema', tema) } catch {}
}

async function carregarTema() {
  try {
    const tema = await window.api.invoke('tema:get')
    aplicarTema(tema)
  } catch {
    aplicarTema(localStorage.getItem('dg-tema') === 'claro' ? 'claro' : 'escuro')
  }
}

// ---------- Paleta de comandos (Ctrl+P, Fase 2) ----------
const COMANDOS = [
  { id: 'abrir-pasta', label: 'Abrir pasta de trabalho', hint: 'Ctrl+O' },
  { id: 'analisar', label: 'Analisar sistema aberto', hint: 'IA' },
  { id: 'reanalisar', label: 'Analisar de novo (forcar)', hint: 'IA' },
  { id: 'limpar-chat', label: 'Limpar chat desta pasta', hint: 'chat' },
  { id: 'contas', label: 'Abrir Contas e saude do sistema', hint: 'Fase 2' },
  { id: 'config', label: 'Abrir Configuracoes', hint: 'sistema' },
  { id: 'tema', label: 'Alternar tema claro/escuro', hint: 'visual' },
  { id: 'guardian', label: 'Ver guardiao de recursos', hint: 'RAM/CPU' }
]

function abrirPaleta() {
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  renderizarPaleta('')
  $('palette-input').focus()
}

function fecharPaleta() {
  $('palette').classList.add('hidden')
}

function renderizarPaleta(filtro) {
  const lista = $('palette-list')
  lista.innerHTML = ''
  const f = filtro.toLowerCase().trim()
  const cmds = COMANDOS.filter((c) => !f || c.label.toLowerCase().includes(f))
  for (const c of cmds) {
    const div = document.createElement('div')
    div.className = 'palette-item'
    div.innerHTML = '<span class="palette-label">' + escapar(c.label) + '</span>' +
      (c.hint ? '<span class="palette-hint">' + escapar(c.hint) + '</span>' : '')
    div.addEventListener('click', () => { fecharPaleta(); executarComando(c.id) })
    lista.appendChild(div)
  }
  if (cmds.length === 0) {
    lista.innerHTML = '<div class="palette-item muted">Nenhum comando</div>'
  }
}

let paletaSel = 0

function executarComando(id) {
  if (id === 'abrir-pasta') abrirPasta()
  else if (id === 'analisar') { if (pastaAtual) rodarAnalise(pastaAtual, false) }
  else if (id === 'reanalisar') { if (pastaAtual) rodarAnalise(pastaAtual, true) }
  else if (id === 'limpar-chat') { if (pastaAtual) window.api.invoke('chat:clear', pastaAtual).then(() => renderizarChat([])) }
  else if (id === 'contas') abrirContas()
  else if (id === 'config') abrirConfig()
  else if (id === 'tema') alternarTema()
  else if (id === 'guardian') abrirContas()
}

// ---------- Guardiao (Fase 2, regra 9) ----------
async function atualizarGuardiao() {
  try {
    const s = await window.api.invoke('guardian:snapshot')
    const mb = Math.round(s.freeMemory / 1048576)
    $('guardian-text').textContent = 'Guardiao: RAM ' + mb + ' MB (' + s.freePct + '%) - CPU ' + s.cpuPercent + '%' + (s.ramOk ? '' : ' - PAUSADO')
    $('guardian-bar').classList.toggle('guardian-alerta', !s.ramOk)
  } catch { /* ignora */ }
}

// ---------- Eventos ----------
$('btn-add-folder').addEventListener('click', abrirPasta)
$('btn-empty-open').addEventListener('click', abrirPasta)
$('btn-reanalyze').addEventListener('click', () => pastaAtual && rodarAnalise(pastaAtual, true))
$('btn-config').addEventListener('click', abrirConfig)
$('btn-config-close').addEventListener('click', () => $('modal-config').classList.add('hidden'))
$('btn-contas').addEventListener('click', abrirContas)
$('btn-diag').addEventListener('click', rodarDiagnostico)
$('btn-contas-close').addEventListener('click', () => $('modal-contas').classList.add('hidden'))
$('btn-tema').addEventListener('click', alternarTema)
$('chat-send').addEventListener('click', enviarMensagem)
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() }
})
$('palette-input').addEventListener('input', (e) => renderizarPaleta(e.target.value))
$('palette-input').addEventListener('keydown', (e) => {
  const itens = document.querySelectorAll('.palette-item')
  if (e.key === 'Escape') fecharPaleta()
  else if (e.key === 'ArrowDown') { paletaSel = Math.min(paletaSel + 1, itens.length - 1); destacarPaleta(itens) }
  else if (e.key === 'ArrowUp') { paletaSel = Math.max(paletaSel - 1, 0); destacarPaleta(itens) }
  else if (e.key === 'Enter') { const alvo = itens[paletaSel]; if (alvo) alvo.click() }
})

function destacarPaleta(itens) {
  itens.forEach((el, i) => el.classList.toggle('selecionado', i === paletaSel))
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    abrirPaleta()
  }
  if (e.key === 'Escape') {
    fecharPaleta()
    $('modal-config').classList.add('hidden')
    $('modal-contas').classList.add('hidden')
  }
})

$('palette').addEventListener('click', (e) => { if (e.target === $('palette')) fecharPaleta() })
$('modal-config').addEventListener('click', (e) => { if (e.target === $('modal-config')) $('modal-config').classList.add('hidden') })
$('modal-contas').addEventListener('click', (e) => { if (e.target === $('modal-contas')) $('modal-contas').classList.add('hidden') })

// ---------- Boot ----------
carregarPastas()
renderizarPastas()
carregarTema()
atualizarGuardiao()
setInterval(atualizarGuardiao, 5000)
window.api.invoke('brain:providers').then((ps) => {
  const ativo = ps.find((p) => p.available)
  if (ativo) $('chat-provider').textContent = 'IA: ' + ativo.name
})

// ---------- Fase 3: roteador + dossie na UI ----------
function atualizarBadgeProvedor(nome) {
  const alvo = document.getElementById('chat-provider')
  if (alvo) alvo.textContent = 'IA: ' + nome
}

async function mostrarInfoDossie() {
  try {
    const snap = await window.api.invoke('dossie:snapshot')
    const alvo = document.getElementById('dossie-info')
    if (!alvo) return
    if (!snap) { alvo.textContent = 'Dossie: ainda nao gerado'; return }
    const dt = snap.atualizadoEm ? new Date(snap.atualizadoEm).toLocaleString('pt-BR') : 'n/d'
    alvo.textContent = 'Dossie: ' + snap.totalMensagens + ' msgs - ' + dt
  } catch { /* silencioso */ }
}

document.addEventListener('DOMContentLoaded', () => {
  try { mostrarInfoDossie() } catch { /* silencioso */ }
})
// ---------- Fase 3: painel clicavel de escolhas (padrao Adapta) ----------
// Uso: await perguntarEscolha('Titulo', ['Opcao A','Opcao B'], { multiplo: false })
function perguntarEscolha(titulo, opcoes, config) {
  const multiplo = !!(config && config.multiplo)
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'escolha-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;'

    const caixa = document.createElement('div')
    caixa.className = 'escolha-caixa'
    caixa.style.cssText = 'background:var(--bg, #1e1e1e);color:var(--fg, #eee);border:1px solid #444;border-radius:10px;padding:18px;min-width:320px;max-width:520px;box-shadow:0 12px 40px rgba(0,0,0,.5);'

    const h = document.createElement('h3')
    h.textContent = titulo
    h.style.cssText = 'margin:0 0 12px;font-size:15px;'
    caixa.appendChild(h)

    const selecionadas = new Set()

    opcoes.forEach((op, idx) => {
      const btn = document.createElement('button')
      btn.textContent = op
      btn.dataset.idx = String(idx)
      btn.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;background:#2a2a2a;color:#eee;border:1px solid #3a3a3a;border-radius:6px;cursor:pointer;font:inherit;'

      if (multiplo) {
        btn.addEventListener('click', () => {
          if (selecionadas.has(op)) {
            selecionadas.delete(op)
            btn.style.background = '#2a2a2a'
            btn.style.borderColor = '#3a3a3a'
          } else {
            selecionadas.add(op)
            btn.style.background = '#1f4a8a'
            btn.style.borderColor = '#2d6fd6'
          }
        })
      } else {
        btn.addEventListener('click', () => {
          overlay.remove()
          resolve([op])
        })
      }
      caixa.appendChild(btn)
    })

    if (multiplo) {
      const ok = document.createElement('button')
      ok.textContent = 'Confirmar'
      ok.style.cssText = 'margin-top:12px;padding:9px 16px;background:#2d6fd6;color:#fff;border:none;border-radius:6px;cursor:pointer;font:inherit;width:100%;'
      ok.addEventListener('click', () => {
        overlay.remove()
        resolve(Array.from(selecionadas))
      })
      caixa.appendChild(ok)
    }

    const cancelar = document.createElement('button')
    cancelar.textContent = 'Cancelar'
    cancelar.style.cssText = 'margin-top:6px;padding:7px 12px;background:transparent;color:#999;border:1px solid #444;border-radius:6px;cursor:pointer;font:inherit;width:100%;'
    cancelar.addEventListener('click', () => {
      overlay.remove()
      resolve(null)
    })
    caixa.appendChild(cancelar)

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null) }
    })

    overlay.appendChild(caixa)
    document.body.appendChild(overlay)
  })
}

// atalho global para testes manuais no console:
// await perguntarEscolha('Qual IA deve assumir?', ['Ollama','Maestro','API'])
window.perguntarEscolha = perguntarEscolha


// ---------- Toggle painel de analise ----------
function alternarPainel() {
  $('exec-panel')?.classList.toggle('aberto')
}
$('btn-painel')?.addEventListener('click', alternarPainel)

// ---------- Auto auditoria ----------
async function rodarAutoAuditoria() {
  const btn = document.getElementById('btn-auditar')
  if (btn) { btn.disabled = true; btn.textContent = 'Auditando...' }
  try {
    const r = await window.api.invoke('auditoria:rodar', { autoAtualizar: true, reiniciarAoFim: false })
    if (!r || r.erro) {
      console.warn('[auditoria] erro:', r && r.erro)
    } else {
      const falhas = r.achados.filter(function (a) { return a.status === 'falhou' })
      var msg = 'Auditoria concluida\n' +
        'OK: ' + r.resumo.ok + ' | Avisos: ' + r.resumo.warn + ' | Erros: ' + r.resumo.erro + '\n' +
        'Corrigidos: ' + r.resumo.corrigidos + ' | Falhas: ' + r.resumo.falhas
      if (falhas.length) { msg += '\n\nFalhas:\n' + falhas.map(function (a) { return '- ' + a.titulo }).join('\n') }
      if (!r.reiniciarPendente) { alert(msg) }
      if (r.reiniciarPendente) { abrirModalReinicio(r.motivoReinicio) }
    }
  } catch (e) {
    console.warn('[auditoria] excecao:', e)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Auditar' }
  }
}
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('btn-auditar')
  if (btn) btn.addEventListener('click', rodarAutoAuditoria)
})


// ---------- Barra de titulo propria ----------
document.addEventListener('DOMContentLoaded', function () {
  var bMin = document.getElementById('tb-min')
  var bMax = document.getElementById('tb-max')
  var bClose = document.getElementById('tb-close')
  if (bMin) bMin.addEventListener('click', function () { window.api.invoke('janela:minimizar') })
  if (bMax) bMax.addEventListener('click', async function () {
    try { await window.api.invoke('janela:maximizar') } catch (e) { console.warn('[janela] maximizar:', e) }
  })
  if (bClose) bClose.addEventListener('click', function () { window.api.invoke('janela:fechar') })
})

// ---------- Modal de reinicio ----------
function abrirModalReinicio(motivo) {
  var m = document.getElementById('modal-reinicio')
  if (!m) return
  var p = document.getElementById('reinicio-motivo')
  if (p) p.textContent = (motivo || 'Algumas alteracoes precisam de reinicio para serem aplicadas') + '. Deseja reiniciar agora?'
  m.classList.remove('hidden')
}
function fecharModalReinicio() {
  var m = document.getElementById('modal-reinicio')
  if (m) m.classList.add('hidden')
}
document.addEventListener('DOMContentLoaded', function () {
  var bAgora = document.getElementById('btn-reinicio-agora')
  var bDepois = document.getElementById('btn-reinicio-depois')
  if (bDepois) bDepois.addEventListener('click', fecharModalReinicio)
  if (bAgora) bAgora.addEventListener('click', function () {
    fecharModalReinicio()
    window.api.invoke('auditoria:rodar', { autoAtualizar: false, reiniciarAoFim: true })
  })
})


// ---------- Estado da janela (icone maximizar/restaurar) ----------
async function atualizarIconeMax() {
  try {
    const st = await window.api.invoke('janela:estado')
    const b = document.getElementById('tb-max')
    if (!b) return
    b.title = st && st.maximizado ? 'Restaurar' : 'Maximizar'
  } catch {}
}
document.addEventListener('DOMContentLoaded', function () {
  var bMax = document.getElementById('tb-max')
  if (bMax) bMax.addEventListener('click', function () { setTimeout(atualizarIconeMax, 120) })
  atualizarIconeMax()
})

