import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  avaliarPlataforma,
  carregarManifesto,
  chavePlataforma,
  compararVersao,
  componenteCompativel,
  dataDoBuild,
  escolherAsset,
  limparCacheManifesto,
  precisaAtualizarBuild,
  type AssetRemoto,
  type ManifestoFerramentas
} from '../compat'

const manifesto: ManifestoFerramentas = {
  schema: 1,
  appMinimo: '0.3.0',
  plataformas: {
    'win32-x64': { rotulo: 'Windows x64', suportado: true },
    'win32-ia32': { rotulo: '32 bits', suportado: false, motivo: 'use x64' }
  },
  python: {
    serie: '3.12',
    minVersaoApp: '0.3.0',
    repo: 'astral-sh/python-build-standalone',
    assetRegex: { x64: 'cpython-3\\.12\\.\\d+.*x86_64.*install_only\\.tar\\.gz$' },
    pacotes: ['edge-tts'],
    pacotesMinVersaoApp: '0.3.0'
  },
  ffmpeg: {
    minVersaoApp: '0.3.0',
    repo: 'BtbN/FFmpeg-Builds',
    tag: 'latest',
    assetRegex: { x64: 'ffmpeg-master-latest-win64-gpl\\.zip$' },
    urlFallback: {},
    filtrosObrigatorios: ['vidstabdetect']
  },
  pacotesPip: { minVersaoApp: '0.3.0', essenciais: ['edge-tts'], completos: [] }
}

describe('compat do provisionamento', () => {
  it('normaliza a chave de plataforma do Electron', () => {
    expect(chavePlataforma('win32', 'x64')).toBe('win32-x64')
    expect(chavePlataforma('win32', 'ia32')).toBe('win32-ia32')
    expect(chavePlataforma('win32', 'x32')).toBe('win32-ia32')
  })

  it('compara versões numéricas sem confundir com string', () => {
    expect(compararVersao('0.3.2', '0.3.10')).toBeLessThan(0)
    expect(compararVersao('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compararVersao('0.3.2', '0.3.2')).toBe(0)
    expect(compararVersao('0.4', '0.3.9')).toBeGreaterThan(0)
  })

  it('respeita a matriz de plataformas do manifesto', () => {
    expect(avaliarPlataforma(manifesto, 'win32-x64')).toEqual({ ok: true, rotulo: 'Windows x64', motivo: undefined })
    const ia32 = avaliarPlataforma(manifesto, 'win32-ia32')
    expect(ia32.ok).toBe(false)
    expect(ia32.motivo).toBe('use x64')
    expect(avaliarPlataforma(manifesto, 'linux-arm64').ok).toBe(false)
  })

  it('só libera componente quando o app atende a versão mínima', () => {
    expect(componenteCompativel('0.3.0', '0.3.0')).toBe(true)
    expect(componenteCompativel('0.3.2', '0.3.0')).toBe(true)
    expect(componenteCompativel('0.2.9', '0.3.0')).toBe(false)
    expect(componenteCompativel('0.10.0', '0.9.9')).toBe(true)
  })

  it('escolhe o asset da arquitetura com data mais recente', () => {
    const assets: AssetRemoto[] = [
      { name: 'ffmpeg-master-latest-win64-gpl.zip', browser_download_url: 'a', updated_at: '2026-10-01T00:00:00Z' },
      { name: 'ffmpeg-master-latest-win64-gpl.zip', browser_download_url: 'b', updated_at: '2026-11-10T00:00:00Z' },
      { name: 'ffmpeg-master-latest-winarm64-gpl.zip', browser_download_url: 'c', updated_at: '2026-12-01T00:00:00Z' }
    ]
    const escolhido = escolherAsset(assets, 'ffmpeg-master-latest-win64-gpl\\.zip$', 'x64')
    expect(escolhido?.browser_download_url).toBe('b')
    expect(escolherAsset(assets, 'cpython-.*\\.tar\\.gz$', 'x64')).toBeNull()
  })

  it('compara builds por data para decidir a atualização do ffmpeg', () => {
    expect(dataDoBuild('2026-11-13T12:00:00Z')).toBe('2026-11-13')
    expect(dataDoBuild(undefined)).toBe('')
    expect(precisaAtualizarBuild('2026-11-12', '2026-11-13')).toBe(true)
    expect(precisaAtualizarBuild('2026-11-13', '2026-11-13')).toBe(false)
    expect(precisaAtualizarBuild('2026-11-14', '2026-11-13')).toBe(false)
    expect(precisaAtualizarBuild(undefined, '2026-11-13')).toBe(true)
    expect(precisaAtualizarBuild('2026-11-13', '')).toBe(false)
  })
})

describe('manifesto embarcado', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'dg-manifesto-'))
    limparCacheManifesto()
  })

  afterEach(() => {
    limparCacheManifesto()
    delete process.env.DG_FERRAMENTAS_MANIFESTO
    rmSync(pasta, { recursive: true, force: true })
  })

  it('carrega resources/ferramentas.json do repositório e valida a matriz', () => {
    const m = carregarManifesto()
    expect(m.schema).toBe(1)
    expect(m.plataformas['win32-x64'].suportado).toBe(true)
    expect(m.ffmpeg.filtrosObrigatorios).toContain('loudnorm')
    expect(m.python.serie).toMatch(/^3\./)
    expect(m.python.pacotes.length).toBeGreaterThan(0)
  })

  it('respeita DG_FERRAMENTAS_MANIFESTO', () => {
    const p = join(pasta, 'ferramentas.json')
    writeFileSync(p, JSON.stringify({ ...manifesto, appMinimo: '9.9.9' }), 'utf8')
    process.env.DG_FERRAMENTAS_MANIFESTO = p
    expect(carregarManifesto().appMinimo).toBe('9.9.9')
  })
})
