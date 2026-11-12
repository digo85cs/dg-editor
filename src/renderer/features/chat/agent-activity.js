/**
 * Faixa de atividade estilo Cursor Agent:
 * Editing N · explored N · searches · tools · commands
 */

export function classificarTool(nome) {
  const id = String(nome || '').toLowerCase()
  if (/codigo_editar|vault_write|dossie_write|ftp_deploy/.test(id)) return 'edit'
  if (/codigo_buscar|disco_buscar|busca/.test(id)) return 'search'
  if (
    /codigo_ler|projeto_arvore|disco_inspecionar|git_status|git_diff|vault_read|dossie_read|skill_ler|listar|navegador_ler/.test(
      id
    )
  ) {
    return 'explore'
  }
  if (/terminal_exec|testes_rodar|qualidade_checar|projeto_smoke|navegador_/.test(id)) return 'command'
  return 'tool'
}

export function criarStatsVazios() {
  return { edits: 0, explored: 0, searches: 0, tools: 0, commands: 0, propostas: 0 }
}

export function aplicarEventoStats(stats, ev) {
  if (!stats || !ev) return stats
  if (ev.tipo === 'stats') {
    stats.edits = Number(ev.edits) || 0
    stats.explored = Number(ev.explored) || 0
    stats.searches = Number(ev.searches) || 0
    stats.tools = Number(ev.tools) || 0
    stats.commands = Number(ev.commands) || 0
    stats._fromMain = true
    return stats
  }
  // Fallback se o main ainda nao emitiu tipo=stats
  if (!stats._fromMain && ev.tipo === 'tool' && ev.fase === 'inicio') {
    stats.tools += 1
    const cat = ev.categoria || classificarTool(ev.nome)
    if (cat === 'edit') stats.edits += 1
    else if (cat === 'search') stats.searches += 1
    else if (cat === 'explore') stats.explored += 1
    else if (cat === 'command') stats.commands += 1
  }
  if (ev.tipo === 'proposta') {
    stats.propostas += 1
  }
  return stats
}

export function textoStats(stats) {
  if (!stats) return ''
  const parts = []
  if (stats.edits) parts.push('Editing ' + stats.edits + (stats.edits === 1 ? ' file' : ' files'))
  if (stats.explored) parts.push('explored ' + stats.explored)
  if (stats.searches) parts.push(stats.searches + ' search' + (stats.searches === 1 ? '' : 'es'))
  if (stats.tools) parts.push(stats.tools + ' tool' + (stats.tools === 1 ? '' : 's'))
  if (stats.commands) parts.push('ran ' + stats.commands + ' command' + (stats.commands === 1 ? '' : 's'))
  if (stats.propostas) parts.push(stats.propostas + ' proposta' + (stats.propostas === 1 ? '' : 's'))
  return parts.join(' · ')
}

/** Pedido que deve forçar Agent Mode (estilo Cursor Apply). */
export function pedidoExigeAgentMode(texto) {
  const t = String(texto || '').toLowerCase()
  if (!t.trim()) return false
  return /\b(aplica|aplique|implementa|implemente|implementar|corrig[ea]|corrija|refator|autonom|melhor[ea]|valida|fa[cç]a|execute|construir|criar ferramenta|modo agent|auditoria|auditar|analis[ea]|inventari)\b/i.test(
    t
  )
}

export function mostrarBannerAgentMode(area, motivo) {
  if (!area) return
  let b = area.querySelector('#chat-agent-mode-banner')
  if (!b) {
    b = document.createElement('div')
    b.id = 'chat-agent-mode-banner'
    b.className = 'chat-agent-mode-banner'
    b.setAttribute('role', 'status')
    area.appendChild(b)
  }
  b.innerHTML =
    '<strong>Modo Agent</strong>' +
    '<span class="chat-agent-mode-banner-motivo">' +
    (motivo || 'Explorar, editar e validar sem pedir cada passo') +
    '</span>'
  b.hidden = false
}

export function ocultarBannerAgentMode(area) {
  const b = area && area.querySelector ? area.querySelector('#chat-agent-mode-banner') : null
  if (b) b.hidden = true
}

export function pintarStatsNoCartao(area, stats) {
  if (!area) return
  const card = area.querySelector('#chat-work-card')
  if (!card) return
  let strip = card.querySelector('.chat-work-stats')
  if (!strip) {
    strip = document.createElement('p')
    strip.className = 'chat-work-stats'
    card.appendChild(strip)
  }
  const t = textoStats(stats)
  strip.textContent = t || 'Explorando…'
  strip.hidden = false
  // Título resumido estilo Cursor quando há edits
  const title = card.querySelector('.chat-work-title')
  if (title && stats?.edits) {
    title.textContent = 'Editing'
  } else if (title && stats?.explored && !stats?.edits) {
    title.textContent = 'Explored'
  }
  strip.classList.toggle('has-stats', !!t)
}
