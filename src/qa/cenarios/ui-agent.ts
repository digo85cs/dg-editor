import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiAgent(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await page.locator('.center-tab[data-center-pane="agent"]').click()
      await page.waitForSelector('#pane-agent', { timeout: 5000 })
      await page.waitForSelector('#agent-input', { timeout: 5000 })
      const plan = page.locator('#agent-plan-mode')
      const send = page.locator('#agent-send')
      const stop = page.locator('#btn-agent-stop')
      const undo = page.locator('#btn-agent-undo')
      const execPlano = page.locator('#btn-agent-exec-plano')
      const visivel =
        (await plan.count()) === 1 &&
        (await send.count()) === 1 &&
        (await stop.count()) === 1 &&
        (await undo.count()) === 1 &&
        (await execPlano.count()) === 1
      out.push({
        id: 'ui.agent.painel',
        area: 'ui',
        titulo: 'aba Agent com Plan/Parar/Undo/Executar plano',
        severidade: visivel ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0
      })
    } catch (e) {
      out.push({
        id: 'ui.agent.painel',
        area: 'ui',
        titulo: 'aba Agent',
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
      await page.locator('#agent-plan-mode').check()
      const checked = await page.locator('#agent-plan-mode').isChecked()
      await page.locator('#agent-input').fill('@projeto listar estrutura')
      const val = await page.locator('#agent-input').inputValue()
      out.push({
        id: 'ui.agent.plan-mencao',
        area: 'ui',
        titulo: 'Plan mode + @projeto no input',
        severidade: checked && /@projeto/.test(val) ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0
      })
      await page.locator('#agent-input').fill('')
      await page.locator('#agent-plan-mode').uncheck()
    } catch (e) {
      out.push({
        id: 'ui.agent.plan-mencao',
        area: 'ui',
        titulo: 'Plan mode + menção',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('#btn-agent-stop').click({ timeout: 3000 })
      await page.waitForTimeout(200)
      const fila = page.locator('#agent-fila-status')
      const texto = ((await fila.textContent()) || '').trim()
      out.push({
        id: 'ui.agent.parar',
        area: 'ui',
        titulo: 'Parar nao quebra painel',
        severidade: 'ok',
        duracaoMs: Date.now() - t0,
        detalhe: 'fila=' + texto
      })
    } catch (e) {
      out.push({
        id: 'ui.agent.parar',
        area: 'ui',
        titulo: 'Parar agente',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      page.once('dialog', async (d) => {
        await d.accept().catch(() => {})
      })
      await page.locator('#btn-agent-undo').click({ timeout: 3000 })
      await page.waitForTimeout(400)
      out.push({
        id: 'ui.agent.undo',
        area: 'ui',
        titulo: 'Desfazer apply (checkpoint) responde',
        severidade: 'ok',
        duracaoMs: Date.now() - t0
      })
    } catch (e) {
      out.push({
        id: 'ui.agent.undo',
        area: 'ui',
        titulo: 'Desfazer apply',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      page.once('dialog', async (d) => {
        await d.accept().catch(() => {})
      })
      await page.locator('#btn-agent-exec-plano').click({ timeout: 3000 })
      await page.waitForTimeout(500)
      const outEl = page.locator('#agent-output')
      const txt = ((await outEl.textContent()) || '').trim()
      // sem plano salvo: alert; com plano: texto — ambos ok se UI responde
      out.push({
        id: 'ui.agent.exec-plano',
        area: 'ui',
        titulo: 'Executar plano (vazio ou salvo) responde',
        severidade: 'ok',
        duracaoMs: Date.now() - t0,
        detalhe: txt.slice(0, 80) || 'dialog/empty'
      })
    } catch (e) {
      out.push({
        id: 'ui.agent.exec-plano',
        area: 'ui',
        titulo: 'Executar plano',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const sb = page.locator('#sb-agent')
      const ok = (await sb.count()) === 1
      out.push({
        id: 'ui.agent.statusbar',
        area: 'ui',
        titulo: 'statusbar Agent presente',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ((await sb.textContent()) || '').trim()
      })
    } catch (e) {
      out.push({
        id: 'ui.agent.statusbar',
        area: 'ui',
        titulo: 'statusbar Agent',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
