import type { Page } from 'playwright-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResultadoCenario } from '../tipos'
import { fecharSobreposicoes } from './limpeza'

type Medida = { ok: boolean; largura: number; altura: number; erro?: string }

async function medirDataUri(page: Page, dataUri: string): Promise<Medida> {
  return page.evaluate(
    (src) =>
      new Promise<{ ok: boolean; largura: number; altura: number; erro?: string }>((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ ok: true, largura: img.naturalWidth, altura: img.naturalHeight })
        img.onerror = () => resolve({ ok: false, largura: 0, altura: 0, erro: 'imagem não decodificou' })
        img.src = src
      }),
    dataUri
  )
}

/** Estúdio de mídia: painel, status das ferramentas e pipeline imagem local. */
export async function cenariosUiMidia(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await fecharSobreposicoes(page)
      await page.locator('.tool-nav-btn[data-tool="midia"]').click({ timeout: 5000 })
      await page.waitForSelector('#tool-panel:not([hidden])', { timeout: 5000 })
      await page.waitForFunction(
        () => {
          const c = document.getElementById('tool-corpo')
          return !!c && /Gerar imagem/.test(c.textContent || '')
        },
        null,
        { timeout: 8000 }
      )
      const titulo = ((await page.locator('#tool-titulo').textContent()) || '').trim()
      const corpo = (await page.locator('#tool-corpo').textContent()) || ''
      const secoes = ['Gerar imagem', 'ComfyUI local', 'Memes', 'Foto → vídeo', 'Hardware e instalação', 'Atualizações', 'Música de fundo (banco local)', 'Biblioteca de músicas livres (por estilo)', 'Áudio: normalizar, equalizar e cortar', 'Editor de vídeo/áudio (linha do tempo)', 'Imagem: nitidez, cor e reescala', 'Vídeo: filtros, estabilização e re-render', 'Apps (APK Android + instalador)', 'Ferramentas automáticas (download no PC novo)', 'Portabilidade do PC', 'Diagrama Mermaid', 'HTML → imagem', 'Fotos → vídeo', 'Cortar vídeo', 'Narrar texto', 'Transcrever', 'Imagens e ISO (estilo Rufus)']
      const faltando = secoes.filter((s) => !corpo.includes(s))
      out.push({
        id: 'ui.midia.painel',
        area: 'ui',
        titulo: 'Estúdio de mídia abre com todas as seções',
        severidade: titulo === 'Estúdio de mídia' && !faltando.length ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: faltando.length ? 'faltando: ' + faltando.join(', ') : secoes.length + '/' + secoes.length + ' seções'
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.painel',
        area: 'ui',
        titulo: 'painel do Estúdio de mídia',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  const status = await page.evaluate(async () => {
    // @ts-expect-error api bridge injetada pelo preload
    const api = window.api
    if (!api?.invoke) return { ok: false, erro: 'api ausente' }
    const raiz = await api.invoke('app:raiz-projeto')
    return api.invoke('midia:status', typeof raiz === 'string' ? raiz : '')
  })
  {
    const ferramentas = (status && status.ferramentas) || {}
    const ffmpeg = ferramentas.ffmpeg || {}
    out.push({
      id: 'ui.midia.status',
      area: 'ui',
      titulo: 'midia:status reporta ffmpeg/ffprobe disponíveis',
      severidade: ffmpeg.ok && ferramentas.ffprobe?.ok ? 'ok' : 'erro',
      duracaoMs: 0,
      detalhe:
        'ffmpeg=' + (ffmpeg.versao || ffmpeg.erro || '?') + ' · whisper=' + (ferramentas.fasterWhisper?.versao || ferramentas.fasterWhisper?.erro || '?')
    })
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        return api.invoke('midia:vozes', { rapido: true })
      })
      const vozes = Array.isArray(r?.vozes) ? r.vozes : []
      const categorias = new Set(vozes.map((v: { categoria: string }) => v.categoria))
      const infantis = vozes.filter((v: { derivada?: boolean }) => v.derivada)
      const idsUnicos = new Set(vozes.map((v: { id: string }) => v.id)).size === vozes.length
      const ok =
        !!r?.ok &&
        vozes.length >= 20 &&
        categorias.size >= 5 &&
        categorias.has('parodia') &&
        infantis.length >= 4 &&
        idsUnicos &&
        typeof r.preferencias?.vozPadrao === 'string'
      out.push({
        id: 'ui.midia.vozes',
        area: 'ui',
        titulo: 'Biblioteca de vozes cobre mulheres, homens, meninas e meninos',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          vozes.length + ' vozes · ' + categorias.size + ' categorias · ' + infantis.length +
          ' infantis · padrão=' + (r?.preferencias?.vozPadrao || '?')
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.vozes',
        area: 'ui',
        titulo: 'biblioteca de vozes (IPC)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const grupos = await page.evaluate(() => {
        const s = document.querySelector('#tool-corpo select') as HTMLSelectElement | null
        if (!s) return []
        return Array.from(s.querySelectorAll('optgroup')).map((g) => g.label)
      })
      const seletor = page.locator('#tool-corpo select').first()
      await seletor.selectOption('infantil:bia')
      const persistido = await page.evaluate(() => localStorage.getItem('dg-voz-escolhida'))
      const esperado = ['Mulheres', 'Homens', 'Meninas (infantil)', 'Meninos (infantil)', 'Paródias (arquétipos)']
      const ok = grupos.length === esperado.length && grupos.every((g, i) => g === esperado[i]) && persistido === 'infantil:bia'
      out.push({
        id: 'ui.midia.vozes-ui',
        area: 'ui',
        titulo: 'Seletor de voz agrupa categorias e lembra a escolha',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? grupos.join(' · ') + ' · escolha=' + persistido : 'grupos=' + grupos.join(',') + ' · escolha=' + persistido
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.vozes-ui',
        area: 'ui',
        titulo: 'seletor de voz',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        return window.api.invoke('dg:comfyui:status')
      })
      const checkpoints = Array.isArray(r?.modelos?.checkpoints) ? r.modelos.checkpoints : []
      const ok = !!r?.instalado && checkpoints.includes('dreamshaper_8.safetensors') && !!r?.modelos?.lcm
      out.push({
        id: 'ui.midia.comfyui',
        area: 'ui',
        titulo: 'ComfyUI local instalado com SD 1.5 + LCM',
        severidade: ok ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe:
          (r?.online ? 'online' : 'parado') + ' · ' + checkpoints.length + ' checkpoint(s) · lcm=' +
          (r?.modelos?.lcm ? 'sim' : 'não') + ' · animatediff=' + (r?.modelos?.animateDiff ? 'sim' : 'não')
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.comfyui',
        area: 'ui',
        titulo: 'ComfyUI local (status)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        return {
          hw: await api.invoke('midia:hardware'),
          memes: await api.invoke('midia:memes', { filtro: '' }),
          at: await api.invoke('midia:atualizacoes', { rede: false })
        }
      })
      const perfil = r?.hw?.hardware?.perfil
      const memesOk = r?.memes?.ok === true || /sincronizado/i.test(String(r?.memes?.erro || ''))
      const atOk = r?.at?.ok === true && Array.isArray(r?.at?.componentes) && r.at.componentes.length >= 4
      const ok = !!perfil && memesOk && atOk
      out.push({
        id: 'ui.midia.novos',
        area: 'ui',
        titulo: 'Hardware, memes e atualizações respondem por IPC',
        severidade: ok ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe:
          'perfil=' + (perfil || '?') +
          ' · memes=' + (r?.memes?.ok ? (r.memes.total + ' templates') : (r?.memes?.erro || '?')) +
          ' · atualizações=' + (r?.at?.componentes?.length || 0) + ' componentes'
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.novos',
        area: 'ui',
        titulo: 'Hardware, memes e atualizações (IPC)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        return {
          apps: await api.invoke('apps:status'),
          musicas: await api.invoke('midia:musicas')
        }
      })
      const appsOk = typeof r?.apps?.pastas?.oneDrive === 'string' && Array.isArray(r?.apps?.apk)
      const musicasOk = r?.musicas?.ok === true && typeof r.musicas.total === 'number'
      const pronto = r?.apps?.ok === true
      out.push({
        id: 'ui.apps.status',
        area: 'ui',
        titulo: 'Construtor Apps e banco de músicas respondem',
        severidade: appsOk && musicasOk ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'apps=' + (pronto ? 'pronto' : 'pendente') +
          ' · apk=' + (r?.apps?.apk?.length || 0) +
          ' · músicas=' + (r?.musicas?.total ?? '?') +
          ' · oneDrive=' + (r?.apps?.pastas?.oneDrive || '?')
      })
    } catch (e) {
      out.push({
        id: 'ui.apps.status',
        area: 'ui',
        titulo: 'Construtor Apps (IPC)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        return window.api.invoke('midia:musicas')
      })
      out.push({
        id: 'ui.midia.musicas',
        area: 'ui',
        titulo: 'Banco de músicas lista arquivos da pasta local',
        severidade: r?.ok === true && Array.isArray(r.itens) ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: (r?.total || 0) + ' faixa(s) em ' + (r?.pasta || '?')
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.musicas',
        area: 'ui',
        titulo: 'banco de músicas',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        const cat = await api.invoke('midia:musicas-catalogo')
        const audio = await api.invoke('midia:audio-analisar', { entrada: 'nao-existe.mp3' })
        return { cat, audio }
      })
      const estilos = Array.isArray(r?.cat?.estilos) ? r.cat.estilos.length : 0
      const total = typeof r?.cat?.total === 'number' ? r.cat.total : 0
      out.push({
        id: 'ui.midia.livres',
        area: 'ui',
        titulo: 'Catálogo livre por estilo e análise de áudio respondem',
        severidade: estilos >= 10 && total >= 20 && r?.audio?.ok === false ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: estilos + ' estilo(s) · ' + total + ' faixa(s) · análise inválida recusada=' + (r?.audio?.ok === false)
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.livres',
        area: 'ui',
        titulo: 'Catálogo livre / áudio (IPC)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        const raiz = await api.invoke('app:raiz-projeto')
        return {
          video: await api.invoke('midia:video-analisar', { raiz, entrada: 'nao-existe.mp4' }),
          melhorar: await api.invoke('midia:video-melhorar', { raiz, entrada: 'nao-existe.mp4' }),
          imagem: await api.invoke('midia:imagem-qualidade', { raiz, entrada: 'nao-existe.png' })
        }
      })
      const recusou = r?.video?.ok === false && r?.melhorar?.ok === false && r?.imagem?.ok === false
      out.push({
        id: 'ui.midia.qualidade',
        area: 'ui',
        titulo: 'Qualidade de vídeo/imagem responde e recusa entrada inválida',
        severidade: recusou ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: recusou ? '3 canais validados' : JSON.stringify(r).slice(0, 220)
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.qualidade',
        area: 'ui',
        titulo: 'Qualidade de vídeo/imagem (IPC)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        const raiz = await api.invoke('app:raiz-projeto')
        return api.invoke('midia:foto-video', {
          raiz,
          entrada: 'nao-existe.jpg',
          consentimento: false
        })
      })
      const recusou = r?.ok === false && /consentimento|direito|autorizada/i.test(String(r?.erro || ''))
      out.push({
        id: 'ui.midia.fotovideo.consentimento',
        area: 'ui',
        titulo: 'Foto → vídeo exige consentimento',
        severidade: recusou ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: recusou ? 'recusado sem consentimento' : 'aceitou sem consentimento: ' + JSON.stringify(r).slice(0, 200)
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.fotovideo.consentimento',
        area: 'ui',
        titulo: 'consentimento em foto → vídeo',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        const raiz = await api.invoke('app:raiz-projeto')
        return api.invoke('midia:html-imagem', {
          raiz,
          html: '<div style="font-family:sans-serif;padding:24px;background:#123;color:#fff;height:100%;box-sizing:border-box"><h1 style="margin:0">DG QA</h1></div>',
          largura: 320,
          altura: 180
        })
      })
      const medida: Medida = r?.previewBase64
        ? await medirDataUri(page, r.previewBase64)
        : { ok: false, largura: 0, altura: 0, erro: 'sem prévia' }
      const ok = !!r?.ok && medida.ok && medida.largura === 320 && medida.altura === 180
      out.push({
        id: 'ui.midia.html-imagem',
        area: 'ui',
        titulo: 'HTML → PNG local 320x180',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? medida.largura + 'x' + medida.altura : r?.erro || medida.erro || 'falhou'
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.html-imagem',
        area: 'ui',
        titulo: 'HTML → PNG local',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        const raiz = await api.invoke('app:raiz-projeto')
        const png = await api.invoke('midia:html-imagem', {
          raiz,
          html: '<div style="width:100%;height:100%;background:#0a5"></div>',
          largura: 320,
          altura: 180
        })
        if (!png?.ok) return png
        const up = await api.invoke('midia:imagem-melhorar', { raiz, entrada: png.caminho, fator: 2, nitidez: 0.5 })
        return { ...up, origem: png.caminho }
      })
      const medida: Medida = r?.previewBase64
        ? await medirDataUri(page, r.previewBase64)
        : { ok: false, largura: 0, altura: 0, erro: 'sem prévia' }
      const ok = !!r?.ok && medida.ok && medida.largura === 640 && medida.altura === 360
      out.push({
        id: 'ui.midia.upscale',
        area: 'ui',
        titulo: 'Melhorar imagem (ffmpeg) dobra a resolução',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? medida.largura + 'x' + medida.altura : r?.erro || medida.erro || 'falhou'
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.upscale',
        area: 'ui',
        titulo: 'upscale via ffmpeg',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        return await window.api.invoke('diag:portabilidade')
      })
      const itens: { id: string; ok: boolean; obrigatorio: boolean }[] = r?.itens || []
      const ids = itens.map((i) => i.id)
      const obrigatorios = itens.filter((i) => i.obrigatorio)
      const ok =
        itens.length >= 8 &&
        ids.includes('ffmpeg') &&
        ids.includes('ffprobe') &&
        ids.includes('python') &&
        ids.includes('terminal') &&
        typeof r?.resumo?.total === 'number'
      out.push({
        id: 'ui.portabilidade.diagnostico',
        area: 'ui',
        titulo: 'Diagnóstico de portabilidade cobre ffmpeg/Python/terminal',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? (r.resumo.ok || 0) + '/' + r.resumo.total + ' OK · ' + obrigatorios.filter((i) => i.ok).length + '/' + obrigatorios.length + ' obrigatórios'
          : 'itens: ' + ids.join(', ')
      })
    } catch (e) {
      out.push({
        id: 'ui.portabilidade.diagnostico',
        area: 'ui',
        titulo: 'diagnóstico de portabilidade',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        return await window.api.invoke('agente:externos')
      })
      const ids: string[] = (r?.agentes || []).map((a: { id: string }) => a.id)
      const ok =
        ids.includes('qcoder') &&
        ids.includes('openhands') &&
        ids.includes('trae') &&
        (r?.agentes || []).every((a: { custo: string }) => a.custo === 'gratuito')
      out.push({
        id: 'ui.agentes.externos',
        area: 'ui',
        titulo: 'Agentes externos gratuitos detectados (QCoder/OpenHands/Trae)',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? (r.agentes as { pronto: boolean }[]).filter((a) => a.pronto).length + ' pronto(s) de ' + ids.length
          : 'ids: ' + ids.join(', ')
      })
    } catch (e) {
      out.push({
        id: 'ui.agentes.externos',
        area: 'ui',
        titulo: 'agentes externos',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        return await window.api.invoke('prov:status')
      })
      const ids: string[] = (r?.itens || []).map((i: { id: string }) => i.id)
      const ok =
        r?.suportado === true &&
        ids.includes('ffmpeg') &&
        ids.includes('python') &&
        ids.includes('pacotes') &&
        typeof r?.pasta === 'string'
      out.push({
        id: 'ui.provisionamento.status',
        area: 'ui',
        titulo: 'Provisionamento automático cobre ffmpeg/Python/pacotes',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? r.plataforma + ' · ' + ids.map((id, i) => id + ':' + (r.itens[i].estado as string)).join(' ')
          : 'itens: ' + ids.join(', ')
      })
    } catch (e) {
      out.push({
        id: 'ui.provisionamento.status',
        area: 'ui',
        titulo: 'provisionamento automático',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        const raiz = await api.invoke('app:raiz-projeto')
        const a = await api.invoke('midia:html-imagem', {
          raiz,
          html: '<div style="width:100%;height:100%;background:#123"></div>',
          largura: 320,
          altura: 180
        })
        if (!a?.ok) return a
        const b = await api.invoke('midia:html-imagem', {
          raiz,
          html: '<div style="width:100%;height:100%;background:#a31"></div>',
          largura: 320,
          altura: 180
        })
        if (!b?.ok) return b
        const vid = await api.invoke('midia:fotos-video', {
          raiz,
          imagens: [a.caminho],
          segundosPorFoto: 1,
          largura: 320,
          altura: 180,
          fps: 24
        })
        if (!vid?.ok) return vid
        const itens = [
          { arquivo: vid.caminho, inicio: 0.2, fim: 0.8, volume: 0.6 },
          { arquivo: b.caminho, duracao: 1, fadeOut: 0.2, mudo: true }
        ]
        const analise = await api.invoke('midia:linha-tempo-analisar', { raiz, itens })
        if (!analise?.ok) return analise
        const exp = await api.invoke('midia:linha-tempo-exportar', {
          raiz,
          itens,
          largura: 320,
          altura: 180,
          fps: 24,
          fadeEntrada: 0.2,
          fadeSaida: 0.2
        })
        if (!exp?.ok) return exp
        const onda = await api.invoke('midia:onda', { raiz, entrada: exp.caminho, largura: 320, altura: 80 })
        return { ...exp, analise, onda }
      })
      const ok =
        !!r?.ok &&
        typeof r.bytes === 'number' &&
        r.bytes > 1000 &&
        Math.abs(Number(r.duracaoSeg) - 1.6) < 0.25 &&
        !!r.analise?.ok &&
        !!r.onda?.ok &&
        !!r.onda?.previewBase64
      out.push({
        id: 'ui.midia.linha-tempo',
        area: 'ui',
        titulo: 'Editor de linha do tempo exporta MP4 (vídeo+imagem) com fade e gera onda',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? r.duracaoSeg + 's · ' + Math.round(r.bytes / 1024) + ' KB · onda OK'
          : r?.erro || 'exportação/onda falhou'
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.linha-tempo',
        area: 'ui',
        titulo: 'editor de linha do tempo',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    const pastaQa = join(process.cwd(), '.dg-editor', 'qa-imagens')
    const fixture = join(pastaQa, 'fixture-fat32.img')
    try {
      mkdirSync(pastaQa, { recursive: true })
      const buf = Buffer.alloc(64 * 1024)
      buf.write('MSWIN4.1', 3, 'latin1')
      buf.write('DGQA-FAT32 ', 71, 'latin1')
      buf.write('FAT32   ', 82, 'latin1')
      buf[510] = 0x55
      buf[511] = 0xaa
      writeFileSync(fixture, buf)

      const r = await page.evaluate(async (caminho: string) => {
        // @ts-expect-error api bridge
        const api = window.api
        const raiz = await api.invoke('app:raiz-projeto')
        return {
          raiz,
          suporte: await api.invoke('imagens:suporte'),
          usb: await api.invoke('imagens:usb-listar'),
          overlay: await api.invoke('imagens:overlay-pasta', { raiz }),
          analise: await api.invoke('imagens:analisar', { raiz, caminho }),
          gravarInvalido: await api.invoke('imagens:usb-gravar', {
            raiz,
            imagem: caminho,
            disco: -1,
            serial: '',
            confirmacao: '',
            verificar: false
          })
        }
      }, fixture)

      const analise = r?.analise || {}
      const analisou =
        analise.ok === true &&
        analise.formato === 'img' &&
        analise.boot?.mbr === true &&
        /FAT32/.test(String((analise.avisos || []).join(' '))) &&
        /DGQA/.test(String(analise.rotulo || ''))
      const recusouGravacao = r?.gravarInvalido?.ok === false && /unidade não encontrada/i.test(String(r.gravarInvalido.erro || ''))
      const overlayOk = r?.overlay?.ok === true && /overlay/i.test(String(r.overlay.caminhoRel || ''))
      const usbOk = r?.usb?.ok === true && Array.isArray(r.usb.unidades)
      const suporteOk = r?.suporte?.ok === true
      const ok = analisou && recusouGravacao && overlayOk && usbOk && suporteOk
      out.push({
        id: 'ui.midia.imagens',
        area: 'ui',
        titulo: 'Análise de imagens, suporte ISO e trava de gravação USB',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? 'img FAT32/MBR · pycdlib=' + (r.suporte.versao || 'ok') + ' · ' + r.usb.unidades.length + ' unidade(s) USB · gravação inválida recusada'
          : JSON.stringify({
              analisou,
              recusouGravacao,
              overlayOk,
              usbOk,
              suporteOk,
              erro: analise.erro || r?.gravarInvalido?.erro || r?.usb?.erro || r?.suporte?.erro
            }).slice(0, 300)
      })
    } catch (e) {
      out.push({
        id: 'ui.midia.imagens',
        area: 'ui',
        titulo: 'Imagens e ISO (estilo Rufus)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      rmSync(fixture, { force: true })
    }
  }

  return out
}
