import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fecharSobreposicoes } from './limpeza'

function ffmpegLocal(): string {
  const p = join(process.cwd(), 'resources', 'bin', 'win32-x64', 'ffmpeg.exe')
  return existsSync(p) ? p : 'ffmpeg'
}

/** Gravador de tela: fontes, chunks WebM, conversão MP4 e modal. */
export async function cenariosUiGravacao(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge injetada pelo preload
        const api = window.api
        const info = await api.invoke('app:raiz-projeto')
        const raiz = info?.raiz || ''
        const fontes = await api.invoke('gravacao:fontes')
        const ini = await api.invoke('gravacao:iniciar', { raiz, nome: 'qa-gravacao' })
        if (!ini?.ok) return { ok: false, erro: ini?.erro || 'iniciar falhou', fontes }
        const c1 = await api.invoke('gravacao:chunk', { id: ini.id, dados: new Uint8Array([26, 69, 223, 163]) })
        const c2 = await api.invoke('gravacao:chunk', { id: ini.id, dados: new Uint8Array([1, 2, 3]) })
        const fim = await api.invoke('gravacao:finalizar', { id: ini.id, raiz })
        const lista = await api.invoke('gravacao:listar', { raiz })
        return { ok: true, fontes: fontes?.fontes?.length ?? -1, c1, c2, fim, lista }
      })
      const fim = (r as { fim?: { ok?: boolean; caminho?: string; bytes?: number } }).fim || {}
      const lista = (r as { lista?: { ok?: boolean; gravacoes?: Array<{ nome: string }> } }).lista || {}
      const bytesOk =
        fim.ok === true && typeof fim.caminho === 'string' && existsSync(fim.caminho) && statSync(fim.caminho).size === 7
      const listado = (lista.gravacoes || []).some((g) => g.nome === 'qa-gravacao.webm')
      out.push({
        id: 'ui.gravacao.ipc',
        area: 'ui',
        titulo: 'Gravador grava chunks WebM e lista a gravação',
        severidade: bytesOk && listado ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'fontes=' +
          String((r as { fontes?: number }).fontes) +
          ' · bytes=' +
          String(fim.bytes) +
          ' · listado=' +
          listado
      })
      if (fim.caminho && existsSync(fim.caminho)) rmSync(fim.caminho, { force: true })
    } catch (e) {
      out.push({
        id: 'ui.gravacao.ipc',
        area: 'ui',
        titulo: 'gravador de tela (chunks)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    const tmp = join(process.cwd(), '.qa-tmp-grav-' + Date.now())
    try {
      mkdirSync(tmp, { recursive: true })
      const webm = join(tmp, 'fonte.webm')
      execFileSync(
        ffmpegLocal(),
        ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x120:d=0.5', '-c:v', 'libvpx', '-b:v', '200k', webm],
        { stdio: 'ignore', timeout: 60_000 }
      )
      const r = await page.evaluate(async (entrada) => {
        // @ts-expect-error api bridge injetada pelo preload
        const api = window.api
        const info = await api.invoke('app:raiz-projeto')
        return api.invoke('gravacao:converter', { raiz: info?.raiz || '', entrada })
      }, webm)
      const ok = !!(r && (r as { ok?: boolean }).ok) &&
        typeof (r as { caminho?: string }).caminho === 'string' &&
        existsSync((r as { caminho: string }).caminho) &&
        statSync((r as { caminho: string }).caminho).size > 500
      out.push({
        id: 'ui.gravacao.mp4',
        area: 'ui',
        titulo: 'Gravação WebM converte para MP4 com ffmpeg',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? Math.round(statSync((r as { caminho: string }).caminho).size / 1024) + ' KB'
          : String((r as { erro?: string })?.erro || 'sem MP4')
      })
    } catch (e) {
      out.push({
        id: 'ui.gravacao.mp4',
        area: 'ui',
        titulo: 'conversão de gravação para MP4',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  {
    const t0 = Date.now()
    try {
      await fecharSobreposicoes(page)
      await page.evaluate(() => {
        const painel = document.getElementById('tool-panel')
        const w = window as unknown as { dgAbrirFerramenta?: (id: string) => void }
        if (painel?.hidden !== false) w.dgAbrirFerramenta?.('midia')
      })
      await page.waitForSelector('#tool-panel:not([hidden])', { timeout: 8000 })
      const btn = page.locator('#tool-corpo button', { hasText: 'Abrir gravador de tela' })
      await btn.waitFor({ timeout: 8000 })
      await btn.click()
      await page.waitForSelector('.gravador-modal', { timeout: 5000 })
      await page.waitForFunction(
        () => {
          const s = document.querySelector('.gravador-modal .gravador-status')
          return !!s && !/Carregando/.test(s.textContent || '')
        },
        null,
        { timeout: 8000 }
      )
      const estado = await page.evaluate(() => {
        const modal = document.querySelector('.gravador-modal')
        const select = modal?.querySelector('.gravador-controles select')
        const status = modal?.querySelector('.gravador-status')?.textContent || ''
        return { opcoes: select ? select.querySelectorAll('option').length : 0, status }
      })
      let capturou = false
      let detalheCaptura = 'fonte indisponível'
      if (estado.opcoes >= 1) {
        try {
          await page.locator('.gravador-modal button', { hasText: 'Gravar' }).click()
          await page.waitForFunction(
            () => /Gravando/.test(document.querySelector('.gravador-modal .gravador-status')?.textContent || ''),
            null,
            { timeout: 15000 }
          )
          await page.waitForTimeout(2500)
          await page.locator('.gravador-modal button', { hasText: 'Parar' }).click()
          await page.waitForFunction(
            () => /Salvo em/.test(document.querySelector('.gravador-modal .gravador-resultado')?.textContent || ''),
            null,
            { timeout: 20000 }
          )
          const info = await page.evaluate(async () => {
            // @ts-expect-error api bridge injetada pelo preload
            const api = window.api
            const info = await api.invoke('app:raiz-projeto')
            return api.invoke('gravacao:listar', { raiz: info?.raiz || '' })
          })
          const itens = (info as { gravacoes?: Array<{ nome: string; caminho: string; bytes: number }> }).gravacoes || []
          const webm = itens.find((g) => /^gravacao-.*\.webm$/.test(g.nome))
          capturou = !!webm && webm.bytes > 1000
          detalheCaptura = webm ? webm.nome + ' · ' + Math.round(webm.bytes / 1024) + ' KB' : 'arquivo não encontrado'
          for (const g of itens) if (/^gravacao-/.test(g.nome)) rmSync(g.caminho, { force: true })
        } catch (e) {
          detalheCaptura = 'captura indisponível no ambiente: ' + String(e).slice(0, 120)
        }
      }
      await page.locator('.gravador-modal .gravador-head button', { hasText: 'Fechar' }).click()
      await page.waitForFunction(() => !document.querySelector('.gravador-modal'), null, { timeout: 5000 })
      out.push({
        id: 'ui.gravacao.ui',
        area: 'ui',
        titulo: 'Gravador de tela abre pelo Estúdio e fecha',
        severidade: estado.opcoes >= 1 ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: estado.opcoes + ' opção(ões) · ' + estado.status.slice(0, 90)
      })
      out.push({
        id: 'ui.gravacao.captura',
        area: 'ui',
        titulo: 'Captura real da tela grava WebM ao vivo',
        severidade: capturou ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe: detalheCaptura
      })
    } catch (e) {
      out.push({
        id: 'ui.gravacao.ui',
        area: 'ui',
        titulo: 'modal do gravador de tela',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
