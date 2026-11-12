/**
 * Browser automation — preferir Navegador do Bloco 3; CDP externo (9222) como fallback.
 */
import {
  navegarPara,
  estadoAtual,
  mostrarNavegadorEmbutido,
  criarJanelaNavegador
} from '../navegador/janela'

const CDP_HOST = '127.0.0.1'
const CDP_PORT = 9222

async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ac.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

async function cdpDisponivel(): Promise<boolean> {
  try {
    await fetchJson(`http://${CDP_HOST}:${CDP_PORT}/json/version`)
    return true
  } catch {
    return false
  }
}

async function listarAbasCdp(): Promise<Array<{ id: string; title: string; url: string; type: string }>> {
  const raw = (await fetchJson(`http://${CDP_HOST}:${CDP_PORT}/json/list`)) as Array<Record<string, string>>
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t) => t && (t.type === 'page' || t.type === 'webview' || !t.type))
    .map((t) => ({
      id: String(t.id || ''),
      title: String(t.title || ''),
      url: String(t.url || ''),
      type: String(t.type || 'page')
    }))
}

async function preferirBloco3(url?: string): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  try {
    const dest = url && url.trim() ? url.trim() : 'about:blank'
    criarJanelaNavegador(dest, { mostrar: true })
    mostrarNavegadorEmbutido(true)
    const r = await navegarPara(dest, 30_000)
    const st = estadoAtual()
    return {
      ok: !!(r && r.ok !== false),
      dados: {
        via: 'bloco3',
        mensagem: 'Navegador do Bloco 3 (preferido). CDP externo so se porta 9222 estiver ativa.',
        url: dest,
        estado: st,
        resultado: r
      }
    }
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message || e) }
  }
}

async function cdpNavegar(url: string): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  const abas = await listarAbasCdp()
  const page = abas.find((a) => a.type === 'page') || abas[0]
  if (!page?.id) {
    return {
      ok: false,
      erro: 'CDP 9222 sem abas. Abra Chrome/Edge com --remote-debugging-port=9222 ou use o Bloco 3.'
    }
  }
  // Endpoint PUT /json/new?url= cria aba; para navegar usamos Runtime via websocket seria pesado —
  // /json/new é o caminho HTTP simples suportado pelo Chrome.
  try {
    const created = (await fetchJson(
      `http://${CDP_HOST}:${CDP_PORT}/json/new?${encodeURIComponent(url)}`,
      8000
    )) as Record<string, string>
    return {
      ok: true,
      dados: {
        via: 'cdp-externo',
        url,
        aba: created?.id || page.id,
        title: created?.title || page.title
      }
    }
  } catch (e) {
    return { ok: false, erro: 'CDP navegar: ' + String((e as Error)?.message || e) }
  }
}

export async function executarBrowser(
  id: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; dados?: unknown; erro?: string; comandoExecutado: string }> {
  const url = args.url ? String(args.url) : undefined
  const forcarExterno = args.externo === true || args.cdp === true

  try {
    if (id === 'browser.abrir' || id === 'browser.navegar') {
      if (!forcarExterno) {
        const bloco = await preferirBloco3(url || 'about:blank')
        if (bloco.ok) return { ...bloco, comandoExecutado: id }
        // fallback CDP se Bloco 3 falhar e porta estiver aberta
        if (url && (await cdpDisponivel())) {
          const cdp = await cdpNavegar(url)
          return { ...cdp, comandoExecutado: id }
        }
        return {
          ok: false,
          erro: bloco.erro || 'Bloco 3 indisponivel e CDP 9222 fechado',
          comandoExecutado: id
        }
      }
      if (!(await cdpDisponivel())) {
        return {
          ok: false,
          erro: 'CDP externo (9222) fechado. Use o Navegador do Bloco 3 ou inicie Chrome/Edge com --remote-debugging-port=9222.',
          comandoExecutado: id
        }
      }
      const cdp = await cdpNavegar(url || 'about:blank')
      return { ...cdp, comandoExecutado: id }
    }

    if (id === 'browser.listarAbas') {
      const bloco = estadoAtual()
      let cdpAbas: unknown[] = []
      let cdpOk = false
      if (await cdpDisponivel()) {
        cdpOk = true
        cdpAbas = await listarAbasCdp()
      }
      return {
        ok: true,
        comandoExecutado: id,
        dados: {
          preferiu: 'bloco3',
          bloco3: bloco,
          cdpExterno: { ativo: cdpOk, porta: CDP_PORT, abas: cdpAbas }
        }
      }
    }

    if (id === 'browser.obterDom' || id === 'browser.executarJs') {
      return {
        ok: true,
        comandoExecutado: id,
        dados: {
          preferiu: 'bloco3',
          mensagem:
            'DOM/JS: use o Navegador embutido (Bloco 3) ou o Agent com ferramentas do DG. CDP externo so listagem/abrir URL.',
          args
        }
      }
    }

    if (id === 'browser.fechar') {
      try {
        mostrarNavegadorEmbutido(false)
      } catch {
        /* */
      }
      return {
        ok: true,
        comandoExecutado: id,
        dados: { via: 'bloco3', mensagem: 'Navegador embutido ocultado (Bloco 3).' }
      }
    }

    return {
      ok: true,
      comandoExecutado: id,
      dados: {
        preferiu: 'bloco3',
        mensagem: 'Use o Navegador do Bloco 3. CDP externo opcional na porta 9222.',
        id,
        args
      }
    }
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message || e), comandoExecutado: id }
  }
}
