import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  confirmacaoConfere,
  gravarEmUsb,
  gravarFluxo,
  limparSerial,
  tokenConfirmacao,
  validarGravacao,
  type ProgressoGravacao,
  type UnidadeUsb
} from '../usb'

function unidade(sobrescrever: Partial<UnidadeUsb> = {}): UnidadeUsb {
  return {
    disco: 7,
    nome: 'SanDisk Cruzer',
    serial: '4C530001120101116292',
    token: '4C530001120101116292',
    tamanhoBytes: 16 * 1024 * 1024 * 1024,
    bus: 'USB',
    sistema: false,
    boot: false,
    volumes: ['E', 'F'],
    podeGravar: true,
    ...sobrescrever
  }
}

let dir = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dg-usb-test-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('limparSerial', () => {
  it('mantém apenas alfanuméricos e hífen, em maiúsculas', () => {
    expect(limparSerial('  ab.cd_12-9 ')).toBe('ABCD12-9')
    expect(limparSerial('4C53\u0000 0001')).toBe('4C530001')
    expect(limparSerial('')).toBe('')
  })
})

describe('tokenConfirmacao', () => {
  it('usa o serial limpo quando tem 4+ caracteres', () => {
    expect(tokenConfirmacao('4C53 00-11', 7)).toBe('4C5300-11')
    expect(tokenConfirmacao('ab-cd', 2)).toBe('AB-CD')
  })

  it('cai para APAGAR-<disco> quando não há serial útil', () => {
    expect(tokenConfirmacao('', 3)).toBe('APAGAR-3')
    expect(tokenConfirmacao('ab', 12)).toBe('APAGAR-12')
  })
})

describe('validarGravacao', () => {
  it('libera uma unidade removível que comporta a imagem', () => {
    expect(validarGravacao(unidade(), 4 * 1024 * 1024 * 1024)).toBeNull()
  })

  it('recusa destino ausente', () => {
    expect(validarGravacao(undefined, 1000)).toMatch(/selecione/)
  })

  it('recusa disco do sistema ou de boot mesmo que reporte USB', () => {
    expect(validarGravacao(unidade({ sistema: true }), 1000)).toMatch(/disco do sistema/)
    expect(validarGravacao(unidade({ boot: true }), 1000)).toMatch(/disco do sistema/)
  })

  it('recusa barramento não removível', () => {
    expect(validarGravacao(unidade({ bus: 'NVMe' }), 1000)).toMatch(/removível/)
    expect(validarGravacao(unidade({ bus: 'SCSI' }), 1000)).toMatch(/removível/)
  })

  it('recusa unidade sem mídia, imagem vazia ou imagem maior que a unidade', () => {
    expect(validarGravacao(unidade({ tamanhoBytes: 0 }), 1000)).toMatch(/sem mídia/)
    expect(validarGravacao(unidade(), 0)).toMatch(/imagem vazia/)
    expect(validarGravacao(unidade({ tamanhoBytes: 1024 }), 2048)).toMatch(/não cabe/)
  })
})

describe('confirmacaoConfere', () => {
  it('compara sem diferenciar caixa e espaços', () => {
    const u = unidade({ token: 'AB12-CD34' })
    expect(confirmacaoConfere(u, ' ab12-cd34 ')).toBe(true)
    expect(confirmacaoConfere(u, 'AB12CD34')).toBe(false)
  })
})

describe('gravarEmUsb — guardrails antes de qualquer escrita', () => {
  it('recusa confirmação errada sem chamar o PowerShell', async () => {
    const r = await gravarEmUsb(unidade(), { imagem: join(dir, 'nao-existe.iso'), confirmacao: 'X' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/não encontrada/)
  })

  it('recusa o disco do sistema mesmo com confirmação correta', async () => {
    const img = join(dir, 'fake.iso')
    writeFileSync(img, Buffer.alloc(1024))
    const alvo = unidade({ sistema: true, token: 'SISTEMA' })
    const r = await gravarEmUsb(alvo, { imagem: img, confirmacao: 'SISTEMA' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/disco do sistema/)
  })

  it('exige o token exato e não altera nada', async () => {
    const img = join(dir, 'fake2.iso')
    writeFileSync(img, Buffer.alloc(1024))
    const r = await gravarEmUsb(unidade(), { imagem: img, confirmacao: 'token-errado' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/confirmação incorreta/)
  })
})

const soWindows = process.platform === 'win32'

describe.skipIf(!soWindows)('gravarFluxo (integração com arquivo de destino)', () => {
  it('copia bytes idênticos e verifica a leitura de volta', async () => {
    const origem = join(dir, 'imagem.img')
    const destino = join(dir, 'saida.img')
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 1234)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff
    writeFileSync(origem, bytes)
    const eventos: ProgressoGravacao[] = []
    const r = await gravarFluxo(origem, destino, { verificar: true }, (p) => eventos.push(p))
    expect(r.ok).toBe(true)
    expect(r.bytes).toBe(bytes.length)
    const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
    expect(hash(destino)).toBe(hash(origem))
    expect(eventos.length).toBeGreaterThan(0)
    const final = eventos.filter((e) => e.etapa === 'gravando').pop()
    expect(final?.escritos).toBe(bytes.length)
    expect(final?.total).toBe(bytes.length)
    expect(eventos.some((e) => e.etapa === 'verificando')).toBe(true)
  }, 120_000)

  it('funciona sem verificação e com imagens menores que um bloco', async () => {
    const origem = join(dir, 'mini.img')
    const destino = join(dir, 'mini-saida.img')
    writeFileSync(origem, Buffer.from('DG-EDITOR'))
    const r = await gravarFluxo(origem, destino, { verificar: false })
    expect(r.ok).toBe(true)
    expect(readFileSync(destino).toString()).toBe('DG-EDITOR')
  }, 120_000)
})
