import { state } from '../../state/app-state.js'
import { pastasPermitidas } from '../arquivos/index.js'
import { dgConfirm } from '../ui/dg-dialog.js'
import { anunciar } from '../ui/live-region.js'
import { lerPreferenciasA11y } from '../ui/acessibilidade.js'
import { agenteEstado } from './agente-estado.js'
import { atualizarStatusAgent, agenteSelecionadoUi, carregarAgentesUi } from './agente-seletor.js'
import { setChatLiveStatus, setChatSendMode, adicionarBolha, limparUiAgenteChat } from './chat-core.js'
import {
  renderChatPlanoCard,
  renderChatApplyCard,
  renderChatRestoreStrip,
  ocultarChatRestoreStrip
} from './chat-parity.js'
import {
  humanizarStatus,
  humanizarToolInicio,
  humanizarToolFim,
  atualizarCartaoTrabalho,
  fecharCartaoTrabalho
} from './progresso-humano.js'
import {
  criarStatsVazios,
  aplicarEventoStats,
  pintarStatsNoCartao,
  mostrarBannerAgentMode,
  ocultarBannerAgentMode
} from './agent-activity.js'
import { organizarRespostaCursor } from './render.js'

const $ = (id) => document.getElementById(id)

let deps = {
  getEditor: () => null,
  toggleRight: () => {},
  ativarAbaDireita: () => {},
  oferecerCommitAposApply: async () => {},
  renderListaPendentesOc: () => {},
  mostrarDiffOpenClaw: () => {},
  anunciarEtapaAgente: () => {},
  previewDiffNoEditor: async () => {}
}

export function configurarAgenteCards(d) {
  deps = { ...deps, ...d }
}

export function renderAgentTrace(passos) {
  const box = $('agent-trace')
  if (!box) return
  box.innerHTML = ''
  if (!passos || !passos.length) {
    box.innerHTML = '<span class="muted">Sem tool calls neste turno.</span>'
    return
  }
  for (const p of passos) {
    const div = document.createElement('div')
    div.className = 'step'
    if (p.tipo === 'tool') {
      div.textContent =
        '⚙️ ' +
        (p.nome || 'tool') +
        (p.resultado ? ' → ' + String(p.resultado).slice(0, 160) : '')
    } else {
      div.textContent = '💬 ' + String(p.texto || '').slice(0, 200)
    }
    box.appendChild(div)
  }
  box.scrollTop = box.scrollHeight
}

export function appendAgentTraceLive(line) {
  const box = $('agent-trace')
  if (!box) return
  if (box.querySelector('.muted')) box.innerHTML = ''
  const div = document.createElement('div')
  div.className = 'step'
  div.textContent = line
  box.appendChild(div)
  box.scrollTop = box.scrollHeight
}

export function atualizarChatPlanoCard(plano) {
  const area = $('chat-messages')
  renderChatPlanoCard(area, plano, {
    onImplementar: (soProximo) => void executarPlanoDoChat(!!soProximo),
    onMarcar: async (id, feito) => {
      await window.api.invoke('agente:plano-marcar-passo', id, feito)
      const r = await window.api.invoke('agente:plano-ler')
      renderPlanoChecklist(r?.plano)
      atualizarChatPlanoCard(r?.plano)
    }
  })
}

export function atualizarChatApplyCard(propostas) {
  const area = $('chat-messages')
  renderChatApplyCard(area, propostas || agenteEstado.propostas, {
    onAplicarTodas: () => void aplicarTodasPropostasAgent(),
    onRevisar: () => {
      deps.toggleRight(true)
      deps.ativarAbaDireita('agent')
      abrirFilaPropostasAgent()
    },
    onAplicarUma: (id) => void aplicarUmaPropostaAgent(id)
  })
}

export function mostrarChatRestoreAposApply(arquivos) {
  renderChatRestoreStrip($('chat-messages'), {
    arquivos: arquivos || [],
    onDesfazer: () => void desfazerCheckpointDoChat()
  })
  atualizarChatApplyCard(agenteEstado.propostas)
}

export async function desfazerCheckpointDoChat() {
  const r = await window.api.invoke('agente:checkpoint-desfazer', pastasPermitidas())
  if (r?.ok) {
    if (window.dgToast) window.dgToast('Checkpoint restaurado (' + (r.restaurados || 0) + ' arquivo(s)).', 'ok')
    else alert('Checkpoint restaurado (' + (r.restaurados || 0) + ' arquivo(s)).')
    ocultarChatRestoreStrip($('chat-messages'))
  } else {
    if (window.dgToast) window.dgToast('Falha: ' + (r?.erro || 'restore'), 'erro')
    else alert('Falha: ' + (r?.erro || 'restore'))
  }
}

export async function aplicarUmaPropostaAgent(id) {
  if (!id) return
  if (!(await dgConfirm('Aplicar este arquivo no disco?', 'Aplicar'))) return
  window.__dgApplyViaAgente = true
  const r = await window.api.invoke('agente:aplicar-proposta', id, pastasPermitidas())
  if (!r?.ok) {
    if (window.dgToast) window.dgToast('Falha em apply: ' + (r?.erro || 'erro'), 'erro')
    else alert('Falha em apply: ' + (r?.erro || ''))
    return
  }
  agenteEstado.propostas = agenteEstado.propostas.filter((p) => p.id !== id)
  const rest = await window.api.invoke('agente:propostas')
  mostrarPropostasAgent(rest?.pendentes || [])
  atualizarChatApplyCard(rest?.pendentes || [])
  mostrarChatRestoreAposApply([r.path || r.absPath].filter(Boolean))
  await deps.oferecerCommitAposApply([r.path || r.absPath].filter(Boolean))
}

export async function executarPlanoDoChat(soProximo) {
  if (!state.pastaAtual) {
    alert('Abra uma pasta primeiro.')
    return
  }
  const area = $('chat-messages')
  const modoSel = document.getElementById('chat-mode-select')
  if (modoSel) modoSel.value = 'code'
  const planToggle = document.getElementById('agent-plan-mode')
  if (planToggle) planToggle.checked = false
  mostrarBannerAgentMode(
    area,
    soProximo
      ? 'Proximo passo do plano — Modo Agent'
      : 'Implementar plano — sair do Plan e executar'
  )
  ligarProgressoAgent()
  atualizarCartaoTrabalho(area, {
    titulo: 'Modo Agent',
    passo: soProximo ? 'Executando proximo passo…' : 'Implementando o plano…'
  })
  setChatLiveStatus('Modo Agent — executando plano…')
  setChatSendMode('stop')
  const agentStats = criarStatsVazios()
  const offProg = window.api.on?.('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    aplicarEventoStats(agentStats, ev)
    if (ev.tipo === 'stats' || ev.tipo === 'tool' || ev.tipo === 'proposta') {
      pintarStatsNoCartao(area, agentStats)
    }
    if (ev.tipo === 'status') {
      atualizarCartaoTrabalho(area, { titulo: 'Modo Agent', passo: humanizarStatus(ev.texto) })
    }
  })
  try {
    const r = await window.api.invoke('agente:executar-plano', {
      raiz: state.pastaAtual,
      pastas: pastasPermitidas(),
      soProximo: !!soProximo
    })
    if (!r?.ok) {
      alert(r?.erro || 'Falha ao executar plano')
      return
    }
    if (r.texto) adicionarBolha('assistant', organizarRespostaCursor(r.texto), r.modelo || 'agente')
    renderAgentTrace(r.passos || [])
    mostrarPropostasAgent(r.propostas || [])
    atualizarChatApplyCard(r.propostas || [])
    renderPlanoChecklist(r.plano)
    atualizarChatPlanoCard(r.plano)
    atualizarStatusAgent(r.modelo, r.duracaoMs, r.fila)
    deps.toggleRight(true)
    deps.ativarAbaDireita('agent')
  } finally {
    if (typeof offProg === 'function') offProg()
    fecharCartaoTrabalho(area, 'Pronto')
    setChatSendMode('send')
    setChatLiveStatus('')
    ocultarBannerAgentMode(area)
  }
}

export function mostrarPropostasAgent(propostas) {
  agenteEstado.propostas = propostas || []
  atualizarChatApplyCard(agenteEstado.propostas)
  const box = $('agent-propostas-resumo')
  if (!box) return
  const tinhaFoco = box.contains(document.activeElement)
  if (!agenteEstado.propostas.length) {
    box.hidden = true
    box.innerHTML = ''
    box.removeAttribute('aria-label')
    if (tinhaFoco) $('chat-input')?.focus()
    return
  }
  box.hidden = false
  const n = agenteEstado.propostas.length
  const linhas = agenteEstado.propostas
    .map((p) => {
      const add = (String(p.unifiedDiff || '').match(/^\+/gm) || []).length
      const del = (String(p.unifiedDiff || '').match(/^-/gm) || []).length
      return (
        '<li><code>' +
        String(p.path || '').replace(/</g, '&lt;') +
        '</code> <span class="muted">+' +
        Math.max(0, add - 1) +
        '/-' +
        Math.max(0, del - 1) +
        '</span></li>'
      )
    })
    .join('')
  box.setAttribute('aria-label', n + ' proposta(s) de edição pendentes')
  box.innerHTML =
    '<div class="agent-propostas-titulo"><strong>' +
    n +
    ' proposta(s)</strong></div><ul class="agent-propostas-lista">' +
    linhas +
    '</ul>'
  const acoes = document.createElement('div')
  acoes.className = 'agent-propostas-acoes'
  const btnVer = document.createElement('button')
  btnVer.type = 'button'
  btnVer.className = 'btn-small'
  btnVer.textContent = 'Revisar diffs'
  btnVer.addEventListener('click', () => abrirFilaPropostasAgent())
  const btnAll = document.createElement('button')
  btnAll.type = 'button'
  btnAll.className = 'btn-small'
  btnAll.textContent = 'Aplicar todas'
  btnAll.addEventListener('click', () => void aplicarTodasPropostasAgent())
  acoes.appendChild(btnVer)
  acoes.appendChild(btnAll)
  box.appendChild(acoes)
  if (tinhaFoco) btnVer.focus()
}

export function abrirFilaPropostasAgent() {
  if (!agenteEstado.propostas.length) return
  agenteEstado.ocPendentes = agenteEstado.propostas.map((p) => ({
    id: p.id,
    path: p.path,
    absPath: p.absPath || p.path,
    unifiedDiff: p.unifiedDiff
  }))
  // reutilizar painel OpenClaw mas apply via agente:aplicar-proposta
  deps.renderListaPendentesOc()
  deps.mostrarDiffOpenClaw(agenteEstado.ocPendentes[0])
  window.__dgApplyViaAgente = true
}

export async function aplicarTodasPropostasAgent() {
  if (!agenteEstado.propostas.length) return
  const total = agenteEstado.propostas.length
  if (
    !(await dgConfirm(
      'Aplicar ' + total + ' arquivo(s)? Um checkpoint será criado por arquivo.',
      'Aplicar propostas'
    ))
  )
    return
  const aplicados = []
  const checkpoints = []
  const falhas = []
  window.__dgApplyViaAgente = true
  for (const p of [...agenteEstado.propostas]) {
    const r = await window.api.invoke('agente:aplicar-proposta', p.id, pastasPermitidas())
    if (!r?.ok) {
      falhas.push({ path: p.path, erro: r?.erro || 'erro' })
      continue
    }
    aplicados.push(p.path || r.path)
    if (r.checkpointId) checkpoints.push({ id: r.checkpointId, path: p.path })
  }
  const rest = await window.api.invoke('agente:propostas')
  mostrarPropostasAgent(rest?.pendentes || [])
  atualizarChatApplyCard(rest?.pendentes || [])
  if (aplicados.length) {
    mostrarChatRestoreAposApply(aplicados)
    await deps.oferecerCommitAposApply(aplicados)
  }
  if (falhas.length) {
    const resume = falhas
      .slice(0, 5)
      .map((f) => '· ' + f.path + ': ' + f.erro)
      .join('\n')
    const desfazer = await dgConfirm(
      aplicados.length +
        ' arquivo(s) aplicado(s), ' +
        falhas.length +
        ' falhou(aram):\n' +
        resume +
        '\n\nDeseja desfazer os arquivos já aplicados?',
      'Desfazer aplicados'
    )
    if (desfazer && checkpoints.length) {
      let desfeitos = 0
      for (const ck of [...checkpoints].reverse()) {
        const rr = await window.api.invoke('agente:checkpoint-restaurar', ck.id, pastasPermitidas())
        if (rr?.ok) desfeitos++
      }
      ocultarChatRestoreStrip($('chat-messages'))
      if (window.dgToast) window.dgToast('Apply parcial: ' + desfeitos + ' arquivo(s) revertido(s).', 'aviso')
    } else if (window.dgToast) {
      window.dgToast('Apply parcial: ' + aplicados.length + ' ok, ' + falhas.length + ' com falha.', 'aviso')
    }
    return
  }
  if (window.dgToast) window.dgToast('Apply concluído (' + aplicados.length + ' arquivo(s)).', 'ok')
  else alert('Apply concluído.')
}

export function ligarProgressoAgent() {
  if (agenteEstado.progressUnsub) agenteEstado.progressUnsub()
  const painelStats = criarStatsVazios()
  agenteEstado.progressUnsub = window.api.on('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    aplicarEventoStats(painelStats, ev)
    if (ev.tipo === 'stats' || ev.tipo === 'tool' || ev.tipo === 'proposta') {
      let strip = document.getElementById('agent-stats-live')
      if (!strip) {
        const out = $('agent-output')
        if (out && out.parentElement) {
          strip = document.createElement('p')
          strip.id = 'agent-stats-live'
          strip.className = 'chat-work-stats agent-stats-live'
          out.parentElement.insertBefore(strip, out)
        }
      }
      if (strip) {
        const parts = []
        if (painelStats.edits) parts.push('Editing ' + painelStats.edits)
        if (painelStats.explored) parts.push('explored ' + painelStats.explored)
        if (painelStats.searches) parts.push(painelStats.searches + ' searches')
        if (painelStats.tools) parts.push(painelStats.tools + ' tools')
        if (painelStats.commands) parts.push('ran ' + painelStats.commands + ' commands')
        strip.textContent = parts.join(' · ')
        strip.hidden = !parts.length
      }
      pintarStatsNoCartao($('chat-messages'), painelStats)
    }
    if (ev.tipo === 'status') {
      const etapa = humanizarStatus(ev.texto)
      appendAgentTraceLive(etapa)
      deps.anunciarEtapaAgente(etapa)
    }
    else if (ev.tipo === 'tool' && ev.fase === 'inicio') appendAgentTraceLive(humanizarToolInicio(ev.nome) + '…')
    else if (ev.tipo === 'tool' && ev.fase === 'fim')
      appendAgentTraceLive(humanizarToolFim(ev.nome, ev.detalhe))
    else if (ev.tipo === 'proposta') { appendAgentTraceLive('Sugestão: ' + (ev.path || 'arquivo')); if (ev.id) void deps.previewDiffNoEditor({ id: ev.id, path: ev.path }) }
    else if (ev.tipo === 'texto-delta') {
      const out = $('agent-output')
      if (out) {
        if (out.dataset.stream !== '1') out.textContent = ''
        out.dataset.stream = '1'
        out.textContent += String(ev.texto || '')
      }
    }
    else if (ev.tipo === 'texto') {
      const out = $('agent-output')
      if (out) {
        out.textContent = String(ev.texto || '')
        delete out.dataset.stream
      }
    }
  })
}

/** Anuncia etapas e resultado do turno mesmo fora do painel Agent (ex.: chat). */
export function ligarAnuncioEtapasAgente() {
  window.api.on?.('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    if (ev.tipo === 'fim') {
      if (lerPreferenciasA11y().anuncioStreaming === 'silencioso') return
      if (ev.cancelado) anunciar('Geração interrompida.')
      else if (ev.ok) anunciar('Resposta concluída.')
      else anunciar('Não foi possível concluir a resposta.', { urgencia: 'assertivo' })
      return
    }
    if (ev.tipo !== 'status') return
    deps.anunciarEtapaAgente(humanizarStatus(ev.texto))
  })
}

export function coletarAbasCtx() {
  const out = []
  for (const a of state.abas) {
    const item = { path: a.caminho, ativa: a.caminho === state.abaAtiva }
    if (a.caminho === state.abaAtiva && deps.getEditor() && deps.getEditor().getConteudo) {
      try {
        item.conteudo = deps.getEditor().getConteudo()
      } catch {
        /* */
      }
    }
    out.push(item)
  }
  return out
}

/** Erros/diagnostics recentes do agent (typecheck/test/manual) para o contexto. */
export async function coletarErrosEditor() {
  try {
    const r = await window.api.invoke('agente:diagnosticos')
    const lista = (r?.recentes || r?.diagnosticos || []).filter((d) => d && d.ok === false && d.saida)
    if (!lista.length) return ''
    return lista
      .slice(0, 5)
      .map((d) => '[' + d.origem + '] ' + (d.resumo || '') + '\n' + String(d.saida || '').slice(0, 3000))
      .join('\n\n')
      .slice(0, 8000)
  } catch {
    return ''
  }
}

export function renderPlanoChecklist(plano) {
  const box = $('agent-plano-checklist')
  if (!box) return
  const passos = plano?.passos || []
  if (!passos.length) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  box.hidden = false
  box.innerHTML = ''
  const titulo = document.createElement('div')
  titulo.innerHTML =
    '<strong>Plano</strong> <span class="muted">' +
    passos.filter((p) => p.feito).length +
    '/' +
    passos.length +
    '</span>'
  box.appendChild(titulo)
  for (const p of passos) {
    const lab = document.createElement('label')
    if (p.feito) lab.classList.add('feito')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!p.feito
    cb.addEventListener('change', async () => {
      await window.api.invoke('agente:plano-marcar-passo', p.id, cb.checked)
      const r = await window.api.invoke('agente:plano-ler')
      renderPlanoChecklist(r?.plano)
      atualizarChatPlanoCard(r?.plano)
    })
    const span = document.createElement('span')
    span.textContent = p.texto
    lab.appendChild(cb)
    lab.appendChild(span)
    box.appendChild(lab)
  }
  // Espelho vivo no transcript do chat
  atualizarChatPlanoCard(plano)
}

export async function refrescarPlanoUi() {
  const r = await window.api.invoke('agente:plano-ler')
  renderPlanoChecklist(r?.plano)
}

export async function executarAgentUi(orquestrar) {
  if (!state.pastaAtual) {
    alert('Abra uma pasta primeiro.')
    return
  }
  const input = $('agent-input')
  const texto = input?.value?.trim()
  if (!texto) return
  const plan =
    $('agent-plan-mode')?.checked ||
    document.getElementById('chat-mode-select')?.value === 'plan'
  const verify = $('agent-verify-loop')?.checked
  const agente = agenteSelecionadoUi()
  const out = $('agent-output')
  const send = $('agent-send')
  if (send) send.disabled = true
  if (out) out.textContent = plan ? 'Gerando plano…' : 'Executando…'
  renderAgentTrace([])
  mostrarPropostasAgent([])
  ligarProgressoAgent()
  let selecao = ''
  try {
    if (deps.getEditor() && deps.getEditor().getSelecao) selecao = deps.getEditor().getSelecao() || ''
  } catch {
    /* */
  }
  try {
    let r
    if (orquestrar) {
      r = await window.api.invoke('agente:orquestrar', state.pastaAtual, texto)
      if (out) {
        out.textContent = (r?.passos || [])
          .map((p) => '## ' + p.agente + (p.ok ? '' : ' (erro)') + '\n' + (p.texto || p.erro || ''))
          .join('\n\n')
      }
      const todos = []
      for (const p of r?.passos || []) {
        if (p.passos) todos.push(...p.passos)
      }
      renderAgentTrace(todos)
    } else {
      const errosEditor = await coletarErrosEditor()
      r = await window.api.invoke('agente:pedir', {
        raiz: state.pastaAtual,
        pergunta: texto,
        modo: plan ? 'plan' : 'agent',
        agente,
        pastas: pastasPermitidas(),
        selecao,
        arquivoAtivo: state.abaAtiva || undefined,
        proposeWrites: true,
        verificarApos: !!verify && !plan,
        abas: coletarAbasCtx(),
        incluirGit: true,
        errosEditor: errosEditor || undefined
      })
      if (!r?.ok) {
        if (out) out.textContent = 'Erro: ' + (r?.erro || 'falha')
        return
      }
      if (out) {
        out.textContent =
          (plan ? '[PLAN]\n\n' : '') +
          (r.texto || '') +
          (r.duracaoMs ? '\n\n— ' + r.duracaoMs + ' ms · ' + (r.modelo || '') : '')
      }
      renderAgentTrace(r.passos || [])
      mostrarPropostasAgent(r.propostas || [])
      atualizarStatusAgent(r.modelo, r.duracaoMs, r.fila)
      if (plan || r.plano) renderPlanoChecklist(r.plano)
      else await refrescarPlanoUi()
    }
    await carregarAgentesUi()
  } catch (e) {
    if (out) out.textContent = 'Erro: ' + String(e)
  } finally {
    if (send) send.disabled = false
  }
}

export function ligarPainelAgente() {
  $('agent-send')?.addEventListener('click', () => void executarAgentUi(false))
  $('btn-agent-orquestrar')?.addEventListener('click', () => void executarAgentUi(true))
  $('btn-agent-stop')?.addEventListener('click', async () => {
    const r = await window.api.invoke('agente:cancelar')
    appendAgentTraceLive('■ cancelado (' + (r?.cancelados || 0) + ')')
    limparUiAgenteChat({ tituloFinal: 'Parado a seu pedido' })
    await carregarAgentesUi()
  })
  ;(function initAgentMoreMenu() {
    const btn = $('btn-agent-mais')
    const menu = $('agent-mais-menu')
    const header = $('agent-header')
    if (!btn || !menu) return
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = menu.hidden
      menu.hidden = !open
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      header?.classList.toggle('is-expanded', open)
    })
    menu.querySelectorAll('[data-agent-more]').forEach((item) => {
      item.addEventListener('click', () => {
        const a = item.getAttribute('data-agent-more')
        menu.hidden = true
        btn.setAttribute('aria-expanded', 'false')
        header?.classList.remove('is-expanded')
        if (a === 'passo') $('btn-agent-exec-passo')?.click()
        else if (a === 'verificar') $('btn-agent-verificar')?.click()
        else if (a === 'undo') $('btn-agent-undo')?.click()
      })
    })
    document.addEventListener('click', () => {
      if (!menu.hidden) {
        menu.hidden = true
        btn.setAttribute('aria-expanded', 'false')
        header?.classList.remove('is-expanded')
      }
    })
  })()
  $('btn-agent-exec-plano')?.addEventListener('click', async () => {
    if (!state.pastaAtual) return
    ligarProgressoAgent()
    const out = $('agent-output')
    if (out) out.textContent = 'Executando plano salvo…'
    const r = await window.api.invoke('agente:executar-plano', {
      raiz: state.pastaAtual,
      pastas: pastasPermitidas(),
      soProximo: false
    })
    if (!r?.ok) {
      alert(r?.erro || 'falha')
      return
    }
    if (out) out.textContent = r.texto || ''
    renderAgentTrace(r.passos || [])
    mostrarPropostasAgent(r.propostas || [])
    atualizarChatApplyCard(r.propostas || [])
    atualizarStatusAgent(r.modelo, r.duracaoMs, null)
    renderPlanoChecklist(r.plano)
    mostrarBannerAgentMode($('chat-messages'), 'Plano executado pelo painel Agente')
  })
  $('btn-agent-exec-passo')?.addEventListener('click', async () => {
    if (!state.pastaAtual) return
    ligarProgressoAgent()
    const out = $('agent-output')
    if (out) out.textContent = 'Executando próximo passo…'
    const r = await window.api.invoke('agente:executar-plano', {
      raiz: state.pastaAtual,
      pastas: pastasPermitidas(),
      soProximo: true
    })
    if (!r?.ok) {
      alert(r?.erro || 'falha')
      return
    }
    if (out) {
      out.textContent =
        (r.passoExecutado ? '[Passo] ' + r.passoExecutado.texto + '\n\n' : '') + (r.texto || '')
    }
    renderAgentTrace(r.passos || [])
    mostrarPropostasAgent(r.propostas || [])
    atualizarChatApplyCard(r.propostas || [])
    renderPlanoChecklist(r.plano)
  })
  $('btn-agent-verificar')?.addEventListener('click', async () => {
    if (!state.pastaAtual) return
    appendAgentTraceLive('… typecheck')
    const r = await window.api.invoke('agente:verificar', {
      raiz: state.pastaAtual,
      pastas: pastasPermitidas(),
      modo: 'typecheck'
    })
    const d = r?.diagnostico
    appendAgentTraceLive(d?.ok ? 'âœ“ typecheck ok' : 'âœ— ' + (d?.resumo || 'falha'))
    const out = $('agent-output')
    if (out && d && !d.ok) out.textContent = (out.textContent || '') + '\n\n[typecheck]\n' + (d.saida || '')
  })
  $('btn-agent-undo')?.addEventListener('click', async () => {
    const r = await window.api.invoke('agente:checkpoint-desfazer', pastasPermitidas())
    alert(r?.ok ? 'Checkpoint restaurado (' + r.restaurados + ' arquivo(s)).' : 'Falha: ' + (r?.erro || ''))
  })
  $('agent-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void executarAgentUi(false)
    }
  })
  void refrescarPlanoUi()
}
