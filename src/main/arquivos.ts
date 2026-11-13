/**
 * IPC de arquivos do DG Editor — nunca expor fs cru ao renderer.
 * Validação: caminhoSeguro (relative + isAbsolute).
 * I/O assíncrono — não bloqueia o main process no painel.
 */
import { promises as fsp } from 'fs'
import { join, resolve, relative, isAbsolute, extname, basename, dirname } from 'path'
import { caminhoSeguro } from './ipc-seguro'

const LIMITE_BYTES = 5 * 1024 * 1024
const EXT_EDITAVEIS = new Set([
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.md',
  '.json',
  '.css',
  '.html',
  '.htm',
  '.txt',
  '.yml',
  '.yaml',
  '.sh',
  '.ps1',
  '.xml',
  '.svg',
  '.env',
  '.gitignore',
  '.sql',
  '.toml',
  '.ini',
  '.cfg',
  '.conf'
])

const EXT_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

export function extensoesImagem(): string[] {
  return [...EXT_IMAGEM]
}

export function ehImagem(caminho: string): boolean {
  return EXT_IMAGEM.has(extname(String(caminho || '')).toLowerCase())
}

export function validarCaminho(caminho: string, pastasPermitidas: string[]): boolean {
  return caminhoSeguro(caminho, pastasPermitidas).ok
}

/** Alias explícito pedido pelo hardening IPC. */
export { caminhoSeguro }

function ehBinario(buf: Buffer): boolean {
  const n = Math.min(512, buf.length)
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

export async function arquivoExiste(
  caminho: string,
  pastas: string[]
): Promise<{ ok: boolean; existe?: boolean; erro?: string }> {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  return { ok: true, existe: await pathExists(resolve(caminho)) }
}

export async function lerArquivo(
  caminho: string,
  pastas: string[]
): Promise<{ ok: boolean; conteudo?: string; erro?: string; bytes?: number }> {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  const abs = resolve(caminho)
  if (!(await pathExists(abs))) return { ok: false, erro: 'arquivo nao encontrado' }
  let st
  try {
    st = await fsp.stat(abs)
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
  if (!st.isFile()) return { ok: false, erro: 'nao e arquivo' }
  if (st.size > LIMITE_BYTES) {
    return { ok: false, erro: 'arquivo maior que 5MB' }
  }
  const ext = extname(abs).toLowerCase()
  const nome = basename(abs)
  const editavel =
    EXT_EDITAVEIS.has(ext) ||
    !ext ||
    nome.startsWith('.') ||
    nome === 'Dockerfile' ||
    nome === 'Makefile'
  if (!editavel) {
    return { ok: false, erro: 'extensao nao editavel: ' + (ext || nome) }
  }
  let buf: Buffer
  try {
    buf = await fsp.readFile(abs)
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
  if (ehBinario(buf)) return { ok: false, erro: 'arquivo binario recusado' }
  return { ok: true, conteudo: buf.toString('utf8'), bytes: buf.length }
}

/** Lê imagem como data-URL (base64) — só EXT_IMAGEM. */
export async function lerArquivoBase64(
  caminho: string,
  pastas: string[]
): Promise<{ ok: boolean; dataUrl?: string; mime?: string; erro?: string }> {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  const abs = resolve(caminho)
  if (!(await pathExists(abs))) return { ok: false, erro: 'arquivo nao encontrado' }
  const ext = extname(abs).toLowerCase()
  if (!EXT_IMAGEM.has(ext)) return { ok: false, erro: 'nao e imagem suportada' }
  let st
  try {
    st = await fsp.stat(abs)
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
  if (!st.isFile()) return { ok: false, erro: 'nao e arquivo' }
  if (st.size > LIMITE_BYTES) return { ok: false, erro: 'arquivo maior que 5MB' }
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.gif'
        ? 'image/gif'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg'
  try {
    const buf = await fsp.readFile(abs)
    return { ok: true, mime, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

export async function salvarArquivo(
  caminho: string,
  conteudo: string,
  pastas: string[]
): Promise<{ ok: boolean; erro?: string }> {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  if (typeof conteudo !== 'string') return { ok: false, erro: 'conteudo invalido' }
  const bytes = Buffer.byteLength(conteudo, 'utf8')
  if (bytes > LIMITE_BYTES) return { ok: false, erro: 'conteudo maior que 5MB' }
  const abs = resolve(caminho)
  const dir = dirname(abs)
  if (!(await pathExists(dir))) return { ok: false, erro: 'diretorio pai nao existe' }
  try {
    await fsp.writeFile(abs, conteudo, 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

export type EntradaDir = {
  nome: string
  caminho: string
  tipo: 'dir' | 'file'
  editavel: boolean
}

export async function listarDiretorio(
  dir: string,
  pastas: string[]
): Promise<{ ok: boolean; entradas?: EntradaDir[]; erro?: string; code?: string }> {
  if (!validarCaminho(dir, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  const abs = resolve(dir)
  if (!(await pathExists(abs))) return { ok: false, erro: 'diretorio nao encontrado', code: 'ENOENT' }
  let st
  try {
    st = await fsp.stat(abs)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code || ''
    return { ok: false, erro: String((e as Error).message || e), code }
  }
  if (!st.isDirectory()) return { ok: false, erro: 'nao e diretorio' }

  const ignorar = new Set([
    'node_modules',
    '.git',
    'out',
    'dist',
    '.dg-editor',
    '__pycache__',
    '.next',
    'vendor'
  ])
  try {
    const dirents = await fsp.readdir(abs, { withFileTypes: true })
    const entradas: EntradaDir[] = []
    for (const d of dirents) {
      const nome = d.name
      if (ignorar.has(nome)) continue
      if (nome === '.' || nome === '..') continue
      const full = join(abs, nome)
      const tipo: 'dir' | 'file' = d.isDirectory() ? 'dir' : 'file'
      const ext = extname(nome).toLowerCase()
      const editavel =
        tipo === 'file' &&
        (EXT_EDITAVEIS.has(ext) ||
          EXT_IMAGEM.has(ext) ||
          !ext ||
          nome.startsWith('.') ||
          nome === 'Dockerfile' ||
          nome === 'Makefile')
      entradas.push({ nome, caminho: full, tipo, editavel })
    }
    entradas.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'dir' ? -1 : 1
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    })
    return { ok: true, entradas }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

function nomeSemSeparador(nome: string): boolean {
  const n = String(nome || '').trim()
  if (!n) return false
  if (n === '.' || n === '..') return false
  if (/[/\\0]/.test(n)) return false
  if (/^[a-zA-Z]:/.test(n)) return false
  return n.length <= 200
}

async function statEntrada(p: string): Promise<{ existe: boolean; tipo?: 'file' | 'dir' }> {
  try {
    const st = await fsp.lstat(p)
    return { existe: true, tipo: st.isDirectory() ? 'dir' : 'file' }
  } catch {
    return { existe: false }
  }
}

/** Cria arquivo vazio ou pasta. Nao sobrescreve. */
export async function criarEntrada(
  caminho: string,
  tipo: 'file' | 'dir',
  pastas: string[]
): Promise<{ ok: boolean; erro?: string }> {
  const seg = caminhoSeguro(caminho, pastas)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  if (seg.rel === '.') return { ok: false, erro: 'nao e possivel criar sobre a raiz' }
  if (!nomeSemSeparador(basename(seg.abs))) return { ok: false, erro: 'nome invalido' }
  const pai = dirname(seg.abs)
  const stPai = await statEntrada(pai)
  if (!stPai.existe || stPai.tipo !== 'dir') return { ok: false, erro: 'diretorio pai nao existe' }
  const alvo = await statEntrada(seg.abs)
  if (alvo.existe) return { ok: false, erro: 'já existe um item com esse nome' }
  try {
    if (tipo === 'dir') await fsp.mkdir(seg.abs)
    else await fsp.writeFile(seg.abs, '', { encoding: 'utf8', flag: 'wx' })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

/** Renomeia mantendo o mesmo diretorio pai. */
export async function renomearEntrada(
  caminho: string,
  novoNome: string,
  pastas: string[]
): Promise<{ ok: boolean; caminho?: string; erro?: string }> {
  const seg = caminhoSeguro(caminho, pastas)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  if (seg.rel === '.') return { ok: false, erro: 'nao e possivel renomear a raiz' }
  if (!nomeSemSeparador(novoNome)) return { ok: false, erro: 'nome invalido' }
  const origem = await statEntrada(seg.abs)
  if (!origem.existe) return { ok: false, erro: 'item nao encontrado' }
  const destino = join(dirname(seg.abs), String(novoNome).trim())
  if (destino === seg.abs) return { ok: true, caminho: seg.abs }
  const segDestino = caminhoSeguro(destino, pastas)
  if (!segDestino.ok) return { ok: false, erro: segDestino.erro }
  if ((await statEntrada(destino)).existe) return { ok: false, erro: 'já existe um item com esse nome' }
  try {
    await fsp.rename(seg.abs, destino)
    return { ok: true, caminho: destino }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

/** Move para outra pasta dentro das raizes abertas. */
export async function moverEntrada(
  origem: string,
  destinoPasta: string,
  pastas: string[]
): Promise<{ ok: boolean; caminho?: string; erro?: string }> {
  const segO = caminhoSeguro(origem, pastas)
  if (!segO.ok) return { ok: false, erro: segO.erro }
  if (segO.rel === '.') return { ok: false, erro: 'nao e possivel mover a raiz' }
  const segD = caminhoSeguro(destinoPasta, pastas)
  if (!segD.ok) return { ok: false, erro: segD.erro }
  const stO = await statEntrada(segO.abs)
  if (!stO.existe) return { ok: false, erro: 'item de origem nao encontrado' }
  const stD = await statEntrada(segD.abs)
  if (!stD.existe || stD.tipo !== 'dir') return { ok: false, erro: 'destino nao e uma pasta existente' }
  if (segD.abs === segO.abs) return { ok: false, erro: 'origem e destino sao a mesma pasta' }
  if (stO.tipo === 'dir') {
    const relDentro = relative(segO.abs, segD.abs)
    if (relDentro && !relDentro.startsWith('..') && !isAbsolute(relDentro)) {
      return { ok: false, erro: 'nao e possivel mover uma pasta para dentro dela mesma' }
    }
  }
  const alvo = join(segD.abs, basename(segO.abs))
  if ((await statEntrada(alvo)).existe) return { ok: false, erro: 'ja existe um item com esse nome no destino' }
  try {
    await fsp.rename(segO.abs, alvo)
    return { ok: true, caminho: alvo }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}
