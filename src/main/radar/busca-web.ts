/**
 * Busca web simples para o Radar Diario.
 * Usa fetch nativo (Node 18+ / Electron) sem dependencias externas.
 *
 * Cascata de fontes gratuitas e sem chave (cada uma com timeout de 15s):
 *   1. DuckDuckGo Lite  (lite.duckduckgo.com/lite/) — o endpoint /html/ retorna
 *      challenge de bot (HTTP 202) para este IP; o lite responde HTML estavel.
 *   2. Bing             (www.bing.com/search) — resultados em <li class="b_algo">
 *      com redirect /ck/a/u=a1<base64url> que precisa ser decodificado.
 *   3. Mojeek           (www.mojeek.com/search) — HTML simples, sem chave.
 *
 * Nunca devolve [] em silencio: se todas as fontes falharem ou devolverem
 * zero resultados, lanca Error com o diagnostico por fonte — o radar registra
 * isso em RadarResultadoBusca.erro e o relatorio escreve "Busca sem resultado".
 */
export type ResultadoBusca = { titulo: string; url: string; resumo?: string }

const TIMEOUT_MS = 15000
const MAX_RESULTADOS = 5
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

type FonteBusca = {
  nome: string
  url: (query: string) => string
  init?: RequestInit
  parsear: (html: string) => ResultadoBusca[]
}

export async function buscaWebDuckDuckGo(query: string): Promise<ResultadoBusca[]> {
  const diagnostico: string[] = []
  for (const fonte of FONTES) {
    try {
      const resultados = await buscarNaFonte(fonte, query)
      if (resultados.length > 0) return resultados
      diagnostico.push(fonte.nome + '=0 resultados')
    } catch (e) {
      diagnostico.push(fonte.nome + '=' + String((e as Error)?.message || e).slice(0, 120))
    }
  }
  throw new Error('busca sem resultado em todas as fontes (' + diagnostico.join('; ') + ')')
}

async function buscarNaFonte(fonte: FonteBusca, query: string): Promise<ResultadoBusca[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(fonte.url(query), {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        ...(fonte.init?.headers || {})
      },
      ...fonte.init
    })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const html = await resp.text()
    const resultados = fonte.parsear(html).slice(0, MAX_RESULTADOS)
    if (resultados.length === 0) throw new Error('0 resultados parseados')
    return resultados
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// Fonte 1: DuckDuckGo Lite
// ---------------------------------------------------------------------------
// Markup real (verificado em 25/11/2026):
//   <a rel="nofollow" href="//duckduckgo.com/l/?uddg=<urlenc>&rut=..." class='result-link'>Titulo</a>
// Anuncios usam o mesmo padrao mas sao seguidos de "(Sponsored link" no HTML.
function parsearDdgLite(html: string): ResultadoBusca[] {
  const resultados: ResultadoBusca[] = []
  const regex = /<a\b[^>]*href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) && resultados.length < MAX_RESULTADOS) {
    const depois = html.slice(match.index + match[0].length, match.index + match[0].length + 400)
    if (depois.includes('Sponsored link')) continue
    const titulo = limparTexto(match[2])
    const url = decodificarUrlDdg(match[1])
    if (titulo && url) resultados.push({ titulo, url })
  }
  return resultados
}

function decodificarUrlDdg(href: string): string | null {
  try {
    const hrefLimpo = href.replace(/&amp;/g, '&')
    const m = /[?&]uddg=([^&]+)/.exec(hrefLimpo)
    const alvo = m ? decodeURIComponent(m[1]) : hrefLimpo
    if (!/^https?:\/\//i.test(alvo)) return null
    // Links de anuncio do proprio DDG/Bing nao sao fonte
    if (/^https?:\/\/(www\.)?(duckduckgo\.com|bing\.com)\//i.test(alvo)) return null
    return alvo
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fonte 2: Bing
// ---------------------------------------------------------------------------
// Markup real: <li class="b_algo"> ... <h2 ...><a target="_blank" href="URL" ...>Titulo</a>
// A URL vem como https://www.bing.com/ck/a?...&u=a1<base64url> — decodificar o
// parametro u (prefixo a1 + base64url) para obter a URL real.
function parsearBing(html: string): ResultadoBusca[] {
  const resultados: ResultadoBusca[] = []
  const regex = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) && resultados.length < MAX_RESULTADOS) {
    const titulo = limparTexto(match[2])
    const url = decodificarUrlBing(match[1].replace(/&amp;/g, '&'))
    if (titulo && url) resultados.push({ titulo: titulo.slice(0, 160), url })
  }
  return resultados
}

function decodificarUrlBing(href: string): string | null {
  try {
    if (/bing\.com\/ck\//i.test(href)) {
      const m = /[?&]u=([^&]+)/.exec(href)
      if (!m) return null
      let codificado = decodeURIComponent(m[1])
      if (codificado.startsWith('a1')) codificado = codificado.slice(2)
      const real = Buffer.from(codificado, 'base64url').toString('utf8')
      return /^https?:\/\//i.test(real) ? real : null
    }
    return /^https?:\/\//i.test(href) ? href : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fonte 3: Mojeek
// ---------------------------------------------------------------------------
// HTML simples sem chave. Resultados organicos usam <a class="ob" href="...">.
function parsearMojeek(html: string): ResultadoBusca[] {
  const resultados: ResultadoBusca[] = []
  if (/captcha/i.test(html)) return resultados
  const regex = /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bob\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) && resultados.length < MAX_RESULTADOS) {
    const titulo = limparTexto(match[2])
    const url = match[1]
    if (titulo && url && !/mojeek\.com/i.test(url)) {
      resultados.push({ titulo: titulo.slice(0, 160), url })
    }
  }
  return resultados
}

const FONTES: FonteBusca[] = [
  {
    nome: 'ddg-lite',
    url: (q) => 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q),
    parsear: parsearDdgLite
  },
  {
    nome: 'bing',
    url: (q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=pt-br',
    parsear: parsearBing
  },
  {
    nome: 'mojeek',
    url: (q) => 'https://www.mojeek.com/search?q=' + encodeURIComponent(q),
    parsear: parsearMojeek
  }
]

// ---------------------------------------------------------------------------
// Helpers de parse
// ---------------------------------------------------------------------------
function limparTexto(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}
