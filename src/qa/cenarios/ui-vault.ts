import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

async function criarVaultQa(): Promise<string> {
  const base = await fsp.mkdtemp(join(tmpdir(), 'dg-qa-vault-'))
  await fsp.writeFile(
    join(base, 'Ideia.md'),
    '---\ntags: [projeto]\n---\n# Ideia\n[[Plano]] e [[Referencia]]\n',
    'utf8'
  )
  await fsp.writeFile(join(base, 'Plano.md'), '# Plano\n[[Referencia]] #tarefa\n', 'utf8')
  await fsp.writeFile(join(base, 'Referencia.md'), '# Referencia\nConteudo\n', 'utf8')
  await fsp.writeFile(join(base, 'Solto.md'), '# Solto\n', 'utf8')
  return base
}

export async function cenariosUiVault(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []
  const raiz = await criarVaultQa()

  {
    const t0 = Date.now()
    try {
      const r = (await page.evaluate(async (dir) => {
        const api = (window as any).api
        const aberto = await api.invoke('vault:abrir', dir)
        const grafo = await api.invoke('vault:grafo')
        const lista = await api.invoke('vault:listar')
        return { aberto, grafo, lista }
      }, raiz)) as any
      const grafo = r.grafo || {}
      const porRel = new Map<string, any>((grafo.nos || []).map((n: any) => [n.rel, n]))
      const ok =
        r.aberto?.ok === true &&
        r.aberto?.total === 4 &&
        grafo.ok === true &&
        grafo.nos?.length === 4 &&
        grafo.arestas?.length === 3 &&
        porRel.get('Referencia.md')?.grau === 2 &&
        porRel.get('Solto.md')?.grau === 0 &&
        r.lista?.notas?.length === 4
      out.push({
        id: 'ui.vault.grafo',
        area: 'ui',
        titulo: 'grafo do vault expõe notas, arestas e grau',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? `${grafo.nos.length} nós · ${grafo.arestas.length} arestas`
          : JSON.stringify({
              aberto: r.aberto?.ok,
              total: r.aberto?.total,
              nos: grafo.nos?.length,
              arestas: grafo.arestas?.length,
              erro: grafo?.erro
            })
      })
    } catch (e) {
      out.push({
        id: 'ui.vault.grafo',
        area: 'ui',
        titulo: 'grafo do vault expõe notas, arestas e grau',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async (dir) => {
        const api = (window as any).api
        const alvo = dir.replace(/[/\\]+$/, '') + (String(dir).includes('\\') ? '\\' : '/')
        const nota = await api.invoke('vault:nota', alvo + 'Referencia.md')
        const backlinks = await api.invoke('vault:backlinks', alvo + 'Referencia.md')
        const tags = await api.invoke('vault:tags')
        const link = await api.invoke('vault:resolver-link', 'Plano', alvo + 'Ideia.md')
        return { nota, backlinks, tags, link }
      }, raiz)
      const ok =
        r.nota?.ok === true &&
        r.backlinks?.backlinks?.length === 2 &&
        Array.isArray(r.tags?.tags?.projeto) &&
        r.tags.tags.projeto.length === 1 &&
        Array.isArray(r.tags?.tags?.tarefa) &&
        r.tags.tags.tarefa.length === 1 &&
        r.link?.ok === true &&
        String(r.link.path || '').endsWith('Plano.md')
      out.push({
        id: 'ui.vault.notas',
        area: 'ui',
        titulo: 'backlinks, tags e resolução de wiki link',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? `backlinks=${r.backlinks.backlinks.length} tags=projeto,tarefa`
          : JSON.stringify({
              nota: r.nota?.ok,
              backlinks: r.backlinks?.backlinks?.length,
              tags: Object.keys(r.tags?.tags || {}),
              link: r.link?.path
            })
      })
    } catch (e) {
      out.push({
        id: 'ui.vault.notas',
        area: 'ui',
        titulo: 'backlinks, tags e resolução de wiki link',
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
        ;(document.getElementById('btn-vault-grafo') as HTMLElement).click()
      })
      await page.waitForSelector('.grafo-modal .grafo-canvas', { timeout: 8000 })
      const r = await page.evaluate(() => {
        const modal = document.querySelector('.grafo-modal')
        const canvas = document.querySelector('.grafo-canvas')
        if (!(canvas instanceof HTMLCanvasElement)) return { ok: false, motivo: 'canvas ausente' }
        const ctx = canvas.getContext('2d')
        const dados = ctx?.getImageData(0, 0, canvas.width, canvas.height).data
        let pintados = 0
        if (dados) {
          for (let i = 3; i < dados.length; i += 4) if (dados[i] > 0) pintados++
        }
        const info = document.querySelector('.grafo-info')?.textContent || ''
        const btn = Array.from(document.querySelectorAll('.grafo-modal button')).find(
          (b) => (b.textContent || '').trim() === 'Fechar'
        )
        if (btn instanceof HTMLElement) btn.click()
        return {
          ok: true,
          papel: modal?.getAttribute('role'),
          largura: canvas.width,
          altura: canvas.height,
          pintados,
          info,
          fechou: !document.querySelector('.grafo-modal')
        }
      })
      const ok =
        r.ok === true &&
        r.papel === 'dialog' &&
        r.largura > 100 &&
        r.altura > 100 &&
        r.pintados > 100 &&
        r.fechou === true &&
        String(r.info).includes('4 notas')
      out.push({
        id: 'ui.vault.grafo-ui',
        area: 'ui',
        titulo: 'modal do grafo desenha canvas e fecha',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? `canvas ${r.largura}x${r.altura} · ${r.pintados} px` : JSON.stringify(r)
      })
    } catch (e) {
      out.push({
        id: 'ui.vault.grafo-ui',
        area: 'ui',
        titulo: 'modal do grafo desenha canvas e fecha',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    const base = join(process.cwd(), '.qa-tmp-mapas-' + Date.now())
    try {
      await fsp.mkdir(base, { recursive: true })
      const r = (await page.evaluate(async (raiz) => {
        const api = (window as any).api
        const outline = '- Raiz\n  - Filho A\n    - Neto\n  - Filho B'
        const svg = await api.invoke('mapas:svg', { outline, titulo: 'QA' })
        const salvo = await api.invoke('mapas:salvar', { raiz, nome: 'QA Mapa', outline })
        const lista = await api.invoke('mapas:listar', { raiz })
        const lido = await api.invoke('mapas:carregar', { raiz, nome: 'QA Mapa' })
        const html =
          '<!doctype html><html><body style="margin:0">' + (svg?.svg || '') + '</body></html>'
        const png = await api.invoke('midia:html-imagem', {
          raiz,
          html,
          largura: Math.min(900, svg?.largura || 900),
          altura: Math.min(700, svg?.altura || 700),
          fundo: '#ffffff',
          saida: '.dg-editor/mapas/qa-mapa.png'
        })
        return { svg, salvo, lista, lido, png }
      }, base)) as any
      const ok =
        r.svg?.ok === true &&
        r.svg.nos === 4 &&
        String(r.svg.svg).includes('data-camada="arestas"') &&
        r.salvo?.ok === true &&
        r.salvo.nos === 4 &&
        r.lista?.mapas?.length === 1 &&
        r.lido?.ok === true &&
        String(r.lido.outline).includes('Neto') &&
        r.png?.ok === true &&
        r.png.bytes > 500
      out.push({
        id: 'ui.mapa-mental.ipc',
        area: 'ui',
        titulo: 'mapa mental renderiza SVG, salva, carrega e exporta PNG',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok
          ? `${r.svg.largura}x${r.svg.altura} · ${Math.round(r.png.bytes / 1024)} KB PNG`
          : JSON.stringify({
              svg: r.svg?.ok,
              nos: r.svg?.nos,
              salvo: r.salvo?.ok,
              lista: r.lista?.mapas?.length,
              lido: r.lido?.ok,
              png: r.png?.ok,
              erro: r.salvo?.erro || r.png?.erro
            })
      })
    } catch (e) {
      out.push({
        id: 'ui.mapa-mental.ipc',
        area: 'ui',
        titulo: 'mapa mental renderiza SVG, salva, carrega e exporta PNG',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      await fsp.rm(base, { recursive: true, force: true }).catch(() => {})
    }
  }

  {
    const t0 = Date.now()
    try {
      await page.evaluate(() => {
        ;(document.getElementById('btn-mapa-mental') as HTMLElement).click()
      })
      await page.waitForSelector('.mapa-modal', { timeout: 8000 })
      await page.waitForFunction(
        () => !!document.querySelector('.mapa-preview svg') && !!document.querySelector('.mapa-preview text'),
        undefined,
        { timeout: 8000 }
      )
      const r = await page.evaluate(() => {
        const modal = document.querySelector('.mapa-modal')
        const status = document.querySelector('.mapa-status')?.textContent || ''
        const svg = document.querySelector('.mapa-preview svg')
        const btn = Array.from(document.querySelectorAll('.mapa-modal button')).find(
          (b) => (b.textContent || '').trim() === 'Fechar'
        )
        if (btn instanceof HTMLElement) btn.click()
        return {
          papel: modal?.getAttribute('role'),
          status,
          temSvg: !!svg,
          fechou: !document.querySelector('.mapa-modal')
        }
      })
      const ok =
        r.papel === 'dialog' && r.temSvg && r.fechou && String(r.status).includes('tópicos')
      out.push({
        id: 'ui.mapa-mental.ui',
        area: 'ui',
        titulo: 'modal do mapa mental renderiza prévia e fecha',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? r.status : JSON.stringify(r)
      })
    } catch (e) {
      out.push({
        id: 'ui.mapa-mental.ui',
        area: 'ui',
        titulo: 'modal do mapa mental renderiza prévia e fecha',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = (await page.evaluate(async () => {
        const api = (window as any).api
        const gravado = await api.invoke('clipboard:gravar', {
          texto: 'alternativa',
          html: '<h2>Notion</h2><p><strong>rico</strong> e <a href="https://x.dev">link</a></p><ul><li>um</li><li>dois</li></ul>'
        })
        const lido = await api.invoke('clipboard:colar-markdown')
        return { gravado, lido }
      })) as any
      const md = String(r.lido?.markdown || '')
      const ok =
        r.gravado?.ok === true &&
        r.lido?.ok === true &&
        r.lido.origem === 'html' &&
        md.includes('## Notion') &&
        md.includes('**rico**') &&
        md.includes('[link](https://x.dev)') &&
        md.includes('- um') &&
        md.includes('- dois')
      out.push({
        id: 'ui.clipboard.markdown',
        area: 'ui',
        titulo: 'clipboard rico vira Markdown no processo principal',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? 'origem=html · ' + md.length + ' caracteres' : JSON.stringify(r)
      })
    } catch (e) {
      out.push({
        id: 'ui.clipboard.markdown',
        area: 'ui',
        titulo: 'clipboard rico vira Markdown no processo principal',
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
        ;(document.body as HTMLElement).focus()
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true })
        )
        return document.activeElement?.tagName || ''
      })
      await page.waitForSelector('.colar-md-modal', { timeout: 8000 })
      const ui = await page.evaluate(() => {
        const area = document.querySelector('.colar-md-area')
        const texto = area instanceof HTMLTextAreaElement ? area.value : ''
        const btn = Array.from(document.querySelectorAll('.colar-md-modal button')).find(
          (b) => (b.textContent || '').trim() === 'Fechar'
        )
        if (btn instanceof HTMLElement) btn.click()
        return { texto, fechou: !document.querySelector('.colar-md-modal') }
      })
      const ok = ui.fechou && ui.texto.includes('## Notion') && ui.texto.includes('**rico**')
      out.push({
        id: 'ui.clipboard.previa',
        area: 'ui',
        titulo: 'atalho Ctrl+Shift+V abre prévia do Markdown sem editor ativo',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: ok ? 'prévia com ' + ui.texto.length + ' caracteres (foco ' + r + ')' : JSON.stringify(ui)
      })
    } catch (e) {
      out.push({
        id: 'ui.clipboard.previa',
        area: 'ui',
        titulo: 'atalho Ctrl+Shift+V abre prévia do Markdown sem editor ativo',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  await page.evaluate(async () => {
    await (window as any).api.invoke('vault:fechar')
  })
  await fsp.rm(raiz, { recursive: true, force: true }).catch(() => {})
  return out
}
