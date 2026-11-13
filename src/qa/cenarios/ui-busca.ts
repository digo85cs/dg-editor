import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'

const TOKEN = 'DGQA_TOKEN_BUSCA_' + Date.now()

export async function cenariosUiBusca(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []
  const base = await fsp.mkdtemp(join(tmpdir(), 'dg-qa-busca-'))
  const sub = join(base, 'sub')
  await fsp.mkdir(sub, { recursive: true })
  await fsp.writeFile(
    join(base, 'a.txt'),
    'alfa\n' + TOKEN + '\nbeta\n' + TOKEN + ' extra\ngama\n',
    'utf8'
  )
  await fsp.writeFile(join(sub, 'b.md'), '# titulo\n' + TOKEN + '\n', 'utf8')

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async ({ base, token }) => {
        const api = (window as any).api
        const busca = await api.invoke('busca:conteudo', base, token, { limite: 20, id: 'qa-busca-1' })
        const semResultado = await api.invoke('busca:conteudo', base, 'token_que_nao_existe_xyz', { limite: 20 })
        const cancelar = await api.invoke('busca:cancelar', 'id-inexistente')
        return { busca, semResultado, cancelar }
      }, { base, token: TOKEN })
      const itens = Array.isArray(r.busca?.itens) ? r.busca.itens : []
      const rels = itens.map((i: any) => i.rel)
      const noA = itens.filter((i: any) => i.rel === 'a.txt')
      const temB = rels.includes('sub/b.md')
      const linhasOk = noA.some((i: any) => i.linha === 2) && noA.some((i: any) => i.linha === 4)
      const shapeOk = itens.every(
        (i: any) => typeof i.caminho === 'string' && typeof i.rel === 'string' && typeof i.linha === 'number' && typeof i.trecho === 'string'
      )
      const ok =
        r.busca?.ok === true &&
        noA.length === 2 &&
        temB &&
        linhasOk &&
        shapeOk &&
        Array.isArray(r.semResultado?.itens) &&
        r.semResultado.itens.length === 0 &&
        r.cancelar?.ok === true
      out.push({
        id: 'ui.busca.conteudo',
        area: 'ui',
        titulo: 'busca global retorna itens por arquivo/linha e cancelamento responde',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'itens=' + itens.length + ' rels=' + rels.join(',') + ' semResultado=' + (r.semResultado?.itens?.length ?? 'n/a')
      })
    } catch (e) {
      out.push({
        id: 'ui.busca.conteudo',
        area: 'ui',
        titulo: 'busca global retorna itens por arquivo/linha e cancelamento responde',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  {
    const t0 = Date.now()
    try {
      const r = await page.evaluate(async ({ base, token }) => {
        const api = (window as any).api
        const previa = await api.invoke('busca:substituir', base, token, 'SUBST', {
          previa: true
        })
        const aplicar = await api.invoke('busca:substituir', base, token, 'SUBST', {
          previa: false
        })
        const depois = await api.invoke('busca:conteudo', base, token, { limite: 20 })
        const novo = await api.invoke('busca:conteudo', base, 'SUBST', { limite: 20 })
        const regexRuim = await api.invoke('busca:substituir', base, '([', 'x', {
          regex: true,
          previa: true
        })
        return { previa, aplicar, depois, novo, regexRuim }
      }, { base, token: TOKEN })
      const ok =
        r.previa?.ok === true &&
        r.previa.ocorrencias === 3 &&
        r.previa.arquivos === 2 &&
        r.aplicar?.ok === true &&
        r.aplicar.alterados === 2 &&
        r.depois?.itens?.length === 0 &&
        r.novo?.itens?.length === 3 &&
        r.regexRuim?.ok === false
      out.push({
        id: 'ui.busca.substituir',
        area: 'ui',
        titulo: 'substituição em arquivos com prévia e validação de regex',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'previa=' +
          (r.previa?.ocorrencias ?? 'n/a') +
          '/' +
          (r.previa?.arquivos ?? 'n/a') +
          ' alterados=' +
          (r.aplicar?.alterados ?? 'n/a') +
          ' restantes=' +
          (r.depois?.itens?.length ?? 'n/a') +
          ' novos=' +
          (r.novo?.itens?.length ?? 'n/a') +
          ' regexRuim=' +
          (r.regexRuim?.ok === false)
      })
    } catch (e) {
      out.push({
        id: 'ui.busca.substituir',
        area: 'ui',
        titulo: 'substituição em arquivos',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  await fsp.rm(base, { recursive: true, force: true }).catch(() => {})
  return out
}
