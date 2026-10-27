import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiTerminal(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await page.bringToFront()
      const estado = async () =>
        page.evaluate(() => {
          const p = document.getElementById('terminal-panel')
          const btn = document.getElementById('btn-terminal-toggle')
          return {
            open: !!(p && p.classList.contains('open')),
            display: p ? getComputedStyle(p).display : 'missing',
            btn: !!btn
          }
        })
      let st = await estado()
      if (!st.open) {
        await page.evaluate(() => {
          const btn =
            document.getElementById('btn-terminal-toggle') ||
            (document.querySelector('[data-action="terminal"]') as HTMLElement | null)
          btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        await page.waitForTimeout(800)
        st = await estado()
        if (!st.open) {
          await page.keyboard.press('Control+Backquote')
          await page.waitForTimeout(800)
          st = await estado()
        }
      }
      if (!st.open) {
        throw new Error('painel nao abriu (display=' + st.display + ' btn=' + st.btn + ')')
      }
      out.push({
        id: 'ui.terminal.abrir',
        area: 'ui',
        titulo: 'Ctrl+` / botão abre painel',
        severidade: 'ok',
        duracaoMs: Date.now() - t0,
        detalhe: 'display=' + st.display
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.abrir',
        area: 'ui',
        titulo: 'Ctrl+` / botão abre painel',
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
      // Não awaita abrirEm sem timeout — pty pode demorar sob Playwright
      await page.evaluate(() => {
        const api = (window as unknown as { dgTerminal?: { abrirEm: (c?: string) => Promise<unknown> } })
          .dgTerminal
        if (!document.querySelector('.xterm') && api?.abrirEm) {
          void api.abrirEm()
        }
      })
      let tem = false
      for (let i = 0; i < 25; i++) {
        tem = await page.evaluate(() => !!document.querySelector('.xterm'))
        if (tem) break
        await page.waitForTimeout(200)
      }
      if (!tem) {
        out.push({
          id: 'ui.terminal.echo',
          area: 'ui',
          titulo: 'echo DG_QA no buffer',
          severidade: 'warn',
          duracaoMs: Date.now() - t0,
          detalhe: 'xterm nao montou a tempo (pty/UI sob Playwright)',
          corrigivel: false
        })
      } else {
        const escreveu = await page.evaluate(async () => {
          const api = (
            window as unknown as {
              api?: { terminal?: { write: (id: string, data: string) => Promise<unknown> } }
            }
          ).api
          const tab =
            (document.querySelector('.terminal-tab.ativa') as HTMLElement | null) ||
            (document.querySelector('.terminal-tab') as HTMLElement | null)
          const id = tab?.dataset?.termId
          if (api?.terminal?.write && id) {
            await api.terminal.write(id, 'echo DG_QA\r')
            return 'ipc:' + id
          }
          return 'keyboard'
        })
        if (escreveu === 'keyboard') {
          await page.keyboard.type('echo DG_QA', { delay: 10 })
          await page.keyboard.press('Enter')
        }
        await page.waitForTimeout(1200)
        const texto = await page.evaluate(
          () =>
            document.querySelector('.xterm')?.textContent ||
            document.querySelector('.terminal-tab-pane')?.textContent ||
            ''
        )
        const ok = /DG_QA/.test(texto)
        out.push({
          id: 'ui.terminal.echo',
          area: 'ui',
          titulo: 'echo DG_QA no buffer',
          severidade: ok ? 'ok' : 'warn',
          duracaoMs: Date.now() - t0,
          detalhe: (ok ? 'encontrado' : 'texto nao apareceu') + '; via=' + escreveu
        })
      }
    } catch (e) {
      out.push({
        id: 'ui.terminal.echo',
        area: 'ui',
        titulo: 'echo DG_QA',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.evaluate(() => {
        const h = document.getElementById('terminal-resize-handle')
        h?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await page.waitForTimeout(300)
      const h = await page.evaluate(() => {
        const p = document.getElementById('terminal-panel')
        return p ? parseInt(p.style.height, 10) || 0 : -1
      })
      out.push({
        id: 'ui.terminal.dblclick300',
        area: 'ui',
        titulo: 'duplo-clique altura 300',
        severidade: h === 300 ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe: 'height=' + h
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.dblclick300',
        area: 'ui',
        titulo: 'duplo-clique altura',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('#terminal-btn-split').click()
      await page.waitForTimeout(1200)
      const n = await page.locator('.terminal-grupo').count()
      out.push({
        id: 'ui.terminal.split',
        area: 'ui',
        titulo: 'split cria 2 grupos',
        severidade: n >= 2 ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe: 'grupos=' + n
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.split',
        area: 'ui',
        titulo: 'split',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.keyboard.press('Control+`')
      await page.waitForTimeout(400)
      const aberto = await page.locator('#terminal-panel.open').count()
      out.push({
        id: 'ui.terminal.fechar',
        area: 'ui',
        titulo: 'Ctrl+` fecha painel',
        severidade: aberto === 0 ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.fechar',
        area: 'ui',
        titulo: 'fechar painel',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
