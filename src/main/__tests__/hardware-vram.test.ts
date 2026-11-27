import { describe, expect, it, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.DG_TEST_USERDATA = mkdtempSync(join(tmpdir(), 'dg-hw-'))

import {
  calcularHardwareProfile,
  garantirHardwareProfile,
  lerHardwareProfile,
  medirVramMb,
  modeloDoTeto,
  modeloExcedeTetoVram,
  tamanhoModeloB,
  tetoBPorVram,
} from '../hardware-profile'

describe('hardware-profile VRAM', () => {
  it('mede VRAM por nvidia-smi ou wmic (nesta maquina > 0)', () => {
    const v = medirVramMb()
    expect(v.vramMb).toBeGreaterThan(0)
    expect(v.medido).toBe(true)
    expect(['nvidia-smi', 'wmic AdapterRAM']).toContain(v.fonte)
    console.log('[prova] VRAM medida =', v.vramMb, 'MB fonte=' + v.fonte)
  })

  it('tetos por VRAM: <4GB->3b, 4-7GB->7b, >=8GB->sem teto', () => {
    expect(tetoBPorVram(0)).toBe(3)
    expect(tetoBPorVram(2048)).toBe(3)
    expect(tetoBPorVram(4095)).toBe(3)
    expect(tetoBPorVram(4096)).toBe(7)
    expect(tetoBPorVram(8191)).toBe(7)
    expect(tetoBPorVram(8192)).toBe(99)
    expect(tetoBPorVram(16384)).toBe(99)
    // chat: <8GB sempre 3b
    expect(tetoBPorVram(2048, 'chat')).toBe(3)
    expect(tetoBPorVram(8192, 'chat')).toBe(99)
  })

  it('modeloExcedeTetoVram respeita o teto por familia', () => {
    expect(modeloExcedeTetoVram('qwen2.5-coder:7b', 'codigo', 2048)).toBe(true)
    expect(modeloExcedeTetoVram('qwen2.5-coder:3b', 'codigo', 2048)).toBe(false)
    expect(modeloExcedeTetoVram('qwen2.5-coder:14b', 'codigo', 2048)).toBe(true)
    expect(modeloExcedeTetoVram('qwen2.5-coder:7b', 'codigo', 8192)).toBe(false)
    expect(modeloExcedeTetoVram('qwen2.5-coder:7b', 'chat', 2048)).toBe(true)
    expect(modeloExcedeTetoVram('qwen2.5-coder:3b', 'chat', 2048)).toBe(false)
    // modelo sem "b" no nome nao e filtrado pelo teto
    expect(modeloExcedeTetoVram('llama3.2:latest', 'codigo', 2048)).toBe(false)
  })

  it('calcularHardwareProfile aplica o teto de VRAM aos modelos locais', () => {
    const p = calcularHardwareProfile()
    expect(p.vramMb).toBeGreaterThanOrEqual(0)
    const capCodigo = tetoBPorVram(p.vramMb, 'codigo')
    const capChat = tetoBPorVram(p.vramMb, 'chat')
    expect(tamanhoModeloB(p.modeloCodigoLocal)).toBeLessThanOrEqual(capCodigo)
    expect(tamanhoModeloB(p.modeloChatLocal)).toBeLessThanOrEqual(capChat)
    console.log(
      '[prova] perfil calculado: vram=' + p.vramMb + 'MB tier=' + p.tier +
      ' chat=' + p.modeloChatLocal + ' codigo=' + p.modeloCodigoLocal
    )
  })

  it('migra hardware-profile.json antigo (sem vramMb) recalculando', () => {
    const arquivo = join(process.env.DG_TEST_USERDATA!, 'hardware-profile.json')
    const antigo = {
      totalRamGb: 24,
      freeRamGb: 7.3,
      cpuCores: 8,
      tier: 'forte',
      modeloChatLocal: 'qwen2.5-coder:3b',
      modeloCodigoLocal: 'qwen2.5-coder:7b',
      numPredictChat: 2048,
      numPredictCodigo: 2048,
      timeoutChatMs: 240000,
      timeoutCodigoMs: 300000,
      atualizadoEm: new Date().toISOString(),
    }
    writeFileSync(arquivo, JSON.stringify(antigo, null, 2), 'utf8')
    const p = garantirHardwareProfile()
    expect(p.vramMb).toBeGreaterThanOrEqual(0)
    expect(typeof p.vramMb).toBe('number')
    const lido = lerHardwareProfile()!
    expect(typeof lido.vramMb).toBe('number')
    expect(existsSync(arquivo)).toBe(true)
    console.log(
      '[prova] migrado: vram=' + p.vramMb + 'MB chat=' + p.modeloChatLocal +
      ' codigo=' + p.modeloCodigoLocal + ' (antes: codigo=7b)'
    )
  })

  it('modeloDoTeto devolve modelo dentro do teto', () => {
    expect(tamanhoModeloB(modeloDoTeto('codigo', 2048))).toBeLessThanOrEqual(tetoBPorVram(2048, 'codigo'))
    expect(tamanhoModeloB(modeloDoTeto('codigo', 8192))).toBeLessThanOrEqual(tetoBPorVram(8192, 'codigo'))
    expect(tamanhoModeloB(modeloDoTeto('chat', 2048))).toBeLessThanOrEqual(tetoBPorVram(2048, 'chat'))
  })
})
