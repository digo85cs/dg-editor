/**
 * Runner IPC: exercita lógica de main sem abrir janela Electron.
 * Não instancia BrowserWindow.
 */
import type { ResultadoCenario } from './tipos'
import { rodarCenariosIpc } from './cenarios/ipc-main'

export async function executarSuiteIpc(): Promise<{
  resultados: ResultadoCenario[]
  stubs: string[]
}> {
  console.log('[qa:ipc] iniciando handlers (sem UI)...')
  const { resultados, stubs } = await rodarCenariosIpc()
  for (const r of resultados) {
    const marca = r.severidade === 'ok' ? 'OK' : r.severidade === 'warn' ? 'WARN' : 'ERRO'
    console.log(`  [${marca}] ${r.id} — ${r.titulo} (${r.duracaoMs}ms)`)
  }
  if (stubs.length) {
    console.log('[qa:ipc] stubs usados: ' + stubs.join('; '))
  }
  return { resultados, stubs }
}
