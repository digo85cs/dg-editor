import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

export async function cenariosUiExplorer(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []
  const base = await fsp.mkdtemp(join(tmpdir(), 'dg-qa-explorer-'))
  const proj = join(base, 'proj')
  await fsp.mkdir(proj, { recursive: true })

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async ({ base, proj }) => {
        const api = (window as any).api
        const sep = String(base).includes('\\') ? '\\' : '/'
        const pastas = [base]
        const alvo = (a: string, b: string) => a.replace(/[/\\]+$/, '') + sep + b
        const novo = alvo(proj, 'novo.txt')
        const sub = alvo(proj, 'sub')
        const renomeado = alvo(proj, 'renomeado.txt')
        const criarArq = await api.invoke('arquivo:criar', novo, 'file', pastas)
        const criarDir = await api.invoke('arquivo:criar', sub, 'dir', pastas)
        const criarDeNovo = await api.invoke('arquivo:criar', novo, 'file', pastas)
        const renomear = await api.invoke('arquivo:renomear', novo, 'renomeado.txt', pastas)
        const mover = await api.invoke('arquivo:mover', renomeado, sub, pastas)
        const existeNoDestino = await api.invoke('arquivo:existe', alvo(sub, 'renomeado.txt'), pastas)
        const excluirRaiz = await api.invoke('arquivo:excluir', base, pastas)
        const criarFora = await api.invoke('arquivo:criar', 'C:\\dg-qa-fora\\x.txt', 'file', pastas)
        const excluir = await api.invoke('arquivo:excluir', alvo(sub, 'renomeado.txt'), pastas)
        const existeDepois = await api.invoke('arquivo:existe', alvo(sub, 'renomeado.txt'), pastas)
        return {
          criarArq,
          criarDir,
          criarDeNovo,
          renomear,
          mover,
          existeNoDestino,
          excluirRaiz,
          criarFora,
          excluir,
          existeDepois
        }
      }, { base, proj })
      const ok =
        r.criarArq?.ok === true &&
        r.criarDir?.ok === true &&
        r.criarDeNovo?.ok === false &&
        r.renomear?.ok === true &&
        r.mover?.ok === true &&
        r.existeNoDestino?.existe === true &&
        r.excluirRaiz?.ok === false &&
        r.criarFora?.ok === false &&
        r.excluir?.ok === true &&
        r.existeDepois?.existe === false
      out.push({
        id: 'ui.explorer.crud',
        area: 'ui',
        titulo: 'criar, renomear, mover e excluir com guardas de raiz',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: JSON.stringify({
          criar: r.criarArq?.ok,
          dir: r.criarDir?.ok,
          duplicado: r.criarDeNovo?.ok,
          renomear: r.renomear?.ok,
          mover: r.mover?.ok,
          destino: r.existeNoDestino?.existe,
          raizBloqueada: r.excluirRaiz?.ok === false,
          foraBloqueado: r.criarFora?.ok === false,
          excluir: r.excluir?.ok,
          excluido: r.existeDepois?.existe === false,
          erroExcluir: r.excluir?.erro
        })
      })
    } catch (e) {
      out.push({
        id: 'ui.explorer.crud',
        area: 'ui',
        titulo: 'criar, renomear, mover e excluir com guardas de raiz',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const labels = await page.evaluate(() => {
        const lista = document.getElementById('files-list')
        if (!lista) return ['#files-list ausente'] as string[]
        const row = document.createElement('div')
        row.className = 'tree-item'
        row.dataset.path = 'C:\\dg-qa\\pasta-fake'
        row.dataset.tipo = 'dir'
        lista.appendChild(row)
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 12, clientY: 12 }))
        const menu = document.querySelector('.tree-ctx-menu')
        const itens = menu ? Array.from(menu.querySelectorAll('.tree-ctx-item')).map((el) => el.textContent || '') : []
        menu?.remove()
        row.remove()
        return itens
      })
      const esperados = ['Novo arquivo', 'Nova pasta', 'Renomear', 'Excluir', 'Abrir terminal']
      const faltando = esperados.filter((e) => !labels.some((l) => l.includes(e)))
      out.push({
        id: 'ui.explorer.menu',
        area: 'ui',
        titulo: 'menu de contexto da arvore expõe CRUD',
        severidade: faltando.length === 0 ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: 'itens=' + labels.join(' | ') + (faltando.length ? ' faltando=' + faltando.join(',') : '')
      })
    } catch (e) {
      out.push({
        id: 'ui.explorer.menu',
        area: 'ui',
        titulo: 'menu de contexto da arvore expõe CRUD',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  await fsp.rm(base, { recursive: true, force: true }).catch(() => {})
  return out
}
