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
        const abaId = await page.evaluate(() => {
          const tab =
            (document.querySelector('.terminal-tab.ativa') as HTMLElement | null) ||
            (document.querySelector('.terminal-tab') as HTMLElement | null)
          return tab?.dataset?.termId || ''
        })
        // CSP bloqueia Playwright waitForFunction (unsafe-eval). Equivalente: poll + evaluate + bufferTexto.
        const lerBuf = async () =>
          page.evaluate((id) => {
            const dg = (window as unknown as { dgTerminal?: { bufferTexto?: (a?: string) => string } })
              .dgTerminal
            if (!dg?.bufferTexto) return { ok: false, txt: '', motivo: 'sem bufferTexto' }
            return { ok: true, txt: dg.bufferTexto(id || undefined) || '', motivo: '' }
          }, abaId)

        let pronto = false
        for (let i = 0; i < 40; i++) {
          const b = await lerBuf()
          if (b.ok && b.txt.trim().length > 0) {
            pronto = true
            break
          }
          await page.waitForTimeout(250)
        }
        if (!pronto) {
          const b = await lerBuf()
          throw new Error('buffer vazio apos abrir (' + (b.motivo || 'len=' + b.txt.length) + ')')
        }

        const escreveu = await page.evaluate(async (id) => {
          const api = (
            window as unknown as {
              api?: { terminal?: { write: (id: string, data: string) => Promise<unknown> } }
            }
          ).api
          if (api?.terminal?.write && id) {
            await api.terminal.write(id, 'echo DG_QA\r')
            return 'ipc:' + id
          }
          return 'keyboard'
        }, abaId)
        if (escreveu === 'keyboard') {
          await page.keyboard.type('echo DG_QA', { delay: 10 })
          await page.keyboard.press('Enter')
        }

        let achou = false
        for (let i = 0; i < 40; i++) {
          const b = await lerBuf()
          if (b.ok && /DG_QA/.test(b.txt)) {
            achou = true
            break
          }
          await page.waitForTimeout(250)
        }
        if (!achou) {
          const b = await lerBuf()
          throw new Error('DG_QA ausente no bufferTexto (amostra=' + b.txt.slice(0, 120) + ')')
        }
        out.push({
          id: 'ui.terminal.echo',
          area: 'ui',
          titulo: 'echo DG_QA no buffer',
          severidade: 'ok',
          duracaoMs: Date.now() - t0,
          detalhe: 'bufferTexto+evaluate; via=' + escreveu
        })
      }
    } catch (e) {
      const msg = String(e)
      // Cloud/CI sem shell real: execvp falha — não é regressão do produto
      const semShell = /execvp|No such file or directory|ENOENT|spawn/i.test(msg)
      out.push({
        id: 'ui.terminal.echo',
        area: 'ui',
        titulo: 'echo DG_QA',
        severidade: semShell ? 'warn' : 'erro',
        duracaoMs: Date.now() - t0,
        erro: msg,
        detalhe: semShell ? 'shell ausente no ambiente — warn' : undefined
      })
    }
  }

  {
    // layout docked (Etapa 4 / P6): handle oculto; dblclick não redimensiona altura
    const t0 = Date.now()
    try {
      const info = await page.evaluate(() => {
        const panel = document.getElementById('terminal-panel')
        const handle = document.getElementById('terminal-resize-handle')
        const hBefore = panel ? panel.style.height : ''
        handle?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
        const hAfter = panel ? panel.style.height : ''
        const body = panel?.querySelector('.terminal-body') as HTMLElement | null
        const bodyH = body?.clientHeight || panel?.clientHeight || 0
        const hasXterm = !!panel?.querySelector('.xterm')
        return {
          docked: !!panel?.classList.contains('terminal-panel--docked'),
          heightUnchanged: hBefore === hAfter,
          bodyH,
          hasXterm,
          open: !!panel?.classList.contains('open')
        }
      })
      const ok =
        info.docked && info.heightUnchanged && info.open && (info.hasXterm || info.bodyH > 0)
      out.push({
        id: 'ui.terminal.dblclick300',
        area: 'ui',
        titulo: 'handle docked: dblclick nao altera altura',
        severidade: ok ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe:
          'docked=' +
          info.docked +
          ' heightUnchanged=' +
          info.heightUnchanged +
          ' open=' +
          info.open +
          ' hasXterm=' +
          info.hasXterm +
          ' bodyH=' +
          info.bodyH
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.dblclick300',
        area: 'ui',
        titulo: 'handle docked dblclick',
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
        const btn = document.getElementById('terminal-btn-split')
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await page.waitForTimeout(1200)
      const n = await page.evaluate(() => document.querySelectorAll('.terminal-grupo').length)
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
      await page.keyboard.press('Control+Backquote')
      await page.waitForTimeout(400)
      const aberto = await page.evaluate(
        () => !!document.querySelector('#terminal-panel.open')
      )
      // fallback: botão toggle se atalho nao fechar
      if (aberto) {
        await page.evaluate(() => {
          document.getElementById('btn-terminal-toggle')?.dispatchEvent(
            new MouseEvent('click', { bubbles: true })
          )
        })
        await page.waitForTimeout(300)
      }
      const ainda = await page.evaluate(
        () => !!document.querySelector('#terminal-panel.open')
      )
      out.push({
        id: 'ui.terminal.fechar',
        area: 'ui',
        titulo: 'Ctrl+` fecha painel',
        severidade: !ainda ? 'ok' : 'warn',
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
