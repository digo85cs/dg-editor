import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'
import { fecharSobreposicoes } from './limpeza'

export async function cenariosUiAgent(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      await page.locator('.right-tab[data-pane="agent"]').click()
      await page.waitForSelector('#pane-agent.active', { timeout: 5000 })
      await page.waitForSelector('#agent-input', { timeout: 5000 })
      const plan = page.locator('#agent-plan-mode')
      const send = page.locator('#agent-send')
      const stop = page.locator('#btn-agent-stop')
      const undo = page.locator('#btn-agent-undo')
      const execPlano = page.locator('#btn-agent-exec-plano')
      const execPasso = page.locator('#btn-agent-exec-passo')
      const verificar = page.locator('#btn-agent-verificar')
      const autoVerify = page.locator('#agent-verify-loop')
      const visivel =
        (await plan.count()) === 1 &&
        (await send.count()) === 1 &&
        (await stop.count()) === 1 &&
        (await undo.count()) === 1 &&
        (await execPlano.count()) === 1 &&
        (await execPasso.count()) === 1 &&
        (await verificar.count()) === 1 &&
        (await autoVerify.count()) === 1
      out.push({
        id: 'ui.agent.painel',
        area: 'ui',
        titulo: 'aba Agent Plan/Parar/Undo/Plano/Passo/Verificar',
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
      const ligou = await page.evaluate(() => {
        const el = document.getElementById('agent-plan-mode') as HTMLInputElement | null
        if (!el) return false
        el.checked = true
        el.dispatchEvent(new Event('change', { bubbles: true }))
        const modo = document.getElementById('chat-mode-select') as HTMLSelectElement | null
        return el.checked && modo?.value === 'plan'
      })
      const checked = await page.locator('#agent-plan-mode').isChecked()
      await page.locator('#agent-input').fill('@projeto listar estrutura')
      const val = await page.locator('#agent-input').inputValue()
      out.push({
        id: 'ui.agent.plan-mencao',
        area: 'ui',
        titulo: 'Plan mode + @projeto no input',
        severidade: ligou && checked && /@projeto/.test(val) ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'modoSincronizado=' + ligou
      })
      await page.locator('#agent-input').fill('')
      await page.evaluate(() => {
        const el = document.getElementById('agent-plan-mode') as HTMLInputElement | null
        if (!el) return
        el.checked = false
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })
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
      await fecharSobreposicoes(page)
      const botao = await page.locator('#btn-agent-undo').count()
      const lista = await page.evaluate(async () => {
        const r = await (window as any).api.invoke('agente:checkpoint-listar', 5)
        return { ok: r?.ok !== false, n: Array.isArray(r?.checkpoints) ? r.checkpoints.length : -1 }
      })
      out.push({
        id: 'ui.agent.undo',
        area: 'ui',
        titulo: 'Desfazer apply presente e checkpoints listaveis',
        severidade: botao === 1 && lista.ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'checkpoints=' + lista.n
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
      const plano = await page.evaluate(async () => {
        const r = await (window as any).api.invoke('agente:plano-ler')
        return { ok: r?.ok !== false, passos: Array.isArray(r?.plano?.passos) ? r.plano.passos.length : -1 }
      })
      const botao = await page.locator('#btn-agent-exec-plano').count()
      out.push({
        id: 'ui.agent.exec-plano',
        area: 'ui',
        titulo: 'Executar plano disponivel e plano legivel',
        severidade: botao === 1 && plano.ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'passos=' + plano.passos
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

  {
    const t0 = Date.now()
    try {
      await fecharSobreposicoes(page)
      await page.locator('#btn-contas').click({ timeout: 5000 })
      await page.waitForSelector('#contas-adapta', { timeout: 5000 })
      const copiar = page.locator('#btn-adapta-copiar')
      const mcp = page.locator('#btn-adapta-mcp')
      const maestro = page.locator('#btn-adapta-maestro')
      const ok =
        (await copiar.count()) === 1 && (await mcp.count()) === 1 && (await maestro.count()) === 1
      out.push({
        id: 'ui.adapta.painel',
        area: 'ui',
        titulo: 'Contas: painel Adapta ONE/Maestro',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0
      })
      await fecharSobreposicoes(page)
    } catch (e) {
      await fecharSobreposicoes(page)
      out.push({
        id: 'ui.adapta.painel',
        area: 'ui',
        titulo: 'painel Adapta',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
