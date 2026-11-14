import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analisarBruto, analisarImagem, analisarIso, marcasConhecidas, normalizarRotulo } from '../iso'

const SETOR = 2048
const BASE_DIR = 22

type Arvore = { [nome: string]: Arvore | null }

function registroDir(nome: string, lba: number, tamanho: number, pasta: boolean): Buffer {
  const nomeBruto = Buffer.from(pasta ? nome : nome + ';1', 'latin1')
  const tam = 33 + nomeBruto.length + ((33 + nomeBruto.length) % 2 === 0 ? 0 : 1)
  const b = Buffer.alloc(tam)
  b[0] = tam
  b.writeUInt32LE(lba, 2)
  b.writeUInt32BE(lba, 6)
  b.writeUInt32LE(tamanho, 10)
  b.writeUInt32BE(tamanho, 14)
  b[18] = 124
  b[19] = 1
  b[20] = 1
  b[25] = pasta ? 2 : 0
  b.writeUInt16LE(1, 28)
  b.writeUInt16BE(1, 30)
  b[32] = nomeBruto.length
  nomeBruto.copy(b, 33)
  return b
}

function especial(nome: 0 | 1, lba: number, pasta: boolean, tamanho = SETOR): Buffer {
  const b = Buffer.alloc(34)
  b[0] = 34
  b.writeUInt32LE(lba, 2)
  b.writeUInt32BE(lba, 6)
  b.writeUInt32LE(tamanho, 10)
  b.writeUInt32BE(tamanho, 14)
  b[25] = pasta ? 2 : 0
  b[28] = 1
  b[30] = 1
  b[32] = 1
  b[33] = nome
  return b
}

function extensao(registros: Buffer[]): Buffer {
  const buf = Buffer.alloc(SETOR)
  let off = 0
  for (const r of registros) {
    r.copy(buf, off)
    off += r.length
  }
  return buf
}

type OpcoesIso = {
  joliet?: boolean
  udf?: boolean
  boot?: { plataforma: number; bios: boolean; uefi: boolean; efiSetor?: 0 | 1 }
}

/** Monta uma ISO mínima em memória: PVD/SVD/UDF, El Torito e árvore de diretórios. */
function criarIso(rotulo: string, arvore: Arvore, opts: OpcoesIso = {}): Buffer {
  const dirs: { caminho: string; filhos: [string, boolean][] }[] = []
  const coletar = (caminho: string, no: Arvore): void => {
    const filhos: [string, boolean][] = []
    for (const [nome, valor] of Object.entries(no)) filhos.push([nome, valor !== null])
    dirs.push({ caminho, filhos })
    for (const [nome, valor] of Object.entries(no)) if (valor !== null) coletar(caminho + '/' + nome, valor)
  }
  coletar('', arvore)
  const lbaDe = new Map<string, number>()
  dirs.forEach((d, i) => lbaDe.set(d.caminho, BASE_DIR + i))

  const totalSetores = Math.max(BASE_DIR + dirs.length, 22) + 2
  const img = Buffer.alloc(totalSetores * SETOR)

  const pvd = Buffer.alloc(SETOR)
  pvd[0] = 1
  pvd.write('CD001', 1, 'latin1')
  pvd[6] = 1
  pvd.write('DGEDIT', 8, 'latin1')
  pvd.write(rotulo, 40, 'latin1')
  pvd.writeUInt32LE(totalSetores, 80)
  pvd.writeUInt32BE(totalSetores, 84)
  pvd.writeUInt16LE(1, 120)
  pvd.writeUInt16BE(1, 122)
  pvd.writeUInt16LE(1, 124)
  pvd.writeUInt16BE(1, 126)
  pvd.writeUInt16LE(SETOR, 128)
  pvd.writeUInt16BE(SETOR, 130)
  const lbaRaiz = lbaDe.get('') ?? BASE_DIR
  especial(0, lbaRaiz, true).copy(pvd, 156)
  pvd.copy(img, 16 * SETOR)

  let descritor = 17
  let catalogoLba = 0
  if (opts.boot) {
    const br = Buffer.alloc(SETOR)
    br[0] = 0
    br.write('CD001', 1, 'latin1')
    br[6] = 1
    br.write('EL TORITO SPECIFICATION', 7, 'latin1')
    catalogoLba = 21
    br.writeUInt32LE(catalogoLba, 71)
    br.copy(img, descritor * SETOR)
    descritor++

    const cat = Buffer.alloc(SETOR)
    cat[0] = 1
    cat[1] = opts.boot.plataforma
    cat.write('DG', 4, 'latin1')
    cat[30] = 0x55
    cat[31] = 0xaa
    let off = 32
    if (opts.boot.bios) {
      cat[off] = 0x88
      cat[off + 1] = opts.boot.efiSetor ?? 0
      off += 32
    }
    if (opts.boot.uefi) {
      cat[off] = 0x91
      cat[off + 1] = 0xef
      cat.writeUInt16LE(1, off + 2)
      off += 32
      cat[off] = 0x88
      cat[off + 1] = 0
    }
    cat.copy(img, catalogoLba * SETOR)
  }
  if (opts.joliet) {
    const svd = Buffer.alloc(SETOR)
    svd[0] = 2
    svd.write('CD001', 1, 'latin1')
    svd[6] = 1
    svd.write('%/E', 88, 'latin1')
    especial(0, lbaRaiz, true).copy(svd, 156)
    svd.copy(img, descritor * SETOR)
    descritor++
  }
  if (opts.udf) {
    const udf = Buffer.alloc(SETOR)
    udf[0] = 0
    udf.write('BEA01', 1, 'latin1')
    udf.copy(img, descritor * SETOR)
    descritor++
  }
  const fim = Buffer.alloc(SETOR)
  fim[0] = 255
  fim.write('CD001', 1, 'latin1')
  fim[6] = 1
  fim.copy(img, descritor * SETOR)

  dirs.forEach((d) => {
    const lba = lbaDe.get(d.caminho) as number
    const pai = d.caminho.includes('/') ? d.caminho.slice(0, d.caminho.lastIndexOf('/')) : ''
    const registros: Buffer[] = [especial(0, lba, true), especial(1, lbaDe.get(pai) ?? lba, true)]
    for (const [nome, pasta] of d.filhos) {
      const filho = d.caminho + '/' + nome
      if (pasta) registros.push(registroDir(nome, lbaDe.get(filho) as number, SETOR, true))
      else registros.push(registroDir(nome, 0, 0, false))
    }
    extensao(registros).copy(img, lba * SETOR)
  })
  return img
}

let dir = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dg-iso-test-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function gravar(nome: string, bytes: Buffer): string {
  const p = join(dir, nome)
  writeFileSync(p, bytes)
  return p
}

describe('normalizarRotulo', () => {
  it('remove nulos, compacta espaços e apara', () => {
    const bruto = Buffer.from('  WIN11   X64\u0000\u0000\u0000  ', 'latin1')
    expect(normalizarRotulo(bruto)).toBe('WIN11 X64')
  })
})

describe('analisarIso', () => {
  it('identifica ISO de Windows com boot BIOS + UEFI', () => {
    const img = criarIso(
      'WIN11_X64',
      {
        bootmgr: null,
        'setup.exe': null,
        sources: { 'install.wim': null },
        efi: { microsoft: { boot: { 'bootmgfw.efi': null } }, boot: { 'bootx64.efi': null } }
      },
      { joliet: true, udf: true, boot: { plataforma: 0, bios: true, uefi: true, efiSetor: 0 } }
    )
    const caminho = gravar('win11.iso', img)
    const r = analisarIso(caminho)
    expect(r.ok).toBe(true)
    expect(r.formato).toBe('iso')
    expect(r.rotulo).toBe('WIN11_X64')
    expect(r.sistema).toBe('windows')
    expect(r.distro).toBe('Windows 11')
    expect(r.boot.eltorito).toBe(true)
    expect(r.boot.bios).toBe(true)
    expect(r.boot.uefi).toBe(true)
    expect(r.iso?.joliet).toBe(true)
    expect(r.iso?.udf).toBe(true)
    expect(r.iso?.raiz.map((i) => i.nome)).toEqual(expect.arrayContaining(['bootmgr', 'sources', 'efi']))
    expect(r.iso?.raiz.find((i) => i.nome === 'sources')?.pasta).toBe(true)
    expect(r.bytes).toBe(img.length)
    expect(r.erro).toBeUndefined()
  })

  it('identifica ISO Linux (Ubuntu) com El Torito BIOS', () => {
    const img = criarIso(
      'UBUNTU_24_04',
      {
        isolinux: { 'isolinux.bin': null },
        casper: { 'filesystem.squashfs': null },
        efi: { boot: { 'bootx64.efi': null } }
      },
      { boot: { plataforma: 0, bios: true, uefi: false } }
    )
    const r = analisarIso(gravar('ubuntu.iso', img))
    expect(r.ok).toBe(true)
    expect(r.sistema).toBe('linux')
    expect(r.distro).toBe('Ubuntu')
    expect(r.boot.bios).toBe(true)
    expect(r.boot.uefi).toBe(true) // efi/boot/bootx64.efi
    expect(r.iso?.joliet).toBe(false)
    expect(r.iso?.udf).toBe(false)
  })

  it('recusa arquivo sem ISO 9660', () => {
    const r = analisarIso(gravar('vazio.iso', Buffer.alloc(128 * SETOR)))
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/ISO 9660/)
  })

  it('aponta arquivo inexistente', () => {
    const r = analisarIso(join(dir, 'nao-existe.iso'))
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/inacessível/)
  })
})

describe('analisarImagem', () => {
  it('analisa DMG pelo trailer koly', () => {
    const dmg = Buffer.alloc(8192)
    const trailer = Buffer.alloc(512)
    trailer.write('koly', 0, 'latin1')
    trailer.write('<key>name</key><string>Install macOS Sonoma</string>', 64, 'latin1')
    trailer.copy(dmg, dmg.length - 512)
    const r = analisarImagem(gravar('mac.dmg', dmg))
    expect(r.ok).toBe(true)
    expect(r.formato).toBe('dmg')
    expect(r.sistema).toBe('macos')
    expect(r.rotulo).toBe('Install macOS Sonoma')
  })

  it('detecta FAT32/rotulo em IMG bruto', () => {
    const img = Buffer.alloc(64 * 1024)
    img.write('MSWIN4.1', 3, 'latin1')
    img.write('FAT32   ', 82, 'latin1')
    img.write('PENDRIVE   ', 71, 'latin1')
    img[510] = 0x55
    img[511] = 0xaa
    const r = analisarImagem(gravar('pendrive.img', img))
    expect(r.ok).toBe(true)
    expect(r.formato).toBe('img')
    expect(r.boot.mbr).toBe(true)
    expect(r.rotulo).toBe('PENDRIVE')
    expect(r.avisos.join(' ')).toMatch(/FAT32/)
  })

  it('informa erro para caminho inexistente', () => {
    const r = analisarImagem(join(dir, 'nada.iso'))
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/não encontrado/)
  })

  it('analisarBruto aceita imagem vazia', () => {
    const r = analisarBruto(gravar('zero.img', Buffer.alloc(SETOR)))
    expect(r.ok).toBe(true)
    expect(statSync(r.caminho).size).toBe(SETOR)
  })
})

describe('marcasConhecidas', () => {
  it('lista marcas por sistema', () => {
    expect(marcasConhecidas('windows')).toContain('sources/install.wim')
    expect(marcasConhecidas('linux')).toContain('casper/filesystem.squashfs')
    expect(marcasConhecidas('macos')).toContain('BaseSystem.dmg')
    expect(marcasConhecidas('desconhecido')).toEqual([])
  })
})
