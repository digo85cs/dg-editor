/**
 * Smoke DG_NAV_SMOKE=1 — valida endpoints locais e sai com código.
 * Não imprime o token completo.
 */
import { app } from 'electron'
import { existsSync, readFileSync, statSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import { criarJanelaNavegador, fecharJanelaNavegador, estadoAtual } from './janela'
import { NAV_HOST, NAV_PORT, prefixoTokenControle } from './controle'
import { caminhoNavToken } from './token'
import { dglog } from '../dglog'
import { projectStateDir, resolverRaizProjeto } from '../paths'

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
    // 1+2: abrir example.com e status (headless)
    criarJanelaNavegador('https://example.com', { mostrar: false })
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
    criarJanelaNavegador('https://example.com', { mostrar: false })
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

    // 9: screenshot da view (página estável)
    await req('POST', '/abrir', { url: 'https://example.com' }, token)
    await new Promise((r) => setTimeout(r, 2000))
    let shot = await req('POST', '/screenshot', {}, token)
    if (!(shot.status === 200 && Number(shot.json.bytes || 0) > 100)) {
      await new Promise((r) => setTimeout(r, 1500))
      shot = await req('POST', '/screenshot', {}, token)
    }
    resultados.push({
      id: 9,
      ok: shot.status === 200 && shot.json.ok === true && Number(shot.json.bytes || 0) > 100,
      detalhe: 'bytes=' + String(shot.json.bytes || 0) + ' erro=' + String(shot.json.erro || '')
    })

    // 10: /ler com seletor inexistente → candidatos[]
    await req('POST', '/abrir', { url: 'https://www.w3schools.com/html/html_tables.asp' }, token)
    await new Promise((r) => setTimeout(r, 4000))
    const lerBad = await req('POST', '/ler', { modo: 'texto', seletor: '#nao-existe-xyz' }, token)
    const candLer = (lerBad.json.candidatos as Array<Record<string, unknown>>) || []
    const lerCandOk =
      lerBad.json.ok === false &&
      candLer.length > 0 &&
      candLer.every(
        (c) =>
          typeof c.tipo === 'string' &&
          typeof c.tag === 'string' &&
          typeof c.texto === 'string' &&
          typeof c.seletor === 'string' &&
          String(c.seletor).length > 0
      )
    resultados.push({
      id: 10,
      ok: lerCandOk,
      detalhe: 'candidatos=' + candLer.length + ' motivo=' + String(lerBad.json.motivo || '')
    })

    // 11: /clicar seletor e texto inexistentes → candidatos[]
    const clicSel = await req('POST', '/clicar', { seletor: '#nao-existe-xyz' }, token)
    const cand1 = (clicSel.json.candidatos as Array<Record<string, unknown>>) || []
    const shapeOk = (lista: Array<Record<string, unknown>>) =>
      lista.length > 0 &&
      lista.every(
        (c) =>
          typeof c.tipo === 'string' &&
          typeof c.tag === 'string' &&
          typeof c.texto === 'string' &&
          typeof c.seletor === 'string' &&
          String(c.seletor).length > 0
      )
    const clicTxt = await req('POST', '/clicar', { texto: 'Nao Existe 999' }, token)
    const cand2 = (clicTxt.json.candidatos as Array<Record<string, unknown>>) || []
    const ok11 =
      clicSel.json.ok === false &&
      shapeOk(cand1) &&
      clicTxt.json.ok === false &&
      shapeOk(cand2) &&
      String(clicSel.json.dica || '').includes('candidatos')
    resultados.push({
      id: 11,
      ok: ok11,
      detalhe: JSON.stringify({
        seletor: { n: cand1.length, pedido: clicSel.json.seletorPedido },
        texto: { n: cand2.length, pedido: clicTxt.json.seletorPedido }
      })
    })

    // 12: singleton — duas chamadas = mesma instância, sem show
    const a = criarJanelaNavegador('about:blank', { mostrar: false })
    const b = criarJanelaNavegador('https://example.com', { mostrar: false })
    const ok12 = a === b && a.isVisible() === false && !a.isDestroyed()
    resultados.push({
      id: 12,
      ok: ok12,
      detalhe: JSON.stringify({
        mesmaInstancia: a === b,
        visible: a.isVisible(),
        destroyed: a.isDestroyed()
      })
    })

    // 13: download real → .dg-editor/downloads/ sem sobrescrever
    criarJanelaNavegador('about:blank', { mostrar: false })
    const downloadsDir = resolve(projectStateDir(resolverRaizProjeto()), 'downloads')
    let urlUsada = 'https://httpbin.org/bytes/1024'
    const urlDlFb =
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    let dl1 = await req('POST', '/baixar', { url: urlUsada }, token)
    if (!(dl1.status === 200 && dl1.json.ok === true && dl1.json.caminho)) {
      urlUsada = urlDlFb
      dl1 = await req('POST', '/baixar', { url: urlUsada }, token)
    }
    const caminho1 = String(dl1.json.caminho || '')
    let ok13a = false
    let size1 = 0
    let mtime1 = 0
    if (caminho1 && isAbsolute(caminho1) && existsSync(caminho1)) {
      const st1 = statSync(caminho1)
      size1 = st1.size
      mtime1 = st1.mtimeMs
      const rel = relative(downloadsDir, resolve(caminho1))
      ok13a = size1 > 0 && !rel.startsWith('..') && !isAbsolute(rel)
    }
    await new Promise((r) => setTimeout(r, 800))
    const dl2 = await req('POST', '/baixar', { url: urlUsada }, token)
    const caminho2 = String(dl2.json.caminho || '')
    const ok13b =
      !!caminho2 &&
      caminho2 !== caminho1 &&
      existsSync(caminho2) &&
      existsSync(caminho1) &&
      statSync(caminho1).size === size1 &&
      statSync(caminho1).mtimeMs <= mtime1 + 100
    resultados.push({
      id: 13,
      ok: ok13a && ok13b && dl2.json.ok === true,
      detalhe: JSON.stringify({
        urlUsada,
        caminho1,
        caminho2,
        size1,
        size2: caminho2 && existsSync(caminho2) ? statSync(caminho2).size : 0,
        mesmoNome: caminho1 === caminho2
      })
    })

    // 14: paginação /ler modo tabela
    await req('POST', '/abrir', { url: 'https://www.w3schools.com/html/html_tables.asp' }, token)
    await new Promise((r) => setTimeout(r, 3500))
    const tabAll = await req('POST', '/ler', { modo: 'tabela' }, token)
    const totalLinhas = Number(tabAll.json.totalLinhas || 0)
    const tab1 = await req('POST', '/ler', { modo: 'tabela', offset: 0, limit: 2 }, token)
    const tabelas1 = (tab1.json.tabelas as Array<{ linhas?: unknown[] }>) || []
    const linhas1 = (tabelas1[0] && tabelas1[0].linhas) || []
    const prox = tab1.json.proximoOffset
    const tab2 = await req(
      'POST',
      '/ler',
      { modo: 'tabela', offset: prox, limit: 2 },
      token
    )
    const tabelas2 = (tab2.json.tabelas as Array<{ linhas?: unknown[] }>) || []
    const linhas2 = (tabelas2[0] && tabelas2[0].linhas) || []
    const ok14 =
      tabAll.status === 200 &&
      totalLinhas > 0 &&
      linhas1.length === 2 &&
      prox != null &&
      JSON.stringify(linhas1) !== JSON.stringify(linhas2) &&
      linhas2.length > 0
    resultados.push({
      id: 14,
      ok: ok14,
      detalhe: JSON.stringify({
        totalLinhas,
        n1: linhas1.length,
        n2: linhas2.length,
        proximoOffset: prox,
        truncado: tab1.json.truncado
      })
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
  const total = resultados.filter((r) => r.id > 0).length
  const pass = resultados.filter((r) => r.id > 0 && r.ok).length
  dglog(`[nav-smoke] fim ${pass}/${total} PASS falhas=${falhas.length}`)
  // eslint-disable-next-line no-console
  console.log(`SMOKE=${pass}/${total}`)
  const code = falhas.length ? 1 : 0
  app.exit(code)
}
