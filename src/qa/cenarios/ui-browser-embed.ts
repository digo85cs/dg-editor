import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

/**
 * Cobre o caminho de produção (embed) — sem DG_NAV_SMOKE.
 * Smoke 22/22 usa BaseWindow; aqui validamos IPC + aba Browser.
 */
export async function cenariosUiBrowserEmbed(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await page.locator('.right-tab[data-pane="browser"], .pane-tab[data-pane="browser"], button[data-pane="browser"]').first().click({ timeout: 5000 }).catch(async () => {
        // fallback: procurar texto Browser nas tabs do painel direito
        await page.getByRole('button', { name: /browser/i }).first().click({ timeout: 5000 })
      })
      await page.waitForTimeout(300)
      const pane = page.locator('#pane-browser')
      const ativo = (await pane.count()) > 0
      out.push({
        id: 'ui.browser.aba',
        area: 'ui',
        titulo: 'aba Browser abre no painel direito',
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

  return out
}
