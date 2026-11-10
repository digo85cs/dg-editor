import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  chaveConfigurada,
  lerChave,
  listarChavesConfiguradas,
  removerChave,
  salvarChave,
} from '../segredos-providers'
import { safeStorage } from 'electron'

const USERDATA = 'C:/tmp/dg-editor-segredos-test'
const ARQUIVO = join(USERDATA, 'providers-keys.bin')

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/tmp/dg-editor-segredos-test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (texto: string) =>
      Buffer.from('v1:' + Buffer.from(texto, 'utf8').toString('base64')),
    decryptString: (buf: Buffer) => {
      const s = Buffer.isBuffer(buf) ? buf.toString() : String(buf)
      if (s.startsWith('v1:')) return Buffer.from(s.slice(3), 'base64').toString('utf8')
      return s
    },
  },
}))

beforeEach(() => {
  try { unlinkSync(ARQUIVO) } catch { /* */ }
  delete process.env.OPENROUTER_API_KEY
  delete process.env.GEMINI_API_KEY
  safeStorage.isEncryptionAvailable = () => true
})

afterEach(() => {
  try { unlinkSync(ARQUIVO) } catch { /* */ }
  safeStorage.isEncryptionAvailable = () => true
})

describe('segredos-providers', () => {
  it('salvarChave + lerChave round-trip', () => {
    const salvo = salvarChave('openrouter-inkling', 'sk-test-123-secret')
    expect(salvo.ok).toBe(true)
    expect(lerChave('openrouter-inkling')).toBe('sk-test-123-secret')
    expect(chaveConfigurada('openrouter-inkling')).toBe(true)
  })

  it('arquivo no disco não contém a chave em texto plano', () => {
    salvarChave('openrouter-inkling', 'sk-test-123-secret')
    const texto = readFileSync(ARQUIVO).toString('utf8')
    expect(texto).not.toContain('sk-test-123-secret')
    expect(texto).toContain('v1:')
  })

  it('lerChave cai em process.env quando o cofre está vazio', () => {
    process.env.OPENROUTER_API_KEY = 'env-key-openrouter'
    expect(lerChave('openrouter-inkling')).toBe('env-key-openrouter')
  })

  it('sem criptografia disponível, salvarChave retorna ok:false', () => {
    safeStorage.isEncryptionAvailable = () => false
    const r = salvarChave('openrouter-inkling', 'sk-test-123-secret')
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('criptografia')
    expect(existsSync(ARQUIVO)).toBe(false)
  })

  it('removerChave apaga a chave do cofre', () => {
    salvarChave('openrouter-inkling', 'sk-test-123-secret')
    expect(lerChave('openrouter-inkling')).toBe('sk-test-123-secret')
    const removido = removerChave('openrouter-inkling')
    expect(removido.ok).toBe(true)
    expect(lerChave('openrouter-inkling')).toBeNull()
    expect(chaveConfigurada('openrouter-inkling')).toBe(false)
  })

  it('listarChavesConfiguradas retorna ids, nunca valores', () => {
    salvarChave('openrouter-inkling', 'sk-test-123-secret')
    salvarChave('groq', 'gsk-abc-def')
    const ids = listarChavesConfiguradas()
    expect(ids).toContain('openrouter-inkling')
    expect(ids).toContain('groq')
    const texto = readFileSync(ARQUIVO).toString('utf8')
    expect(texto).not.toContain('sk-test-123-secret')
    expect(texto).not.toContain('gsk-abc-def')
  })
})
