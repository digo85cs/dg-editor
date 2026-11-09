import { escapar } from '../../utils/dom.js'
import { isErroApp } from '@shared/erros'

export function secao(titulo, texto) {
  return (
    '<div class="analysis-section"><h4>' + escapar(titulo) + '</h4><p>' + escapar(texto) + '</p></div>'
  )
}

export function secaoLista(titulo, itens) {
  const arr = Array.isArray(itens) ? itens.filter((i) => i != null && String(i).trim()) : []
  if (!arr.length) return secao(titulo, '—')
  return (
    '<div class="analysis-section"><h4>' +
    escapar(titulo) +
    '</h4><ul>' +
    arr.map((i) => '<li>' + escapar(i) + '</li>').join('') +
    '</ul></div>'
  )
}

function normReport(report) {
  const r = report && typeof report === 'object' ? report : {}
  const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v)).trim()
  const list = (v) => (Array.isArray(v) ? v.map((x) => txt(x)).filter(Boolean) : [])
  return {
    oQueE: txt(r.oQueE ?? r.oqueE ?? r['o_que_e']),
    stack: txt(r.stack),
    estrutura: txt(r.estrutura),
    pontosAtencao: list(r.pontosAtencao ?? r.pontos_atencao),
    sugestoes: list(r.sugestoes),
    provider: txt(r.provider),
    model: txt(r.model),
    analyzedAt: typeof r.analyzedAt === 'number' ? r.analyzedAt : undefined,
  }
}

/** @param {any} report @param {boolean} [fromCache] */
export function renderizarAnaliseHtml(report, fromCache) {
  if (!report || typeof report !== 'object') {
    return '<p class="muted">Análise indisponível (dados ausentes). ' +
      '<button type="button" class="btn-small" data-action="retry-analise">Tentar novamente</button></p>'
  }
  const r = normReport(report)
  const badge = fromCache ? ' <span class="muted">(do cache)</span>' : ''
  let html = ''
  html += secao('O que é', r.oQueE || '—')
  html += secao('Stack', r.stack || '—')
  html += secao('Estrutura', r.estrutura || '—')
  html += secaoLista('Pontos de atenção', r.pontosAtencao)
  html += secaoLista('Sugestões', r.sugestoes)
  if (r.provider) {
    html +=
      '<p class="muted">Analisado por: ' +
      escapar(r.provider) +
      (r.model ? ' (' + escapar(r.model) + ')' : '') +
      (r.analyzedAt ? ' — ' + escapar(new Date(r.analyzedAt).toLocaleString('pt-BR')) : '') +
      badge +
      '</p>'
  }
  return html
}

/** @param {any} erro */
export function renderizarErroHtml(erro) {
  const e = isErroApp(erro)
    ? erro
    : erro && typeof erro === 'object' && isErroApp(erro.erro)
      ? erro.erro
      : typeof erro === 'string' && erro.trim()
        ? { codigo: 'ERR_UNKNOWN', mensagem: erro.trim() }
        : erro && typeof erro.erro === 'string' && erro.erro.trim()
          ? { codigo: 'ERR_UNKNOWN', mensagem: erro.erro.trim() }
          : { codigo: 'ERR_UNKNOWN', mensagem: String(erro?.mensagem || erro?.message || 'Ocorreu um erro.') }
  const acao = e.acao ? '<p class="muted"><strong>Ação:</strong> ' + escapar(e.acao) + '</p>' : ''
  return '<p class="muted"><strong>[' + escapar(e.codigo) + ']</strong> ' + escapar(e.mensagem) + '</p>' + acao
}
