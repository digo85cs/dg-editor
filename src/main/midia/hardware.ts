/**
 * Perfil de hardware — o DG Editor se adapta à máquina.
 *
 * Classifica o PC em cpu-lite, cpu ou gpu e deriva padrões de geração.
 * Sem GPU compatível (ex.: GT 710, compute 3.5) tudo roda em CPU, mais lento.
 */
import { cpus, totalmem } from 'node:os'
import { rodar } from './core'

export type PerfilHardware = 'cpu-lite' | 'cpu' | 'gpu'

export type GpuInfo = {
  nome: string
  vramGb: number
  compute?: number
  compativel: boolean
  motivo?: string
}

export type AjustesComfy = {
  largura: number
  altura: number
  passos: number
  quadros: number
  fps: number
  denoise: number
}

export type Hardware = {
  perfil: PerfilHardware
  platform: string
  arch: string
  cpu: string
  nucleos: number
  threads: number
  ramGb: number
  gpu?: GpuInfo
  comfy: AjustesComfy
}

export function classificarHardware(i: {
  threads: number
  ramGb: number
  gpu?: { vramGb: number; compute?: number }
}): PerfilHardware {
  if (i.gpu && i.gpu.vramGb >= 6 && typeof i.gpu.compute === 'number' && i.gpu.compute >= 7) return 'gpu'
  if (i.threads >= 8 && i.ramGb >= 12) return 'cpu'
  return 'cpu-lite'
}

export function ajustesComfy(perfil: PerfilHardware): AjustesComfy {
  if (perfil === 'gpu') return { largura: 768, altura: 768, passos: 8, quadros: 16, fps: 8, denoise: 0.55 }
  if (perfil === 'cpu') return { largura: 512, altura: 512, passos: 6, quadros: 8, fps: 8, denoise: 0.55 }
  return { largura: 384, altura: 384, passos: 4, quadros: 8, fps: 8, denoise: 0.5 }
}

/**
 * Alguns drivers antigos não expõem compute_cap. Estimamos pela arquitetura
 * (Kepler/Maxwell antigos = 3.5–5.x; VRAM >= 6 GB assume CUDA moderna).
 */
function computeProvavel(nome: string, vramGb: number): number | undefined {
  if (/GT 7[0-4]0|GTX (6|7)\d\d|GT 6\d\d|GTX TITAN|Quadro K/i.test(nome)) return 3.5
  if (vramGb >= 6) return 7.0
  return undefined
}

async function lerGpu(): Promise<GpuInfo | undefined> {
  const r = await rodar(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,compute_cap', '--format=csv,noheader,nounits'],
    5000
  )
  let linha = r.ok ? r.stdout.trim().split(/\r?\n/)[0] : ''
  let compute: number | undefined
  if (!linha) {
    const r2 = await rodar('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 5000)
    linha = r2.ok ? r2.stdout.trim().split(/\r?\n/)[0] : ''
  }
  if (!linha) return undefined
  const partes = linha.split(',').map((p) => p.trim())
  const nome = partes[0] || 'GPU NVIDIA'
  const vramMb = Number(partes[1])
  if (partes[2] && Number.isFinite(Number(partes[2]))) compute = Number(partes[2])
  const vramGb = Number.isFinite(vramMb) ? +(vramMb / 1024).toFixed(1) : 0
  const estimado = compute === undefined
  if (estimado) compute = computeProvavel(nome, vramGb)
  const compativel = vramGb >= 6 && typeof compute === 'number' && compute >= 7
  return {
    nome,
    vramGb,
    compute,
    compativel,
    motivo: compativel
      ? undefined
      : compute === undefined
        ? 'compute capability desconhecida e VRAM abaixo de 6 GB; usando CPU'
        : 'CUDA ' + compute + ' antiga para o PyTorch atual; usando CPU'
  }
}

let cache: Hardware | null = null

export async function detectarHardware(forcar = false): Promise<Hardware> {
  if (cache && !forcar) return cache
  const lista = cpus()
  const threads = lista.length
  const nucleos = threads
  const ramGb = +(totalmem() / 1024 ** 3).toFixed(1)
  const gpu = process.platform === 'win32' || process.platform === 'linux' ? await lerGpu() : undefined
  const perfil = classificarHardware({ threads, ramGb, gpu })
  cache = {
    perfil,
    platform: process.platform,
    arch: process.arch,
    cpu: lista[0]?.model?.trim() || 'CPU',
    nucleos,
    threads,
    ramGb,
    gpu,
    comfy: ajustesComfy(perfil)
  }
  return cache
}
