import { cpus, totalmem, freemem, arch, platform, release, hostname, networkInterfaces } from 'os'
import { execSync } from 'child_process'
import { existsSync, statSync } from 'fs'
import { SystemProfile } from '@shared/types'

function safeExec(cmd: string, timeoutMs = 5000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function detectGPU(): { name: string; vendor: string }[] {
  const gpus: { name: string; vendor: string }[] = []
  const plat = platform()

  if (plat === 'win32') {
    const out = safeExec('wmic path win32_VideoController get name /value')
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/^name=(.+)$/)
      if (m && m[1].trim()) gpus.push({ name: m[1].trim(), vendor: 'Unknown' })
    }
  } else if (plat === 'darwin') {
    const out = safeExec("system_profiler SPDisplaysDataType 2>/dev/null | grep -i 'Chipset\\|Model' || true")
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && /Apple|AMD|NVIDIA|Intel/i.test(trimmed)) {
        gpus.push({ name: trimmed, vendor: /Apple/.test(trimmed) ? 'Apple' : /NVIDIA/.test(trimmed) ? 'NVIDIA' : /AMD/.test(trimmed) ? 'AMD' : 'Unknown' })
      }
    }
  } else {
    const out = safeExec("lspci -nn 2>/dev/null | grep -iE 'vga|3d|display' || true")
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        const vendorMatch = trimmed.match(/\[(.*?)\]/)
        gpus.push({ name: trimmed, vendor: vendorMatch ? vendorMatch[1] : 'Unknown' })
      }
    }
  }

  return gpus
}

function diskUsage(): { total: number; free: number } {
  try {
    // Cross-platform disk usage via statfs on root
    const { statfsSync } = require('fs') as typeof import('fs')
    const st = statfsSync(platform() === 'win32' ? 'C:\\' : '/')
    const bsize = st.bsize || 4096
    const total = st.blocks * bsize
    const free = st.bavail * bsize
    return { total, free }
  } catch {
    return { total: 0, free: 0 }
  }
}

export function getSystemProfile(): SystemProfile {
  const cpuList = cpus()
  return {
    platform: platform(),
    arch: arch(),
    hostname: hostname(),
    cpus: cpuList.map((c) => ({
      model: c.model,
      cores: 1,
      speed: c.speed
    })),
    totalMemory: totalmem(),
    freeMemory: freemem(),
    osRelease: release(),
    gpu: detectGPU(),
    disk: diskUsage(),
    nodeVersion: process.version,
    electronVersion: process.versions.electron ?? 'unknown',
    capturedAt: Date.now()
  }
}

export function profileStrength(profile: SystemProfile): 'light' | 'medium' | 'strong' {
  const cores = Math.max(1, profile.cpus.length)
  const memGB = profile.totalMemory / (1024 * 1024 * 1024)
  const diskGB = profile.disk.total / (1024 * 1024 * 1024)

  if (cores >= 8 && memGB >= 16 && diskGB >= 50) return 'strong'
  if (cores >= 4 && memGB >= 8 && diskGB >= 20) return 'medium'
  return 'light'
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}