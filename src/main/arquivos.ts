/**
 * IPC de arquivos do DG Editor — nunca expor fs cru ao renderer.
 * Validação: relative() + isAbsolute() (não path.startsWith).
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative, isAbsolute, extname, basename, dirname } from 'path'

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

export function validarCaminho(caminho: string, pastasPermitidas: string[]): boolean {
  if (!caminho || typeof caminho !== 'string') return false
  let abs: string
  try {
    abs = resolve(caminho)
  } catch {
    return false
  }
  for (const pasta of pastasPermitidas || []) {
    if (!pasta) continue
    const raiz = resolve(pasta)
    const rel = relative(raiz, abs)
    if (rel === '') return true
    if (!rel.startsWith('..') && !isAbsolute(rel)) return true
  }
  return false
}

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

export function listarDiretorio(
  dir: string,
  pastas: string[]
): { ok: boolean; entradas?: EntradaDir[]; erro?: string } {
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
    const nomes = readdirSync(abs)
    const entradas: EntradaDir[] = []
    for (const nome of nomes) {
      if (ignorar.has(nome)) continue
      if (nome === '.' || nome === '..') continue
      const full = join(abs, nome)
      let tipo: 'dir' | 'file' = 'file'
      try {
        tipo = statSync(full).isDirectory() ? 'dir' : 'file'
      } catch {
        continue
      }
      const ext = extname(nome).toLowerCase()
      const editavel =
        tipo === 'file' &&
        (EXT_EDITAVEIS.has(ext) ||
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
