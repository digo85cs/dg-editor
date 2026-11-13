import http from 'node:http'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'
import { fecharSobreposicoes } from './limpeza'

type ServidorDownload = { url: string; fechar: () => Promise<void> }

function criarServidorDownload(opts: {
  nome: string
  chunks: number
  bytesPorChunk: number
  atrasoMs: number
}): Promise<ServidorDownload> {
  return new Promise((resolve, reject) => {
    const total = opts.chunks * opts.bytesPorChunk
    const pedaco = Buffer.alloc(opts.bytesPorChunk, 'd')
    let timer: ReturnType<typeof setInterval> | null = null
    let encerrado = false
    const parar = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${opts.nome}"`,
        'Content-Length': String(total)
      })
      let enviados = 0
      res.on('close', parar)
      timer = setInterval(() => {
        if (encerrado || res.destroyed) {
          parar()
          return
        }
        if (enviados >= opts.chunks) {
          parar()
          res.end()
          return
        }
        res.write(pedaco)
        enviados++
      }, opts.atrasoMs)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const porta = typeof addr === 'object' && addr ? addr.port : 0
      resolve({
        url: `http://127.0.0.1:${porta}/arquivo`,
        fechar: () =>
          new Promise<void>((done) => {
            encerrado = true
            parar()
            server.closeAllConnections?.()
            server.close(() => done())
            setTimeout(done, 1500)
          })
      })
    })
  })
}

function pastaDownloads(): string[] {
  const base = join(process.cwd(), '.dg-editor', 'downloads')
  if (!existsSync(base)) return []
  try {
    return readdirSync(base).map((n) => join(base, n))
  } catch {
    return []
  }
}

function baixadosComPrefixo(prefixo: string): string[] {
  return pastaDownloads().filter((p) => {
    const nome = p.split(/[\\/]/).pop() || ''
    return nome.startsWith(prefixo)
  })
}

function limparBaixados(prefixo: string): void {
  for (const p of baixadosComPrefixo(prefixo)) {
    try {
      unlinkSync(p)
    } catch {
      /* arquivo pode estar em uso */
    }
  }
}

async function observarDownloads(page: Page, nomeArquivo: string): Promise<void> {
  await page.evaluate((nome) => {
    const w = window as unknown as { __dlEstados?: string[]; __dlUltimo?: unknown }
    w.__dlEstados = []
    w.__dlUltimo = null
    // @ts-expect-error api bridge injetada pelo preload
    window.api.on('navegador:download-progresso', (_e: unknown, p: Record<string, unknown>) => {
      if (!p || typeof p !== 'object') return
      if (p.nomeOriginal !== nome) return
      w.__dlEstados?.push(String(p.estado))
      w.__dlUltimo = p
    })
  }, nomeArquivo)
}

async function aguardarEstado(page: Page, estado: string, timeoutMs: number): Promise<string[]> {
  const t0 = Date.now()
  let estados: string[] = []
  while (Date.now() - t0 < timeoutMs) {
    estados = await page.evaluate(
      () => (window as unknown as { __dlEstados?: string[] }).__dlEstados || []
    )
    if (estados.includes(estado)) return estados
    await page.waitForTimeout(150)
  }
  return estados
}

async function abrirUrl(page: Page, url: string): Promise<void> {
  await page.evaluate(async (u) => {
    // @ts-expect-error api bridge injetada pelo preload
    return window.api.invoke('navegador:abrir', u)
  }, url)
}

/**
 * Cobre o caminho de produção (embed) — sem DG_NAV_SMOKE.
 * Smoke 22/22 usa BaseWindow; aqui validamos IPC + aba Browser.
 */
export async function cenariosUiBrowserEmbed(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await fecharSobreposicoes(page)
      await page.locator('.right-tab[data-pane="browser"]').click({ timeout: 5000 })
      await page.waitForSelector('#pane-browser.active', { timeout: 5000 })
      const pane = page.locator('#pane-browser')
      const ativo = (await pane.count()) > 0
      out.push({
        id: 'ui.browser.aba',
        area: 'ui',
        titulo: 'aba Navegador abre no painel direito',
        severidade: ativo ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0
      })
    } catch (e) {
      out.push({
        id: 'ui.browser.aba',
        area: 'ui',
        titulo: 'aba Browser',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const st = await page.evaluate(async () => {
        // @ts-expect-error api bridge
        const api = window.api
        if (!api?.invoke) return { ok: false, erro: 'api ausente' }
        return api.invoke('navegador:embed-status')
      })
      const modoOk = st && st.ok !== false && st.modo === 'embed'
      out.push({
        id: 'ui.browser.embed-status',
        area: 'ui',
        titulo: 'navegador:embed-status modo=embed (produção)',
        severidade: modoOk ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: JSON.stringify(st || {})
      })
    } catch (e) {
      out.push({
        id: 'ui.browser.embed-status',
        area: 'ui',
        titulo: 'embed-status',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      let st: Record<string, unknown> = {}
      for (let i = 0; i < 30; i++) {
        st = await page.evaluate(async () => {
          // @ts-expect-error api bridge
          const api = window.api
          if (!api?.invoke) return { ok: false, erro: 'api ausente' }
          return api.invoke('navegador:embed-status')
        })
        const u = typeof st?.url === 'string' ? st.url : ''
        if (u && u !== 'about:blank') break
        await page.waitForTimeout(200)
      }
      const url = typeof st?.url === 'string' ? st.url : ''
      const carregou = !!url && url !== 'about:blank'
      out.push({
        id: 'ui.browser.inicio',
        area: 'ui',
        titulo: 'navegador nao abre em branco (pagina inicial local)',
        severidade: carregou ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'url=' + (url.length > 120 ? url.slice(0, 120) + '…' : url) + ' inicio=' + !!st?.ehPaginaInicial
      })
    } catch (e) {
      out.push({
        id: 'ui.browser.inicio',
        area: 'ui',
        titulo: 'pagina inicial do navegador',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    const nome = `dg-e2e-progresso-${Date.now()}.bin`
    let srv: ServidorDownload | null = null
    try {
      await fecharSobreposicoes(page)
      srv = await criarServidorDownload({
        nome,
        chunks: 10,
        bytesPorChunk: 32 * 1024,
        atrasoMs: 25
      })
      await observarDownloads(page, nome)
      await abrirUrl(page, srv.url)
      const estados = await aguardarEstado(page, 'concluido', 20000)
      await page.waitForTimeout(300)
      const arquivos = baixadosComPrefixo(nome.replace(/\.bin$/, ''))
      const salvou = arquivos.length > 0
      const uiOk = await page.evaluate(() => {
        const el = document.getElementById('browser-download')
        return el instanceof HTMLElement ? el.hidden : null
      })
      const ok = estados.includes('iniciado') && estados.includes('concluido') && salvou
      out.push({
        id: 'ui.browser.download-progresso',
        area: 'ui',
        titulo: 'download real com progresso até concluído',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: `estados=${estados.join(',') || 'nenhum'} arquivo=${salvou ? 'salvo' : 'ausente'} uiFinal=${uiOk}`
      })
    } catch (e) {
      out.push({
        id: 'ui.browser.download-progresso',
        area: 'ui',
        titulo: 'download real com progresso',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      limparBaixados('dg-e2e-progresso-')
      await srv?.fechar()
    }
  }

  {
    const t0 = Date.now()
    const nome = `dg-e2e-cancel-${Date.now()}.bin`
    let srv: ServidorDownload | null = null
    try {
      await fecharSobreposicoes(page)
      srv = await criarServidorDownload({
        nome,
        chunks: 400,
        bytesPorChunk: 64 * 1024,
        atrasoMs: 60
      })
      await observarDownloads(page, nome)
      await abrirUrl(page, srv.url)
      const ateIniciar = await aguardarEstado(page, 'andamento', 12000)
      const clicou = await page.evaluate(() => {
        const btn = document.getElementById('browser-download-cancelar')
        if (!(btn instanceof HTMLElement)) return false
        btn.click()
        return true
      })
      const estados = await aguardarEstado(page, 'cancelado', 12000)
      const ok =
        ateIniciar.length > 0 && clicou && estados.includes('cancelado') && !estados.includes('concluido')
      out.push({
        id: 'ui.browser.download-cancelar',
        area: 'ui',
        titulo: 'cancelamento de download pela UI',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: `btn=${clicou} estados=${estados.join(',') || 'nenhum'}`
      })
    } catch (e) {
      out.push({
        id: 'ui.browser.download-cancelar',
        area: 'ui',
        titulo: 'cancelamento de download',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      limparBaixados('dg-e2e-cancel-')
      await srv?.fechar()
    }
  }

  return out
}
