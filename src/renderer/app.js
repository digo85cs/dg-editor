// DG Studio - renderer (Fase 1)
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

// ---------- Selecionar pasta: carrega chat + cache + dispara analise ----------
async function selecionarPasta(path) {
  pastaAtual = path
  $('chat-title').textContent = path.split('\\').pop() || path
  $('empty-state')?.remove()
  $('whereis-bar').classList.remove('hidden')
  $('chat-send').disabled = false
  $('btn-reanalyze').classList.remove('hidden')
  renderizarPastas()

  // chat persistido da pasta
  const msgs = await window.api.invoke('chat:load', path)
  renderizarChat(msgs)

  // cache da analise (MOSTRA se existir; NUNCA analisa sozinho - botao)
  const cached = await window.api.invoke('analysis:cached', path)
  if (cached) {
    renderizarAnalise(cached, true)
  } else {
    $('analysis-content').innerHTML = '<p class="muted">Pasta aberta. Clique em <strong>Analisar agora</strong> (canto superior do painel) quando quiser a analise.</p>'
  }

  // regras: cria template se nao existir
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

// ---------- Eventos ----------
$('btn-add-folder').addEventListener('click', abrirPasta)
$('btn-empty-open').addEventListener('click', abrirPasta)
$('btn-reanalyze').addEventListener('click', () => pastaAtual && rodarAnalise(pastaAtual, true))
$('btn-config').addEventListener('click', abrirConfig)
$('btn-config-close').addEventListener('click', () => $('modal-config').classList.add('hidden'))
$('chat-send').addEventListener('click', enviarMensagem)
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() }
})
$('whereis-btn').addEventListener('click', buscarOndeEsta)
$('whereis-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarOndeEsta() })

// ---------- Boot ----------
carregarPastas()
renderizarPastas()
window.api.invoke('brain:providers').then((ps) => {
  const ativo = ps.find((p) => p.available)
  if (ativo) $('chat-provider').textContent = 'IA: ' + ativo.name
})