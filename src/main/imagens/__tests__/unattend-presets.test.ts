import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  aplicarPreset,
  construirEiCfg,
  construirUnattend,
  criarPastaOverlay,
  escaparXml,
  gerarUnattend,
  idPreset,
  listarPresets,
  salvarPreset
} from '../personalizar'
import { sha256Imagem } from '../usb'

describe('autounattend.xml e ei.cfg', () => {
  it('gera XML com locale, EULA e nome do PC sanitizados', () => {
    const xml = construirUnattend({ locale: 'pt-BR', nomePc: 'DG-TESTE', edicao: 'Core' })
    expect(xml).toContain('<UILanguage>pt-BR</UILanguage>')
    expect(xml).toContain('<AcceptEula>true</AcceptEula>')
    expect(xml).toContain('<ComputerName>DG-TESTE</ComputerName>')
    expect(xml).toContain('<HideOnlineAccountScreens>true</HideOnlineAccountScreens>')
  })

  it('substitui valores inválidos por padrões seguros', () => {
    const xml = construirUnattend({ locale: 'xx', nomePc: '<script>alert(1)</script>', fusoHorario: '"><' })
    expect(xml).toContain('<UILanguage>pt-BR</UILanguage>')
    expect(xml).toContain('<ComputerName>DG-PC</ComputerName>')
    expect(xml).toContain('<TimeZone>E. South America Standard Time</TimeZone>')
    expect(xml).not.toContain('<script>')
  })

  it('escaparXml cobre os cinco caracteres reservados', () => {
    expect(escaparXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;')
  })

  it('ei.cfg respeita edição e canal Volume', () => {
    const cfg = construirEiCfg({ edicao: 'Enterprise', canal: 'Volume' })
    expect(cfg).toContain('[EditionID]\nEnterprise')
    expect(cfg).toContain('[Channel]\nVolume')
    expect(cfg).toContain('[VL]\n1')
  })
})

describe('gerarUnattend e presets', () => {
  let raiz = ''

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'dg-preset-'))
  })

  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true })
  })

  it('grava autounattend.xml e sources/ei.cfg no overlay', () => {
    const r = gerarUnattend(raiz, { edicao: 'Professional' })
    expect(r.ok).toBe(true)
    const overlay = criarPastaOverlay(raiz).caminho
    expect(existsSync(join(overlay, 'autounattend.xml'))).toBe(true)
    expect(existsSync(join(overlay, 'sources', 'ei.cfg'))).toBe(true)
    expect(Array.isArray(r.detalhes?.arquivos)).toBe(true)
  })

  it('salva, lista e aplica um preset com mesclagem', () => {
    const overlay = criarPastaOverlay(raiz).caminho
    writeFileSync(join(overlay, 'autounattend.xml'), construirUnattend({ nomePc: 'PC-A' }), 'utf8')
    mkdirSync(join(overlay, 'sources'), { recursive: true })
    writeFileSync(join(overlay, 'sources', 'ei.cfg'), construirEiCfg({ edicao: 'Core' }), 'utf8')

    const salvo = salvarPreset(raiz, 'Win 11 Pro')
    expect(salvo.ok).toBe(true)
    const lista = listarPresets(raiz)
    expect(lista.ok).toBe(true)
    expect(lista.itens.map((i) => i.id)).toContain('win-11-pro')
    expect(lista.itens[0].arquivos).toBe(2)

    writeFileSync(join(overlay, 'autounattend.xml'), 'alterado', 'utf8')
    const aplicado = aplicarPreset(raiz, 'win-11-pro')
    expect(aplicado.ok).toBe(true)
    expect(readFileSync(join(overlay, 'autounattend.xml'), 'utf8')).toContain('PC-A')
    expect(existsSync(join(overlay, 'sources', 'ei.cfg'))).toBe(true)
  })

  it('recusa preset inexistente e nome vazio', () => {
    expect(aplicarPreset(raiz, 'nao-existe').ok).toBe(false)
    expect(salvarPreset(raiz, '   ').ok).toBe(false)
    expect(idPreset('')).toBeNull()
    expect(idPreset('ok-nome') as string).toBe('ok-nome')
  })

  it('salvar preset com overlay vazio falha com orientação', () => {
    criarPastaOverlay(raiz)
    const r = salvarPreset(raiz, 'vazio')
    expect(r.ok).toBe(false)
    expect(String(r.erro)).toMatch(/vazia/i)
  })
})

describe('sha256Imagem', () => {
  it('calcula o mesmo hash que o crypto em streaming', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'dg-hash-'))
    const arquivo = join(raiz, 'img.img')
    const dados = Buffer.alloc(300_000)
    for (let i = 0; i < dados.length; i++) dados[i] = i % 251
    writeFileSync(arquivo, dados)
    let progresso = 0
    const r = await sha256Imagem(arquivo, (lidos) => {
      progresso = lidos
    })
    rmSync(raiz, { recursive: true, force: true })
    expect(r.ok).toBe(true)
    expect(r.hash).toBe(createHash('sha256').update(dados).digest('hex'))
    expect(progresso).toBe(dados.length)
  })

  it('retorna erro para arquivo inexistente', async () => {
    const r = await sha256Imagem('nao-existe-xyz.img')
    expect(r.ok).toBe(false)
    expect(String(r.erro)).toMatch(/não encontrada/i)
  })
})
