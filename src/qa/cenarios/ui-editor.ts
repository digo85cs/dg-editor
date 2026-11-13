import { promises as fsp } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiEditor(page: Page, raizProjeto: string): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []
  const criados: string[] = []

  let base = join(raizProjeto, 'qa-artifacts')
  try {
    base = await fsp.mkdir(base, { recursive: true }).then(() => base)
  } catch {
    base = raizProjeto
  }

  try {
    const ws = await page.evaluate(async () => {
      const api = (window as any).api
      const r = await api.invoke('workspace:carregar')
      return r?.workspace || null
    })
    const raiz = String(ws?.pastaAtual || (Array.isArray(ws?.pastas) ? ws.pastas[0] : '') || '')
    if (!raiz) {
      out.push({
        id: 'ui.editor.diagnosticos',
        area: 'ui',
        titulo: 'diagnosticos e formatacao no editor',
        severidade: 'warn',
        duracaoMs: 0,
        detalhe: 'sem workspace definido no perfil de QA'
      })
      return out
    }

    const invalido = join(base, '.qa-diag-invalido-' + Date.now() + '.json')
    const valido = join(base, '.qa-diag-valido-' + Date.now() + '.json')
    criados.push(invalido, valido)

    {
      const t0 = Date.now()
      try {
        const r = await page.evaluate(async ({ invalido, raiz }) => {
          const api = (window as any).api
          const salvo = await api.invoke('arquivo:salvar', invalido, '{\n  "a": 1,\n}\n', [raiz])
          if (!salvo?.ok) return { erro: 'salvar: ' + (salvo?.erro || '?') }
          await (window as any).abrirArquivoNaAba(invalido)
          await new Promise((res) => setTimeout(res, 500))
          const chip = document.getElementById('editor-diag')
          const linhaErro = document.querySelectorAll('.cm-line.cm-diag-erro').length
          const conteudo = document.querySelector('.cm-content')?.textContent || ''
          return {
            chipTexto: chip ? chip.textContent : '',
            chipClasse: chip ? chip.className : 'ausente',
            chipVisivel: !!chip && !chip.classList.contains('hidden'),
            linhaErro,
            conteudo: conteudo.slice(0, 60)
          }
        }, { invalido, raiz })
        const ok =
          !r.erro &&
          r.chipVisivel === true &&
          /erro/i.test(String(r.chipTexto)) &&
          (r.linhaErro || 0) > 0
        out.push({
          id: 'ui.editor.diagnosticos',
          area: 'ui',
          titulo: 'JSON invalido gera diagnostico visivel no editor',
          severidade: ok ? 'ok' : 'erro',
          duracaoMs: Date.now() - t0,
          detalhe: JSON.stringify(r)
        })
      } catch (e) {
        out.push({
          id: 'ui.editor.diagnosticos',
          area: 'ui',
          titulo: 'JSON invalido gera diagnostico visivel no editor',
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: String(e)
        })
      }
    }

    {
      const t0 = Date.now()
      try {
        const r = await page.evaluate(async ({ valido, raiz }) => {
          const api = (window as any).api
          const salvo = await api.invoke('arquivo:salvar', valido, '{"a":1,"b":[2,3]}', [raiz])
          if (!salvo?.ok) return { erro: 'salvar: ' + (salvo?.erro || '?') }
          await (window as any).abrirArquivoNaAba(valido)
          await new Promise((res) => setTimeout(res, 400))
          const el = document.querySelector('.cm-content')
          el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          const chipAntes = document.getElementById('editor-diag')?.textContent || ''
          return { chipAntes }
        }, { valido, raiz })
        if (r.erro) throw new Error(r.erro)
        await page.locator('.cm-content').click({ timeout: 3000 }).catch(() => {})
        await page.keyboard.press('Control+s')
        await page.waitForTimeout(600)
        const conteudo = await fsp.readFile(valido, 'utf8')
        const formatado = conteudo.includes('\n  "a": 1') && conteudo.trim().endsWith('}')
        const chipDepois = await page.locator('#editor-diag').textContent().catch(() => '')
        out.push({
          id: 'ui.editor.formatar-no-salvar',
          area: 'ui',
          titulo: 'Ctrl+S formata JSON e mantem diagnostico limpo',
          severidade: formatado ? 'ok' : 'erro',
          duracaoMs: Date.now() - t0,
          detalhe: 'formatado=' + formatado + ' chipAntes=' + r.chipAntes + ' chipDepois=' + chipDepois
        })
      } catch (e) {
        out.push({
          id: 'ui.editor.formatar-no-salvar',
          area: 'ui',
          titulo: 'Ctrl+S formata JSON e mantem diagnostico limpo',
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: String(e)
        })
      }
    }
    {
      const t0 = Date.now()
      const js = join(base, '.qa-format-' + Date.now() + '.js')
      criados.push(js)
      try {
        const r = await page.evaluate(async ({ js, raiz }) => {
          const api = (window as any).api
          const salvo = await api.invoke('arquivo:salvar', js, 'const x={a:1,b:2}\nfunction f( a,b ){return a+b}\n', [raiz])
          if (!salvo?.ok) return { erro: 'salvar: ' + (salvo?.erro || '?') }
          await (window as any).abrirArquivoNaAba(js)
          await new Promise((res) => setTimeout(res, 500))
          const btn = document.getElementById('btn-editor-formatar')
          if (!btn) return { erro: 'botao formatar ausente' }
          btn.click()
          return { clicou: true }
        }, { js, raiz })
        if (r.erro) throw new Error(r.erro)
        await page.waitForTimeout(1800)
        await page.locator('.cm-content').click({ timeout: 3000 }).catch(() => {})
        await page.keyboard.press('Control+s')
        await page.waitForTimeout(800)
        const conteudo = await fsp.readFile(js, 'utf8')
        const ok = conteudo.includes('const x = { a: 1, b: 2 }') && conteudo.includes('function f(a, b) {')
        out.push({
          id: 'ui.editor.formatar-js',
          area: 'ui',
          titulo: 'Formatar formata JavaScript com Prettier (estilo do projeto)',
          severidade: ok ? 'ok' : 'erro',
          duracaoMs: Date.now() - t0,
          detalhe: conteudo.slice(0, 80).replace(/\n/g, '\\n')
        })
      } catch (e) {
        out.push({
          id: 'ui.editor.formatar-js',
          area: 'ui',
          titulo: 'Formatar formata JavaScript com Prettier (estilo do projeto)',
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: String(e)
        })
      }
    }

    {
      const t0 = Date.now()
      try {
        const r = await page.evaluate(() => {
          const c = document.querySelector('.dg-minimapa') as HTMLCanvasElement | null
          const btn = document.getElementById('btn-editor-minimapa')
          if (!c || !btn) return { erro: 'minimapa ou botao ausente' }
          const visivelInicial = !c.hidden && c.width > 0
          ;(btn as HTMLButtonElement).click()
          const ocultoAposToggle = c.hidden === true
          ;(btn as HTMLButtonElement).click()
          const voltou = c.hidden === false
          return { visivelInicial, ocultoAposToggle, voltou, largura: c.width }
        })
        const ok = !r.erro && r.visivelInicial && r.ocultoAposToggle && r.voltou && (r.largura || 0) > 0
        out.push({
          id: 'ui.editor.minimapa',
          area: 'ui',
          titulo: 'minimapa desenha e alterna visibilidade',
          severidade: ok ? 'ok' : 'erro',
          duracaoMs: Date.now() - t0,
          detalhe: JSON.stringify(r)
        })
      } catch (e) {
        out.push({
          id: 'ui.editor.minimapa',
          area: 'ui',
          titulo: 'minimapa desenha e alterna visibilidade',
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: String(e)
        })
      }
    }

    {
      const t0 = Date.now()
      const auto = join(base, '.qa-autosave-' + Date.now() + '.txt')
      criados.push(auto)
      try {
        const r = await page.evaluate(async ({ auto, raiz }) => {
          const api = (window as any).api
          const salvo = await api.invoke('arquivo:salvar', auto, 'linha inicial\n', [raiz])
          if (!salvo?.ok) return { erro: 'salvar: ' + (salvo?.erro || '?') }
          await (window as any).abrirArquivoNaAba(auto)
          await new Promise((res) => setTimeout(res, 400))
          const sel = document.getElementById('editor-autosave') as HTMLSelectElement | null
          if (!sel) return { erro: 'select autosave ausente' }
          sel.value = '1000'
          sel.dispatchEvent(new Event('change'))
          return { pronto: true }
        }, { auto, raiz })
        if (r.erro) throw new Error(r.erro)
        await page.locator('.cm-content').click({ timeout: 3000 })
        await page.keyboard.press('Control+End')
        await page.keyboard.type('texto auto')
        await page.waitForTimeout(2200)
        const conteudo = await fsp.readFile(auto, 'utf8')
        const ok = conteudo.includes('texto auto')
        await page.evaluate(() => {
          const sel = document.getElementById('editor-autosave') as HTMLSelectElement | null
          if (!sel) return
          sel.value = '0'
          sel.dispatchEvent(new Event('change'))
        })
        out.push({
          id: 'ui.editor.autosave',
          area: 'ui',
          titulo: 'autosave persiste configuracao e grava apos pausa',
          severidade: ok ? 'ok' : 'erro',
          duracaoMs: Date.now() - t0,
          detalhe: 'gravado=' + ok + ' trecho=' + conteudo.slice(-24).replace(/\n/g, '\\n')
        })
      } catch (e) {
        out.push({
          id: 'ui.editor.autosave',
          area: 'ui',
          titulo: 'autosave persiste configuracao e grava apos pausa',
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: String(e)
        })
      }
    }
    {
      const t0 = Date.now()
      const orfao = join(base, '.qa-orfao-' + Date.now() + '.txt')
      const vizinho = join(base, '.qa-vizinho-' + Date.now() + '.txt')
      const orfaoSujo = join(base, '.qa-orfao-sujo-' + Date.now() + '.txt')
      criados.push(orfao, vizinho, orfaoSujo)
      try {
        const clicarAba = (caminho: string) =>
          page.evaluate((p) => {
            const btn = Array.from(document.querySelectorAll<HTMLElement>('.editor-tab')).find(
              (b) => b.dataset.caminho === p
            )
            btn?.click()
            return !!btn
          }, caminho)

        const r = await page.evaluate(async ({ orfao, vizinho, orfaoSujo, raiz }) => {
          const api = (window as any).api
          const arquivos: Array<[string, string]> = [
            [orfao, 'orfao\n'],
            [vizinho, 'vizinho\n'],
            [orfaoSujo, 'sujo\n']
          ]
          for (const [p, c] of arquivos) {
            const s = await api.invoke('arquivo:salvar', p, c, [raiz])
            if (!s?.ok) return { erro: 'salvar ' + p + ': ' + (s?.erro || '?') }
          }
          await (window as any).abrirArquivoNaAba(orfao)
          await (window as any).abrirArquivoNaAba(vizinho)
          await (window as any).abrirArquivoNaAba(orfaoSujo)
          await new Promise((res) => setTimeout(res, 400))
          return {
            abas: Array.from(document.querySelectorAll<HTMLElement>('.editor-tab')).map((b) => b.dataset.caminho)
          }
        }, { orfao, vizinho, orfaoSujo, raiz })
        if (r.erro) throw new Error(r.erro)

        // Suja a aba ativa e troca para a vizinha (dirty sincronizado na troca).
        await page.locator('.cm-content').click({ timeout: 3000 })
        await page.keyboard.press('Control+End')
        await page.keyboard.type(' editado')
        await clicarAba(vizinho)
        await page.waitForTimeout(300)

        await fsp.rm(orfao, { force: true })
        await fsp.rm(orfaoSujo, { force: true })

        const abriuLimpa = await clicarAba(orfao)
        await page.waitForTimeout(500)
        const limpou = await page.evaluate((p) => {
          const existe = Array.from(document.querySelectorAll<HTMLElement>('.editor-tab')).some(
            (b) => b.dataset.caminho === p
          )
          const toasts = Array.from(document.querySelectorAll('#dg-toast-host .dg-toast')).map(
            (t) => t.textContent || ''
          )
          return {
            existe,
            toasts,
            ativa: document.querySelector<HTMLElement>('.editor-tab.active')?.dataset.caminho || ''
          }
        }, orfao)

        const abriuSuja = await clicarAba(orfaoSujo)
        await page.waitForTimeout(500)
        const manteve = await page.evaluate((p) => {
          const existe = Array.from(document.querySelectorAll<HTMLElement>('.editor-tab')).some(
            (b) => b.dataset.caminho === p
          )
          const toasts = Array.from(document.querySelectorAll('#dg-toast-host .dg-toast')).map(
            (t) => t.textContent || ''
          )
          return { existe, toasts }
        }, orfaoSujo)

        const limpouOk =
          abriuLimpa &&
          limpou.existe === false &&
          limpou.toasts.some((t) => /não existe mais/i.test(t)) &&
          limpou.ativa === vizinho
        const manteveOk =
          abriuSuja &&
          manteve.existe === true &&
          manteve.toasts.some((t) => /Não foi possível abrir/i.test(t))

        const toastsLimpa = limpou.toasts.join(' | ')
        const toastsSuja = manteve.toasts.join(' | ')
        out.push({
          id: 'ui.editor.aba-orfa',
          area: 'ui',
          titulo: 'aba órfã limpa fecha ao clicar; aba suja é preservada',
          severidade: limpouOk && manteveOk ? 'ok' : 'erro',
          duracaoMs: Date.now() - t0,
          detalhe:
            'limpa=' + JSON.stringify(limpouOk) + ' suja=' + JSON.stringify(manteveOk) +
            ' toastsLimpa=[' + toastsLimpa.slice(-80) + '] toastsSuja=[' + toastsSuja.slice(-80) + ']'
        })

        // Devolve a barra de abas limpa para os cenários seguintes.
        await page.evaluate(async () => {
          const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
          for (let i = 0; i < 20; i++) {
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
          }
        })
      } catch (e) {
        out.push({
          id: 'ui.editor.aba-orfa',
          area: 'ui',
          titulo: 'aba órfã limpa fecha ao clicar; aba suja é preservada',
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: String(e)
        })
      }
    }
  } finally {
    for (const p of criados) {
      await fsp.rm(p, { force: true }).catch(() => {})
    }
  }

  return out
}
