/**
 * Busca web simples para o Radar Diario.
 * Usa fetch nativo (Node 18+ / Electron) sem dependencias externas.
 * Fonte: DuckDuckGo HTML (lite).
 */
export type ResultadoBusca = { titulo: string; url: string; resumo?: string }

export async function buscaWebDuckDuckGo(query: string): Promise<ResultadoBusca[]> {
  const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(query)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DGEditor-Radar/1.0'
      }
    })
    if (!resp.ok) {
      console.warn('[radar:busca] status ' + resp.status + ' para query="' + query + '"')
      return []
    }
    const html = await resp.text()
    return parsearResultados(html)
  } catch (e) {
    console.warn('[radar:busca] falhou para query="' + query + '": ' + String((e as Error)?.message || e))
    return []
  } finally {
    clearTimeout(timeout)
  }
}

function parsearResultados(html: string): ResultadoBusca[] {
  const resultados: ResultadoBusca[] = []
  try {
    // DuckDuckGo HTML usa links com classe "result__a"
    const regex = /<a rel="nofollow" class="result__a" href="([^"]+)">([^<]+)<\/a>/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(html)) && resultados.length < 5) {
      const url = match[1]
      const titulo = match[2].replace(/<[^>]*>/g, '').trim()
      if (titulo && url) {
        resultados.push({ titulo, url })
      }
    }
  } catch {
    /* ignora erro de parse, retorna vazio */
  }
  return resultados
}
