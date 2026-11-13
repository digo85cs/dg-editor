/**
 * Regressao visual: captura telas-chave e compara com baseline local.
 * Baseline em qa-artifacts/visual-baseline (gitignored).
 * --atualizar-baseline grava/atualiza a baseline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'
import { compararPng } from '../visual-png'

const LIMITE_PCT = 0.5

/** Regiões voláteis (provedor, fila, atualização): mascaradas para o diff
 * comparar a UI estável sem depender do ambiente de rede. */
const MASCARAS = [
  // Lista de conversas: nomes e tempos relativos mudam entre execuções.
  '#folder-list'
]

/** Elementos com texto dinâmico: ocultos com largura fixa para o layout não deslocar. */
const DINAMICOS: Array<[string, number]> = [
  ['#sb-ia', 56],
  ['#sb-agent', 96],
  ['#sb-workspace', 48],
  ['#sb-safe', 44],
  ['#sb-update', 40],
  ['#sb-deps', 72],
  ['#guardian-bar', 104],
  // Pílula "Pausado" aparece conforme carga de CPU (dg:status) — volátil.
  ['#guardian-alert', 56],
  ['#chat-provider', 64],
  ['#chat-usage', 44]
]

type TelaVisual = {
  id: string
  titulo: string
  preparar: (page: Page, raiz: string) => Promise<void>
  /** Máscaras adicionais (regiões com conteúdo volátil, ex.: shell/prompt). */
  mascarar?: string[]
}

async function prepararChat(page: Page): Promise<void> {
  await page.evaluate(() => {
    // @ts-expect-error api do app
    window.dgUi?.ativarAbaCentro?.('chat')
    // @ts-expect-error api do app
    window.dgUi?.toggleRight?.(true)
    // @ts-expect-error api do app
    window.dgUi?.ativarAbaDireita?.('agent')
  })
  await page.waitForTimeout(400)
}

async function prepararExplorer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = document.getElementById('app')
    if (app?.classList.contains('sidebar-collapsed')) {
      document
        .querySelector('#activity-bar [data-action="explorer"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await page.waitForTimeout(600)
}

async function prepararEditor(page: Page, raiz: string): Promise<void> {
  const alvo = join(raiz, 'package.json')
  await page.evaluate(async (caminho) => {
    // @ts-expect-error api do app
    await window.abrirArquivoNaAba?.(caminho)
    // @ts-expect-error api do app
    window.dgUi?.ativarAbaCentro?.('editor')
    // @ts-expect-error api do app
    window.dgUi?.ativarAbaDireita?.('files')
  }, alvo)
  await page.waitForTimeout(800)
}

async function prepararChatClaro(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // @ts-expect-error api do app
    await window.dgTerminal?.ocultar?.()
    if (!document.body.classList.contains('tema-claro')) {
      document.getElementById('btn-tema')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await page.waitForTimeout(500)
  await prepararChat(page)
}

async function prepararTerminal(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // @ts-expect-error api do app
    await window.dgTerminal?.abrir?.()
  })
  await page.waitForTimeout(1200)
}

async function prepararConfig(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // @ts-expect-error api do app
    await window.dgTerminal?.ocultar?.()
    document.getElementById('btn-config')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  // Diagnóstico do sistema chega assíncrono (Ollama/disco/API).
  await page
    .waitForFunction(
      () => {
        const foot = document.getElementById('dg-diag-foot')
        return !!foot && (foot.textContent || '').trim().length > 0
      },
      null,
      { timeout: 3000 }
    )
    .catch(() => {})
  await page.evaluate(() => {
    // O grid de diagnóstico cresce conforme os cards carregam (skeleton tem
    // menos linhas que o resultado). Como o bloco é mascarado, fixar a altura
    // evita que as seções seguintes (Máquina/Acessibilidade) desloquem.
    const diag = document.getElementById('dg-diagnostico') as HTMLElement | null
    if (diag) {
      diag.style.setProperty('height', '400px', 'important')
      diag.style.setProperty('overflow', 'hidden', 'important')
    }
    const body = document.querySelector<HTMLElement>('#modal-config .config-body')
    if (body) body.scrollTop = 0
  })
  await page.waitForTimeout(400)
}

async function limparTransitorios(page: Page): Promise<void> {
  await page.evaluate((dinamicos: Array<[string, number]>) => {
    document.querySelectorAll('#dg-toast-host > *').forEach((el) => el.remove())
    document.getElementById('dg-rich-tip')?.classList.remove('is-show')
    // “Máscara semântica”: esconde só os textos voláteis, com largura fixa,
    // mantendo o resto da UI visível e estável entre capturas.
    for (const [sel, largura] of dinamicos) {
      const el = document.querySelector<HTMLElement>(sel)
      if (!el) continue
      el.style.setProperty('display', 'inline-block', 'important')
      el.style.setProperty('width', largura + 'px', 'important')
      el.style.setProperty('overflow', 'hidden', 'important')
      el.style.setProperty('visibility', 'hidden', 'important')
    }
    // Barras de rolagem nativas aparecem/somem conforme o conteúdo e deslocam pixels.
    let estilo = document.getElementById('qa-visual-freeze') as HTMLStyleElement | null
    if (!estilo) {
      estilo = document.createElement('style')
      estilo.id = 'qa-visual-freeze'
      estilo.textContent = [
        '::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}',
        '*{scrollbar-width:none!important}'
      ].join('\n')
      document.head.appendChild(estilo)
    }
  }, DINAMICOS)
  await page.waitForTimeout(120)
}

const TELAS: TelaVisual[] = [
  { id: 'visual.chat', titulo: 'Chat + painel do agente', preparar: (p) => prepararChat(p) },
  { id: 'visual.explorer', titulo: 'Explorer lateral', preparar: prepararExplorer },
  {
    id: 'visual.editor',
    titulo: 'Editor com arquivo aberto',
    preparar: prepararEditor,
    // Canvas do minimapa + trilho de rolagem variam alguns pixels entre runs.
    mascarar: ['.dg-minimapa']
  },
  {
    id: 'visual.terminal',
    titulo: 'Terminal docked com shell ativo',
    preparar: prepararTerminal,
    mascarar: ['.xterm-screen', '#terminal-shell-label']
  },
  { id: 'visual.chat-claro', titulo: 'Chat no tema claro', preparar: prepararChatClaro },
  {
    id: 'visual.config',
    titulo: 'Modal de configurações',
    preparar: prepararConfig,
    // Diagnóstico do sistema (Ollama/API/disco/horário) é volátil entre runs.
    mascarar: ['#dg-diagnostico', '#config-ollama', '#adapta-status-cfg', '#oc-token-status']
  }
]

export async function cenariosUiVisual(
  page: Page,
  ctx: { raiz: string; artifactsDir: string; atualizarBaseline: boolean }
): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []
  const baselineDir = join(ctx.raiz, 'qa-artifacts', 'visual-baseline')
  const atualDir = join(ctx.artifactsDir, 'visual')
  mkdirSync(baselineDir, { recursive: true })
  mkdirSync(atualDir, { recursive: true })

  for (const tela of TELAS) {
    const t0 = Date.now()
    try {
      await tela.preparar(page, ctx.raiz)
      await page.waitForTimeout(250)
      await limparTransitorios(page)
      const mascaras = [...MASCARAS, ...(tela.mascarar || [])]
      const shot = await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        mask: mascaras.map((sel) => page.locator(sel)),
        maskColor: '#ff00ff'
      })
      const arquivoBase = join(baselineDir, tela.id + '.png')
      const arquivoAtual = join(atualDir, tela.id + '.png')
      writeFileSync(arquivoAtual, shot)

      if (ctx.atualizarBaseline || !existsSync(arquivoBase)) {
        writeFileSync(arquivoBase, shot)
        out.push({
          id: tela.id,
          area: 'ui',
          titulo: tela.titulo,
          severidade: 'ok',
          duracaoMs: Date.now() - t0,
          detalhe: ctx.atualizarBaseline ? 'baseline atualizada' : 'baseline criada'
        })
        continue
      }

      const cmp = compararPng(readFileSync(arquivoBase), shot)
      if (cmp.erro) {
        out.push({
          id: tela.id,
          area: 'ui',
          titulo: tela.titulo,
          severidade: 'erro',
          duracaoMs: Date.now() - t0,
          erro: cmp.erro,
          detalhe: 'atual=' + arquivoAtual
        })
        continue
      }
      const ok = cmp.pct <= LIMITE_PCT
      out.push({
        id: tela.id,
        area: 'ui',
        titulo: tela.titulo,
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'diff=' +
          cmp.pct.toFixed(3) +
          '% (' +
          cmp.diferentes +
          '/' +
          cmp.total +
          ') limite=' +
          LIMITE_PCT +
          '% atual=' +
          arquivoAtual
      })
    } catch (e) {
      out.push({
        id: tela.id,
        area: 'ui',
        titulo: tela.titulo,
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
