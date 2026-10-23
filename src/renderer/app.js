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
  $('whereis-bar').classList.remove('hidden')
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
  html += secao('O que é', report.oQueE || '—')
  html += secao('Stack', report.stack || '—')
  html += secao('Estrutura', report.estrutura || '—')
  html += secaoLista('Pontos de atenção', report.pontosAtencao)
  html += secaoLista('Sugestões', report.sugestoes)
  if (report.provider) {
    html += '<p class="muted">Analisado por: ' + escapar(report.provider) +
      (report.model ? ' (' + escapar(report.model) + ')' : '') + ' — ' +
      new Date(report.analyzedAt).toLocaleString('pt-BR') + badge + '</p>'
  }
  $('analysis-content').innerHTML = html
}

function secao(titulo, texto) {
  return '<div class="analysis-section"><h4>' + titulo + '</h4><p>' + escapar(texto) + '</p></div>'
}

function secaoLista(titulo, itens) {
  if (!itens || itens.length === 0) return secao(titulo, '—')
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
}

function adicionarBolha(role, content, provider) {
  const area = $('chat-messages')
  const div = document.createElement('div')
  div.className = 'msg ' + role
  div.textContent = content
  if (provider) {
    const tag = document.createElement('span')
    tag.className = 'msg-provider'
    tag.textContent = provider
    div.appendChild(tag)
  }
  area.appendChild(div)
  area.scrollTop = area.scrollHeight
}

async function enviarMensagem() {
  if (!pastaAtual) return
  const input = $('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  input.value = ''
  adicionarBolha('user', texto)
  $('chat-send').disabled = true
  try {
    const r = await window.api.invoke('chat:send', pastaAtual, texto)
    adicionarBolha(r.message.role, r.message.content, r.message.provider)
  } catch (err) {
    adicionarBolha('assistant', 'Erro ao enviar: ' + String(err), 'erro')
  } finally {
    $('chat-send').disabled = false
    input.focus()
  }
}

// ---------- Onde esta? ----------
async function buscarOndeEsta() {
  if (!pastaAtual) return
  const q = $('whereis-input').value.trim()
  if (!q) return
  let box = document.querySelector('.whereis-result')
  if (!box) {
    box = document.createElement('div')
    box.className = 'whereis-result'
    $('whereis-bar').after(box)
  }
  box.textContent = 'Buscando "' + q + '"...'
  const r = await window.api.invoke('whereis:ask', pastaAtual, q)
  box.textContent = r.formatted
}

// ---------- Configuracoes ----------
async function abrirConfig() {
  $('modal-config').classList.remove('hidden')
  const p = await window.api.invoke('system:get-profile')
  const forca = await window.api.invoke('system:profile-strength')
  const gb = (b) => (b / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  $('config-profile').innerHTML =
    '<h4>Maquina</h4>' +
    escapar(p.hostname) + ' — ' + escapar(p.platform) + ' ' + escapar(p.arch) + '<br>' +
    (p.cpus ? p.cpus.length : '?') + ' nucleos — ' + gb(p.totalMemory) + ' RAM<br>' +
    'Forca: <strong>' + escapar(forca) + '</strong>'
  const o = await window.api.invoke('brain:ollama-status')
  $('config-ollama').innerHTML =
    '<h4>Ollama (IA local)</h4>' +
    (o.installed
      ? (o.reachable
        ? 'Instalado e rodando — ' + o.models.length + ' modelo(s): ' + escapar(o.models.map((m) => m.name).join(', ') || '—')
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
      'Desde: ' + (s.identidade.criadoEm ? new Date(s.identidade.criadoEm).toLocaleDateString('pt-BR') : '—')
    $('contas-maquina').innerHTML =
      '<h4>Maquina</h4>' +
      escapar(s.maquina.hostname) + ' — ' + escapar(s.maquina.plataforma) + '<br>' +
      s.maquina.cpus + ' nucleos — ' + escapar(s.maquina.ramGB) + ' GB RAM<br>' +
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

// ---------- Tema (Fase 2) ----------
async function alternarTema() {
  const atual = document.body.classList.contains('tema-claro') ? 'claro' : 'escuro'
  const novo = atual === 'claro' ? 'escuro' : 'claro'
  await window.api.invoke('tema:set', novo)
  aplicarTema(novo)
}

function aplicarTema(tema) {
  document.body.classList.toggle('tema-claro', tema === 'claro')
  $('btn-tema').textContent = tema === 'claro' ? '\u2600' : '\u263D'
  localStorage.setItem('dg-tema', tema)
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
  { id: 'onde-esta', label: 'Onde esta? (focar busca)', hint: 'busca textual' },
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
  else if (id === 'onde-esta') { $('whereis-bar').classList.remove('hidden'); $('whereis-input').focus() }
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
$('btn-contas-close').addEventListener('click', () => $('modal-contas').classList.add('hidden'))
$('btn-tema').addEventListener('click', alternarTema)
$('btn-palette').addEventListener('click', abrirPaleta)
$('chat-send').addEventListener('click', enviarMensagem)
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() }
})
$('whereis-btn').addEventListener('click', buscarOndeEsta)
$('whereis-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarOndeEsta() })
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
