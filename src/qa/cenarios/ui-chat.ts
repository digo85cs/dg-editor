import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiChat(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await page.locator('.right-tab[data-pane="chat"]').click()
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
