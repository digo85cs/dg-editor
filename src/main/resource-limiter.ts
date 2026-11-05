import os from 'os'
import { app } from 'electron'

export function configurarLimites() {
  const totalGB = os.totalmem() / (1024 * 1024 * 1024)
  const cpus = os.cpus().length
  
  // Limitar memria baseado na mquina - nunca mais que 25% ou 2GB
  let maxRam = Math.min(2048, Math.floor((totalGB * 1024) * 0.25))
  if (maxRam < 512) maxRam = 512
  if (maxRam > 1536 && totalGB <= 8) maxRam = 1024
  
  // Um unico js-flags: o segundo appendSwitch substitui o primeiro.
  app.commandLine.appendSwitch(
    'js-flags',
    '--max-old-space-size=' + maxRam + ' --max-semi-space-size=64'
  )

  // Reduzir uso de CPU/GPU
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-hang-monitor')
  app.commandLine.appendSwitch('disable-dev-shm-usage')

  // Prioridade normal: a janela responde ao digitar e trocar de aba.
  // Sem WMIC (no Windows 11 o wmic trava o processo principal).
  try {
    os.setPriority(os.constants.priority.PRIORITY_NORMAL)
  } catch {
    /* ignore */
  }
  
  console.log('[resource-limiter]', { totalGB: totalGB.toFixed(1), cpus, maxRamMB: maxRam })
}
