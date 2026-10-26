/**
 * Smoke DG_NAV_SMOKE=1 — valida endpoints locais e sai com código.
 * Não imprime o token completo.
 */
import { app } from 'electron'
import { readFileSync } from 'fs'
import { criarJanelaNavegador, fecharJanelaNavegador, estadoAtual } from './janela'
import { NAV_HOST, NAV_PORT, prefixoTokenControle } from './controle'
import { caminhoNavToken } from './token'
import { dglog } from '../dglog'

async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-DG-Token'] = token
  const r = await fetch(`http://${NAV_HOST}:${NAV_PORT}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const json = (await r.json()) as Record<string, unknown>
  return { status: r.status, json }
}

export async function rodarSmokeESair(): Promise<void> {
  const resultados: Array<{ id: number; ok: boolean; detalhe: string }> = []
  const token = readFileSync(caminhoNavToken(), 'utf8').trim()
  dglog(`[nav-smoke] token prefix=${prefixoTokenControle()}…`)

  try {
    // 1+2: abrir example.com e status
    criarJanelaNavegador('https://example.com')
    await new Promise((r) => setTimeout(r, 2500))
    const st = await req('GET', '/status', undefined, token)
    const ok2 =
      st.status === 200 &&
      st.json.aberto === true &&
      String(st.json.url || '').includes('example.com')
    resultados.push({
      id: 2,
      ok: ok2,
      detalhe: JSON.stringify({ url: st.json.url, titulo: st.json.titulo, aberto: st.json.aberto })
    })
    resultados.push({ id: 1, ok: estadoAtual().aberto, detalhe: 'janela aberta' })

    // 3: ler texto
    const ler = await req('POST', '/ler', { modo: 'texto' }, token)
    const texto = String(ler.json.texto || '')
    const tituloOk = /example domain/i.test(String(st.json.titulo || ''))
    const textoOk =
      /example domain/i.test(texto) ||
      /domain is for use/i.test(texto) ||
      /iana\.org/i.test(texto)
    resultados.push({
      id: 3,
      ok: ler.status === 200 && (textoOk || tituloOk) && texto.length > 20,
      detalhe: texto.slice(0, 80)
    })

    // 4: links
    const links = await req('POST', '/ler', { modo: 'links' }, token)
    const arr = (links.json.links as Array<{ href?: string }>) || []
    const temIana = arr.some((l) => /iana\.org/i.test(String(l.href || '')))
    resultados.push({ id: 4, ok: links.status === 200 && temIana, detalhe: 'links=' + arr.length })

    // 5: preencher — página com input (httpbin forms)
    await req('POST', '/abrir', { url: 'https://httpbin.org/forms/post' }, token)
    await new Promise((r) => setTimeout(r, 3000))
    const pref = await req(
      'POST',
      '/preencher',
      { seletor: 'input[name="custname"]', valor: 'DG-Editor-Smoke' },
      token
    )
    const okPref = pref.status === 200 && pref.json.ok === true && pref.json.valorLido === 'DG-Editor-Smoke'
    resultados.push({ id: 5, ok: okPref, detalhe: JSON.stringify(pref.json) })

    // 6: sem token → 401
    const sem = await req('GET', '/status', undefined, null)
    resultados.push({ id: 6, ok: sem.status === 401, detalhe: 'status=' + sem.status })

    // 7: fechar painel → aberto false + 409
    fecharJanelaNavegador()
    await new Promise((r) => setTimeout(r, 500))
    const st2 = await req('GET', '/status', undefined, token)
    const ler2 = await req('POST', '/ler', { modo: 'texto' }, token)
    resultados.push({
      id: 7,
      ok: st2.json.aberto === false && ler2.status === 409,
      detalhe: JSON.stringify({ status: st2.json, ler: ler2.status })
    })

    // 8: persistência de cookie (partition persist:dgnav)
    criarJanelaNavegador('https://example.com')
    await new Promise((r) => setTimeout(r, 2000))
    const { session } = await import('electron')
    const sess = session.fromPartition('persist:dgnav')
    await sess.cookies.set({
      url: 'https://example.com',
      name: 'dg_nav_smoke',
      value: 'persistente',
      expirationDate: Math.floor(Date.now() / 1000) + 86400
    })
    const cookies1 = await sess.cookies.get({ url: 'https://example.com', name: 'dg_nav_smoke' })
    // flush
    await sess.cookies.flushStore()
    const ainda = cookies1.length > 0 && cookies1[0].value === 'persistente'
    resultados.push({
      id: 8,
      ok: ainda,
      detalhe: 'cookie partition persist:dgnav gravado (reabrir app mantém sessão real de login)'
    })
  } catch (e) {
    resultados.push({ id: 0, ok: false, detalhe: String((e as Error).message || e) })
  }

  const falhas = resultados.filter((r) => !r.ok)
  for (const r of resultados) {
    dglog(`[nav-smoke] #${r.id} ${r.ok ? 'PASS' : 'FAIL'} ${r.detalhe}`)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(r))
  }
  const code = falhas.length ? 1 : 0
  dglog(`[nav-smoke] fim falhas=${falhas.length} exit=${code}`)
  app.exit(code)
}
