import os from 'os'
import { app } from 'electron'

export type ResourceProfile = {
  maxRamMB: number
  maxCpuPercent: number
  idleThrottleMs: number
}

let profile: ResourceProfile

export function getResourceProfile(): ResourceProfile {
  if (profile) return profile
  const totalGB = os.totalmem() / (1024 * 1024 * 1024)
  const cpus = os.cpus().length
  
  if (totalGB <= 4) {
    profile = { maxRamMB: 768, maxCpuPercent: 35, idleThrottleMs: 3000 }
  } else if (totalGB <= 8) {
    profile = { maxRamMB: 1024, maxCpuPercent: 45, idleThrottleMs: 2000 }
  } else if (totalGB <= 16) {
    profile = { maxRamMB: 1536, maxCpuPercent: 60, idleThrottleMs: 1500 }
  } else {
    profile = { maxRamMB: 2048, maxCpuPercent: 65, idleThrottleMs: 1000 }
  }
  return profile
}

export function applyMemoryLimit() {
  // js-flags fica so em resource-limiter (appendSwitch repetido apaga o anterior).
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}
