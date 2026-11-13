import type { Page } from 'playwright-core'
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
      const secoes = ['Gerar imagem', 'ComfyUI local', 'Memes', 'Foto → vídeo', 'Hardware e instalação', 'Atualizações', 'Música de fundo (banco local)', 'Biblioteca de músicas livres (por estilo)', 'Áudio: normalizar, equalizar e cortar', 'Apps (APK Android + instalador)', 'Diagrama Mermaid', 'HTML → imagem', 'Fotos → vídeo', 'Cortar vídeo', 'Narrar texto', 'Transcrever']
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

  return out
}
