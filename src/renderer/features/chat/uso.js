// uso.js — contador de tokens/custo da conversa no chat.
// Extraído de app.js. Estado por sessão; só depende do DOM (#chat-usage).

const $ = (id) => document.getElementById(id)

const usoChatSessao = { entrada: 0, saida: 0, custoUSD: null, turnos: 0 }

export function recontarUsoChat(msgs) {
  usoChatSessao.entrada = 0
  usoChatSessao.saida = 0
  usoChatSessao.custoUSD = null
  usoChatSessao.turnos = 0
  for (const m of Array.isArray(msgs) ? msgs : []) {
    const u = m?.usage
    if (!u) continue
    usoChatSessao.entrada += Number(u.entrada) || 0
    usoChatSessao.saida += Number(u.saida) || 0
    usoChatSessao.turnos++
    if (typeof u.custoUSD === 'number' && Number.isFinite(u.custoUSD)) {
      usoChatSessao.custoUSD = (usoChatSessao.custoUSD || 0) + u.custoUSD
    }
  }
  atualizarUsoChatUi()
}

export function registrarUsoTurno(usage) {
  if (!usage || typeof usage !== 'object') return
  usoChatSessao.entrada += Number(usage.entrada) || 0
  usoChatSessao.saida += Number(usage.saida) || 0
  usoChatSessao.turnos++
  if (typeof usage.custoUSD === 'number' && Number.isFinite(usage.custoUSD)) {
    usoChatSessao.custoUSD = (usoChatSessao.custoUSD || 0) + usage.custoUSD
  }
  atualizarUsoChatUi()
}

function formatarTokensChat(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k'
  return String(Math.round(n))
}

function atualizarUsoChatUi() {
  const el = $('chat-usage')
  if (!el) return
  const total = usoChatSessao.entrada + usoChatSessao.saida
  if (!usoChatSessao.turnos) {
    el.textContent = '0 tok'
    el.title = 'Tokens e custo estimados desta conversa'
    return
  }
  const custo = usoChatSessao.custoUSD
  const custoTxt =
    custo == null ? 'custo n/d' : custo === 0 ? 'grátis' : 'US$ ' + custo.toFixed(4).replace('.', ',')
  el.textContent = formatarTokensChat(total) + ' tok · ' + custoTxt
  el.title =
    'Entrada ' +
    formatarTokensChat(usoChatSessao.entrada) +
    ' · saída ' +
    formatarTokensChat(usoChatSessao.saida) +
    ' · ' +
    usoChatSessao.turnos +
    ' turno(s) — estimativa (~4 caracteres/token)'
}
