import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fecharSobreposicoes } from './limpeza'

/** Compartilhamento local (estilo AirDrop): servidor LAN, upload e modal. */
export async function cenariosUiCompartilhar(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async () => {
        // @ts-expect-error api bridge injetada pelo preload
        const api = window.api
        const info = await api.invoke('app:raiz-projeto')
        const raiz = info?.raiz || ''
        const ini = await api.invoke('compartilhar:iniciar', { raiz })
        const st = await api.invoke('compartilhar:status', { raiz })
        return { raiz, ini, st }
      })
      const ini = (r as { ini?: { ok?: boolean; url?: string; porta?: number; token?: string; erro?: string } }).ini || {}
      let upload = { ok: false as boolean, erro: '' as string, nome: '' as string }
      if (ini.ok && ini.url && ini.token) {
        const base = ini.url.split('/?')[0]
        const resp = await fetch(base + '/enviar?t=' + ini.token + '&nome=' + encodeURIComponent('qa-share.txt'), {
          method: 'PUT',
          body: 'arquivo de teste do QA'
        })
        const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; nome?: string; erro?: string }
        upload = { ok: !!j.ok, erro: j.erro || '', nome: j.nome || '' }
      }
      const lista = await page.evaluate(async () => {
        // @ts-expect-error api bridge injetada pelo preload
        const api = window.api
        const info = await api.invoke('app:raiz-projeto')
        return api.invoke('compartilhar:listar', { raiz: info?.raiz || '' })
      })
      const recebidos = ((lista as { recebidos?: Array<{ nome: string }> }).recebidos || []).map((x) => x.nome)
      const st = (r as { st?: { ativo?: boolean; recebidos?: number } }).st || {}
      out.push({
        id: 'ui.compartilhar.ipc',
        area: 'ui',
        titulo: 'Servidor LAN recebe upload autenticado e lista o arquivo',
        severidade: ini.ok && st.ativo && upload.ok && recebidos.includes('qa-share.txt') ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'porta=' + String(ini.porta) + ' · upload=' + upload.nome + ' · recebidos=' + recebidos.join(',')
      })
      const raiz = (r as { raiz?: string }).raiz
      if (raiz) {
        const arquivo = join(raiz, '.dg-editor', 'recebidos', 'qa-share.txt')
        if (existsSync(arquivo)) rmSync(arquivo, { force: true })
      }
    } catch (e) {
      out.push({
        id: 'ui.compartilhar.ipc',
        area: 'ui',
        titulo: 'compartilhamento local (upload)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      await page.evaluate(async () => {
        // @ts-expect-error api bridge injetada pelo preload
        await window.api.invoke('compartilhar:parar')
      })
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
      const btn = page.locator('#tool-corpo button', { hasText: 'Receber do celular (LAN)' })
      await btn.waitFor({ timeout: 8000 })
      await btn.click()
      await page.waitForSelector('.share-modal', { timeout: 5000 })
      const titulo = ((await page.locator('.share-modal h3').textContent()) || '').trim()
      await page.locator('.share-modal button', { hasText: 'Iniciar' }).click()
      await page.waitForFunction(
        () => {
          const u = document.querySelector('.share-modal .share-url')
          return !!u && /^http:\/\//.test((u.textContent || '').trim())
        },
        null,
        { timeout: 8000 }
      )
      const ativo = await page.evaluate(() => {
        const st = document.querySelector('.share-modal .share-status')?.textContent || ''
        return /ativo/i.test(st)
      })
      await page.locator('.share-modal button', { hasText: 'Parar' }).click()
      await page.locator('.share-modal .share-head button', { hasText: 'Fechar' }).click()
      await page.waitForFunction(() => !document.querySelector('.share-modal'), null, { timeout: 5000 })
      out.push({
        id: 'ui.compartilhar.ui',
        area: 'ui',
        titulo: 'Modal de compartilhamento inicia, para e fecha',
        severidade: ativo && /celular/i.test(titulo) ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: titulo + ' · status ativo=' + ativo
      })
    } catch (e) {
      out.push({
        id: 'ui.compartilhar.ui',
        area: 'ui',
        titulo: 'modal de compartilhamento local',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
