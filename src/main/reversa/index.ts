/**
 * Engenharia reversa local (inspirado no REA, MIT): análise estática de
 * binários PE/ELF/Mach-O, apps Electron/ASAR, JAR/APK e páginas web.
 * 100% gratuito e offline (sem Hopper/IDA). Gera evidências + limitações.
 *
 * Uso autorizado: analise apenas arquivos e sistemas que você possui ou tem
 * permissão para inspecionar. Não contorna DRM nem proteções técnicas.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { basename, extname, join, relative, resolve } from 'node:path'
import { caminhoDentroDaRaiz } from '../paths'
import { escreverAtomico } from '../fs-atomico'

export type Evidencia = { tipo: string; valor: string; fonte: string }

export type ResultadoReversa = {
  ok: boolean
  erro?: string
  alvo: string
  tipo: string
  resumo: string
  evidencias: Evidencia[]
  limitacoes: string[]
  relatorio: string
  caminho?: string
  caminhoRel?: string
}

const LIMITE_LEITURA = 512 * 1024 * 1024
const LIMITE_STRINGS = 4000

export function slugAlvo(texto: string): string {
  const base = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (base || 'alvo').slice(0, 60)
}

export function hashBuffer(buf: Buffer): { md5: string; sha256: string } {
  return {
    md5: createHash('md5').update(buf).digest('hex'),
    sha256: createHash('sha256').update(buf).digest('hex')
  }
}

export function entropia(buf: Buffer): number {
  if (!buf.length) return 0
  const contagem = new Array(256).fill(0)
  for (const b of buf) contagem[b]++
  let h = 0
  for (const c of contagem) {
    if (!c) continue
    const p = c / buf.length
    h -= p * Math.log2(p)
  }
  return Math.round(h * 100) / 100
}

/** Assinaturas de arquivo. */
export function detectarTipoArquivo(buf: Buffer, caminho = ''): string {
  const ext = extname(caminho).toLowerCase()
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return 'pe'
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return 'elf'
  if (ext === '.asar') return 'electron-asar'
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript'
  if (buf.length < 4) return 'desconhecido'
  const m = buf.readUInt32BE(0)
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(m)) return 'macho'
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5)) {
    if (ext === '.apk') return 'apk'
    if (ext === '.jar' || ext === '.war' || ext === '.ear') return 'jar'
    if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') return 'zip-office'
    return 'zip'
  }
  return 'desconhecido'
}

// ------------------------------------------------------------------ PE

type SecaoPE = { nome: string; rva: number; tamanhoVirtual: number; tamanhoBruto: number; offset: number; entropia: number }

export type InfoPE = {
  maquina: string
  bits: 32 | 64
  subsistema: string
  entryPoint: number
  imageBase: string
  secoes: SecaoPE[]
  imports: string[]
  exports: string[]
  pdb?: string
  compiladoEm?: string
}

const MAQUINAS: Record<number, string> = {
  0x14c: 'x86',
  0x8664: 'x86-64',
  0x1c0: 'ARM',
  0xaa64: 'ARM64',
  0x200: 'IA-64'
}
const SUBSISTEMAS: Record<number, string> = {
  1: 'native',
  2: 'GUI (Windows)',
  3: 'console',
  9: 'Windows CE',
  10: 'EFI'
}

function rvaParaOffset(rva: number, secoes: SecaoPE[]): number {
  for (const s of secoes) {
    if (rva >= s.rva && rva < s.rva + Math.max(s.tamanhoVirtual, s.tamanhoBruto)) {
      return s.offset + (rva - s.rva)
    }
  }
  return -1
}

function lerCString(buf: Buffer, offset: number, max = 260): string {
  if (offset < 0 || offset >= buf.length) return ''
  let fim = offset
  while (fim < buf.length && fim - offset < max && buf[fim] !== 0) fim++
  return buf.slice(offset, fim).toString('latin1').trim()
}

export function analisarPE(buf: Buffer): InfoPE | null {
  try {
    if (buf.length < 0x40) return null
    const eLfanew = buf.readUInt32LE(0x3c)
    if (eLfanew + 24 > buf.length || buf.toString('latin1', eLfanew, eLfanew + 4) !== 'PE\0\0') return null
    const coff = eLfanew + 4
    const maquina = buf.readUInt16LE(coff)
    const numSecoes = buf.readUInt16LE(coff + 2)
    const stamp = buf.readUInt32LE(coff + 4)
    const tamOpt = buf.readUInt16LE(coff + 16)
    const opt = coff + 20
    const magic = buf.readUInt16LE(opt)
    const bits: 32 | 64 = magic === 0x20b ? 64 : 32
    const entryPoint = buf.readUInt32LE(opt + 16)
    const imageBase = bits === 64 ? Number(buf.readBigUInt64LE(opt + 24)) : buf.readUInt32LE(opt + 28)
    const subsystem = buf.readUInt16LE(opt + 68)
    const dirOff = bits === 64 ? opt + 112 : opt + 96
    const secoes: SecaoPE[] = []
    const secStart = opt + tamOpt
    for (let i = 0; i < numSecoes && secStart + i * 40 + 40 <= buf.length; i++) {
      const s = secStart + i * 40
      const nome = buf.toString('latin1', s, s + 8).replace(/\0/g, '').trim()
      const tamanhoVirtual = buf.readUInt32LE(s + 8)
      const rva = buf.readUInt32LE(s + 12)
      const tamanhoBruto = buf.readUInt32LE(s + 16)
      const offset = buf.readUInt32LE(s + 20)
      const dados = offset + tamanhoBruto <= buf.length ? buf.slice(offset, offset + tamanhoBruto) : Buffer.alloc(0)
      secoes.push({ nome, rva, tamanhoVirtual, tamanhoBruto, offset, entropia: entropia(dados) })
    }

    const imports: string[] = []
    if (dirOff + 8 <= buf.length) {
      const importRva = buf.readUInt32LE(dirOff + 8)
      if (importRva) {
        let off = rvaParaOffset(importRva, secoes)
        for (let i = 0; i < 512 && off > 0 && off + 20 <= buf.length; i++) {
          const nomeRva = buf.readUInt32LE(off + 12)
          const original = buf.readUInt32LE(off)
          if (!nomeRva && !original) break
          const nome = lerCString(buf, rvaParaOffset(nomeRva, secoes))
          if (nome && !imports.includes(nome)) imports.push(nome)
          off += 20
        }
      }
    }

    const exports: string[] = []
    if (dirOff + 8 <= buf.length) {
      const exportRva = buf.readUInt32LE(dirOff)
      if (exportRva) {
        const off = rvaParaOffset(exportRva, secoes)
        if (off > 0 && off + 40 <= buf.length) {
          const numeroNomes = buf.readUInt32LE(off + 24)
          const nomesRva = buf.readUInt32LE(off + 32)
          const base = rvaParaOffset(nomesRva, secoes)
          for (let i = 0; i < Math.min(500, numeroNomes); i++) {
            const nRva = buf.readUInt32LE(base + i * 4)
            const nome = lerCString(buf, rvaParaOffset(nRva, secoes), 120)
            if (nome && !exports.includes(nome)) exports.push(nome)
          }
        }
      }
    }

    if (!stamp) return { maquina: MAQUINAS[maquina] || '0x' + maquina.toString(16), bits, subsistema: SUBSISTEMAS[subsystem] || String(subsystem), entryPoint, imageBase: '0x' + imageBase.toString(16), secoes, imports, exports }
    const data = new Date(stamp * 1000)
    return {
      maquina: MAQUINAS[maquina] || '0x' + maquina.toString(16),
      bits,
      subsistema: SUBSISTEMAS[subsystem] || String(subsystem),
      entryPoint,
      imageBase: '0x' + imageBase.toString(16),
      secoes,
      imports,
      exports,
      compiladoEm: isNaN(data.getTime()) ? undefined : data.toISOString()
    }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ ELF / Mach-O

export function analisarElf(buf: Buffer): { classe: string; endian: string; maquina: string; tipo: string } | null {
  try {
    if (buf.length < 20) return null
    const classe = buf[4] === 2 ? '64 bits' : '32 bits'
    const le = buf[5] !== 2
    const read16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
    const tipo = read16(16)
    const maquina = read16(18)
    const maquinas: Record<number, string> = { 3: 'x86', 62: 'x86-64', 40: 'ARM', 183: 'ARM64', 8: 'MIPS', 20: 'PowerPC', 243: 'RISC-V' }
    const tipos: Record<number, string> = { 1: 'relocável', 2: 'executável', 3: 'shared object (PIC)', 4: 'core dump' }
    return { classe, endian: le ? 'little-endian' : 'big-endian', maquina: maquinas[maquina] || '0x' + maquina.toString(16), tipo: tipos[tipo] || String(tipo) }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ strings

export type StringCategorizada = { tipo: string; valor: string; offset: number }

const PADROES: Array<{ tipo: string; re: RegExp }> = [
  { tipo: 'url', re: /https?:\/\/[\w._~:/?#[\]@!$&'()*+,;=%-]{6,200}/i },
  { tipo: 'ip', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { tipo: 'email', re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  { tipo: 'registro', re: /(?:HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKLM|HKCU|SOFTWARE\\[\w\\ ]{3,})/i },
  { tipo: 'caminho', re: /(?:[A-Za-z]:\\|\\\\\?\\)[\w\\. ()%$@-]{4,180}/ },
  { tipo: 'pdb', re: /[\w.-]+\.pdb/i },
  { tipo: 'dll', re: /\b[\w.-]+\.dll\b/i },
  { tipo: 'cripto', re: /\b(AES|RSA|SHA-?1|SHA-?256|MD5|bcrypt|libcrypto|openssl|EVP_)\b/i },
  { tipo: 'electron', re: /(app\.asar|ipcRenderer|ipcMain|contextBridge|nodeIntegration|preload\.js)/i },
  { tipo: 'rede', re: /\b(socket|connect|WSAStartup|curl_|libcurl|WinHTTP|HttpClient)\b/i },
  { tipo: 'android', re: /\b(classes\.dex|AndroidManifest|dalvik|com\.android)/i }
]

export function extrairStrings(buf: Buffer, minimo = 5): StringCategorizada[] {
  const out: StringCategorizada[] = []
  const vistas = new Set<string>()
  const add = (valor: string, offset: number) => {
    const v = valor.trim()
    if (v.length < minimo || out.length >= LIMITE_STRINGS) return
    for (const p of PADROES) {
      const m = p.re.exec(v)
      if (m && !vistas.has(p.tipo + '\0' + m[0])) {
        vistas.add(p.tipo + '\0' + m[0])
        out.push({ tipo: p.tipo, valor: m[0].slice(0, 300), offset })
      }
    }
  }
  let ascii = ''
  let asciiOff = 0
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]
    if (b >= 0x20 && b <= 0x7e) {
      if (!ascii) asciiOff = i
      ascii += String.fromCharCode(b)
    } else {
      if (ascii.length >= minimo) add(ascii, asciiOff)
      ascii = ''
    }
  }
  if (ascii.length >= minimo) add(ascii, asciiOff)

  let utf = ''
  let utfOff = 0
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const lo = buf[i]
    const hi = buf[i + 1]
    if (hi === 0 && lo >= 0x20 && lo <= 0x7e) {
      if (!utf) utfOff = i
      utf += String.fromCharCode(lo)
    } else {
      if (utf.length >= minimo) add(utf, utfOff)
      utf = ''
    }
  }
  if (utf.length >= minimo) add(utf, utfOff)
  return out
}

// ------------------------------------------------------------------ ASAR

export type ArquivoAsar = { caminho: string; tamanho: number; offset: number; unpacked: boolean; executavel: boolean }

export type InfoAsar = {
  cabecalho: number
  dataOffset: number
  arquivos: ArquivoAsar[]
  totalBytes: number
  packageJson?: Record<string, unknown>
}

export function lerCabecalhoAsar(buf: Buffer): InfoAsar | null {
  try {
    if (buf.length < 16) return null
    const tamanhoCabecalho = buf.readUInt32LE(4)
    if (!tamanhoCabecalho || tamanhoCabecalho > 64 * 1024 * 1024) return null
    const inicioJson = 12
    const fimJson = 8 + tamanhoCabecalho
    if (fimJson > buf.length) return null
    const texto = buf.toString('utf8', inicioJson, fimJson).replace(/\0+$/, '').trim()
    const cab = JSON.parse(texto) as { files?: Record<string, unknown> }
    let dataOffset = 8 + tamanhoCabecalho
    if (dataOffset % 4 !== 0) dataOffset += 4 - (dataOffset % 4)
    const arquivos: ArquivoAsar[] = []
    const visitar = (no: Record<string, unknown>, prefixo: string) => {
      for (const [nome, valor] of Object.entries(no)) {
        if (!valor || typeof valor !== 'object') continue
        const item = valor as Record<string, unknown>
        const caminho = prefixo ? prefixo + '/' + nome : nome
        if (item.files) visitar(item.files as Record<string, unknown>, caminho)
        else if (typeof item.size === 'number' && typeof item.offset === 'string') {
          arquivos.push({
            caminho,
            tamanho: item.size,
            offset: Number(item.offset),
            unpacked: item.unpacked === true,
            executavel: item.executable === true
          })
        }
      }
    }
    if (cab?.files) visitar(cab.files, '')
    let packageJson: Record<string, unknown> | undefined
    const pkg = arquivos.find((a) => a.caminho === 'package.json')
    if (pkg && !pkg.unpacked && dataOffset + pkg.offset + pkg.tamanho <= buf.length) {
      try {
        packageJson = JSON.parse(buf.toString('utf8', dataOffset + pkg.offset, dataOffset + pkg.offset + pkg.tamanho))
      } catch {
        /* package.json inválido */
      }
    }
    return {
      cabecalho: tamanhoCabecalho,
      dataOffset,
      arquivos,
      totalBytes: arquivos.reduce((s, a) => s + a.tamanho, 0),
      packageJson
    }
  } catch {
    return null
  }
}

export function lerArquivoAsar(buf: Buffer, info: InfoAsar, caminho: string): Buffer | null {
  const item = info.arquivos.find((a) => a.caminho === caminho)
  if (!item || item.unpacked) return null
  const inicio = info.dataOffset + item.offset
  if (inicio + item.tamanho > buf.length) return null
  return buf.slice(inicio, inicio + item.tamanho)
}

/** Extrai o conteúdo não-unpacked do ASAR para uma pasta do projeto. */
export function extrairAsar(raiz: string, arquivoAsar: string, destinoRel?: string): { ok: boolean; erro?: string; destino?: string; destinoRel?: string; arquivos?: number; bytes?: number } {
  try {
    const buf = readFileSync(arquivoAsar)
    const info = lerCabecalhoAsar(buf)
    if (!info) return { ok: false, erro: 'cabeçalho ASAR inválido' }
    const destino = destinoRel
      ? caminhoDentroDaRaiz(raiz, destinoRel).abs
      : caminhoDentroDaRaiz(raiz, join('.dg-editor', 'reversa', slugAlvo(basename(arquivoAsar, '.asar')), 'asar')).abs
    let count = 0
    for (const item of info.arquivos) {
      if (item.unpacked) continue
      const conteudo = lerArquivoAsar(buf, info, item.caminho)
      if (!conteudo) continue
      const alvo = join(destino, item.caminho)
      const rel = relative(destino, alvo)
      if (rel.startsWith('..')) continue
      mkdirSync(join(alvo, '..'), { recursive: true })
      writeFileSync(alvo, conteudo)
      count++
    }
    return {
      ok: true,
      destino,
      destinoRel: relative(resolve(raiz), destino).replace(/\\/g, '/'),
      arquivos: count,
      bytes: info.totalBytes
    }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

// ------------------------------------------------------------------ análise

function acharAsarEm(dir: string): string | null {
  const candidatos = [
    join(dir, 'resources', 'app.asar'),
    join(dir, 'app.asar'),
    join(dir, 'Contents', 'Resources', 'app.asar')
  ]
  for (const c of candidatos) if (existsSync(c)) return c
  return null
}

function evidenciasElectron(raizBuf: Buffer, info: InfoAsar, fontes: string[]): Evidencia[] {
  const ev: Evidencia[] = []
  const pkg = info.packageJson || {}
  for (const chave of ['name', 'version', 'main', 'description', 'author']) {
    if (pkg[chave]) ev.push({ tipo: 'package.json', valor: chave + ': ' + String(pkg[chave]).slice(0, 200), fonte: 'app.asar' })
  }
  const deps = (pkg.dependencies || {}) as Record<string, string>
  for (const [nome, versao] of Object.entries(deps).slice(0, 40)) {
    ev.push({ tipo: 'dependência', valor: nome + '@' + versao, fonte: 'package.json' })
  }
  const js = info.arquivos.filter((a) => /\.(js|cjs|mjs)$/.test(a.caminho) && !a.unpacked && a.tamanho < 4 * 1024 * 1024).slice(0, 80)
  const canais = new Set<string>()
  const preloads = new Set<string>()
  for (const item of js) {
    const conteudo = lerArquivoAsar(raizBuf, info, item.caminho)
    if (!conteudo) continue
    const texto = conteudo.toString('utf8')
    for (const m of texto.matchAll(/ipcMain\.(?:handle|on)\(\s*['"]([^'"]{2,120})['"]/g)) canais.add(m[1])
    for (const m of texto.matchAll(/ipcRenderer\.(?:invoke|send|on)\(\s*['"]([^'"]{2,120})['"]/g)) canais.add(m[1])
    if (/preload/i.test(item.caminho) && /contextBridge|exposeInMainWorld/.test(texto)) preloads.add(item.caminho)
    if (/nodeIntegration\s*:\s*true/.test(texto)) ev.push({ tipo: 'risco', valor: 'nodeIntegration: true', fonte: item.caminho })
    if (/contextIsolation\s*:\s*false/.test(texto)) ev.push({ tipo: 'risco', valor: 'contextIsolation: false', fonte: item.caminho })
  }
  for (const c of [...canais].slice(0, 120)) ev.push({ tipo: 'canal IPC', valor: c, fonte: 'app.asar' })
  for (const p of preloads) ev.push({ tipo: 'preload', valor: p, fonte: 'app.asar' })
  for (const [fonte] of fontes.slice(0, 4).map((f) => [f])) ev.push({ tipo: 'arquivo', valor: fonte, fonte: 'app.asar' })
  return ev
}

export function detectarFerramentasReversa(): Record<string, { ok: boolean; versao?: string }> {
  const rodar = (bin: string, args: string[]) => {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 5000, windowsHide: true })
    if (r.error || r.status !== 0) return { ok: false }
    const linha = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).find((l) => l.trim()) || ''
    return { ok: true, versao: linha.trim().slice(0, 100) }
  }
  const ghidraHome = process.env.GHIDRA_HOME || process.env.GHIDRA_INSTALL_DIR
  const nucleo = {
    strings: rodar(process.platform === 'win32' ? 'strings.exe' : 'strings', ['--version']),
    objdump: rodar('objdump', ['--version']),
    java: rodar('java', ['-version']),
    python: rodar(process.platform === 'win32' ? 'python' : 'python3', ['--version']),
    jadx: rodar('jadx', ['--version']),
    radare2: rodar('radare2', ['-v'])
  }
  return {
    ...nucleo,
    ghidra: ghidraHome && existsSync(ghidraHome) ? { ok: true, versao: ghidraHome } : { ok: false }
  }
}

function secaoEvidencias(titulo: string, itens: Evidencia[]): string {
  if (!itens.length) return ''
  const linhas = ['', '### ' + titulo, '', '| Tipo | Evidência | Fonte |', '| --- | --- | --- |']
  for (const e of itens.slice(0, 200)) {
    linhas.push('| ' + e.tipo + ' | ' + e.valor.replace(/\|/g, '\\|') + ' | ' + e.fonte.replace(/\|/g, '\\|') + ' |')
  }
  return linhas.join('\n')
}

function montarRelatorio(r: Omit<ResultadoReversa, 'relatorio'>): string {
  const linhas = [
    '# Relatório de engenharia reversa',
    '',
    '- **Alvo:** ' + r.alvo,
    '- **Tipo detectado:** ' + r.tipo,
    '- **Gerado em:** ' + new Date().toLocaleString('pt-BR'),
    '',
    '## Resumo',
    '',
    r.resumo,
    '',
    '## Evidências',
    '',
    secaoEvidencias('Binário', r.evidencias.filter((e) => ['seção', 'import', 'export', 'compilação', 'arquitetura', 'assinatura', 'hash', 'packer'].includes(e.tipo))) || 'Sem evidências estruturais.',
    secaoEvidencias('Aplicação', r.evidencias.filter((e) => !['seção', 'import', 'export', 'compilação', 'arquitetura', 'assinatura', 'hash', 'packer'].includes(e.tipo))),
    '',
    '## Limitações',
    '',
    ...(r.limitacoes.length ? r.limitacoes.map((l) => '- ' + l) : ['- Nenhuma limitação registrada.']),
    '',
    '## Próximos passos sugeridos',
    '',
    '- Confirmar os pontos de entrada e os canais IPC mapeados com execução controlada em ambiente isolado.',
    '- Se necessário, aprofundar com Ghidra/JADX/radare2 (gratuitos) — instale e rode novamente a análise.',
    '- Tratar todo resultado como hipótese até validar com evidência adicional.',
    '',
    '> Análise estática local. Use apenas em software que você possui ou tem autorização para inspecionar.'
  ]
  return linhas.filter((l) => l !== undefined).join('\n')
}

export function analisarArquivo(arquivo: string): ResultadoReversa {
  const alvo = resolve(arquivo)
  if (!existsSync(alvo)) return finalizar({ ok: false, erro: 'arquivo não encontrado: ' + alvo, alvo, tipo: 'desconhecido', resumo: '', evidencias: [], limitacoes: [] })
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(alvo)
  } catch (e) {
    return finalizar({ ok: false, erro: String((e as Error).message || e), alvo, tipo: 'desconhecido', resumo: '', evidencias: [], limitacoes: [] })
  }
  if (st.isDirectory()) return analisarDiretorio(alvo)
  if (st.size > LIMITE_LEITURA) {
    return finalizar({ ok: false, erro: 'arquivo maior que ' + Math.round(LIMITE_LEITURA / 1024 / 1024) + ' MB', alvo, tipo: 'desconhecido', resumo: '', evidencias: [], limitacoes: [] })
  }
  const buf = readFileSync(alvo)
  const tipo = detectarTipoArquivo(buf, alvo)
  const ev: Evidencia[] = []
  const limitacoes: string[] = []
  const hashes = hashBuffer(buf)
  ev.push({ tipo: 'hash', valor: 'SHA256 ' + hashes.sha256, fonte: basename(alvo) })
  ev.push({ tipo: 'hash', valor: 'MD5 ' + hashes.md5, fonte: basename(alvo) })
  ev.push({ tipo: 'hash', valor: 'tamanho ' + st.size + ' bytes', fonte: basename(alvo) })

  let resumo = 'Arquivo ' + tipo + ' de ' + st.size + ' bytes.'
  if (tipo === 'pe') {
    const pe = analisarPE(buf)
    if (pe) {
      resumo = 'Executável Windows ' + pe.maquina + ' (' + pe.bits + ' bits, ' + pe.subsistema + '), ' + pe.secoes.length + ' seções, ' + pe.imports.length + ' DLLs importadas.'
      ev.push({ tipo: 'arquitetura', valor: pe.maquina + ' / ' + pe.bits + ' bits / ' + pe.subsistema, fonte: 'cabeçalho PE' })
      if (pe.compiladoEm) ev.push({ tipo: 'compilação', valor: pe.compiladoEm, fonte: 'timestamp PE' })
      for (const s of pe.secoes) ev.push({ tipo: 'seção', valor: s.nome + ' · ' + s.tamanhoBruto + ' bytes · entropia ' + s.entropia, fonte: 'PE' })
      for (const dll of pe.imports) ev.push({ tipo: 'import', valor: dll, fonte: 'import table' })
      for (const exp of pe.exports.slice(0, 60)) ev.push({ tipo: 'export', valor: exp, fonte: 'export table' })
      const suspeitas = pe.secoes.filter((s) => s.entropia >= 7.2 && s.tamanhoBruto > 4096)
      for (const s of suspeitas) ev.push({ tipo: 'packer', valor: 'seção ' + s.nome + ' com entropia alta (' + s.entropia + ')', fonte: 'heurística' })
      if (pe.imports.some((d) => /vcruntime|msvcp|ucrtbase/i.test(d))) ev.push({ tipo: 'compilação', valor: 'runtime MSVC', fonte: 'imports' })
      if (pe.imports.some((d) => /mscoree/i.test(d))) ev.push({ tipo: 'assinatura', valor: '.NET (mscoree.dll)', fonte: 'imports' })
      limitacoes.push('Análise estática não executa o binário; comportamento em runtime não foi observado.')
      limitacoes.push('Nomes de funções internas e lógica não são recuperados sem um descompilador (Ghidra/radare2).')
    }
  } else if (tipo === 'elf') {
    const elf = analisarElf(buf)
    if (elf) {
      resumo = 'Binário ELF ' + elf.maquina + ' (' + elf.classe + ', ' + elf.tipo + ').'
      ev.push({ tipo: 'arquitetura', valor: elf.maquina + ' / ' + elf.classe + ' / ' + elf.endian + ' / ' + elf.tipo, fonte: 'ELF header' })
    }
  } else if (tipo === 'electron-asar' || tipo === 'zip' || tipo === 'jar' || tipo === 'apk' || tipo === 'zip-office') {
    if (tipo === 'electron-asar') {
      const info = lerCabecalhoAsar(buf)
      if (info) {
        resumo = 'Arquivo ASAR (Electron) com ' + info.arquivos.length + ' arquivos (' + Math.round(info.totalBytes / 1024) + ' KB descompactados).'
        ev.push(...evidenciasElectron(buf, info, []))
        limitacoes.push('A extração não executa o app; comportamento e tráfego de rede não são observados.')
        return finalizar({ ok: true, alvo, tipo: 'electron-asar', resumo, evidencias: ev, limitacoes })
      }
    }
    if (tipo === 'jar' || tipo === 'apk') {
      ev.push({ tipo: 'assinatura', valor: tipo === 'apk' ? 'ZIP/APK' : 'ZIP/JAR', fonte: 'magic PK' })
      ev.push({ tipo: 'android', valor: tipo === 'apk' ? 'pacote Android (classes.dex esperado)' : 'Java archive', fonte: 'extensão' })
      limitacoes.push('Para listar classes e manifesto, use JADX (gratuito) ou unzip; o app não descompila DEX/Java internamente.')
    }
  } else if (tipo === 'javascript') {
    const texto = buf.toString('utf8')
    const urls = extrairStrings(buf).filter((s) => s.tipo === 'url').slice(0, 40)
    for (const u of urls) ev.push({ tipo: 'url', valor: u.valor, fonte: basename(alvo) })
    resumo = 'JavaScript com ' + texto.split(/\r?\n/).length + ' linhas' + (urls.length ? ' e ' + urls.length + ' URLs embutidas.' : '.')
    for (const m of texto.matchAll(/ipc(?:Main|Renderer)\.(?:handle|on|invoke|send)\(\s*['"]([^'"]{2,120})['"]/g)) {
      ev.push({ tipo: 'canal IPC', valor: m[1], fonte: basename(alvo) })
    }
    limitacoes.push('Análise textual; código ofuscado pode esconder strings e chamadas.')
  }

  const strings = extrairStrings(buf)
  for (const s of strings.slice(0, 120)) ev.push({ tipo: 'string:' + s.tipo, valor: s.valor, fonte: 'offset ' + s.offset })
  return finalizar({ ok: true, alvo, tipo, resumo, evidencias: ev, limitacoes })
}

export function analisarDiretorio(dir: string): ResultadoReversa {
  const alvo = resolve(dir)
  const asar = acharAsarEm(alvo)
  const ev: Evidencia[] = []
  const limitacoes: string[] = []
  let tipo = 'desconhecido'
  let resumo = 'Diretório sem assinatura conhecida.'
  if (asar) {
    tipo = 'electron-app'
    const buf = readFileSync(asar)
    const info = lerCabecalhoAsar(buf)
    if (info) {
      resumo = 'Aplicativo Electron: ' + info.arquivos.length + ' arquivos no app.asar.'
      ev.push({ tipo: 'assinatura', valor: 'Electron com app.asar', fonte: relative(resolve('.'), asar) })
      ev.push(...evidenciasElectron(buf, info, []))
      limitacoes.push('A extração do ASAR preserva apenas arquivos empacotados; arquivos "unpacked" ficam em app.asar.unpacked.')
      limitacoes.push('A análise não executa o aplicativo; tráfego e comportamento em runtime não foram observados.')
    }
  } else {
    const pkgPath = join(alvo, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
        if (pkg.electron || (pkg.devDependencies && (pkg.devDependencies as Record<string, unknown>).electron)) {
          tipo = 'electron-project'
          resumo = 'Projeto Electron (código-fonte): ' + String(pkg.name || basename(alvo)) + ' ' + String(pkg.version || '')
          ev.push({ tipo: 'package.json', valor: 'name: ' + String(pkg.name || ''), fonte: 'package.json' })
          ev.push({ tipo: 'package.json', valor: 'main: ' + String(pkg.main || ''), fonte: 'package.json' })
        }
      } catch {
        /* */
      }
    }
    if (tipo === 'desconhecido') {
      let arquivos = 0
      const visitar = (d: string, nivel: number) => {
        if (nivel > 2 || arquivos > 800) return
        for (const n of readdirSync(d)) {
          const p = join(d, n)
          try {
            const st = statSync(p)
            if (st.isDirectory()) visitar(p, nivel + 1)
            else {
              arquivos++
              const ext = extname(n).toLowerCase()
              if (['.exe', '.dll', '.asar', '.jar', '.apk', '.so', '.dylib'].includes(ext)) {
                ev.push({ tipo: 'arquivo', valor: p.replace(alvo, '.'), fonte: ext })
              }
            }
          } catch {
            /* */
          }
        }
      }
      try {
        visitar(alvo, 0)
      } catch {
        /* */
      }
      if (arquivos) resumo = 'Diretório com ' + arquivos + ' arquivos analisados (profundidade 2).'
    }
  }
  return finalizar({ ok: true, alvo, tipo, resumo, evidencias: ev, limitacoes })
}

export async function analisarUrl(url: string): Promise<ResultadoReversa> {
  const ev: Evidencia[] = []
  const limitacoes: string[] = []
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'DG-Editor/0.3 (auditoria local)' } })
    const html = await res.text()
    const tipo = 'web'
    ev.push({ tipo: 'http', valor: 'status ' + res.status, fonte: url })
    for (const [k, v] of res.headers.entries()) {
      if (/server|content-type|set-cookie|strict-transport|x-frame|content-security/i.test(k)) ev.push({ tipo: 'cabeçalho', valor: k + ': ' + v.slice(0, 160), fonte: url })
    }
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) ev.push({ tipo: 'script', valor: m[1].slice(0, 200), fonte: 'HTML' })
    for (const m of html.matchAll(/<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']*)["']/gi)) ev.push({ tipo: 'meta', valor: m[1] + ': ' + m[2].slice(0, 120), fonte: 'HTML' })
    for (const m of html.matchAll(/<form[^>]*action=["']([^"']*)["'][^>]*method=["']([^"']*)["']/gi)) ev.push({ tipo: 'formulário', valor: (m[2] || 'GET').toUpperCase() + ' ' + m[1], fonte: 'HTML' })
    const urls = new Set<string>()
    for (const m of html.matchAll(/https?:\/\/[\w._~:/?#[\]@!$&'()*+,;=%-]{6,200}/gi)) urls.add(m[0])
    for (const u of [...urls].slice(0, 40)) ev.push({ tipo: 'url', valor: u, fonte: 'HTML/JS' })
    const frameworks: string[] = []
    if (/__NEXT_DATA__|\/_next\//.test(html)) frameworks.push('Next.js')
    if (/data-reactroot|react(?:-dom)?(?:\.production)?\.min\.js/.test(html)) frameworks.push('React')
    if (/ng-version|angular\.min\.js/.test(html)) frameworks.push('Angular')
    if (/__NUXT__|\/_nuxt\//.test(html)) frameworks.push('Nuxt')
    if (/wp-content|wordpress/i.test(html)) frameworks.push('WordPress')
    for (const f of frameworks) ev.push({ tipo: 'framework', valor: f, fonte: 'heurística' })
    limitacoes.push('Inspeção apenas do HTML inicial e cabeçalhos; não cobre comportamento dinâmico autenticado.')
    return finalizar({
      ok: true,
      alvo: url,
      tipo,
      resumo: 'Página web ' + res.status + ' com ' + urls.size + ' URLs e ' + (frameworks.join(', ') || 'stack não identificada') + '.',
      evidencias: ev,
      limitacoes
    })
  } catch (e) {
    return finalizar({ ok: false, erro: String((e as Error).message || e), alvo: url, tipo: 'web', resumo: '', evidencias: ev, limitacoes })
  }
}

function finalizar(r: Omit<ResultadoReversa, 'relatorio'>): ResultadoReversa {
  return { ...r, relatorio: montarRelatorio(r) }
}

/** Salva o relatório em `.dg-editor/reversa/<slug>/relatorio.md`. */
export async function salvarRelatorioReversa(raiz: string, r: ResultadoReversa): Promise<ResultadoReversa> {
  try {
    const nome = slugAlvo(r.tipo + '-' + basename(r.alvo))
    const alvo = caminhoDentroDaRaiz(raiz, join('.dg-editor', 'reversa', nome, 'relatorio.md')).abs
    mkdirSync(join(alvo, '..'), { recursive: true })
    await escreverAtomico(alvo, r.relatorio + '\n')
    return { ...r, caminho: alvo, caminhoRel: relative(resolve(raiz), alvo).replace(/\\/g, '/') }
  } catch (e) {
    return { ...r, ok: false, erro: String((e as Error).message || e) }
  }
}
