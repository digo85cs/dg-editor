/**
 * Análise de imagens de instalação (ISO/IMG/DMG) — Windows, Linux e macOS.
 *
 * Parser próprio de ISO 9660 + Joliet + El Torito: não depende de ferramentas
 * externas para identificar rótulo, tamanho, sistema, modo de boot e conteúdo
 * da raiz. Somente leitura; nada aqui grava na imagem.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'

const SETOR = 2048

export type SistemaImagem = 'windows' | 'linux' | 'macos' | 'desconhecido'

export type ItemIso = { nome: string; pasta: boolean; bytes: number }

export type BootImagem = { bios: boolean; uefi: boolean; eltorito: boolean; hfs: boolean; mbr: boolean; gpt: boolean }

export type AnaliseImagem = {
  ok: boolean
  erro?: string
  caminho: string
  bytes: number
  formato: 'iso' | 'img' | 'dmg' | 'desconhecido'
  rotulo: string
  sistema: SistemaImagem
  distro?: string
  boot: BootImagem
  iso?: {
    volumeId: string
    systemId: string
    iso9660: boolean
    joliet: boolean
    udf: boolean
    raiz: ItemIso[]
    truncado: boolean
  }
  avisos: string[]
}

type RegistroDir = { lba: number; tamanho: number; flags: number; nome: string }

function lerSetor(fd: number, lba: number, setores = 1): Buffer {
  const buf = Buffer.alloc(SETOR * setores)
  readSync(fd, buf, 0, buf.length, lba * SETOR)
  return buf
}

function lerRegistro(buf: Buffer, off: number): { rec: RegistroDir; proximo: number } | null {
  if (off + 33 > buf.length) return null
  const tam = buf[off]
  if (tam === 0) return null
  if (off + tam > buf.length || tam < 33) return null
  const lba = buf.readUInt32LE(off + 2)
  const tamanho = buf.readUInt32LE(off + 10)
  const flags = buf[off + 25]
  const nomeLen = buf[off + 32]
  if (nomeLen === 0 || off + 33 + nomeLen > buf.length) return null
  const bruto = buf.subarray(off + 33, off + 33 + nomeLen)
  let nome = ''
  if (nomeLen === 1 && (bruto[0] === 0 || bruto[0] === 1)) {
    nome = bruto[0] === 0 ? '.' : '..'
  } else {
    nome = bruto.toString('latin1').replace(/;\d+$/, '')
  }
  return { rec: { lba, tamanho, flags, nome }, proximo: off + tam }
}

function listarDiretorio(fd: number, rec: RegistroDir): RegistroDir[] {
  const limite = Math.min(rec.tamanho, 256 * 1024)
  const setores = Math.max(1, Math.ceil(limite / SETOR))
  let buf: Buffer
  try {
    buf = lerSetor(fd, rec.lba, setores)
  } catch {
    return []
  }
  const itens: RegistroDir[] = []
  let off = 0
  while (off < buf.length) {
    const lido = lerRegistro(buf, off)
    if (!lido) {
      const proximoSetor = (Math.floor(off / SETOR) + 1) * SETOR
      if (proximoSetor <= off) break
      off = proximoSetor
      continue
    }
    if (lido.rec.nome !== '.' && lido.rec.nome !== '..') itens.push(lido.rec)
    off = lido.proximo
  }
  return itens
}

function construirAnaliseBase(caminho: string): AnaliseImagem {
  return {
    ok: false,
    caminho,
    bytes: 0,
    formato: 'desconhecido',
    rotulo: '',
    sistema: 'desconhecido',
    boot: { bios: false, uefi: false, eltorito: false, hfs: false, mbr: false, gpt: false },
    avisos: []
  }
}

export function normalizarRotulo(bruto: Buffer): string {
  return bruto.toString('latin1').replace(/\0/g, ' ').trim().replace(/\s+/g, ' ')
}

/** Lê os descritores de volume ISO 9660 (setores 16..) e o catálogo El Torito. */
export function analisarIso(caminho: string): AnaliseImagem {
  const res = construirAnaliseBase(caminho)
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(caminho)
  } catch {
    res.erro = 'arquivo inacessível: ' + caminho
    return res
  }
  res.bytes = st.size
  res.formato = 'iso'

  let fd: number
  try {
    fd = openSync(caminho, 'r')
  } catch (e) {
    res.erro = 'não foi possível abrir a imagem: ' + String(e instanceof Error ? e.message : e)
    return res
  }
  try {
    const cabecalho = lerSetor(fd, 16, 48)
    let pvd: Buffer | null = null
    let svd: Buffer | null = null
    let udf = false
    let bootCatLba = 0
    for (let i = 0; i < 48; i++) {
      const off = i * SETOR
      if (off + 7 > cabecalho.length) break
      const tipo = cabecalho[off]
      const id = cabecalho.toString('latin1', off + 1, off + 6)
      if (id !== 'CD001' && id !== 'BEA01' && id !== 'NSR02' && id !== 'NSR03') continue
      if (id === 'BEA01' || id === 'NSR02' || id === 'NSR03') udf = true
      if (id === 'CD001' && tipo === 1 && !pvd) pvd = cabecalho.subarray(off, off + SETOR)
      if (id === 'CD001' && tipo === 2 && !svd) svd = cabecalho.subarray(off, off + SETOR)
      if (id === 'CD001' && tipo === 0) {
        const sistemaBoot = cabecalho.toString('latin1', off + 7, off + 39)
        if (/EL TORITO/i.test(sistemaBoot)) bootCatLba = cabecalho.readUInt32LE(off + 71)
      }
    }
    if (!pvd) {
      res.erro = 'a imagem não possui sistema de arquivos ISO 9660' + (udf ? ' (apenas UDF)' : '')
      return res
    }
    const volumeId = normalizarRotulo(pvd.subarray(40, 72))
    const systemId = normalizarRotulo(pvd.subarray(8, 40))
    res.rotulo = volumeId
    const rootLido = lerRegistro(pvd, 156)
    const raiz: RegistroDir[] = rootLido ? listarDiretorio(fd, rootLido.rec) : []
    const cache = new Map<number, RegistroDir[]>()
    const listar = (rec: RegistroDir): RegistroDir[] => {
      const atual = cache.get(rec.lba)
      if (atual) return atual
      const lista = listarDiretorio(fd, rec)
      cache.set(rec.lba, lista)
      return lista
    }
    const achar = (partes: string[]): RegistroDir | null => {
      if (!rootLido) return null
      let atual: RegistroDir | null = rootLido.rec
      for (const parte of partes) {
        if (!atual) return null
        const alvo = parte.toLowerCase()
        const achado: RegistroDir | undefined = listar(atual).find((r) => r.nome.toLowerCase() === alvo)
        if (!achado) return null
        atual = achado
      }
      return atual
    }
    const existe = (partes: string[]): boolean => {
      const rec = achar(partes)
      return !!rec && (rec.flags & 0x02) === 0
    }

    let bios = false
    let uefiBoot = false
    if (bootCatLba > 0) {
      try {
        const cat = lerSetor(fd, bootCatLba)
        const plataformaValidacao = cat[1]
        let off = 32
        let seguranca = 0
        while (off + 32 <= cat.length && seguranca++ < 64) {
          const b0 = cat[off]
          if (b0 === 0x90 || b0 === 0x91) {
            const plataforma = cat[off + 1]
            const quantidade = cat.readUInt16LE(off + 2)
            off += 32
            for (let i = 0; i < quantidade && off + 32 <= cat.length; i++) {
              if (cat[off] === 0x88) {
                if (plataforma === 0xef) uefiBoot = true
                else bios = true
              }
              off += 32
            }
            continue
          }
          if (b0 === 0x88) {
            if (plataformaValidacao === 0xef) uefiBoot = true
            else bios = true
            off += 32
            continue
          }
          break
        }
        res.boot.eltorito = true
      } catch {
        res.avisos.push('catálogo El Torito ilegível')
      }
    }

    const marcasWindows = [
      ['sources', 'install.wim'],
      ['sources', 'install.esd'],
      ['bootmgr'],
      ['efi', 'microsoft', 'boot', 'bootmgfw.efi'],
      ['setup.exe']
    ]
    const marcasLinux = [
      ['isolinux', 'isolinux.bin'],
      ['casper', 'filesystem.squashfs'],
      ['live', 'filesystem.squashfs'],
      ['efi', 'boot', 'grubx64.efi'],
      ['images', 'pxeboot', 'vmlinuz'],
      ['arch', 'boot', 'x86_64', 'vmlinuz'],
      ['boot', 'grub2', 'grub.cfg'],
      ['boot', 'grub', 'grub.cfg']
    ]
    const marcasMac = [
      ['system', 'installation'],
      ['basesystem.dmg'],
      ['boot.efi'],
      ['installassistant.pkg']
    ]
    const pontuar = (marcas: string[][]): number => marcas.reduce((n, m) => n + (existe(m) ? 1 : 0), 0)
    const pWin = pontuar(marcasWindows)
    const pLinux = pontuar(marcasLinux)
    const pMac = pontuar(marcasMac)

    let hfs = false
    try {
      const hdr = Buffer.alloc(4)
      readSync(fd, hdr, 0, 4, 1024)
      const sig = hdr.toString('latin1', 0, 2)
      hfs = sig === 'H+' || sig === 'HX' || sig === 'BD'
    } catch {
      hfs = false
    }
    if (hfs) res.boot.hfs = true

    let mbr = false
    let gpt = false
    try {
      const setor0 = lerSetor(fd, 0, 2)
      mbr = setor0[510] === 0x55 && setor0[511] === 0xaa
      gpt = setor0.toString('latin1', 512, 520) === 'EFI PART'
    } catch {
      /* imagem menor que 2 setores */
    }
    res.boot.mbr = mbr
    res.boot.gpt = gpt

    if (existe(['efi', 'boot', 'bootx64.efi']) || existe(['efi', 'boot', 'bootaa64.efi'])) uefiBoot = true
    res.boot.bios = bios
    res.boot.uefi = uefiBoot

    const raizItens: ItemIso[] = raiz
      .map((r) => ({ nome: r.nome, pasta: (r.flags & 0x02) !== 0, bytes: r.tamanho }))
      .sort((a, b) => Number(b.pasta) - Number(a.pasta) || a.nome.localeCompare(b.nome))
      .slice(0, 80)

    let sistema: SistemaImagem = 'desconhecido'
    const rotuloMin = volumeId.toLowerCase()
    if (pMac > 0 || hfs || /mac ?os|os ?x/.test(rotuloMin)) sistema = 'macos'
    else if (pWin > 0 || /windows|win ?(7|8|10|11)|server/.test(rotuloMin)) sistema = 'windows'
    else if (pLinux > 0) sistema = 'linux'

    res.iso = {
      volumeId,
      systemId,
      iso9660: true,
      joliet: !!svd,
      udf,
      raiz: raizItens,
      truncado: raiz.length > raizItens.length
    }
    res.sistema = sistema
    res.distro = detectarDistro(rotuloMin, sistema, { pWin, pLinux, pMac })
    res.ok = true
    return res
  } catch (e) {
    res.erro = 'falha ao analisar a imagem: ' + String(e instanceof Error ? e.message : e)
    return res
  } finally {
    closeSync(fd)
  }
}

function detectarDistro(rotulo: string, sistema: SistemaImagem, marcas: { pWin: number; pLinux: number; pMac: number }): string | undefined {
  if (sistema === 'windows') {
    if (/server/.test(rotulo)) return 'Windows Server'
    const m = rotulo.match(/win(?:dows)?[\s_-]*(11|10|8\.1|8|7)(?![0-9])/)
    if (m) return 'Windows ' + m[1]
    if (marcas.pWin > 0) return 'Windows'
    return undefined
  }
  if (sistema === 'macos') return 'macOS'
  if (sistema === 'linux') {
    const tabela: [RegExp, string][] = [
      [/ubuntu|kubuntu|xubuntu|lubuntu/, 'Ubuntu'],
      [/debian/, 'Debian'],
      [/fedora/, 'Fedora'],
      [/linux ?mint|mint/, 'Linux Mint'],
      [/arch/, 'Arch Linux'],
      [/manjaro/, 'Manjaro'],
      [/opensuse|tumbleweed|leap/, 'openSUSE'],
      [/alpine/, 'Alpine'],
      [/centos/, 'CentOS'],
      [/rocky/, 'Rocky Linux'],
      [/alma/, 'AlmaLinux'],
      [/zorin/, 'Zorin OS'],
      [/pop!?_?os/, 'Pop!_OS'],
      [/kali/, 'Kali Linux'],
      [/raspberry|raspios/, 'Raspberry Pi OS'],
      [/android|lineage/, 'Android']
    ]
    for (const [re, nome] of tabela) if (re.test(rotulo)) return nome
    return 'Linux'
  }
  return undefined
}

function analisarDmg(caminho: string, res: AnaliseImagem, fd: number): void {
  res.formato = 'dmg'
  const st = statSync(caminho)
  res.bytes = st.size
  try {
    const fim = Math.max(0, st.size - 512)
    const buf = Buffer.alloc(512)
    readSync(fd, buf, 0, 512, fim)
    if (buf.toString('latin1', 0, 4) === 'koly') {
      res.sistema = 'macos'
      res.distro = 'macOS'
      res.rotulo = lerRotuloDmgPlists(buf) || res.rotulo
      res.ok = true
      return
    }
  } catch {
    /* segue para o conteúdo bruto */
  }
  res.erro = 'imagem DMG sem trailer koly reconhecível'
}

function lerRotuloDmgPlists(trailer: Buffer): string {
  const txt = trailer.toString('latin1')
  const m = txt.match(/<key>name<\/key>\s*<string>([^<]{1,80})<\/string>/)
  return m ? m[1].trim() : ''
}

export function analisarImagem(caminho: string): AnaliseImagem {
  const ext = caminho.toLowerCase().slice(caminho.lastIndexOf('.'))
  if (!existsSync(caminho)) {
    const res = construirAnaliseBase(caminho)
    res.erro = 'arquivo não encontrado: ' + caminho
    return res
  }
  if (ext === '.dmg') {
    const res = construirAnaliseBase(caminho)
    let fd = -1
    try {
      fd = openSync(caminho, 'r')
      analisarDmg(caminho, res, fd)
    } catch (e) {
      res.erro = String(e instanceof Error ? e.message : e)
    } finally {
      if (fd >= 0) closeSync(fd)
    }
    return res
  }
  const iso = analisarIso(caminho)
  if (iso.ok || (iso.erro && !/não possui sistema de arquivos ISO 9660/.test(iso.erro))) return iso
  if (ext === '.iso') {
    iso.erro = iso.erro || 'ISO sem descritor de volume reconhecível'
    return iso
  }
  return analisarBruto(caminho)
}

/** IMG/RAW: detecta MBR/GPT e sistemas de arquivos comuns sem interpretar conteúdo. */
export function analisarBruto(caminho: string): AnaliseImagem {
  const res = construirAnaliseBase(caminho)
  res.formato = 'img'
  let fd = -1
  try {
    const st = statSync(caminho)
    res.bytes = st.size
    fd = openSync(caminho, 'r')
    const buf = lerSetor(fd, 0, 2)
    res.boot.mbr = buf[510] === 0x55 && buf[511] === 0xaa
    res.boot.gpt = buf.toString('latin1', 512, 520) === 'EFI PART'
    const fat32 = buf.toString('latin1', 82, 87) === 'FAT32'
    const ntfs = buf.toString('latin1', 3, 11) === 'NTFS    '
    if (fat32 || ntfs) res.avisos.push('sistema de arquivos ' + (fat32 ? 'FAT32' : 'NTFS') + ' detectado no setor 0')
    if (fat32) res.rotulo = buf.toString('latin1', 71, 82).replace(/\s+/g, ' ').trim()
    res.sistema = 'desconhecido'
    res.ok = true
    if (res.boot.gpt) res.avisos.push('tabela GPT detectada — imagem de disco completo')
    return res
  } catch (e) {
    res.erro = String(e instanceof Error ? e.message : e)
    return res
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

/** Caminhos de arquivos que indicam o sistema de instalação (para exibir na UI). */
export function marcasConhecidas(sistema: SistemaImagem): string[] {
  if (sistema === 'windows') return ['sources/install.wim', 'sources/install.esd', 'bootmgr', 'efi/microsoft/boot/bootmgfw.efi', 'setup.exe']
  if (sistema === 'linux') return ['isolinux/isolinux.bin', 'casper/filesystem.squashfs', 'live/filesystem.squashfs', 'efi/boot/grubx64.efi']
  if (sistema === 'macos') return ['System/Installation', 'BaseSystem.dmg', 'boot.efi']
  return []
}
