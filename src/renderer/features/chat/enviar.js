import { state } from '../../state/app-state.js'
import { anunciar } from '../ui/live-region.js'
import { mostrarToast } from '../ui/toast.js'
import { lerPreferenciasA11y } from '../ui/acessibilidade.js'
import { agendarSalvarWorkspace } from '../../workspace-ui.js'
import { mostrarLoadingChat, removerLoadingChat } from '../../chat.js'
import {
  chatOcupado,
  pararChatOuAgente,
  adicionarBolha,
  obterHistChat,
  setChatSendMode,
  setChatLiveStatus,
  limparUiAgenteChat,
  marcarChatComMsgs,
  ligarAcoesBolha
} from './chat-core.js'
import {
  registrarJob,
  atualizarJob,
  removerJob,
  pastaTemJob,
  pintarSidebarJobs
} from './jobs-paralelos.js'
import { obterAnexosChat, limparAnexosChat } from './anexos.js'
import { skillAtivaChat } from './skill-chip.js'
import { sincronizarAgenteSelects, atualizarStatusAgent } from './agente-seletor.js'
import {
  renderPlanoChecklist,
  atualizarChatPlanoCard,
  mostrarPropostasAgent,
  atualizarChatApplyCard,
  mostrarChatRestoreAposApply
} from './agente-cards.js'
import { previewDiffNoEditor } from '../editor/diff-pendentes.js'
import { toggleRight } from '../layout/paineis.js'
import { ativarAbaDireita, ativarPainelCentro } from '../layout/panes.js'
import { atualizarBadgeProvedor } from '../ui/deps-status.js'
import { bolhaHtml, organizarRespostaCursor } from './render.js'
import { registrarUsoTurno } from './uso.js'
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
  pedidoExigeAgentMode,
  mostrarBannerAgentMode,
  ocultarBannerAgentMode
} from './agent-activity.js'

const $ = (id) => document.getElementById(id)

let deps = {
  resolverPastaChatAtiva: () => null,
  sincronizarContextoPasta: async () => {},
  nomePastaUi: (p) => p
}

export function configurarEnviar(d) {
  deps = { ...deps, ...d }
}

export async function enviarMensagem() {
  let pastaChat = deps.resolverPastaChatAtiva()
  if (!pastaChat) {
    mostrarToast('Selecione um repositório no Bloco 1 para o chat analisar a pasta.', 'aviso')
    return
  }
  // Stop só se ESTE repositório já está rodando; outros repos podem seguir em paralelo
  if (chatOcupado() && pastaTemJob(pastaChat)) {
    await pararChatOuAgente()
    return
  }
  if (pastaChat !== state.pastaAtual) {
    await deps.sincronizarContextoPasta(pastaChat, { forceAnalise: true })
    pastaChat = state.pastaAtual || pastaChat
  } else {
    try {
      await window.api.invoke('workspace:definir-raiz', pastaChat)
    } catch {
      /* */
    }
  }
  const input = $('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  ativarPainelCentro('chat')
  input.value = ''
  adicionarBolha('user', texto)
  const chatIdJob = obterHistChat()?.obterId?.() || 'default'
  const histDoJob = obterHistChat()
  histDoJob?.registrarMensagem('user', texto)
  setChatSendMode('stop')
  setChatLiveStatus('Analisando o repositório…')
  mostrarLoadingChat()
  let falhou = false
  let streamTexto = ''
  let streamBolha = null
  let streamSpan = null
  const modoAnuncio = lerPreferenciasA11y().anuncioStreaming
  let anuncioAte = 0
  let offProg = null
  const jobInicio = Date.now()
  const agentStats = criarStatsVazios()
  registrarJob({
    pasta: pastaChat,
    chatId: chatIdJob,
    titulo: texto.slice(0, 48),
    iniciadoEm: jobInicio,
    passo: 'Iniciando…',
    tituloCard: 'Trabalhando…',
    stats: agentStats
  })
  pintarSidebarJobs(() => state.pastaAtual)
  const pastaDesteJob = pastaChat
  const visivelNesteJob = () =>
    String(state.pastaAtual || '').toLowerCase() === String(pastaDesteJob || '').toLowerCase()
  // Leitor de tela: anuncia frases completas do stream, nunca token a token.
  const anunciarTrechoStream = () => {
    if (modoAnuncio === 'silencioso' || !visivelNesteJob()) return
    const minimo = modoAnuncio === 'completo' ? 15 : 40
    const fallback = modoAnuncio === 'completo' ? 120 : 280
    const novo = streamTexto.slice(anuncioAte)
    if (novo.length < minimo) return
    let corte = -1
    for (const fim of ['. ', '! ', '? ', '… ', '.\n', '!\n', '?\n']) {
      corte = Math.max(corte, novo.lastIndexOf(fim))
    }
    if (corte >= 0) corte += 1
    else if (novo.length >= fallback) corte = novo.lastIndexOf(' ', fallback - 20) + 1
    if (corte <= 0) return
    const trecho = novo.slice(0, corte).trim()
    anuncioAte += corte
    if (trecho) anunciar(trecho)
  }
  const offDelta = window.api.on('chat:delta', (_evt, payload) => {
    if (!visivelNesteJob()) return
    const p = payload || {}
    if (p.reset) {
      streamTexto = ''
      anuncioAte = 0
      if (streamSpan) streamSpan.textContent = ''
      return
    }
    if (!p.delta) return
    const area = $('chat-messages')
    if (!streamBolha) {
      void removerLoadingChat({ imediato: true })
      streamBolha = adicionarBolha('assistant', '')
      streamSpan = streamBolha.querySelector('.msg-text')
    }
    streamTexto += p.delta
    if (streamSpan) streamSpan.textContent = streamTexto
    if (area) area.scrollTop = area.scrollHeight
    anunciarTrechoStream()
  })
  const offMidia = window.api.on?.('chat:midia', (_e, m) => {
    const area = $('chat-messages')
    if (!area || !m) return
    const bolha = adicionarBolha('assistant', m.aviso || 'Mídia gerada:')
    const wrap = bolha.querySelector('.msg-text') || bolha
    const fig = document.createElement('figure')
    fig.className = 'chat-midia'
    if (typeof m.preview === 'string' && /^data:image\//.test(m.preview)) {
      const img = document.createElement('img')
      img.src = m.preview
      img.alt = m.nome || 'mídia gerada'
      img.loading = 'lazy'
      fig.appendChild(img)
    }
    if (m.caminho) {
      const cap = document.createElement('figcaption')
      cap.textContent = String(m.caminho)
      fig.appendChild(cap)
    }
    wrap.appendChild(fig)
    area.scrollTop = area.scrollHeight
  })
  try {
    const agenteSel = document.getElementById('chat-agent-select')
    const modoSel = document.getElementById('chat-mode-select')
    const planToggle = document.getElementById('agent-plan-mode')
    let modo = modoSel?.value || 'auto'
    const forcarAgent = pedidoExigeAgentMode(texto) && modo !== 'ask' && modo !== 'plan'
    if (forcarAgent) {
      // UI: option "Agent" = value "code"; main tambem aceita "agent"
      modo = 'code'
      if (modoSel) modoSel.value = 'code'
      if (visivelNesteJob()) {
        mostrarBannerAgentMode(
          $('chat-messages'),
          'Pedido de aplicar/implementar/auditar — sair do Plan/Ask e executar sozinho'
        )
      }
    }
    if (planToggle?.checked && modo !== 'ask' && !forcarAgent) modo = 'plan'
    if (modo === 'plan' && planToggle) planToggle.checked = true
    if (modo === 'plan' && visivelNesteJob()) {
      toggleRight(true)
      ativarAbaDireita('agent')
      setChatLiveStatus('Modo Plan — abrindo o bloco 3 para o plano…')
      appendChatToolTrace('… Planejando os passos no painel Execução')
    }
    const agente = agenteSel?.value || 'auto'
    sincronizarAgenteSelects('chat')
    const autoAprovar = (() => {
      try {
        if (forcarAgent) return true
        return localStorage.getItem('dg-chat-autoapprove') === '1'
      } catch {
        return !!forcarAgent
      }
    })()
    const skill = skillAtivaChat()
    const patchUiProgresso = (passo, titulo, extra) => {
      atualizarJob(pastaDesteJob, chatIdJob, {
        passo,
        tituloCard: titulo,
        stats: { ...agentStats },
        log: extra?.log
      })
      pintarSidebarJobs(() => state.pastaAtual)
      if (!visivelNesteJob()) return
      atualizarCartaoTrabalho($('chat-messages'), {
        titulo: titulo || (forcarAgent ? 'Modo Agent…' : 'Trabalhando no seu pedido…'),
        passo,
        elapsedSec: (Date.now() - jobInicio) / 1000,
        modelo: extra?.modelo,
        log: extra?.log,
        ok: extra?.ok,
        erro: extra?.erro
      })
      pintarStatsNoCartao($('chat-messages'), agentStats)
    }
    offProg = window.api.on?.('agente:progresso', (_e, ev) => {
      if (!ev || typeof ev !== 'object') return
      if (ev.raiz && String(ev.raiz).toLowerCase() !== String(pastaDesteJob).toLowerCase()) return
      aplicarEventoStats(agentStats, ev)
      if (ev.tipo === 'heartbeat') {
        const h =
          'Passo ' +
          ev.passo +
          ' de ' +
          ev.max +
          ' — aguardando modelo (' +
          (ev.modelo || '') +
          ')…'
        patchUiProgresso(h, forcarAgent ? 'Modo Agent…' : 'Trabalhando…', {
          modelo: ev.modelo
        })
        if (visivelNesteJob()) setChatLiveStatus(humanizarStatus(h))
        return
      }
      if (ev.tipo === 'stats' || ev.tipo === 'tool' || ev.tipo === 'proposta') {
        if (visivelNesteJob()) pintarStatsNoCartao($('chat-messages'), agentStats)
        atualizarJob(pastaDesteJob, chatIdJob, { stats: { ...agentStats } })
        pintarSidebarJobs(() => state.pastaAtual)
      }
      if (ev.tipo === 'status') {
        const h = humanizarStatus(ev.texto)
        patchUiProgresso(h, forcarAgent ? 'Modo Agent…' : 'Trabalhando no seu pedido…', {
          modelo: ev.modelo,
          log: h
        })
        if (visivelNesteJob()) {
          appendChatToolTrace(ev.texto, {
            humano: h,
            titulo: forcarAgent ? 'Modo Agent…' : 'Trabalhando no seu pedido…'
          })
        }
      } else if (ev.tipo === 'tool' && ev.fase === 'inicio') {
        const h = humanizarToolInicio(ev.nome) + '…'
        patchUiProgresso(h, forcarAgent ? 'Modo Agent — explorando…' : 'Explorando o projeto…', {
          log: h
        })
        if (visivelNesteJob()) {
          appendChatToolTrace(String(ev.nome), {
            humano: h,
            titulo: forcarAgent ? 'Modo Agent — explorando…' : 'Explorando o projeto…'
          })
        }
      } else if (ev.tipo === 'tool' && ev.fase === 'fim') {
        const h = humanizarToolFim(ev.nome, ev.detalhe)
        const erro = /falt|erro|falha|não encont|nao encont/i.test(String(ev.detalhe || ''))
        patchUiProgresso(h, erro ? 'Ajuste no caminho…' : 'Trabalhando no seu pedido…', {
          log: h,
          ok: !erro,
          erro
        })
        if (visivelNesteJob()) {
          appendChatToolTrace(String(ev.nome), {
            humano: h,
            ok: !erro,
            erro,
            titulo: erro ? 'Ajuste no caminho…' : 'Trabalhando no seu pedido…'
          })
        }
      } else if (ev.tipo === 'proposta') {
        if (visivelNesteJob()) {
          appendChatToolTrace('proposta', {
            humano: 'Sugestão de mudança pronta — veja no Bloco 3 (Execução)',
            titulo: 'Revisão necessária',
            ok: true
          })
          toggleRight(true)
          ativarAbaDireita('agent')
          if (ev.id) void previewDiffNoEditor({ id: ev.id, path: ev.path })
        }
      }
    })
    if (visivelNesteJob()) {
      setChatLiveStatus(
        modo === 'plan'
          ? 'Montando o plano…'
          : forcarAgent
            ? 'Modo Agent — explorando, editando e validando…'
            : 'Pesquisando no repositório…'
      )
      atualizarCartaoTrabalho($('chat-messages'), {
        titulo: modo === 'plan' ? 'Montando o plano…' : forcarAgent ? 'Modo Agent' : 'Trabalhando no repositório…',
        passo:
          modo === 'plan'
            ? 'Vou listar o que podemos fazer'
            : 'Analisando a pasta ' + deps.nomePastaUi(pastaChat) + '…',
        elapsedSec: 0
      })
    }
    const r = await window.api.invoke('chat:send', pastaChat, texto, {
      agente,
      modo,
      autoAprovar,
      anexos: obterAnexosChat(),
      arquivo: state.abaAtiva || '',
      skill,
      verificarApos:
        modo !== 'plan' &&
        modo !== 'ask' &&
        (document.getElementById('agent-verify-loop')?.checked !== false)
    })
    limparAnexosChat()
    const ok = r && r.ok !== false && r.message && r.message.content
    let conteudo = organizarRespostaCursor(
      ok ? r.message.content : r?.message?.content || 'Não consegui responder.'
    )
    falhou = !ok || (r.message && r.message.provider === 'erro')
    if (visivelNesteJob()) {
      if (!streamBolha) await removerLoadingChat({ erro: falhou })
      else await removerLoadingChat({ imediato: true })
      fecharCartaoTrabalho($('chat-messages'), falhou ? 'Não concluído' : 'Pronto')
      pintarStatsNoCartao($('chat-messages'), agentStats)
      if (!falhou) ocultarBannerAgentMode($('chat-messages'))
    }
    let bolha = streamBolha
    const prov = r?.message?.provider
    const provLimpo = prov && !/:free\b/i.test(prov) ? prov : (prov && /ollama/i.test(prov) ? prov : '')
    if (visivelNesteJob()) {
      if (bolha && streamSpan) {
        const b = bolhaHtml('assistant', conteudo, provLimpo || undefined)
        bolha.innerHTML = b.html
        bolha.className = b.cls
        ligarAcoesBolha(bolha, 'assistant', conteudo)
      } else {
        bolha = adicionarBolha('assistant', conteudo, provLimpo || undefined)
      }
      const areaChat = $('chat-messages')
      if (areaChat) areaChat.scrollTop = areaChat.scrollHeight
    }
    // Sempre persiste no histórico do job (mesmo se o usuário mudou de repo)
    if (!falhou) {
      histDoJob?.registrarMensagem('assistant', conteudo, r.message.provider)
      registrarUsoTurno(r.usage || r.message?.usage)
      if (visivelNesteJob() && Array.isArray(r.tentativas) && r.tentativas.length > 1) {
        appendChatToolTrace('Fallback de provedor: ' + r.tentativas.join(' → '))
      }
      if (visivelNesteJob() && r.message.provider) atualizarBadgeProvedor(r.message.provider)
      if (visivelNesteJob() && (r.plano || modo === 'plan')) {
        const plano = r.plano || (await window.api.invoke('agente:plano-ler'))?.plano
        if (plano?.passos?.length) {
          renderPlanoChecklist(plano)
          atualizarChatPlanoCard(plano)
        }
      }
      if (visivelNesteJob() && Array.isArray(r.propostas) && r.propostas.length) {
        mostrarPropostasAgent(r.propostas)
        atualizarChatApplyCard(r.propostas)
        appendChatToolTrace(r.propostas.length + ' proposta(s) — Apply no chat ou na aba Agente')
      }
      if (visivelNesteJob() && r.autoAprovacao?.aplicada) {
        appendChatToolTrace('aprovação automática: ' + (r.autoAprovacao.motivo || 'ok'))
        mostrarChatRestoreAposApply([])
      }
      if (visivelNesteJob()) {
        atualizarStatusAgent(
          r.message?.provider || r.modelo || null,
          r.duracaoMs ?? r.ms ?? null,
          r.fila || null
        )
      }
    }
    void bolha
  } catch (err) {
    falhou = true
    if (visivelNesteJob()) {
      await removerLoadingChat({ erro: !streamBolha, imediato: !!streamBolha })
      if (!streamBolha) adicionarBolha('assistant', 'Não consegui responder.')
      else if (streamSpan && !streamTexto) streamSpan.textContent = 'Não consegui responder.'
    }
    console.info('[chat] erro invoke:', err)
  } finally {
    if (typeof offDelta === 'function') offDelta()
    if (typeof offProg === 'function') offProg()
    if (typeof offMidia === 'function') offMidia()
    removerJob(pastaDesteJob, chatIdJob)
    pintarSidebarJobs(() => state.pastaAtual)
    if (visivelNesteJob()) {
      if (falhou) {
        limparUiAgenteChat({ tituloFinal: 'Não concluí — veja a mensagem acima' })
      } else {
        setChatSendMode('send')
        fecharCartaoTrabalho($('chat-messages'), 'Pronto')
        setChatLiveStatus('Pronto')
        setTimeout(() => setChatLiveStatus(''), 1800)
        ocultarBannerAgentMode($('chat-messages'))
      }
      if (state.pastaAtual) $('chat-send').disabled = false
      marcarChatComMsgs()
      input.focus()
    } else {
      // Outro repo na tela: só ajusta o botão se o repo atual não tem job
      if (!pastaTemJob(state.pastaAtual)) setChatSendMode('send')
    }
    void histDoJob?.flushSalvar?.()
    agendarSalvarWorkspace()
  }
}

