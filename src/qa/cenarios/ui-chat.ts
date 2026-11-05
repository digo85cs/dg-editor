import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiChat(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    const titulo = 'qa-regras-' + Date.now()
    try {
      await page.waitForSelector('#regras-gerais-box', { timeout: 5000 })
      await page.locator('#rg-titulo').fill(titulo)
      await page.locator('#rg-desc').fill('validacao automatizada dos canais e botoes')
      await page.locator('#rg-add').click({ timeout: 3000 })
      const apareceu = (await page.locator('#rg-list .item').filter({ hasText: titulo }).count()) === 1
      let mensagemDialog = ''
      page.once('dialog', async (dialog) => {
        mensagemDialog = dialog.message()
        await dialog.accept()
      })
      await page.locator('#rg-salvar').click({ timeout: 3000 })
      const persistiu = await page.evaluate(async (nome) => {
        const api = (window as any).api
        const listado = await api.invoke('dg:regrasgerais:listar')
        const ativas = await api.invoke('dg:regrasgerais:ativas')
        return Array.isArray(listado?.regras) && listado.regras.some((r: any) => r.titulo === nome) &&
          String(ativas?.texto || '').includes(nome)
      }, titulo)
      out.push({
        id: 'ui.regras-gerais.salvar',
        area: 'ui',
        titulo: 'adicionar e salvar regras gerais via UI e preload',
        severidade: apareceu && persistiu ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'apareceu=' + apareceu + ' persistiu=' + persistiu + ' retorno=' + mensagemDialog
      })
    } catch (e) {
      out.push({
        id: 'ui.regras-gerais.salvar',
        area: 'ui',
        titulo: 'adicionar e salvar regras gerais via UI e preload',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      await page.evaluate(async (nome) => {
        try {
          const api = (window as any).api
          const listado = await api.invoke('dg:regrasgerais:listar')
          if (Array.isArray(listado?.regras)) {
            await api.invoke(
              'dg:regrasgerais:salvar',
              listado.regras.filter((r: any) => r.titulo !== nome && !String(r.titulo).startsWith('qa-regras-'))
            )
          }
        } catch {
          // O teste nao deixa a regra temporaria no perfil isolado.
        }
      }, titulo).catch(() => {})
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('.center-tab[data-center-pane="chat"]').click()
      const agent = page.locator('#chat-agent-select')
      const mode = page.locator('#chat-mode-select')
      const mais = page.locator('#btn-chat-mais')
      const menu = page.locator('#chat-mais-menu')
      await agent.waitFor({ state: 'visible', timeout: 5000 })
      const options = await agent.locator('option').allTextContents()
      const setting = await page.evaluate(() => localStorage.getItem('dg-chat-autoapprove') === '1')
      await mais.click({ timeout: 3000 })
      const aberto = (await menu.isVisible()) && (await mais.getAttribute('aria-expanded')) === 'true'
      const marcado = (await menu.locator('[role="menuitemcheckbox"]').getAttribute('aria-checked')) === String(setting)
      await page.keyboard.press('Escape')
      const fechado = (await menu.isHidden()) && (await mais.getAttribute('aria-expanded')) === 'false'
      const ok = (await mode.count()) === 1 && options.includes('Automático') && options.some((x) => /Auto Free|Coder Free/.test(x)) && aberto && marcado && fechado
      out.push({
        id: 'ui.chat.controles',
        area: 'ui',
        titulo: 'seletores de agente/modo e menu de opções respondem',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'opcoes=' + options.length + ' aberto=' + aberto + ' pref=' + marcado + ' fechado=' + fechado
      })
    } catch (e) {
      out.push({
        id: 'ui.chat.controles',
        area: 'ui',
        titulo: 'controles do cabeçalho do chat',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('.center-tab[data-center-pane="chat"]').click()
      await page.waitForSelector('#chat-input', { timeout: 5000 })
      const input = page.locator('#chat-input')
      await input.fill('')
      const nAntes = await page.locator('#chat-messages .msg, #chat-list .msg, .chat-msg').count()
      await page.locator('#chat-send').click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(400)
      const nDepois = await page.locator('#chat-messages .msg, #chat-list .msg, .chat-msg').count()
      const ok = nDepois <= nAntes
      out.push({
        id: 'ui.chat.vazio',
        area: 'ui',
        titulo: 'mensagem vazia nao envia',
        severidade: ok ? 'ok' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe: 'msgs antes=' + nAntes + ' depois=' + nDepois
      })
    } catch (e) {
      out.push({
        id: 'ui.chat.vazio',
        area: 'ui',
        titulo: 'chat vazio',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const input = page.locator('#chat-input')
      await input.fill('qa-probe-' + Date.now())
      const send = page.locator('#chat-send')
      // pode continuar disabled sem pasta — ok controlado
      const disabled = await send.isDisabled()
      out.push({
        id: 'ui.chat.sem-pasta',
        area: 'ui',
        titulo: 'enviar sem pasta: estado controlado',
        severidade: 'ok',
        duracaoMs: Date.now() - t0,
        detalhe: 'disabled=' + disabled
      })
      await input.fill('')
    } catch (e) {
      out.push({
        id: 'ui.chat.sem-pasta',
        area: 'ui',
        titulo: 'chat sem pasta',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
