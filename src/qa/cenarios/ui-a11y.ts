import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

async function focoDentro(page: Page, seletor: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const raiz = document.querySelector(sel)
    return !!raiz && !!document.activeElement && raiz.contains(document.activeElement)
  }, seletor)
}

export async function cenariosUiA11y(page: Page, raiz: string): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    try {
      const roles = await page.evaluate(() => {
        const ler = (id: string) => {
          const el = document.getElementById(id)
          return el ? { role: el.getAttribute('role'), modal: el.getAttribute('aria-modal') } : null
        }
        return {
          palette: ler('palette'),
          busca: ler('busca-global'),
          dirty: ler('modal-dirty'),
          atalhos: ler('modal-atalhos')
        }
      })
      const alvos = [roles.palette, roles.busca, roles.dirty, roles.atalhos]
      const ok = alvos.every((r) => r && r.role === 'dialog' && r.modal === 'true')
      out.push({
        id: 'ui.a11y.roles',
        area: 'ui',
        titulo: 'modais expõem role=dialog e aria-modal',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'palette=' + JSON.stringify(roles.palette) + ' busca=' + JSON.stringify(roles.busca) +
          ' dirty=' + JSON.stringify(roles.dirty) + ' atalhos=' + JSON.stringify(roles.atalhos)
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.roles',
        area: 'ui',
        titulo: 'modais expõem role=dialog e aria-modal',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.keyboard.press('Escape')
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
      await page.keyboard.press('Shift+Slash')
      await page.waitForSelector('#modal-atalhos:not(.hidden)', { timeout: 3000 })
      await page.waitForTimeout(120)
      const kbs = await page.locator('#modal-atalhos kbd').count()
      const focouFechar = await page.evaluate(() => document.activeElement?.id === 'btn-atalhos-fechar')
      await page.keyboard.press('Tab')
      const dentro = await focoDentro(page, '#modal-atalhos')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(80)
      const fechou = await page.evaluate(
        () => document.getElementById('modal-atalhos')?.classList.contains('hidden') === true
      )
      const ok = kbs >= 15 && focouFechar && dentro && fechou
      out.push({
        id: 'ui.a11y.atalhos-modal',
        area: 'ui',
        titulo: 'janela de atalhos abre com ? e fecha com Esc',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'kbd=' + kbs + ' focoFechar=' + focouFechar + ' trapTab=' + dentro + ' fechou=' + fechou
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.atalhos-modal',
        area: 'ui',
        titulo: 'janela de atalhos abre com ? e fecha com Esc',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('#btn-config').click()
      await page.waitForSelector('#modal-config:not(.hidden)', { timeout: 3000 })
      await page.waitForTimeout(120)
      const entrou = await focoDentro(page, '#modal-config')
      let escapou = false
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab')
        if (!(await focoDentro(page, '#modal-config'))) {
          escapou = true
          break
        }
      }
      await page.keyboard.press('Shift+Tab')
      const voltou = await focoDentro(page, '#modal-config')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)
      const fechou = await page.evaluate(
        () => document.getElementById('modal-config')?.classList.contains('hidden') === true
      )
      const ok = entrou && !escapou && voltou && fechou
      out.push({
        id: 'ui.a11y.focus-trap',
        area: 'ui',
        titulo: 'Tab/Shift+Tab ficam presos ao modal de configurações',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'entrou=' + entrou + ' escapou=' + escapou + ' shiftTab=' + voltou + ' fechou=' + fechou
      })
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {})
      out.push({
        id: 'ui.a11y.focus-trap',
        area: 'ui',
        titulo: 'Tab/Shift+Tab ficam presos ao modal de configurações',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('#btn-config').click()
      await page.waitForSelector('#modal-config:not(.hidden)', { timeout: 3000 })
      const temControles = await page.evaluate(() => {
        return ['a11y-movimento', 'a11y-alto-contraste', 'a11y-escala'].every(
          (id) => !!document.getElementById(id)
        )
      })
      await page.selectOption('#a11y-movimento', 'reduzir')
      await page.locator('#a11y-alto-contraste').check()
      await page.selectOption('#a11y-escala', '1.1')
      await page.waitForTimeout(250)
      const estado = await page.evaluate(async () => {
        const prefs = JSON.parse(localStorage.getItem('dg-a11y-prefs') || '{}')
        const zoom = await (window as any).api.invoke('janela:zoom-estado').catch(() => null)
        const cm = document.querySelector('.cm-editor')
        const btn = document.querySelector('.btn-primary')
        const trans = btn ? getComputedStyle(btn).transitionDuration : ''
        return {
          classes: document.body.className,
          prefs,
          zoom: zoom?.fator ?? zoom,
          cmBg: cm ? getComputedStyle(cm).backgroundColor : '',
          trans
        }
      })
      // Restaura padrão para não afetar telas seguintes/baseline
      await page.selectOption('#a11y-movimento', 'sistema')
      await page.locator('#a11y-alto-contraste').uncheck()
      await page.selectOption('#a11y-escala', '1')
      await page.waitForTimeout(250)
      const restaurado = await page.evaluate(() => ({
        classes: document.body.className,
        zoom: null as number | null
      }))
      await page.keyboard.press('Escape')
      const ok =
        temControles &&
        /dg-reduzir-movimento/.test(estado.classes) &&
        /dg-alto-contraste/.test(estado.classes) &&
        estado.prefs.movimento === 'reduzir' &&
        estado.prefs.altoContraste === true &&
        estado.prefs.escalaInterface === 1.1 &&
        Number(estado.zoom) === 1.1 &&
        (!estado.cmBg || /^(rgb\(18, 18, 18\)|rgb\(247, 247, 247\)|rgb\(0, 0, 0\)|rgb\(255, 255, 255\))$/.test(estado.cmBg)) &&
        !/dg-reduzir-movimento|dg-alto-contraste/.test(restaurado.classes)
      out.push({
        id: 'ui.a11y.preferencias',
        area: 'ui',
        titulo: 'configurações de acessibilidade aplicam e persistem',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'controles=' + temControles + ' prefs=' + JSON.stringify(estado.prefs) +
          ' zoom=' + estado.zoom + ' cmBg=' + estado.cmBg +
          ' classes=' + JSON.stringify(estado.classes) +
          ' restaurado=' + JSON.stringify(restaurado.classes)
      })
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {})
      out.push({
        id: 'ui.a11y.preferencias',
        area: 'ui',
        titulo: 'configurações de acessibilidade aplicam e persistem',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const zoomInicial = await page.evaluate(async () => {
        const r = await (window as any).api.invoke('janela:zoom-estado').catch(() => null)
        return Number(r?.fator ?? r?.data ?? r) || 1
      })
      await page.keyboard.press('Control+=')
      await page.waitForTimeout(200)
      const zoomMais = await page.evaluate(async () => {
        const r = await (window as any).api.invoke('janela:zoom-estado').catch(() => null)
        const prefs = JSON.parse(localStorage.getItem('dg-a11y-prefs') || '{}')
        return { fator: Number(r?.fator ?? r?.data ?? r) || 1, prefs }
      })
      await page.keyboard.press('Control+0')
      await page.waitForTimeout(200)
      const zoomReset = await page.evaluate(async () => {
        const r = await (window as any).api.invoke('janela:zoom-estado').catch(() => null)
        const prefs = JSON.parse(localStorage.getItem('dg-a11y-prefs') || '{}')
        return { fator: Number(r?.fator ?? r?.data ?? r) || 1, prefs }
      })
      const ok =
        zoomInicial === 1 &&
        zoomMais.fator === 1.1 &&
        zoomMais.prefs.escalaInterface === 1.1 &&
        zoomReset.fator === 1 &&
        zoomReset.prefs.escalaInterface === 1
      out.push({
        id: 'ui.a11y.zoom-atalhos',
        area: 'ui',
        titulo: 'Ctrl+= e Ctrl+0 ajustam a escala e persistem',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'inicial=' + zoomInicial + ' mais=' + zoomMais.fator + ' reset=' + zoomReset.fator
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.zoom-atalhos',
        area: 'ui',
        titulo: 'Ctrl+= e Ctrl+0 ajustam a escala e sincronizam Configurações',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const ler = () =>
        page.evaluate(async () => {
          const prefs = JSON.parse(localStorage.getItem('dg-a11y-prefs') || '{}')
          const zoom = await (window as any).api.invoke('janela:zoom-estado').catch(() => null)
          const raiz = getComputedStyle(document.documentElement)
          const cs = (sel: string) => {
            const el = document.querySelector(sel)
            if (!el) return { fs: '', ff: '' }
            const s = getComputedStyle(el)
            return { fs: s.fontSize, ff: s.fontFamily }
          }
          return {
            editor: Number(prefs.tamanhoEditor) || 0,
            terminal: Number(prefs.tamanhoTerminal) || 0,
            escala: Number(prefs.escalaInterface) || 1,
            zoom: Number(zoom?.fator ?? zoom) || 1,
            varEditor: raiz.getPropertyValue('--dg-editor-fs').trim(),
            selectEditor: (document.getElementById('a11y-fonte-editor') as HTMLSelectElement | null)?.value || '',
            out: cs('#agent-output'),
            diff: cs('#diff-panel-body')
          }
        })
      await page.keyboard.press('Control+Shift+=')
      await page.waitForTimeout(200)
      const subiu = await ler()
      await page.keyboard.press('Control+Shift+-')
      await page.keyboard.press('Control+Shift+-')
      await page.waitForTimeout(200)
      const desceu = await ler()
      await page.keyboard.press('Control+Alt+=')
      await page.waitForTimeout(200)
      const terminal = await ler()
      await page.keyboard.press('Control+Shift+0')
      await page.waitForTimeout(200)
      const reset = await ler()
      const ok =
        subiu.editor === 14 &&
        subiu.varEditor === '14px' &&
        subiu.selectEditor === '14' &&
        // diff e saída do agente acompanham a fonte do editor
        subiu.out.fs === '14px' &&
        subiu.diff.fs === '14px' &&
        /Consolas|Cascadia/.test(subiu.out.ff) &&
        /Consolas|Cascadia/.test(subiu.diff.ff) &&
        desceu.editor === 12 &&
        terminal.terminal === 14 &&
        terminal.editor === 12 &&
        reset.editor === 13 &&
        reset.terminal === 13 &&
        subiu.zoom === 1 &&
        reset.zoom === 1
      out.push({
        id: 'ui.a11y.fonte-atalhos',
        area: 'ui',
        titulo: 'Ctrl+Shift/Alt e Ctrl+Shift+0 ajustam a fonte por painel',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'subiu=' + JSON.stringify(subiu) + ' desceu=' + JSON.stringify(desceu) +
          ' terminal=' + JSON.stringify(terminal) + ' reset=' + JSON.stringify(reset)      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.fonte-atalhos',
        area: 'ui',
        titulo: 'Ctrl+Shift/Alt e Ctrl+Shift+0 ajustam a fonte por painel',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.locator('.right-tab[data-pane="files"]').click().catch(() => {})
      await page.waitForSelector('#files-list .tree-root-header', { timeout: 5000 })
      await page.evaluate(() => {
        const primeiro = document.querySelector('#files-list .tree-root-header')
        const chevron = primeiro?.querySelector('.chevron')
        if (chevron && !chevron.classList.contains('open')) chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        ;(document.getElementById('files-list') as HTMLElement)?.focus()
      })
      await page.waitForTimeout(500)
      const inicial = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null
        return { dentro: !!a?.closest('#files-list'), classe: a?.className || '', path: a?.dataset?.path || '' }
      })
      await page.keyboard.press('ArrowDown')
      const depoisDown = await page.evaluate(() => ({
        path: (document.activeElement as HTMLElement | null)?.dataset?.path || ''
      }))
      await page.keyboard.press('End')
      const noFim = await page.evaluate(() => ({
        path: (document.activeElement as HTMLElement | null)?.dataset?.path || ''
      }))
      await page.keyboard.press('Home')
      const noInicio = await page.evaluate(() => ({
        path: (document.activeElement as HTMLElement | null)?.dataset?.path || ''
      }))
      const renomeavel = await page.evaluate(() => {
        const linhas = Array.from(document.querySelectorAll<HTMLElement>('#files-list .tree-item[data-path]'))
        const file = linhas.find((l) => l.dataset.tipo === 'file')
        if (!file) return { achou: false }
        file.focus()
        return { achou: true, path: file.dataset.path || '' }
      })
      let abriuInput = false
      let fechouInput = true
      if (renomeavel.achou) {
        await page.keyboard.press('F2')
        await page.waitForTimeout(120)
        abriuInput = await page.evaluate(() => !!document.querySelector('#files-list .tree-rename-input'))
        await page.keyboard.press('Escape')
        await page.waitForTimeout(120)
        fechouInput = await page.evaluate(() => !document.querySelector('#files-list .tree-rename-input'))
      }
      const menuInfo = await page.evaluate(() => {
        const linhas = Array.from(document.querySelectorAll<HTMLElement>('#files-list .tree-item[data-path]'))
        const file = linhas.find((l) => l.dataset.tipo === 'file')
        if (!file) return null
        file.focus()
        return { path: file.dataset.path || '' }
      })
      let menuAbriu = false
      let menuSetas = false
      let menuFechou = false
      if (menuInfo) {
        await page.keyboard.press('Shift+F10')
        await page.waitForTimeout(150)
        const primeiroItem = await page.evaluate(() => {
          const item = document.activeElement as HTMLElement | null
          return document.querySelector('.tree-ctx-menu') && item?.classList.contains('tree-ctx-item')
            ? item.textContent || ''
            : ''
        })
        menuAbriu = !!primeiroItem
        await page.keyboard.press('ArrowDown')
        const segundoItem = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent || '')
        menuSetas = !!primeiroItem && !!segundoItem && primeiroItem !== segundoItem
        await page.keyboard.press('Escape')
        await page.waitForTimeout(120)
        menuFechou = await page.evaluate(() => {
          const semMenu = !document.querySelector('.tree-ctx-menu')
          const noArvore = !!document.activeElement?.closest?.('#files-list')
          return semMenu && noArvore
        })
      }
      const alvoTypeahead = await page.evaluate(() => {
        const linhas = Array.from(document.querySelectorAll<HTMLElement>('#files-list .tree-item[data-path]'))
        const file = linhas.filter((l) => l.dataset.tipo === 'file').pop()
        if (!file) return null
        const nome = (file.dataset.path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''
        linhas[0]?.focus()
        return { nome, prefixo: nome.slice(0, 3) }
      })
      let typeaheadOk = false
      if (alvoTypeahead && alvoTypeahead.prefixo.length >= 2) {
        await page.keyboard.type(alvoTypeahead.prefixo, { delay: 60 })
        await page.waitForTimeout(150)
        typeaheadOk = await page.evaluate((prefixo) => {
          const a = document.activeElement as HTMLElement | null
          const nome = (a?.dataset?.path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''
          return nome.toLowerCase().startsWith(prefixo.toLowerCase())
        }, alvoTypeahead.prefixo)
      }
      const ok =
        inicial.dentro &&
        !!inicial.path &&
        !!depoisDown.path &&
        depoisDown.path !== inicial.path &&
        !!noFim.path &&
        !!noInicio.path &&
        abriuInput &&
        fechouInput &&
        menuAbriu &&
        menuSetas &&
        menuFechou &&
        typeaheadOk
      out.push({
        id: 'ui.a11y.explorer-teclado',
        area: 'ui',
        titulo: 'árvore responde a setas, Home/End, F2, Shift+F10 e type-ahead',
        severidade: ok ? 'ok' : renomeavel.achou ? 'erro' : 'warn',
        duracaoMs: Date.now() - t0,
        detalhe:
          'inicial=' + JSON.stringify(inicial) + ' down=' + depoisDown.path +
          ' fim=' + noFim.path + ' inicio=' + noInicio.path +
          ' f2=' + abriuInput + ' esc=' + fechouInput +
          ' menu=' + menuAbriu + ' setas=' + menuSetas + ' fechou=' + menuFechou +
          ' typeahead=' + typeaheadOk + ' alvo=' + (alvoTypeahead?.nome || '')
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.explorer-teclado',
        area: 'ui',
        titulo: 'árvore responde a setas, Home/End e F2',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const regioes = await page.evaluate(async () => {
        const educado = document.getElementById('dg-live-region')
        const assertivo = document.getElementById('dg-live-alert')
        ;(window as any).dgToast?.('teste de anúncio a11y', 'erro')
        await new Promise((r) => setTimeout(r, 250))
        const status = document.getElementById('chat-live-status')
        const toasts = Array.from(document.querySelectorAll('#dg-toast-host .dg-toast'))
        const toast =
          toasts.find((t) => (t.textContent || '').includes('teste de anúncio a11y')) ||
          toasts[toasts.length - 1]
        return {
          educado: educado?.getAttribute('aria-live') || '',
          assertivo: assertivo?.getAttribute('aria-live') || '',
          chatLive: status?.getAttribute('aria-live'),
          toastRole: toast?.getAttribute('role') || ''
        }
      })
      const ok =
        regioes.educado === 'polite' &&
        regioes.assertivo === 'assertive' &&
        regioes.chatLive === null &&
        regioes.toastRole === 'alert'
      out.push({
        id: 'ui.a11y.live-regions',
        area: 'ui',
        titulo: 'regiões aria-live para chat e toasts de erro',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: JSON.stringify(regioes)
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.live-regions',
        area: 'ui',
        titulo: 'regiões aria-live para chat e toasts de erro',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async (root) => {
        const api = (window as any).api
        const dir = root.replace(/\\/g, '/')
        const regiao = document.getElementById('dg-live-region')
        if (regiao) regiao.textContent = ''
        const brutos: string[] = []
        const off = api.on?.('agente:progresso', (_e: unknown, ev: any) => {
          if (ev?.tipo === 'status') brutos.push(String(ev.texto || ''))
        })
        const raizOk = await api.invoke('workspace:definir-raiz', dir).catch((e: Error) => ({ erro: String(e) }))
        const vistos = new Set<string>()
        const enviar = api
          .invoke('chat:send', dir, 'qa: anuncio de etapas', {
            agente: 'auto',
            modo: 'agent',
            verificarApos: false
          })
          .catch((e: Error) => ({ ok: false, erro: String(e) }))
        for (let i = 0; i < 100; i++) {
          const t = (regiao?.textContent || '').trim()
          if (t) vistos.add(t)
          await new Promise((res) => setTimeout(res, 50))
        }
        const envio: any = await enviar
        try {
          off?.()
        } catch {
          /* sem unsubscribe */
        }
        return {
          raizOk: raizOk?.ok === true,
          okEnvio: envio?.ok === true,
          provider: envio?.message?.provider || envio?.erro || '',
          brutos,
          anuncios: [...vistos]
        }
      }, raiz)
      const etapa = r.anuncios.some((a) => /^Agente: .*(Montando um plano|Verificando)/.test(a))
      const resultado = r.anuncios.some((a) => /Resposta concluída|Não foi possível/.test(a))
      const ok = etapa && resultado
      out.push({
        id: 'ui.a11y.agente-etapas',
        area: 'ui',
        titulo: 'etapas e resultado do turno são anunciados na região aria-live',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'raiz=' + r.raizOk + ' envio=' + r.okEnvio + ' provider=' + r.provider +
          ' etapa=' + etapa + ' resultado=' + resultado +
          ' brutos=' + JSON.stringify(r.brutos) + ' anuncios=' + JSON.stringify(r.anuncios)
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.agente-etapas',
        area: 'ui',
        titulo: 'etapas e resultado do turno são anunciados na região aria-live',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
      const landmarks = await page.evaluate(() => ({
        main: document.getElementById('center-panel')?.getAttribute('role') || '',
        complementar: document.getElementById('exec-panel')?.getAttribute('role') || '',
        skip: document.getElementById('dg-skip-link')?.textContent || ''
      }))
      await page.keyboard.press('Alt+1')
      const naSidebar = await page.evaluate(() => document.activeElement?.id || '')
      await page.keyboard.press('Alt+3')
      const naDireita = await page.evaluate(() => document.activeElement?.id || '')
      const skipVisivel = await page.evaluate(async () => {
        const a = document.getElementById('dg-skip-link') as HTMLElement | null
        if (!a) return false
        a.focus()
        await new Promise((r) => setTimeout(r, 250))
        const r = a.getBoundingClientRect()
        return r.top >= 0 && r.height > 0
      })
      const ok =
        landmarks.main === 'main' &&
        landmarks.complementar === 'complementary' &&
        !!landmarks.skip &&
        naSidebar === 'sidebar' &&
        naDireita === 'exec-panel' &&
        skipVisivel
      out.push({
        id: 'ui.a11y.landmarks',
        area: 'ui',
        titulo: 'landmarks, skip link e Alt+1/3 focam blocos',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: JSON.stringify(landmarks) + ' alt1=' + naSidebar + ' alt3=' + naDireita + ' skip=' + skipVisivel
      })
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    } catch (e) {
      out.push({
        id: 'ui.a11y.landmarks',
        area: 'ui',
        titulo: 'landmarks, skip link e Alt+1/3 focam blocos',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const abriu = await page.evaluate(async () => {
        const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const r = await (window as any).api.invoke('app:raiz-projeto').catch(() => null)
        const base = r?.raiz || r
        if (!base) return { base: '', a: '', b: '', limpas: 0 }
        // Zera abas herdadas das telas anteriores (descarta alterações pendentes).
        let limpas = 0
        for (let i = 0; i < 30; i++) {
          const btn = document.querySelector<HTMLElement>('#editor-tabs .editor-tab')
          if (!btn) break
          btn
            .querySelector<HTMLElement>('.tab-close')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await espera(120)
          const modal = document.getElementById('modal-dirty')
          if (modal && !modal.classList.contains('hidden')) {
            document.getElementById('btn-dirty-discard')?.click()
            await espera(120)
          }
          limpas++
        }
        const a = base + '/package.json'
        const b = base + '/vitest.config.ts'
        await (window as any).abrirArquivoNaAba?.(a)
        await espera(150)
        await (window as any).abrirArquivoNaAba?.(b)
        return { base, a, b, limpas }
      })
      await page.waitForTimeout(500)
      const estado = await page.evaluate(({ a, b }) => {
        const abas = [...document.querySelectorAll<HTMLElement>('#editor-tabs .editor-tab')]
        const paths = abas.map((x) => x.dataset.caminho || '')
        return {
          total: abas.length,
          roles: abas.map((x) => x.getAttribute('role')),
          selecionadas: abas.map((x) => x.getAttribute('aria-selected')),
          abriuA: paths.includes(a),
          abriuB: paths.includes(b)
        }
      }, { a: abriu.a, b: abriu.b })
      const primeiraFocada = await page.evaluate(() => {
        const abas = document.querySelectorAll<HTMLElement>('#editor-tabs .editor-tab')
        abas[0]?.focus()
        const a = document.activeElement as HTMLElement | null
        return { dentro: !!a?.closest('#editor-tabs'), titulo: a?.getAttribute('title') || '' }
      })
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(350)
      const segunda = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null
        const ativa = document.querySelector('#editor-tabs .editor-tab.active')
        return {
          dentro: !!a?.closest('#editor-tabs'),
          focoTitulo: a?.getAttribute('title') || '',
          ativaTitulo: ativa?.getAttribute('title') || '',
          focoAtivo: a?.classList.contains('active') === true
        }
      })
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(350)
      const voltouSetas = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null
        const ativa = document.querySelector('#editor-tabs .editor-tab.active')
        return {
          focoTitulo: a?.getAttribute('title') || '',
          ativaTitulo: ativa?.getAttribute('title') || ''
        }
      })
      await page.keyboard.press('End')
      await page.waitForTimeout(350)
      const fim = await page.evaluate(() => ({
        ativaTitulo: document.querySelector('#editor-tabs .editor-tab.active')?.getAttribute('title') || ''
      }))
      await page.keyboard.press('Home')
      await page.waitForTimeout(350)
      const voltou = await page.evaluate(() => {
        const abas = [...document.querySelectorAll<HTMLElement>('#editor-tabs .editor-tab')]
        return {
          foco: document.activeElement?.getAttribute('title') || '',
          primeira: abas[0]?.getAttribute('title') || '',
          ativaEhPrimeira: abas[0]?.classList.contains('active') === true
        }
      })
      const ok =
        estado.abriuA &&
        estado.abriuB &&
        estado.total === 2 &&
        estado.roles.every((r) => r === 'tab') &&
        estado.selecionadas.includes('true') &&
        primeiraFocada.dentro &&
        segunda.dentro &&
        segunda.focoAtivo &&
        segunda.focoTitulo === abriu.b &&
        segunda.ativaTitulo === abriu.b &&
        voltouSetas.ativaTitulo === abriu.a &&
        fim.ativaTitulo === abriu.b &&
        voltou.foco === voltou.primeira &&
        voltou.ativaEhPrimeira
      out.push({
        id: 'ui.a11y.abas-teclado',
        area: 'ui',
        titulo: 'abas do editor navegam com setas/Home e ativam o arquivo',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'limpas=' + abriu.limpas + ' abas=' + estado.total + ' roles=' + JSON.stringify(estado.roles) +
          ' abriuA=' + estado.abriuA + ' abriuB=' + estado.abriuB +
          ' foco1=' + primeiraFocada.titulo + ' foco2=' + segunda.focoTitulo +
          ' ativa2=' + segunda.ativaTitulo + ' volta=' + voltouSetas.ativaTitulo +
          ' fim=' + fim.ativaTitulo + ' home=' + voltou.foco
      })
    } catch (e) {
      out.push({
        id: 'ui.a11y.abas-teclado',
        area: 'ui',
        titulo: 'abas do editor navegam com setas/Home e ativam o arquivo',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
