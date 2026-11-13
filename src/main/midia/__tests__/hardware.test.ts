import { describe, expect, it } from 'vitest'
import { ajustesComfy, classificarHardware } from '../hardware'

describe('perfil de hardware', () => {
  it('GPU recente com 6 GB+ vira gpu', () => {
    expect(classificarHardware({ threads: 8, ramGb: 16, gpu: { vramGb: 8, compute: 8.6 } })).toBe('gpu')
  })

  it('GPU antiga (GT 710, compute 3.5) fica em CPU', () => {
    expect(classificarHardware({ threads: 12, ramGb: 16, gpu: { vramGb: 2, compute: 3.5 } })).toBe('cpu')
  })

  it('GPU com VRAM insuficiente fica em CPU', () => {
    expect(classificarHardware({ threads: 12, ramGb: 16, gpu: { vramGb: 4, compute: 8.9 } })).toBe('cpu')
  })

  it('CPU fraca vira cpu-lite', () => {
    expect(classificarHardware({ threads: 4, ramGb: 8 })).toBe('cpu-lite')
  })

  it('ajustes crescem de cpu-lite para gpu', () => {
    const lite = ajustesComfy('cpu-lite')
    const cpu = ajustesComfy('cpu')
    const gpu = ajustesComfy('gpu')
    expect(cpu.largura).toBeGreaterThan(lite.largura)
    expect(gpu.largura).toBeGreaterThan(cpu.largura)
    expect(gpu.passos).toBeGreaterThan(cpu.passos)
    expect(gpu.quadros).toBeGreaterThan(cpu.quadros)
    for (const a of [lite, cpu, gpu]) {
      expect(a.largura % 64).toBe(0)
      expect(a.altura % 64).toBe(0)
      expect(a.denoise).toBeGreaterThanOrEqual(0.3)
      expect(a.denoise).toBeLessThanOrEqual(0.8)
    }
  })
})
