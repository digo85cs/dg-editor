import { app } from 'electron'

export function configurarFechamentoLimpo() {
  app.on('before-quit', () => {
    try {
      // Forçar limpeza rápida
      process.removeAllListeners('uncaughtException')
      process.removeAllListeners('unhandledRejection')
    } catch {}
  })
  
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err?.message)
  })
  
  process.on('unhandledRejection', (err: any) => {
    console.error('[unhandledRejection]', err?.message)
  })
}
