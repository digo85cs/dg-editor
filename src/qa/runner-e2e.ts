/**
 * Runner E2E com Playwright Electron (_electron.launch).
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import type { ResultadoCenario } from './tipos'
import { cenariosUiNavegacao } from './cenarios/ui-navegacao'
import { cenariosUiTerminal } from './cenarios/ui-terminal'
import { cenariosUiChat } from './cenarios/ui-chat'
import { cenariosUiAgent } from './cenarios/ui-agent'
import { cenariosUiBrowserEmbed } from './cenarios/ui-browser-embed'
import { cenariosUiExplorer } from './cenarios/ui-explorer'
import { cenariosUiBusca } from './cenarios/ui-busca'
import { cenariosUiEditor } from './cenarios/ui-editor'
import { cenariosUiMidia } from './cenarios/ui-midia'
import { cenariosUiA11y } from './cenarios/ui-a11y'
import { cenariosUiVisual } from './cenarios/ui-visual'

export async function executarSuiteE2e(
  raiz: string,
  artifactsDir: string,
  opcoes: { visualOnly?: boolean; atualizarBaseline?: boolean } = {}
): Promise<{ resultados: ResultadoCenario[]; metricasE2e: { id: string; valor: number; limitePadrao: number }[] }> {
  const resultados: ResultadoCenario[] = []
  const metricasE2e: { id: string; valor: number; limitePadrao: number }[] = []

  let _electron: typeof import('playwright-core')._electron
  try {
    ;({ _electron } = await import('playwright-core'))
  } catch (e) {
    resultados.push({
      id: 'ui.e2e.playwright',
      area: 'ui',
      titulo: 'playwright-core indisponivel',
      severidade: 'erro',
      duracaoMs: 0,
      erro: String((e as Error)?.message || e)
    })
    return { resultados, metricasE2e }
  }

  const electronBin =
    process.env.ELECTRON_PATH ||
    require('electron') // path to electron binary when required from node
  const executablePath = typeof electronBin === 'string' ? electronBin : undefined
  const mainJs = join(raiz, 'out', 'main', 'index.js')
  if (!existsSync(mainJs)) {
    resultados.push({
      id: 'ui.e2e.build',
      area: 'ui',
      titulo: 'out/main/index.js ausente — rode npm run build',
      severidade: 'erro',
      duracaoMs: 0
    })
    return { resultados, metricasE2e }
  }

  console.log('[qa:e2e] lancando Electron via Playwright...')
  const tBoot = Date.now()
  // Perfil isolado por execução: sem configs/segredos/estado de runs anteriores.
  const userDataQa = join(artifactsDir, 'userdata')
  try {
    rmSync(userDataQa, { recursive: true, force: true })
    mkdirSync(userDataQa, { recursive: true })
  } catch {
    /* */
  }
  let app: Awaited<ReturnType<typeof _electron.launch>> | null = null
  try {
    app = await _electron.launch({
      executablePath,
      args: [mainJs],
      env: {
        ...process.env,
        DG_NAV_SMOKE: '',
        DG_QA_E2E: '1',
        DG_FAKE_LLM: '1',
        DG_QA_USERDATA: userDataQa,
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
      },
      timeout: 30000
    })
    const window = await app.firstWindow({ timeout: 20000 })
    await window.waitForLoadState('domcontentloaded')
    const bootMs = Date.now() - tBoot
    metricasE2e.push({ id: 'perf.boot', valor: bootMs, limitePadrao: 15000 })
    resultados.push({
      id: 'perf.boot',
      area: 'perf',
      titulo: 'boot ate firstWindow',
      severidade: bootMs <= 15000 * 1.3 ? 'ok' : 'warn',
      duracaoMs: bootMs
    })

    const shotDir = join(artifactsDir, 'screenshots')
    if (!existsSync(shotDir)) mkdirSync(shotDir, { recursive: true })

    const suites = opcoes.visualOnly
      ? [
          {
            nome: 'visual',
            fn: () =>
              cenariosUiVisual(window, {
                raiz,
                artifactsDir,
                atualizarBaseline: !!opcoes.atualizarBaseline
              })
          }
        ]
      : [
          { nome: 'navegacao', fn: () => cenariosUiNavegacao(window) },
          { nome: 'terminal', fn: () => cenariosUiTerminal(window) },
          { nome: 'chat', fn: () => cenariosUiChat(window, raiz) },
          { nome: 'agent', fn: () => cenariosUiAgent(window) },
          { nome: 'browser-embed', fn: () => cenariosUiBrowserEmbed(window) },
          { nome: 'explorer', fn: () => cenariosUiExplorer(window) },
          { nome: 'busca', fn: () => cenariosUiBusca(window) },
          { nome: 'editor', fn: () => cenariosUiEditor(window, raiz) },
          { nome: 'midia', fn: () => cenariosUiMidia(window) },
          { nome: 'a11y', fn: () => cenariosUiA11y(window, raiz) }
        ]

    for (const s of suites) {
      try {
        const parcial = await Promise.race([
          s.fn(),
          new Promise<ResultadoCenario[]>((_, rej) =>
            setTimeout(() => rej(new Error('timeout suite ' + s.nome)), 90000)
          )
        ])
        for (const r of parcial) {
          if (r.severidade === 'erro') {
            try {
              const shot = join(shotDir, r.id.replace(/[^\w.-]+/g, '_') + '.png')
              await window.screenshot({ path: shot })
              r.screenshot = shot
            } catch {
              /* */
            }
          }
          const marca = r.severidade === 'ok' ? 'OK' : r.severidade === 'warn' ? 'WARN' : 'ERRO'
          console.log(`  [${marca}] ${r.id} — ${r.titulo}`)
          resultados.push(r)
        }
      } catch (e) {
        const id = 'ui.suite.' + s.nome
        console.log(`  [ERRO] ${id} — ${String(e)}`)
        resultados.push({
          id,
          area: 'ui',
          titulo: 'suite ' + s.nome,
          severidade: 'erro',
          duracaoMs: 0,
          erro: String((e as Error)?.message || e)
        })
      }
    }
  } catch (e) {
    resultados.push({
      id: 'ui.e2e.launch',
      area: 'ui',
      titulo: 'falha ao lancar Electron/Playwright',
      severidade: 'erro',
      duracaoMs: Date.now() - tBoot,
      erro: String((e as Error)?.message || e),
      detalhe: 'display indisponivel ou binario electron'
    })
  } finally {
    try {
      await app?.close()
    } catch {
      /* */
    }
    try {
      rmSync(userDataQa, { recursive: true, force: true })
    } catch {
      /* arquivos ainda em uso pelo Electron */
    }
  }

  return { resultados, metricasE2e }
}
