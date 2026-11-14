import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  analisarArquivo,
  detectarTipoArquivo,
  entropia,
  extrairAsar,
  extrairStrings,
  lerCabecalhoAsar,
  lerArquivoAsar,
  salvarRelatorioReversa,
  slugAlvo
} from '../index'

/** Monta um ASAR sintético compatível com o parser (pickle + JSON + dados). */
export function montarAsar(arquivos: Record<string, string>): Buffer {
  const mapa: Record<string, { size: number; offset: string }> = {}
  const dados: Buffer[] = []
  let offset = 0
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const b = Buffer.from(conteudo, 'utf8')
    mapa[nome] = { size: b.length, offset: String(offset) }
    dados.push(b)
    offset += b.length
  }
  const json = Buffer.from(JSON.stringify({ files: mapa }), 'utf8')
  const base = 12 + json.length
  const pad = (4 - (base % 4)) % 4
  const head = Buffer.alloc(base + pad)
  head.writeUInt32LE(4, 0)
  head.writeUInt32LE(json.length + 4, 4)
  head.writeUInt32LE(json.length, 8)
  json.copy(head, 12)
  return Buffer.concat([head, ...dados])
}

let raiz = ''

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'dg-reversa-'))
})

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true })
})

describe('reversa (inspirado no REA)', () => {
  it('slug seguro para nome de pasta', () => {
    expect(slugAlvo('Meu App (v2).exe')).toBe('meu-app-v2-exe')
    expect(slugAlvo('')).toBe('alvo')
  })

  it('detecta assinaturas PE, ELF e ASAR', () => {
    const pe = Buffer.from([0x4d, 0x5a, 0x90, 0x00])
    expect(detectarTipoArquivo(pe, 'a.exe')).toBe('pe')
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1])
    expect(detectarTipoArquivo(elf, 'a.so')).toBe('elf')
    expect(detectarTipoArquivo(Buffer.from('x'), 'app.asar')).toBe('electron-asar')
    expect(detectarTipoArquivo(Buffer.from('x'), 'main.js')).toBe('javascript')
  })

  it('entropia distingue dados repetidos de aleatórios', () => {
    expect(entropia(Buffer.alloc(0))).toBe(0)
    expect(entropia(Buffer.from('aaaaaaaaaaaaaaaa'))).toBe(0)
    const aleatorio = Buffer.alloc(2048)
    for (let i = 0; i < aleatorio.length; i++) aleatorio[i] = i % 256
    expect(entropia(aleatorio)).toBeGreaterThan(7)
  })

  it('extrai strings categorizadas e ignora curtas', () => {
    const buf = Buffer.from(
      'abc\0contato@exemplo.com\0https://exemplo.com/api\0C:\\Users\\digo\\app.exe\0' +
        'HKEY_CURRENT_USER\\Software\0segredo-de-teste-123\0',
      'latin1'
    )
    const strings = extrairStrings(buf, 5)
    const tipos = new Set(strings.map((s) => s.tipo))
    expect(strings.some((s) => s.valor === 'contato@exemplo.com')).toBe(true)
    expect(strings.some((s) => s.valor === 'https://exemplo.com/api')).toBe(true)
    expect(tipos.has('email')).toBe(true)
    expect(tipos.has('url')).toBe(true)
    expect(strings.some((s) => s.valor === 'abc')).toBe(false)
  })

  it('lê cabeçalho ASAR, arquivo interno e extrai para o projeto', () => {
    const asar = montarAsar({
      'package.json': JSON.stringify({ name: 'demo', version: '1.2.3', main: 'main.js', dependencies: { electron: '33' } }),
      'main.js': "ipcMain.handle('demo:salvar', () => 1)\nipcRenderer.invoke('demo:ler')"
    })
    const info = lerCabecalhoAsar(asar)
    expect(info).not.toBeNull()
    expect(info?.arquivos.map((a) => a.caminho).sort()).toEqual(['main.js', 'package.json'])
    expect(info?.packageJson?.name).toBe('demo')
    const main = lerArquivoAsar(asar, info!, 'main.js')
    expect(main?.toString('utf8')).toContain("ipcMain.handle('demo:salvar'")

    const arquivo = join(raiz, 'app.asar')
    writeFileSync(arquivo, asar)
    const r = extrairAsar(raiz, arquivo)
    expect(r.ok).toBe(true)
    expect(r.arquivos).toBe(2)
    expect(existsSync(join(raiz, '.dg-editor', 'reversa', 'app', 'asar', 'package.json'))).toBe(true)
    expect(readFileSync(join(raiz, '.dg-editor', 'reversa', 'app', 'asar', 'main.js'), 'utf8')).toContain('demo:ler')
  })

  it('analisa JavaScript e registra canais IPC como evidência', () => {
    const arquivo = join(raiz, 'preload.js')
    writeFileSync(
      arquivo,
      "const { ipcMain } = require('electron')\nipcMain.handle('teste:acao', () => 42)\nfetch('https://exemplo.com/api')\n"
    )
    const r = analisarArquivo(arquivo)
    expect(r.ok).toBe(true)
    expect(r.tipo).toBe('javascript')
    expect(r.evidencias.some((e) => e.tipo === 'canal IPC' && e.valor === 'teste:acao')).toBe(true)
    expect(r.evidencias.some((e) => e.tipo === 'url')).toBe(true)
    expect(r.relatorio).toContain('Limitações')
  })

  it('salva relatório dentro do projeto em .dg-editor/reversa', async () => {
    const arquivo = join(raiz, 'alvo.js')
    writeFileSync(arquivo, "ipcMain.handle('x', () => 1)")
    const r = analisarArquivo(arquivo)
    const salvo = await salvarRelatorioReversa(raiz, r)
    expect(salvo.ok).toBe(true)
    expect(salvo.caminhoRel?.startsWith('.dg-editor/reversa/')).toBe(true)
    expect(existsSync(salvo.caminho!)).toBe(true)
    expect(readFileSync(salvo.caminho!, 'utf8')).toContain('Relatório de engenharia reversa')
  })
})
