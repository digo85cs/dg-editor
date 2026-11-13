import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiChat(page: Page, raiz: string): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    const titulo = 'qa-regras-' + Date.now()
    try {
      await page.locator('#btn-config').click({ timeout: 5000 })
      await page.waitForSelector('#modal-config:not(.hidden)', { timeout: 5000 })
      await page.waitForSelector('#regras-gerais-box', { state: 'visible', timeout: 5000 })
      await page.locator('#rg-titulo').fill(titulo)
      await page.locator('#rg-desc').fill('validacao automatizada dos canais e botoes')
      await page.locator('#rg-form button[type="submit"]').click({ timeout: 3000 })
      await page.waitForTimeout(400)
      const apareceu = (await page.locator('#rg-list .regra-card').filter({ hasText: titulo }).count()) === 1
      const persistiu = await page.evaluate(async (nome) => {
        const api = (window as any).api
        const listado = await api.invoke('dg:regrasgerais:listar')
        const ativas = await api.invoke('dg:regrasgerais:ativas')
        return Array.isArray(listado?.regras) && listado.regras.some((r: any) => r.titulo === nome) &&
          String(ativas?.texto || '').includes(nome)
      }, titulo)
      await page.locator('#btn-config-close').click({ timeout: 3000 }).catch(() => {})
      out.push({
        id: 'ui.regras-gerais.salvar',
        area: 'ui',
        titulo: 'adicionar e salvar regras gerais via UI e preload',
        severidade: apareceu && persistiu ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'apareceu=' + apareceu + ' persistiu=' + persistiu
      })
    } catch (e) {
      await page.locator('#btn-config-close').click({ timeout: 1000 }).catch(() => {})
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
      await page.locator('.center-tab[data-center="chat"]').click()
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
      await page.locator('.center-tab[data-center="chat"]').click()
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

  {
    const t0 = Date.now()
    try {
      await page.locator('.center-tab[data-center="chat"]').click()
      await page.waitForSelector('#chat-input', { timeout: 5000 })
      const fluxo = await page.evaluate(async (r) => {
        const api = (window as any).api
        const raiz = r.replace(/\\/g, '/')
        const def = await api.invoke('workspace:definir-raiz', raiz)
        const alvo = raiz + '/qa-artifacts/mock-chat/alvo.txt'
        const envio = await api.invoke('chat:send', raiz, 'qa-mock [qa:proposta]', {
          agente: 'auto',
          modo: 'agent',
          verificarApos: false
        })
        const lista = Array.isArray(envio?.propostas) ? envio.propostas : []
        const proposta = lista[0]
        const antes = alvo ? await api.invoke('arquivo:ler', alvo, [raiz]) : null
        let aplicado: any = null
        let depoisApply: any = null
        let restaurado: any = null
        let depoisRestore: any = null
        if (proposta?.id) {
          aplicado = await api.invoke('agente:aplicar-proposta', proposta.id, [raiz])
          depoisApply = await api.invoke('arquivo:ler', alvo, [raiz])
          if (aplicado?.checkpointId) {
            restaurado = await api.invoke('agente:checkpoint-restaurar', aplicado.checkpointId, [raiz])
            depoisRestore = await api.invoke('arquivo:ler', alvo, [raiz])
          }
        }
        return {
          raizOk: def?.ok === true,
          defRaw: JSON.stringify(def).slice(0, 160),
          ok: envio?.ok === true,
          provider: envio?.message?.provider || '',
          texto: String(envio?.message?.content || ''),
          usageTotal: Number(envio?.usage?.total || envio?.message?.usage?.total || 0),
          usageEstimado: envio?.usage?.estimado === true,
          propostas: lista.length,
          antes: String(antes?.conteudo || ''),
          aplicado: aplicado?.ok === true,
          depoisApply: String(depoisApply?.conteudo || ''),
          restaurado: restaurado?.ok === true,
          depoisRestore: String(depoisRestore?.conteudo || '')
        }
      }, raiz)
      const ok =
        fluxo.raizOk &&
        fluxo.ok &&
        fluxo.provider === 'mock' &&
        /DG_FAKE_LLM/.test(fluxo.texto) &&
        fluxo.usageTotal > 0 &&
        fluxo.usageEstimado &&
        fluxo.propostas === 1 &&
        /linha original/.test(fluxo.antes) &&
        fluxo.aplicado &&
        /linha alterada/.test(fluxo.depoisApply) &&
        fluxo.restaurado &&
        /linha original/.test(fluxo.depoisRestore)
      out.push({
        id: 'ui.chat.mock-apply-undo',
        area: 'ui',
        titulo: 'mock DG_FAKE_LLM: stream, proposta, apply, undo e uso estimado',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'raizOk=' + fluxo.raizOk + ' def=' + fluxo.defRaw + ' ok=' + fluxo.ok + ' provider=' + fluxo.provider +
          ' tokens=' + fluxo.usageTotal + ' propostas=' + fluxo.propostas +
          ' apply=' + fluxo.aplicado + ' restore=' + fluxo.restaurado +
          ' texto=' + JSON.stringify(fluxo.texto.slice(0, 60)) +
          ' antes=' + JSON.stringify(fluxo.antes.slice(0, 40)) +
          ' depois=' + JSON.stringify(fluxo.depoisApply.slice(0, 40)) +
          ' restaurado=' + JSON.stringify(fluxo.depoisRestore.slice(0, 40))
      })
    } catch (e) {
      out.push({
        id: 'ui.chat.mock-apply-undo',
        area: 'ui',
        titulo: 'mock chat/apply/undo',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const cancel = await page.evaluate(async (r) => {
        const api = (window as any).api
        const raiz = r.replace(/\\/g, '/')
        await api.invoke('workspace:definir-raiz', raiz)
        const promessa = api.invoke('chat:send', raiz, 'qa-mock cancelar', {
          agente: 'auto',
          modo: 'agent',
          verificarApos: false
        })
        await new Promise((res) => setTimeout(res, 30))
        const c = await api.invoke('chat:cancelar')
        const r2 = await promessa
        return {
          cancelados: Number(c?.cancelados || 0),
          ok: r2?.ok === true,
          provider: r2?.message?.provider || '',
          texto: String(r2?.message?.content || '')
        }
      }, raiz)
      const ok = cancel.cancelados >= 1 && !cancel.ok &&
        (cancel.provider === 'cancelado' || /interrompida/i.test(cancel.texto))
      out.push({
        id: 'ui.chat.cancelar',
        area: 'ui',
        titulo: 'chat:cancelar aborta o turno em andamento',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'cancelados=' + cancel.cancelados + ' provider=' + cancel.provider
      })
    } catch (e) {
      out.push({
        id: 'ui.chat.cancelar',
        area: 'ui',
        titulo: 'cancelar chat',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
