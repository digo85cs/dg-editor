// uso.js — contador de tokens/custo da conversa no chat.
// Extraído de app.js. Estado por sessão; só depende do DOM (#chat-usage).

const $ = (id) => document.getElementById(id)

const usoChatSessao = { entrada: 0, saida: 0, custoUSD: null, turnos: 0 }
const usoHoje = { turnos: 0, tokens: 0, custoUSD: null, data: '' }
let ultimoFetchHoje = 0

function buscarUsoHoje() {
  const api = window.api
  if (!api?.invoke) return
  if (Date.now() - ultimoFetchHoje < 15000) return
  ultimoFetchHoje = Date.now()
  api
    .invoke('custo:diario')
    .then((r) => {
      if (!r?.ok) return
      usoHoje.turnos = Number(r.turnos) || 0
      usoHoje.tokens = (Number(r.tokensEntrada) || 0) + (Number(r.tokensSaida) || 0)
      usoHoje.custoUSD = typeof r.custoUSD === 'number' ? r.custoUSD : null
      usoHoje.data = String(r.data || '')
      atualizarUsoChatUi()
    })
    .catch(() => {})
}

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
  buscarUsoHoje()
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
  buscarUsoHoje()
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
    el.title =
      'Tokens e custo estimados desta conversa' +
      (usoHoje.turnos
        ? ' | Hoje (' +
          usoHoje.data +
          '): ' +
          usoHoje.turnos +
          ' turno(s), ' +
          formatarTokensChat(usoHoje.tokens) +
          ' tok'
        : '')
    return
  }
  const custo = usoChatSessao.custoUSD
  const custoTxt =
    custo == null ? 'custo n/d' : custo === 0 ? 'grátis' : 'US$ ' + custo.toFixed(4).replace('.', ',')
  el.textContent = formatarTokensChat(total) + ' tok · ' + custoTxt
  const custoHoje = usoHoje.custoUSD
  const custoHojeTxt =
    custoHoje == null
      ? 'n/d'
      : custoHoje === 0
        ? 'grátis'
        : 'US$ ' + custoHoje.toFixed(4).replace('.', ',')
  el.title =
    'Entrada ' +
    formatarTokensChat(usoChatSessao.entrada) +
    ' · saída ' +
    formatarTokensChat(usoChatSessao.saida) +
    ' · ' +
    usoChatSessao.turnos +
    ' turno(s) — estimativa (~4 caracteres/token)' +
    (usoHoje.turnos
      ? ' | Hoje (' +
        usoHoje.data +
        '): ' +
        usoHoje.turnos +
        ' turno(s), ' +
        formatarTokensChat(usoHoje.tokens) +
        ' tok, ' +
        custoHojeTxt
      : '')
}
