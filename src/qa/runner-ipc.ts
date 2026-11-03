/**
 * Runner IPC: exercita lógica de main sem abrir janela Electron.
 * Não instancia BrowserWindow.
 * ConPTY/node-pty exige console real — sem TTY o cenário de pty é pulado (ok).
 */
import type { ResultadoCenario } from './tipos'
import { rodarCenariosIpc } from './cenarios/ipc-main'

/** false em Start-Job / CI / quando DG_QA_SEM_PTY=1 */
export const temTTY =
  process.env.DG_QA_SEM_PTY === '1'
    ? false
    : !!(process.stdout && (process.stdout as NodeJS.WriteStream).isTTY)

export async function executarSuiteIpc(): Promise<{
  resultados: ResultadoCenario[]
  stubs: string[]
}> {
  console.log(
    '[qa:ipc] iniciando handlers (sem UI)... temTTY=' +
      temTTY +
      (process.env.DG_QA_SEM_PTY === '1' ? ' (DG_QA_SEM_PTY=1)' : '')
  )
  const { resultados, stubs } = await rodarCenariosIpc(temTTY)
  for (const r of resultados) {
    const marca = r.severidade === 'ok' ? 'OK' : r.severidade === 'warn' ? 'WARN' : 'ERRO'
    console.log(`  [${marca}] ${r.id} — ${r.titulo} (${r.duracaoMs}ms)`)
  }
  if (stubs.length) {
    console.log('[qa:ipc] stubs usados: ' + stubs.join('; '))
  }
  return { resultados, stubs }
}
