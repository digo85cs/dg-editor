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
      await page.locator('.right-tab[data-pane="files"]').click()
      await page.waitForSelector('#files-list .tree-root-header', { timeout: 8000 }).catch(() => {})
      const roots = page.locator('#files-list .tree-root-header')
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
    try {
      await page.locator('.right-tab[data-pane="files"]').click()
      await page.waitForSelector('#files-list .tree-root-header', { timeout: 8000 })
      if ((await page.locator('#files-list .tree-item[data-tipo]').count()) === 0) {
        await page.locator('#files-list .tree-root-header .chevron').first().click()
        await page.waitForTimeout(300)
      }
      await page.waitForSelector('#files-list .tree-item[data-tipo]', { timeout: 8000 })
      const itens = await page.locator('#files-list .tree-item[data-tipo]').count()
      let arquivo = page.locator('#files-list .tree-item[data-tipo="file"]').first()
      if ((await arquivo.count()) === 0) {
        const dir = page.locator('#files-list .tree-item[data-tipo="dir"] .chevron').first()
        if ((await dir.count()) > 0) {
          await dir.click()
          await page.waitForTimeout(700)
        }
        arquivo = page.locator('#files-list .tree-item[data-tipo="file"]').first()
      }
      let abriu = false
      if ((await arquivo.count()) > 0) {
        await arquivo.click({ timeout: 3000 })
        await page.waitForSelector('#center-pane-editor.active', { timeout: 6000 })
        await page.waitForSelector('#editor-tabs .editor-tab', { timeout: 6000 })
        abriu = (await page.locator('#editor-tabs .editor-tab').count()) > 0
      }
      out.push({
        id: 'ui.arvore.listar',
        area: 'ui',
        titulo: 'painel Arquivos lista e abre arquivo no editor',
        severidade: itens > 0 && abriu ? 'ok' : itens > 0 ? 'warn' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'itens=' + itens + ' abriu=' + abriu
      })
      await page.locator('.center-tab[data-center="chat"]').click()
    } catch (e) {
      out.push({
        id: 'ui.arvore.listar',
        area: 'ui',
        titulo: 'painel Arquivos lista e abre arquivo',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const alvos: [string, string][] = [
        ['automacoes', 'Automações'],
        ['artefatos', 'Artefatos'],
        ['skills', 'Skills'],
        ['conectores', 'Conectores'],
        ['memoria', 'Memória']
      ]
      const falhas: string[] = []
      for (const [id, titulo] of alvos) {
        await page.locator('.tool-nav-btn[data-tool="' + id + '"]').click({ timeout: 4000 })
        await page.waitForSelector('#tool-panel:not([hidden])', { timeout: 4000 })
        await page
          .waitForFunction(
            () => {
              const c = document.getElementById('tool-corpo')
              return !!c && !/Carregando/.test(c.textContent || '')
            },
            null,
            { timeout: 6000 }
          )
          .catch(() => {})
        const t = ((await page.locator('#tool-titulo').textContent()) || '').trim()
        const corpo = ((await page.locator('#tool-corpo').textContent()) || '').trim()
        if (t !== titulo || !corpo) falhas.push(id + '=' + t + '/' + corpo.length)
        await page.locator('.tool-nav-btn[data-tool="' + id + '"]').click({ timeout: 3000 })
        await page.waitForTimeout(100)
      }
      out.push({
        id: 'ui.ferramentas.paineis',
        area: 'ui',
        titulo: 'cinco paineis de ferramentas abrem com conteudo',
        severidade: falhas.length ? 'erro' : 'ok',
        duracaoMs: Date.now() - t0,
        detalhe: falhas.join(' | ') || '5/5 paineis'
      })
    } catch (e) {
      out.push({
        id: 'ui.ferramentas.paineis',
        area: 'ui',
        titulo: 'painéis de ferramentas',
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
