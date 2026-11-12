import { escapar } from '../../utils/dom.js'

export function normalizarMensagensChat(msgs) {
  if (Array.isArray(msgs)) return msgs
  if (Array.isArray(msgs?.mensagens)) return msgs.mensagens
  return []
}

/**
 * Organiza a resposta no estilo Cursor: um bloco unico, limpo, facil de ler.
 * Remove dump de tools/JSON e listas soltas demais.
 */
export function organizarRespostaCursor(content) {
  let t = String(content ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return ''

  // Dump tecnico de tools → extrair texto util
  if (/A tool ["']/i.test(t) || (/Trecho:/i.test(t) && /\{/.test(t))) {
    try {
      const m = t.match(/"texto"\s*:\s*"((?:\\.|[^"\\])*)"/)
      if (m) t = JSON.parse('"' + m[1] + '"')
      else {
        const j = t.match(/\{[\s\S]*"ok"\s*:\s*true[\s\S]*\}/)
        if (j) {
          const o = JSON.parse(j[0])
          if (o.texto) t = String(o.texto)
        }
      }
    } catch {
      /* mantem */
    }
  }
  t = String(t).replace(/\r\n/g, '\n').trim()

  // Lista longa de bullets curtos → paragrafo organizado
  const linhas = t.split('\n')
  const bullets = linhas.filter((l) => /^\s*[-*•]\s+\S/.test(l))
  const curtos = bullets.filter((l) => l.replace(/^\s*[-*•]\s+/, '').trim().length <= 40)
  if (bullets.length >= 8 && curtos.length >= Math.floor(bullets.length * 0.7)) {
    const itens = bullets.map((l) => l.replace(/^\s*[-*•]\s+/, '').trim()).filter(Boolean)
    const resto = linhas
      .filter((l) => !/^\s*[-*•]\s+/.test(l))
      .join('\n')
      .trim()
    const lista = itens.join(', ')
    t = (resto ? resto + '\n\n' : '') + 'Itens encontrados: ' + lista + '.'
  }

  // Remover restos de dump de tool
  t = t.replace(/^A tool ["'][^"'\n]+["'][^\n]*\n?/gim, '')
  t = t.replace(/^Trecho:\s*/gim, '')

  // Se houver marca de resposta final, ficar so com ela
  const rf = t.match(/(?:^|\n)(?:Resposta final|##\s*Resposta(?:\s+final)?)[:\s]*\n([\s\S]+)/i)
  if (rf) t = rf[1].trim()

  // Juntar blocos separados por --- em um unico texto
  const partes = t
    .split(/\n-{3,}\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (partes.length > 1) t = partes.join('\n\n')

  // Compactar linhas em branco demais
  t = t.replace(/\n{3,}/g, '\n\n').trim()
  return t
}

/** Formata fences ``` em bloco monoespaçado (sem botao de copiar por fence). */
export function formatarConteudoChat(content) {
  const raw = organizarRespostaCursor(content)
  if (!raw.includes('```')) {
    return '<span class="msg-text">' + escapar(raw) + '</span>'
  }
  const parts = raw.split(/```/)
  let html = ''
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i]
    if (i % 2 === 0) {
      if (chunk) html += '<span class="msg-text">' + escapar(chunk) + '</span>'
      continue
    }
    const nl = chunk.indexOf('\n')
    const code = nl >= 0 ? chunk.slice(nl + 1) : chunk
    html +=
      '<div class="msg-code-inner"><pre><code>' +
      escapar(code.replace(/\n$/, '')) +
      '</code></pre></div>'
  }
  return html || '<span class="msg-text"></span>'
}

/** Pure HTML parts for a chat bubble (content escaped). DOM insertion/scroll/animation stay in app.js. */
export function bolhaHtml(role, content, provider) {
  const cls = 'msg ' + String(role || '')
  const text = formatarConteudoChat(content)
  const tag = provider ? '<span class="msg-provider">' + escapar(provider) + '</span>' : ''
  // Cursor-like: copiar sempre; usuario tambem pode reeditar o prompt
  const copyMsg =
    '<button type="button" class="btn-icon msg-copy" data-copy="full" title="Copiar prompt" aria-label="Copiar prompt">⧉</button>'
  const editMsg =
    role === 'user'
      ? '<button type="button" class="btn-icon msg-reedit" data-reedit="1" title="Editar e continuar daqui" aria-label="Editar e continuar daqui">✎</button>'
      : ''
  return {
    cls,
    html:
      '<div class="msg-body msg-result-wrap">' +
      text +
      '<div class="msg-actions">' +
      editMsg +
      copyMsg +
      '</div></div>' +
      tag
  }
}
