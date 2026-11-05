import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiNavegacao(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []
  const errosConsole: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const local = msg.location()
      errosConsole.push(msg.text() + (local.url ? ' @ ' + local.url + ':' + local.lineNumber : ''))
    }
  })
  page.on('pageerror', (err) => errosConsole.push(String(err)))
  page.on('requestfailed', (request) => {
    errosConsole.push('request failed: ' + request.url() + ' (' + (request.failure()?.errorText || 'unknown') + ')')
  })

  {
    const t0 = Date.now()
    try {
      await page.waitForSelector('#folder-list', { timeout: 10000 })
      await page.waitForSelector('#app', { timeout: 5000 })
      out.push({
        id: 'ui.arvore.presente',
        area: 'ui',
        titulo: 'janela abre com arvore',
        severidade: 'ok',
        duracaoMs: Date.now() - t0
      })
    } catch (e) {
      out.push({
        id: 'ui.arvore.presente',
        area: 'ui',
        titulo: 'janela abre com arvore',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
      return out
    }
  }

  {
    const t0 = Date.now()
    try {
      const roots = page.locator('.tree-root-header')
      const n = await roots.count()
      if (n === 0) {
        out.push({
          id: 'ui.arvore.expandir',
          area: 'ui',
          titulo: 'expandir pasta 5x',
          severidade: 'warn',
          duracaoMs: Date.now() - t0,
          detalhe: 'nenhuma pasta aberta no workspace'
        })
      } else {
        const header = roots.first()
        for (let i = 0; i < 5; i++) {
          await header.click()
          await page.waitForTimeout(200)
        }
        out.push({
          id: 'ui.arvore.expandir',
          area: 'ui',
          titulo: 'expandir/retrair 5x sem crash',
          severidade: 'ok',
          duracaoMs: Date.now() - t0
        })
      }
    } catch (e) {
      out.push({
        id: 'ui.arvore.expandir',
        area: 'ui',
        titulo: 'expandir pasta 5x',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    const graves = errosConsole.filter((t) => !/Electron Security Warning/i.test(t))
    out.push({
      id: 'ui.console.limpo',
      area: 'ui',
      titulo: 'console sem pageerror grave',
      severidade: graves.length ? 'warn' : 'ok',
      duracaoMs: Date.now() - t0,
      detalhe: graves.slice(0, 3).join(' | ') || 'limpo'
    })
  }

  return out
}
