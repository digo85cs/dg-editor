import { state } from '../../state/app-state.js'
import { pastasPermitidas } from '../arquivos/index.js'
import { relPosix } from '../arquivos/git-helpers.js'
import { escapar } from '../../utils/dom.js'
import { dgConfirm } from '../ui/dg-dialog.js'
import { anunciar } from '../ui/live-region.js'
import { lerPreferenciasA11y } from '../ui/acessibilidade.js'
import { agenteEstado } from '../chat/agente-estado.js'
import { mostrarEditorDiffBar, ocultarEditorDiffBar } from '../ui/diff-bar.js'

const $ = (id) => document.getElementById(id)

let deps = {
  getEditor: () => null,
  raizWorkspaceDe: (c) => c,
  ativarAbaCentro: () => {},
  abrirArquivoNaAba: () => {},
  nomeArquivo: (p) => p,
  mostrarPropostasAgent: () => {},
  mostrarChatRestoreAposApply: () => {}
}

export function configurarDiffPendentes(d) {
  deps = { ...deps, ...d }
}

export function renderDiffHtml(diffText) {
  const lines = String(diffText || '').split(/\r?\n/)
  return lines
    .map((ln) => {
      let cls = 'diff-ctx'
      if (ln.startsWith('+') && !ln.startsWith('+++')) cls = 'diff-add'
      else if (ln.startsWith('-') && !ln.startsWith('---')) cls = 'diff-del'
      else if (ln.startsWith('@@')) cls = 'diff-hunk'
      return '<span class="' + cls + '">' + escapar(ln) + '</span>'
    })
    .join('\n')
}

export async function abrirPainelDiff(absPath) {
  const raiz = deps.raizWorkspaceDe(absPath) || state.pastaAtual
  if (!raiz) return
  const rel = relPosix(absPath, raiz)
  const panel = $('diff-panel')
  const body = $('diff-panel-body')
  const title = $('diff-panel-title')
  if (!panel || !body) return
  title.textContent = 'Diff: ' + rel
  body.textContent = 'Carregando…'
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  try {
    const r = await window.api.invoke('git:diff', raiz, rel)
    body.innerHTML = renderDiffHtml(r?.diff || r?.erro || '(vazio)')
  } catch (e) {
    body.textContent = String(e)
  }
}

let ultimoStatusAgente = ''
let ultimoStatusAgenteEm = 0
/** @type {Set<number>} */
let ocHunksAceitos = new Set()

/**
 * Anuncia a etapa do agente no aria-live, sem repetir a mesma etapa em
 * sequência (streaming), mas permitindo repetir em outro turno.
 * @param {string} etapa
 */
export function anunciarEtapaAgente(etapa) {
  if (!etapa) return
  const agora = Date.now()
  if (etapa === ultimoStatusAgente && agora - ultimoStatusAgenteEm < 4000) return
  if (lerPreferenciasA11y().anuncioStreaming === 'silencioso') return
  ultimoStatusAgente = etapa
  ultimoStatusAgenteEm = agora
  anunciar('Agente: ' + etapa, { prioridade: true })
}

export function fecharPainelDiff() {
  const panel = $('diff-panel')
  if (!panel) return
  panel.classList.add('hidden')
  panel.setAttribute('aria-hidden', 'true')
  agenteEstado.ocPendenteAtivoId = null
  window.__dgApplyViaAgente = false
  ocHunksAceitos = new Set()
  const acoes = $('diff-panel-actions')
  if (acoes) acoes.hidden = true
  const lista = $('oc-pendentes-lista')
  if (lista) {
    lista.hidden = true
    lista.innerHTML = ''
  }
  const bar = $('diff-hunks-bar')
  if (bar) {
    bar.hidden = true
    bar.innerHTML = ''
  }
  if (deps.getEditor() && deps.getEditor().limparDiff) deps.getEditor().limparDiff()
  ocultarEditorDiffBar()
}

/** Preview side-by-side no CodeMirror via propostas:preview (sem gravar disco). */
export async function previewDiffNoEditor(pendente) {
  if (!pendente?.id || !deps.getEditor() || !deps.getEditor().mostrarDiffProposta) return
  const r = await window.api.invoke('propostas:preview', pendente.id, pastasPermitidas())
  if (!r?.ok) {
    alert('Preview: ' + (r?.erro || 'falha'))
    return
  }
  // abre o arquivo no deps.getEditor() (antes) se ainda nao estiver
  const abs = r.absPath || pendente.absPath || pendente.path
  if (abs && state.abaAtiva !== abs) {
    try {
      await deps.abrirArquivoNaAba(abs)
    } catch {
      /* */
    }
  }
  if (abs && deps.getEditor().getCaminho && deps.getEditor().getCaminho() !== abs && r.antes != null) {
    deps.getEditor().abrir(abs, r.antes)
  } else if (r.antes != null && deps.getEditor().getConteudo && deps.getEditor().getConteudo() !== r.antes) {
    // alinha doc com o original do disco usado no preview
    deps.getEditor().abrir(abs || deps.getEditor().getCaminho(), r.antes)
  }
  deps.getEditor().mostrarDiffProposta({
    linhasDel: r.linhasDel || [],
    linhasAdd: r.linhasAdd || [],
    depois: r.depois,
    caminho: abs
  })
  mostrarEditorDiffBar(
    { id: pendente.id, path: pendente.path || abs, absPath: abs },
    { linhasDel: r.linhasDel || [], linhasAdd: r.linhasAdd || [] }
  )
  deps.ativarAbaCentro('deps.getEditor()')
}

export async function carregarHunksDiff(pendenteId) {
  const bar = $('diff-hunks-bar')
  if (!bar) return
  bar.innerHTML = ''
  ocHunksAceitos = new Set()
  const r = await window.api.invoke('propostas:hunks', pendenteId)
  if (!r?.ok || !r.hunks?.length) {
    bar.hidden = true
    return
  }
  bar.hidden = false
  for (const h of r.hunks) {
    ocHunksAceitos.add(h.index)
    const row = document.createElement('div')
    row.className = 'diff-hunk-row'
    row.dataset.index = String(h.index)
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.setAttribute('aria-label', 'Aceitar hunk ' + (h.index + 1))
    cb.addEventListener('change', () => {
      if (cb.checked) {
        ocHunksAceitos.add(h.index)
        row.classList.remove('rejeitado')
      } else {
        ocHunksAceitos.delete(h.index)
        row.classList.add('rejeitado')
      }
    })
    const code = document.createElement('code')
    code.textContent = 'hunk ' + (h.index + 1) + ' ' + (h.resumo || '') + ' ' + (h.header || '')
    row.appendChild(cb)
    row.appendChild(code)
    bar.appendChild(row)
  }
}

export function mostrarDiffOpenClaw(pendente) {
  const panel = $('diff-panel')
  const body = $('diff-panel-body')
  const title = $('diff-panel-title')
  const acoes = $('diff-panel-actions')
  if (!panel || !body || !pendente) return
  agenteEstado.ocPendenteAtivoId = pendente.id
  const origem = pendente.origem || (window.__dgApplyViaAgente ? 'agent' : 'openclaw')
  if (title) title.textContent = origem + ': ' + (pendente.path || pendente.absPath)
  body.innerHTML = renderDiffHtml(pendente.unifiedDiff)
  if (acoes) acoes.hidden = false
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  void previewDiffNoEditor(pendente)
  const lista = $('oc-pendentes-lista')
  if (lista) {
    for (const btn of lista.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.id === pendente.id)
    }
  }
  void carregarHunksDiff(pendente.id)
}

export function renderListaPendentesOc() {
  const lista = $('oc-pendentes-lista')
  if (!lista) return
  const tinhaFoco = lista.contains(document.activeElement)
  lista.innerHTML = ''
  if (!agenteEstado.ocPendentes.length) {
    lista.hidden = true
    return
  }
  lista.hidden = false
  lista.setAttribute('role', 'menu')
  lista.setAttribute('aria-label', 'Propostas pendentes')
  for (const p of agenteEstado.ocPendentes) {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'menuitem')
    b.dataset.id = p.id
    b.textContent = deps.nomeArquivo(p.path || p.absPath)
    b.title = p.absPath || p.path
    if (p.id === agenteEstado.ocPendenteAtivoId) b.classList.add('active')
    b.addEventListener('click', () => mostrarDiffOpenClaw(p))
    lista.appendChild(b)
  }
  if (tinhaFoco) lista.querySelector('button')?.focus()
}

/** Setas/Home/End percorrem as propostas; Enter/Espaço abrem o diff. */
export function initTecladoPendentes() {
  const lista = $('oc-pendentes-lista')
  if (!lista || lista.dataset.teclado === '1') return
  lista.dataset.teclado = '1'
  lista.addEventListener('keydown', (e) => {
    const botoes = [...lista.querySelectorAll('button')]
    if (!botoes.length) return
    const i = botoes.indexOf(document.activeElement)
    let alvo = null
    if (e.key === 'ArrowDown') alvo = (i + 1) % botoes.length
    else if (e.key === 'ArrowUp') alvo = (i - 1 + botoes.length) % botoes.length
    else if (e.key === 'Home') alvo = 0
    else if (e.key === 'End') alvo = botoes.length - 1
    else return
    e.preventDefault()
    botoes[alvo].focus()
  })
}
initTecladoPendentes()

export async function pedirOpenClawUi() {
  const prompt = window.prompt('Pedido para o OpenClaw (edicoes voltam como diff para aprovacao):')
  if (prompt == null || !String(prompt).trim()) return
  const arquivosAbertos = []
  for (const a of state.abas) {
    const item = { path: a.caminho }
    if (a.caminho === state.abaAtiva && deps.getEditor()) {
      item.conteudo = deps.getEditor().getConteudo()
      if (deps.getEditor().getSelecao) {
        const sel = deps.getEditor().getSelecao()
        if (sel) item.selecao = sel
      }
    }
    arquivosAbertos.push(item)
  }
  const r = await window.api.invoke('openclaw:pedir', {
    prompt: String(prompt).trim(),
    pastas: pastasPermitidas(),
    arquivosAbertos
  })
  if (!r?.ok) {
    alert('OpenClaw: ' + (r?.erro || 'erro'))
    return
  }
  agenteEstado.ocPendentes = r.pendentes || []
  if (r.rejeitados?.length) {
    console.warn('[openclaw] paths rejeitados:', r.rejeitados)
  }
  if (!agenteEstado.ocPendentes.length) {
    alert(r.mensagem || 'Nenhum diff proposto.')
    return
  }
  renderListaPendentesOc()
  mostrarDiffOpenClaw(agenteEstado.ocPendentes[0])
}

export async function oferecerCommitAposApply(arquivos) {
  const raiz = (pastasPermitidas() || [])[0] || (state.pastasRecentes || [])[0] || ''
  if (!raiz) return
  const lista = (arquivos || []).filter(Boolean)
  const msgPadrao = lista.length === 1
    ? 'Aplicar diff: ' + lista[0]
    : 'Aplicar diffs do agente (' + lista.length + ' arquivo(s))'
  if (!(await dgConfirm('Diff aplicado. Criar commit local agora?', 'Commit'))) return
  const mensagem = window.prompt('Mensagem do commit:', msgPadrao)
  if (!mensagem || !String(mensagem).trim()) return
  const r = await window.api.invoke('git:commit', {
    raiz,
    mensagem: String(mensagem).trim(),
    arquivos: lista
  })
  if (r?.ok) {
    if (window.dgToast) window.dgToast('Commit ' + (r.hash || 'ok'), 'ok')
    else alert('Commit ' + (r.hash || 'ok'))
  } else if (r?.erro && r.erro !== 'cancelado') {
    if (window.dgToast) window.dgToast('Commit: ' + r.erro, 'erro')
    else alert('Commit: ' + r.erro)
  }
}

export async function finalizarApplyPendente(r, id) {
  const viaAgente = !!window.__dgApplyViaAgente
  const pathAplicado = r?.path || r?.absPath || ''
  agenteEstado.ocPendentes = agenteEstado.ocPendentes.filter((p) => p.id !== id)
  agenteEstado.propostas = agenteEstado.propostas.filter((p) => p.id !== id)
  deps.mostrarPropostasAgent(agenteEstado.propostas)
  if (r.absPath && state.abaAtiva === r.absPath && deps.getEditor()) {
    const ler = await window.api.invoke('arquivo:ler', r.absPath, pastasPermitidas())
    if (ler?.ok) deps.getEditor().abrir(r.absPath, ler.conteudo)
  }
  // fila unificada
  const rest = await window.api.invoke('propostas:listar')
  agenteEstado.ocPendentes = (rest?.pendentes || []).map((p) => ({
    id: p.id,
    path: p.path,
    absPath: p.absPath,
    unifiedDiff: p.unifiedDiff,
    origem: p.origem
  }))
  agenteEstado.propostas = agenteEstado.ocPendentes.slice()
  deps.mostrarPropostasAgent(agenteEstado.propostas)
  if (agenteEstado.ocPendentes.length) {
    renderListaPendentesOc()
    mostrarDiffOpenClaw(agenteEstado.ocPendentes[0])
  } else {
    fecharPainelDiff()
    const base = viaAgente && r.checkpointId ? 'Diff aplicado (checkpoint ' + r.checkpointId + ').' : 'Diff aplicado.'
    if (window.dgToast) window.dgToast(base, 'ok')
    else alert(base)
    deps.mostrarChatRestoreAposApply(pathAplicado ? [pathAplicado] : [])
    await oferecerCommitAposApply(pathAplicado ? [pathAplicado] : [])
  }
}

export async function aplicarPendenteOc() {
  if (!agenteEstado.ocPendenteAtivoId) return
  if (!(await dgConfirm('Aplicar este arquivo no disco?', 'Aplicar'))) return
  const viaAgente = !!window.__dgApplyViaAgente
  const canal = viaAgente ? 'agente:aplicar-proposta' : 'openclaw:aplicar'
  const id = agenteEstado.ocPendenteAtivoId
  const r = await window.api.invoke(canal, id, pastasPermitidas())
  if (!r?.ok) {
    alert('Falha ao aplicar: ' + (r?.erro || 'erro'))
    return
  }
  await finalizarApplyPendente(r, id)
}

export async function aplicarHunksSelecionadosOc() {
  if (!agenteEstado.ocPendenteAtivoId) return
  const indices = [...ocHunksAceitos].sort((a, b) => a - b)
  if (!indices.length) {
    alert('Nenhum hunk selecionado.')
    return
  }
  if (!(await dgConfirm('Aplicar ' + indices.length + ' hunk(s) selecionado(s)?', 'Aplicar hunks'))) return
  const def = await window.api.invoke('propostas:definir-hunks', agenteEstado.ocPendenteAtivoId, indices)
  if (!def?.ok) {
    alert('Falha ao filtrar hunks: ' + (def?.erro || ''))
    return
  }
  if (def.rejeitado) {
    alert('Todos os hunks rejeitados.')
    fecharPainelDiff()
    return
  }
  const viaAgente = !!window.__dgApplyViaAgente || def.pendente?.origem === 'agent'
  const canal = viaAgente ? 'agente:aplicar-proposta' : 'openclaw:aplicar'
  const id = agenteEstado.ocPendenteAtivoId
  const r = await window.api.invoke(canal, id, pastasPermitidas())
  if (!r?.ok) {
    alert('Falha ao aplicar hunks: ' + (r?.erro || 'erro'))
    return
  }
  await finalizarApplyPendente(r, id)
}

export async function rejeitarPendenteOc() {
  if (!agenteEstado.ocPendenteAtivoId) return
  const viaAgente = !!window.__dgApplyViaAgente
  const canal = viaAgente ? 'agente:rejeitar-proposta' : 'openclaw:rejeitar'
  await window.api.invoke(canal, agenteEstado.ocPendenteAtivoId)
  const id = agenteEstado.ocPendenteAtivoId
  agenteEstado.ocPendentes = agenteEstado.ocPendentes.filter((p) => p.id !== id)
  if (viaAgente) {
    agenteEstado.propostas = agenteEstado.propostas.filter((p) => p.id !== id)
    deps.mostrarPropostasAgent(agenteEstado.propostas)
  }
  if (agenteEstado.ocPendentes.length) {
    renderListaPendentesOc()
    mostrarDiffOpenClaw(agenteEstado.ocPendentes[0])
  } else {
    fecharPainelDiff()
  }
}

export async function carregarConfigOpenClawUi() {
  const cfg = await window.api.invoke('openclaw:config-get')
  let st = await window.api.invoke('openclaw:token-ensure')
  if (!st?.ok || !st?.configurado) {
    st = await window.api.invoke('openclaw:token-status')
  }
  if (cfg?.config) {
    const ep = $('oc-endpoint')
    const md = $('oc-model')
    if (ep) ep.value = cfg.config.endpoint || ''
    if (md) md.value = cfg.config.model || ''
  }
  const tok = $('oc-token')
  if (tok) tok.value = ''
  const status = $('oc-token-status')
  if (status) {
    if (st?.configurado || st?.ok) {
      status.textContent = st?.criado
        ? 'Token OpenClaw criado automaticamente (prefixo ' + (st.prefixo || 'oc_') + '…).'
        : 'Token gravado no cofre do SO (safeStorage).'
    } else {
      status.textContent = 'Nenhum token configurado.' + (st?.erro ? ' ' + st.erro : '')
    }
  }
}

export async function salvarConfigOpenClawUi() {
  const endpoint = $('oc-endpoint')?.value?.trim()
  const model = $('oc-model')?.value?.trim()
  await window.api.invoke('openclaw:config-set', { endpoint, model })
  const token = $('oc-token')?.value
  if (token && token.trim()) {
    const r = await window.api.invoke('openclaw:token-set', token.trim())
    if (!r?.ok) {
      alert('Token nao salvo: ' + (r?.erro || 'erro'))
      return
    }
    const tok = $('oc-token')
    if (tok) tok.value = ''
  }
  await carregarConfigOpenClawUi()
  alert('OpenClaw salvo.')
}

