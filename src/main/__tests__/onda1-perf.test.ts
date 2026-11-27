import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { envOllamaServe } from '../ollama-keeper'

const ROOT = process.cwd()

describe('Onda 1 — Velocidade e Fluidez', () => {
  it('envOllamaServe habilita Flash Attention e KV cache q8_0 por padrão', () => {
    const env = envOllamaServe({ PATH: '/usr/bin' })
    expect(env.OLLAMA_FLASH_ATTENTION).toBe('1')
    expect(env.OLLAMA_KV_CACHE_TYPE).toBe('q8_0')
    expect(env.OLLAMA_NUM_PARALLEL).toBe('1')
    expect(env.OLLAMA_MAX_LOADED_MODELS).toBe('1')
    expect(env.OLLAMA_KEEP_ALIVE).toBe('10m')
  })

  it('envOllamaServe respeita overrides definidos pelo usuário', () => {
    const env = envOllamaServe({
      OLLAMA_FLASH_ATTENTION: '0',
      OLLAMA_KV_CACHE_TYPE: 'f16',
      OLLAMA_KEEP_ALIVE: '30m'
    })
    expect(env.OLLAMA_FLASH_ATTENTION).toBe('0')
    expect(env.OLLAMA_KV_CACHE_TYPE).toBe('f16')
    expect(env.OLLAMA_KEEP_ALIVE).toBe('30m')
  })

  it('agent.ts mantém prefixo estático antes de blocos voláteis (Prefix Caching)', () => {
    const src = readFileSync(join(ROOT, 'src/main/brain/agent.ts'), 'utf8')
    const iExtra = src.indexOf('const systemExtra =')
    expect(iExtra).toBeGreaterThan(0)
    const trecho = src.slice(iExtra, iExtra + 450)
    // Estáticos antes de voláteis (blocoMidia/blocoAgente antes de memoria/blocoInventario)
    expect(trecho.indexOf('blocoAgente')).toBeLessThan(trecho.indexOf('memoria'))
    expect(trecho.indexOf('blocoMidia')).toBeLessThan(trecho.indexOf('blocoInventario'))
    expect(trecho.indexOf('blocoPropose')).toBeLessThan(trecho.indexOf('memoria'))
  })

  it('ferramentas-ui.js carrega midia-ui.js sob demanda (lazy import)', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/ferramentas-ui.js'), 'utf8')
    expect(src).not.toMatch(/^import\s+.*midia-ui\.js/m)
    expect(src).toMatch(/import\(\s*['"]\.\/midia-ui\.js['"]\s*\)/)
  })

  it('terminal.js usa WebglAddon com fallback seguro e batching rAF', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/terminal.js'), 'utf8')
    expect(src).toContain('@xterm/addon-webgl')
    expect(src).toContain('onContextLoss')
    expect(src).toContain('criarBufferEscritaXterm')
  })

  it('editor-cm.js protege contra arquivos grandes via wrapCompartment', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/editor-cm.js'), 'utf8')
    expect(src).toContain('wrapCompartment')
    expect(src).toContain('ARQUIVO_GRANDE_BYTES')
    expect(src).toContain('deveQuebrarLinha')
  })
})
