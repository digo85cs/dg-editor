/**
 * IPC de arquivos do DG Editor — nunca expor fs cru ao renderer.
 * Validação: caminhoSeguro (relative + isAbsolute).
 */
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs'
import { readdir } from 'fs/promises'
import { join, resolve, extname, basename, dirname } from 'path'
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

export function arquivoExiste(
  caminho: string,
  pastas: string[]
): { ok: boolean; existe?: boolean; erro?: string } {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  return { ok: true, existe: existsSync(resolve(caminho)) }
}

export function lerArquivo(
  caminho: string,
  pastas: string[]
): { ok: boolean; conteudo?: string; erro?: string; bytes?: number } {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  const abs = resolve(caminho)
  if (!existsSync(abs)) return { ok: false, erro: 'arquivo nao encontrado' }
  let st
  try {
    st = statSync(abs)
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
    buf = readFileSync(abs)
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
  if (ehBinario(buf)) return { ok: false, erro: 'arquivo binario recusado' }
  return { ok: true, conteudo: buf.toString('utf8'), bytes: buf.length }
}

/** Lê imagem como data-URL (base64) — só EXT_IMAGEM. */
export function lerArquivoBase64(
  caminho: string,
  pastas: string[]
): { ok: boolean; dataUrl?: string; mime?: string; erro?: string } {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  const abs = resolve(caminho)
  if (!existsSync(abs)) return { ok: false, erro: 'arquivo nao encontrado' }
  const ext = extname(abs).toLowerCase()
  if (!EXT_IMAGEM.has(ext)) return { ok: false, erro: 'nao e imagem suportada' }
  let st
  try {
    st = statSync(abs)
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
    const buf = readFileSync(abs)
    return { ok: true, mime, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

export function salvarArquivo(
  caminho: string,
  conteudo: string,
  pastas: string[]
): { ok: boolean; erro?: string } {
  if (!validarCaminho(caminho, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  if (typeof conteudo !== 'string') return { ok: false, erro: 'conteudo invalido' }
  const bytes = Buffer.byteLength(conteudo, 'utf8')
  if (bytes > LIMITE_BYTES) return { ok: false, erro: 'conteudo maior que 5MB' }
  const abs = resolve(caminho)
  const dir = dirname(abs)
  if (!existsSync(dir)) return { ok: false, erro: 'diretorio pai nao existe' }
  try {
    writeFileSync(abs, conteudo, 'utf8')
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
): Promise<{ ok: boolean; entradas?: EntradaDir[]; erro?: string }> {
  if (!validarCaminho(dir, pastas)) {
    return { ok: false, erro: 'caminho fora das pastas permitidas' }
  }
  const abs = resolve(dir)
  if (!existsSync(abs)) return { ok: false, erro: 'diretorio nao encontrado' }
  let st
  try {
    st = statSync(abs)
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
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
    const dirents = await readdir(abs, { withFileTypes: true })
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
