/**
 * Smoke do navegador embutido.
 *
 * Ativacao (host BaseWindow legado):
 *   DG_NAV_SMOKE=1 npx electron out/main/index.js
 *
 * Ativacao (host View de produção — embed):
 *   DG_NAV_SMOKE=1 DG_NAV_SMOKE_EMBED=1 npx electron out/main/index.js
 *   (index.ts injeta BrowserWindow pai oculta)
 *
 * Contagem oficial: 22 cenarios com ids 0..21 (derivados do array resultados).
 * Nao imprime o token completo.
 */
import { app } from 'electron'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync } from 'fs'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import {
  criarJanelaNavegador,
  fecharJanelaNavegador,
  estadoAtual,
  statusEmbedNavegador,
  caminhoHostNavegador
} from './janela'
import { NAV_HOST, NAV_PORT, prefixoTokenControle, resetarRateLimit } from './controle'
import {
  caminhoNavToken,
  garantirTokenSessao,
  removerTokenSessao,
  getTokenSessao
} from './token'
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
  resetarRateLimit()
  let token = readFileSync(caminhoNavToken(), 'utf8').trim()
  const estadoDir = projectStateDir(resolverRaizProjeto())
  const downloadsRoot = resolve(estadoDir, 'downloads')
  const smokeDlDir = join(downloadsRoot, '_smoke')
  const urlRealPath = join(estadoDir, 'nav-ultima-url')
  const urlSmokePath = join(estadoDir, 'nav-ultima-url.smoke')
  let urlRealAntes: string | null = null
  try {
    urlRealAntes = existsSync(urlRealPath) ? readFileSync(urlRealPath, 'utf8') : null
  } catch {
    urlRealAntes = null
  }
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
    // Embed/oculto: pai precisa pintar — show breve p/ capturePage (showInactive falha sem surface).
    let embedParentShown = false
    const revelarPais = async (modo: 'inactive' | 'show') => {
      try {
        const { BrowserWindow } = await import('electron')
        for (const w of BrowserWindow.getAllWindows()) {
          if (w.isDestroyed()) continue
          if (modo === 'show') {
            w.show()
            try {
              w.focus()
            } catch {
              /* */
            }
          } else if (!w.isVisible()) {
            w.showInactive()
          }
          embedParentShown = true
        }
      } catch {
        /* */
      }
    }
    if (process.env.DG_NAV_SMOKE_EMBED === '1' || process.env.DG_NAV_SMOKE === '1') {
      await revelarPais('inactive')
      if (embedParentShown) await new Promise((r) => setTimeout(r, 500))
    }
    let shot = await req('POST', '/screenshot', {}, token)
    if (!(shot.status === 200 && Number(shot.json.bytes || 0) > 100)) {
      await revelarPais('show')
      await new Promise((r) => setTimeout(r, 1200))
      shot = await req('POST', '/screenshot', {}, token)
    }
    if (!(shot.status === 200 && Number(shot.json.bytes || 0) > 100)) {
      await new Promise((r) => setTimeout(r, 1500))
      shot = await req('POST', '/screenshot', {}, token)
    }
    if (embedParentShown) {
      try {
        const { BrowserWindow } = await import('electron')
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed() && w.isVisible()) w.hide()
        }
      } catch {
        /* */
      }
    }
    resultados.push({
      id: 9,
      ok: shot.status === 200 && shot.json.ok === true && Number(shot.json.bytes || 0) > 100,
      detalhe:
        'bytes=' +
        String(shot.json.bytes || 0) +
        ' erro=' +
        String(shot.json.erro || shot.json.motivo || '') +
        (embedParentShown ? ' embedParentShown' : '')
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
    // Embed: retorno tipado BaseWindow é null; valida host View + sessão aberta.
    const a = criarJanelaNavegador('about:blank', { mostrar: false })
    const b = criarJanelaNavegador('https://example.com', { mostrar: false })
    const host = caminhoHostNavegador()
    let ok12: boolean
    let det12: Record<string, unknown>
    if (host === 'embed') {
      const st = statusEmbedNavegador()
      ok12 =
        st.host === 'embed' &&
        st.conteudoCompartilhado === true &&
        estadoAtual().aberto === true
      det12 = {
        modo: 'embed',
        host: st.host,
        conteudoCompartilhado: st.conteudoCompartilhado,
        aberto: estadoAtual().aberto,
        retornoNull: a == null && b == null
      }
    } else {
      ok12 = !!a && a === b && a.isVisible() === false && !a.isDestroyed()
      det12 = {
        mesmaInstancia: a === b,
        visible: a?.isVisible?.() ?? null,
        destroyed: a?.isDestroyed?.() ?? null
      }
    }
    resultados.push({
      id: 12,
      ok: ok12,
      detalhe: JSON.stringify(det12)
    })

    // 13: download real → _smoke/, nome legível, colisão _1
    criarJanelaNavegador('about:blank', { mostrar: false })
    let urlUsada = 'https://httpbin.org/bytes/1024'
    const urlDlFb =
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    let dl1 = await req('POST', '/baixar', { url: urlUsada }, token)
    if (!(dl1.status === 200 && dl1.json.ok === true && dl1.json.caminho)) {
      urlUsada = urlDlFb
      dl1 = await req('POST', '/baixar', { url: urlUsada }, token)
    }
    const caminho1 = String(dl1.json.caminho || '')
    const nome1 = String(dl1.json.nomeSalvo || basename(caminho1))
    let ok13a = false
    let size1 = 0
    if (caminho1 && isAbsolute(caminho1) && existsSync(caminho1)) {
      size1 = statSync(caminho1).size
      const rel = relative(smokeDlDir, resolve(caminho1))
      ok13a =
        size1 > 0 &&
        !rel.startsWith('..') &&
        !isAbsolute(rel) &&
        !/^\d+-/.test(nome1)
    }
    await new Promise((r) => setTimeout(r, 400))
    const dl2 = await req('POST', '/baixar', { url: urlUsada }, token)
    const caminho2 = String(dl2.json.caminho || '')
    const nome2 = String(dl2.json.nomeSalvo || basename(caminho2))
    const ok13b =
      !!caminho2 &&
      caminho2 !== caminho1 &&
      existsSync(caminho2) &&
      existsSync(caminho1) &&
      statSync(caminho1).size === size1 &&
      (/_\d+(\.|$)/.test(nome2) || dl2.json.renomeado === true)
    resultados.push({
      id: 13,
      ok: ok13a && ok13b && dl2.json.ok === true,
      detalhe: JSON.stringify({
        urlUsada,
        nome1,
        nome2,
        caminho1,
        caminho2,
        renomeado: dl2.json.renomeado
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

    // 15: sanitização path traversal + nome longo
    const urlEvil =
      'https://httpbin.org/response-headers?Content-Disposition=attachment%3B%20filename%3D%22..%2F..%2Fevil.txt%22'
    const dlEvil = await req('POST', '/baixar', { url: urlEvil }, token)
    const caminhoEvil = String(dlEvil.json.caminho || '')
    const nomeEvil = String(dlEvil.json.nomeSalvo || '')
    const relEvil = caminhoEvil ? relative(smokeDlDir, resolve(caminhoEvil)) : '..'
    const foraProjeto = join(resolverRaizProjeto(), '..', 'evil.txt')
    const ok15a =
      dlEvil.json.ok === true &&
      !!caminhoEvil &&
      existsSync(caminhoEvil) &&
      !relEvil.startsWith('..') &&
      !isAbsolute(relEvil) &&
      !nomeEvil.includes('..') &&
      !existsSync(foraProjeto)

    const longName = 'a'.repeat(200) + '.txt'
    const urlLong =
      'https://httpbin.org/response-headers?Content-Disposition=attachment%3B%20filename%3D%22' +
      encodeURIComponent(longName) +
      '%22'
    const dlLong = await req('POST', '/baixar', { url: urlLong }, token)
    const nomeLong = String(dlLong.json.nomeSalvo || '')
    const ok15b =
      dlLong.json.ok === true &&
      nomeLong.length > 0 &&
      nomeLong.length <= 120 &&
      !nomeLong.includes('..')
    resultados.push({
      id: 15,
      ok: ok15a && ok15b,
      detalhe: JSON.stringify({
        nomeEvil,
        caminhoEvil,
        nomeLong,
        lenLong: nomeLong.length,
        evilFora: existsSync(foraProjeto)
      })
    })

    // 16: esperarSeletor (SPA)
    await req(
      'POST',
      '/abrir',
      {
        url: 'https://www.w3schools.com/html/html_tables.asp',
        esperarSeletor: 'table',
        esperarTimeoutMs: 15000
      },
      token
    )
    const tabEsp = await req(
      'POST',
      '/ler',
      { modo: 'tabela', esperarSeletor: 'table', esperarTimeoutMs: 10000 },
      token
    )
    const tabJa = await req('POST', '/ler', { modo: 'tabela' }, token)
    const ok16 =
      Number(tabEsp.json.totalLinhas || 0) > 0 && Number(tabJa.json.totalLinhas || 0) > 0
    resultados.push({
      id: 16,
      ok: ok16,
      detalhe: JSON.stringify({
        comEspera: tabEsp.json.totalLinhas,
        semEspera: tabJa.json.totalLinhas
      })
    })

    // 17: iframe — data URL com tabela no frame
    const iframeHtml =
      '<!DOCTYPE html><html><body><p>host-sem-tabela</p>' +
      '<iframe id="f1" src="data:text/html,' +
      encodeURIComponent(
        '<!DOCTYPE html><html><body><table id="t"><tr><th>H</th></tr><tr><td>v1</td></tr><tr><td>v2</td></tr></table></body></html>'
      ) +
      '"></iframe></body></html>'
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(iframeHtml)
    const abriu = await req('POST', '/abrir', { url: dataUrl }, token)
    await new Promise((r) => setTimeout(r, 2000))
    const st17 = await req('GET', '/status', undefined, token)
    const lerHost = await req('POST', '/ler', { modo: 'tabela' }, token)
    const framesDisp = (lerHost.json.framesDisponiveis as Array<{ indice: number; url?: string }>) || []
    const totalHost = Number(lerHost.json.totalLinhas || 0)
    const temFrames = framesDisp.length > 0
    let totalFrame = 0
    let frameUsado: number | null = null
    for (const fr of framesDisp) {
      const lerFrame = await req('POST', '/ler', { modo: 'tabela', frame: fr.indice }, token)
      const n = Number(lerFrame.json.totalLinhas || 0)
      if (n > 0) {
        totalFrame = n
        frameUsado = fr.indice
        break
      }
    }
    const ok17 =
      String(st17.json.url || '').startsWith('data:') &&
      totalHost === 0 &&
      temFrames &&
      totalFrame > 0 &&
      frameUsado != null
    resultados.push({
      id: 17,
      ok: ok17,
      detalhe: JSON.stringify({
        abriu: abriu.json.ok,
        url: String(st17.json.url || '').slice(0, 48),
        framesHost: framesDisp.length,
        totalHost,
        totalFrame,
        frameUsado,
        aviso: lerHost.json.aviso
      })
    })

    // P4: nav-ultima-url real inalterado
    let urlRealDepois: string | null = null
    try {
      urlRealDepois = existsSync(urlRealPath) ? readFileSync(urlRealPath, 'utf8') : null
    } catch {
      urlRealDepois = null
    }
    // 0: nav-ultima-url real inalterado (cenario oficial, sempre conta)
    resultados.push({
      id: 0,
      ok: urlRealAntes === urlRealDepois,
      detalhe:
        urlRealAntes === urlRealDepois
          ? 'nav-ultima-url real inalterado'
          : 'nav-ultima-url real foi alterado pelo smoke'
    })

    // 20: fallback debugger — força CDP (_forceDebugger) num iframe data: (sem sandbox
    // opaco: sandbox real bloqueia createIsolatedWorld no Electron 33 offline)
    const iframeDbg =
      '<!DOCTYPE html><html><body><p>host</p>' +
      '<iframe id="f1" src="data:text/html,' +
      encodeURIComponent(
        '<!DOCTYPE html><html><body><table id="t"><tr><th>H</th></tr><tr><td>dbg</td></tr><tr><td>dbg2</td></tr></table></body></html>'
      ) +
      '"></iframe></body></html>'
    await req(
      'POST',
      '/abrir',
      { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(iframeDbg) },
      token
    )
    await new Promise((r) => setTimeout(r, 2000))
    const host20 = await req('POST', '/ler', { modo: 'tabela' }, token)
    const frames20 =
      (host20.json.framesDisponiveis as Array<{ indice: number }>) || []
    let ok20 = false
    let det20: Record<string, unknown> = { frames: frames20.length }
    for (const fr of frames20) {
      const lerDbg = await req(
        'POST',
        '/ler',
        { modo: 'tabela', frame: fr.indice, _forceDebugger: true },
        token
      )
      if (
        lerDbg.json.ok === true &&
        lerDbg.json.tentouDebugger === true &&
        Number(lerDbg.json.totalLinhas || 0) > 0
      ) {
        ok20 = true
        det20 = {
          frame: fr.indice,
          totalLinhas: lerDbg.json.totalLinhas,
          tentouDebugger: true
        }
        break
      }
      det20 = {
        frame: fr.indice,
        ok: lerDbg.json.ok,
        motivo: lerDbg.json.motivo || lerDbg.json.erro,
        erroDebugger: lerDbg.json.erroDebugger,
        tentouDebugger: lerDbg.json.tentouDebugger,
        totalLinhas: lerDbg.json.totalLinhas
      }
    }
    resultados.push({ id: 20, ok: ok20, detalhe: JSON.stringify(det20) })

    // 21: MutationObserver aguardarEstavel
    const mutHtml =
      '<!DOCTYPE html><html><body><div id="root">aguarde</div><script>' +
      'setTimeout(function(){' +
      'var t=document.createElement("table");t.id="dyn";document.body.appendChild(t);' +
      'var n=0;var iv=setInterval(function(){n++;' +
      't.innerHTML="";for(var i=0;i<n;i++){var tr=document.createElement("tr");' +
      'var td=document.createElement("td");td.textContent="r"+i;tr.appendChild(td);t.appendChild(tr);}' +
      'if(n>=5)clearInterval(iv);},200);},500);' +
      '</script></body></html>'
    await req(
      'POST',
      '/abrir',
      { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(mutHtml) },
      token
    )
    const tabEst = await req(
      'POST',
      '/ler',
      {
        modo: 'tabela',
        esperarSeletor: 'table#dyn',
        aguardarEstavel: 300,
        esperarTimeoutMs: 8000
      },
      token
    )
    const linhasFinais = Number(tabEst.json.totalLinhas || 0)
    // 5 linhas de dados (sem header separado — cada iteração cria n rows)
    const ok21 = tabEst.json.ok === true && linhasFinais === 5
    resultados.push({
      id: 21,
      ok: ok21,
      detalhe: JSON.stringify({
        totalLinhas: linhasFinais,
        aviso: tabEst.json.aviso
      })
    })

    // 19: rate limit — 130 /ler rápidos → 429 (depois dos testes que usam /ler)
    resetarRateLimit()
    let lastStatus = 200
    let retryAfter = 0
    for (let i = 0; i < 130; i++) {
      const r = await req('POST', '/ler', { modo: 'texto' }, token)
      lastStatus = r.status
      if (r.status === 429) {
        retryAfter = Number(r.json.retryAfterSec || 0)
        break
      }
    }
    const stOk = await req('GET', '/status', undefined, token)
    const ok19 = lastStatus === 429 && retryAfter > 0 && stOk.status === 200
    resultados.push({
      id: 19,
      ok: ok19,
      detalhe: JSON.stringify({ lastStatus, retryAfter, statusOk: stOk.status })
    })
    resetarRateLimit()

    // 18: rotação de token (por último — invalida token atual)
    const tokenAntigo = token
    const pathTok = caminhoNavToken()
    removerTokenSessao()
    const arquivoSumiu = !existsSync(pathTok)
    const semTok = await req('GET', '/status', undefined, null)
    const novo = garantirTokenSessao()
    token = novo
    const memOk = getTokenSessao() === novo
    const comAntigo = await req('GET', '/status', undefined, tokenAntigo)
    const comNovo = await req('GET', '/status', undefined, novo)
    const ok18 =
      arquivoSumiu &&
      semTok.status === 401 &&
      novo !== tokenAntigo &&
      memOk &&
      comAntigo.status === 401 &&
      comNovo.status === 200
    resultados.push({
      id: 18,
      ok: ok18,
      detalhe: JSON.stringify({
        arquivoSumiu,
        semTok: semTok.status,
        diferente: novo !== tokenAntigo,
        antigo401: comAntigo.status,
        novo200: comNovo.status,
        prefixNovo: novo.slice(0, 8)
      })
    })
  } catch (e) {
    // Falha fatal do harness — marca cenario 0 se ainda nao registrado
    if (!resultados.some((r) => r.id === 0)) {
      resultados.push({ id: 0, ok: false, detalhe: String((e as Error).message || e) })
    }
    dglog('[nav-smoke] excecao: ' + String((e as Error).message || e))
  } finally {
    // P3: limpar só _smoke
    try {
      if (existsSync(smokeDlDir)) rmSync(smokeDlDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
    try {
      if (existsSync(urlSmokePath)) unlinkSync(urlSmokePath)
    } catch {
      /* best-effort */
    }
  }

  // Contagem deterministica: sempre 22 cenarios (ids 0..21), derivados do array
  const IDS_ESPERADOS = Array.from({ length: 22 }, (_, i) => i)
  const porId = new Map<number, { id: number; ok: boolean; detalhe: string }>()
  for (const r of resultados) porId.set(r.id, r)
  for (const id of IDS_ESPERADOS) {
    if (!porId.has(id)) {
      porId.set(id, { id, ok: false, detalhe: 'cenario nao executado' })
    }
  }
  const ordenados = IDS_ESPERADOS.map((id) => porId.get(id)!)
  const falhas = ordenados.filter((r) => !r.ok)
  for (const r of ordenados) {
    dglog(`[nav-smoke] #${r.id} ${r.ok ? 'PASS' : 'FAIL'} ${r.detalhe}`)
    // eslint-disable-next-line no-console
    console.log(`[smoke] id=${r.id} ok=${r.ok} detalhe=${r.detalhe}`)
  }
  // resíduo em downloads (fora _smoke)
  let residuo = false
  try {
    if (existsSync(smokeDlDir)) residuo = true
    if (existsSync(downloadsRoot)) {
      const ents = readdirSync(downloadsRoot)
      if (ents.includes('_smoke')) residuo = true
    }
  } catch {
    /* ignore */
  }
  const total = ordenados.length
  const pass = ordenados.filter((r) => r.ok).length
  const failed = falhas.length
  dglog(`[nav-smoke] fim ${pass}/${total} PASS falhas=${failed} residuoSmoke=${residuo}`)
  // eslint-disable-next-line no-console
  console.log(`[smoke] total=${total} passed=${pass} failed=${failed}`)
  // eslint-disable-next-line no-console
  console.log(`SMOKE=${pass}/${total}`)
  // before-quit não roda com app.exit — remover token aqui (espelha before-quit)
  try {
    removerTokenSessao()
  } catch {
    /* ignore */
  }
  const code = falhas.length || residuo ? 1 : 0
  app.exit(code)
}
