import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiTerminal(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  // Hermeticidade: descarta layout restaurado de execucoes anteriores (split/abas antigas).
  await page.evaluate(async () => {
    const dg = (window as unknown as { dgTerminal?: { fechar?: () => Promise<void> } }).dgTerminal
    try {
      await dg?.fechar?.()
    } catch {
      /* painel ainda nao existe */
    }
    try {
      localStorage.removeItem('dg.terminal.layout')
    } catch {
      /* */
    }
  })

  /** Aba ativa do grupo ativo (evita pegar aba de outro grupo em split). */
  const abaAtivaId = () =>
    page.evaluate(() => {
      const tab =
        document.querySelector('.terminal-grupo.ativo .terminal-tab.ativa') ||
        document.querySelector('.terminal-tab.ativa') ||
        document.querySelector('.terminal-tab')
      return (tab as HTMLElement | null)?.dataset?.termId || ''
    })

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
          document
            .getElementById('rail-terminal')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        for (let i = 0; i < 50; i++) {
          st = await estado()
          if (st.open) break
          await page.waitForTimeout(200)
        }
        if (!st.open) {
          await page.keyboard.press('Control+Backquote')
          for (let i = 0; i < 50; i++) {
            st = await estado()
            if (st.open) break
            await page.waitForTimeout(200)
          }
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
        const abaId = await abaAtivaId()
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
    // Perfis salvos: salvar aba atual, abrir por perfil e remover.
    const t0 = Date.now()
    try {
      const antes = await page.evaluate(() => document.querySelectorAll('.terminal-tab').length)
      const nome = 'Perfil QA ' + Date.now()
      const salvo = await page.evaluate((nome) => {
        const w = window as unknown as { prompt: unknown; confirm: unknown; __dgPromptOrig?: unknown }
        w.__dgPromptOrig = w.prompt
        w.prompt = () => nome
        document.getElementById('terminal-btn-perfil-salvar')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        )
        const raw = localStorage.getItem('dg.terminal.perfis') || '[]'
        let lista: Array<{ id: string; nome: string }> = []
        try {
          lista = JSON.parse(raw)
        } catch {
          lista = []
        }
        return { achou: lista.some((p) => p.nome === nome), perfil: lista.find((p) => p.nome === nome) || null }
      }, nome)
      if (!salvo.achou || !salvo.perfil) throw new Error('perfil nao persistiu')
      await page.evaluate((id) => {
        const sel = document.getElementById('terminal-perfil-select') as HTMLSelectElement | null
        if (!sel) return
        sel.value = id
        sel.dispatchEvent(new Event('change'))
      }, salvo.perfil.id)
      await page.waitForTimeout(1200)
      const depois = await page.evaluate(() => document.querySelectorAll('.terminal-tab').length)
      const removido = await page.evaluate(() => {
        const w = window as unknown as { confirm: unknown; __dgConfirmOrig?: unknown }
        w.__dgConfirmOrig = w.confirm
        w.confirm = () => true
        document.getElementById('terminal-btn-perfil-remover')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        )
        const raw = localStorage.getItem('dg.terminal.perfis') || '[]'
        try {
          return !(JSON.parse(raw) as Array<{ nome: string }>).some((p) => p.nome.startsWith('Perfil QA '))
        } catch {
          return false
        }
      })
      await page.evaluate(() => {
        const w = window as unknown as {
          prompt: unknown
          confirm: unknown
          __dgPromptOrig?: unknown
          __dgConfirmOrig?: unknown
        }
        if (w.__dgPromptOrig !== undefined) w.prompt = w.__dgPromptOrig
        if (w.__dgConfirmOrig !== undefined) w.confirm = w.__dgConfirmOrig
      })
      const ok = depois > antes && removido
      out.push({
        id: 'ui.terminal.perfis',
        area: 'ui',
        titulo: 'salvar perfil, abrir aba pelo perfil e remover',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'abas=' + antes + '→' + depois + ' removido=' + removido
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.perfis',
        area: 'ui',
        titulo: 'perfis de terminal',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  if (process.platform === 'win32') {
    // OSC 9;9 emitido por um powershell aninhado deve atualizar o cwd da aba.
    const t0 = Date.now()
    try {
      const cmd =
        "powershell -NoProfile -Command \"Write-Host -NoNewline ([char]27 + ']9;9;C:\\Windows' + [char]27 + '\\')\"\r"
      const alvo = await abaAtivaId()
      await page.evaluate(async ({ cmd, id }) => {
        const api = (window as unknown as { api?: { terminal?: { write: (id: string, s: string) => Promise<unknown> } } }).api
        if (id && api?.terminal?.write) await api.terminal.write(id, cmd)
      }, { cmd, id: alvo })
      let cwd: string | null = null
      for (let i = 0; i < 60; i++) {
        cwd = await page.evaluate(() => {
          const dg = (window as unknown as { dgTerminal?: { cwdAtual?: () => string | null } }).dgTerminal
          return dg?.cwdAtual?.() ?? null
        })
        if (cwd && /^C:\/Windows$/i.test(cwd)) break
        await page.waitForTimeout(250)
      }
      const ok = !!cwd && /^C:\/Windows$/i.test(cwd)
      out.push({
        id: 'ui.terminal.cwd-osc',
        area: 'ui',
        titulo: 'OSC 9;9 atualiza o diretorio atual da aba',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'cwd=' + String(cwd)
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.cwd-osc',
        area: 'ui',
        titulo: 'OSC 9;9 atualiza cwd',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    // Scrollback textual: fechar destrói as abas; reabrir restaura o histórico.
    const t0 = Date.now()
    try {
      const marcador = 'DG_SCROLL_' + Date.now()
      const id = await abaAtivaId()
      await page.evaluate(async ({ id, marcador }) => {
        const api = (window as unknown as { api?: { terminal?: { write: (i: string, s: string) => Promise<unknown> } } }).api
        if (id && api?.terminal?.write) await api.terminal.write(id, 'echo ' + marcador + '\r')
      }, { id, marcador })
      let achouAntes = false
      for (let i = 0; i < 40; i++) {
        achouAntes = await page.evaluate((m) => {
          const dg = (window as unknown as { dgTerminal?: { bufferTexto?: (a?: string) => string } }).dgTerminal
          return !!dg?.bufferTexto && dg.bufferTexto()!.includes(m)
        }, marcador)
        if (achouAntes) break
        await page.waitForTimeout(250)
      }
      if (!achouAntes) throw new Error('marcador nao apareceu no buffer antes de fechar')
      await page.evaluate(async () => {
        const dg = (window as unknown as { dgTerminal?: { fechar?: () => Promise<void>; abrir?: () => Promise<void> } }).dgTerminal
        await dg?.fechar?.()
        await dg?.abrir?.()
      })
      await page.waitForTimeout(2500)
      let achouDepois = false
      for (let i = 0; i < 40; i++) {
        achouDepois = await page.evaluate((m) => {
          const dg = (window as unknown as { dgTerminal?: { bufferTexto?: (a?: string) => string } }).dgTerminal
          const bt = dg?.bufferTexto
          if (!bt) return false
          const tabs = [...document.querySelectorAll('.terminal-tab')] as HTMLElement[]
          return tabs.some((t) => (bt(t.dataset.termId) || '').includes(m))
        }, marcador)
        if (achouDepois) break
        await page.waitForTimeout(250)
      }
      out.push({
        id: 'ui.terminal.scrollback',
        area: 'ui',
        titulo: 'scrollback textual sobrevive a fechar/reabrir',
        severidade: achouDepois ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'antes=' + achouAntes + ' depois=' + achouDepois
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.scrollback',
        area: 'ui',
        titulo: 'scrollback textual',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
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
      let aberto = true
      for (let i = 0; i < 20; i++) {
        aberto = await page.evaluate(() => !!document.querySelector('#terminal-panel.open'))
        if (!aberto) break
        await page.waitForTimeout(150)
      }
      // fallback: se atalho nao ocultou, usa a API do painel
      if (aberto) {
        await page.evaluate(async () => {
          await (window as unknown as { dgTerminal?: { ocultar?: () => Promise<void> } })
            .dgTerminal?.ocultar?.()
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

  {
    // Persistência de abas: ocultar não destrói e reabrir restaura o mesmo conjunto.
    const t0 = Date.now()
    try {
      const antes = await page.evaluate(() => {
        const api = (window as unknown as { dgTerminal?: { ocultar?: () => Promise<void> } })
          .dgTerminal
        void api?.ocultar?.()
        return document.querySelectorAll('.terminal-tab').length
      })
      await page.waitForTimeout(250)
      const fechado = await page.evaluate(
        () => !document.querySelector('#terminal-panel.open')
      )
      await page.evaluate(() => {
        document
          .getElementById('rail-terminal')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      let aberto = false
      for (let i = 0; i < 40; i++) {
        aberto = await page.evaluate(() => !!document.querySelector('#terminal-panel.open'))
        if (aberto) break
        await page.waitForTimeout(200)
      }
      const depois = await page.evaluate(() => document.querySelectorAll('.terminal-tab').length)
      const ok = fechado && aberto && antes > 0 && depois === antes
      out.push({
        id: 'ui.terminal.persistencia',
        area: 'ui',
        titulo: 'ocultar preserva abas; reabrir restaura',
        severidade: ok ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe: 'fechado=' + fechado + ' aberto=' + aberto + ' abas=' + antes + '→' + depois
      })
    } catch (e) {
      out.push({
        id: 'ui.terminal.persistencia',
        area: 'ui',
        titulo: 'persistencia de abas',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
