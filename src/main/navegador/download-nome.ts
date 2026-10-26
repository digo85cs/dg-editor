/**
 * Sanitização e nomes legíveis para downloads do navegador embutido.
 * Previne path traversal e colisão sem sobrescrever.
 */
import { existsSync } from 'fs'
import { basename, extname, join, resolve, relative, isAbsolute } from 'path'

const RESERVADOS = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

function dentroDe(dir: string, candidato: string): boolean {
  const rel = relative(resolve(dir), resolve(candidato))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Remove path traversal, chars inválidos Windows, nomes reservados.
 * Resultado nunca começa com '.' ou '-'; máx 120 chars.
 */
export function sanitizarNomeArquivo(nome: string, dirDownloads: string): string {
  let n = String(nome || '')
  // null bytes e separadores
  n = n.replace(/\0/g, '')
  n = n.replace(/\\/g, '/')
  // só o basename (descarta ../../)
  n = basename(n)
  n = n.replace(/\.\./g, '')
  n = n.replace(/[<>:"|?*]/g, '_')
  n = n.replace(/[\u0000-\u001f]/g, '')
  n = n.trim().replace(/^\.+/, '').replace(/\.+$/, '').trim()

  // reservados Windows (com ou sem extensão)
  const baseSemExt = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : n
  if (RESERVADOS.has(baseSemExt.toUpperCase()) || RESERVADOS.has(n.toUpperCase())) {
    n = 'arquivo'
  }

  if (!n) n = 'arquivo'

  // extensão
  let ext = extname(n)
  let stem = ext ? n.slice(0, -ext.length) : n
  stem = stem.replace(/[<>:"|?*\\/]/g, '_').trim()
  if (!stem || stem === '.' || stem === '..') stem = 'arquivo'

  // cortar 120 preservando extensão
  const max = 120
  if (ext.length > 20) ext = ext.slice(0, 20)
  const maxStem = Math.max(1, max - ext.length)
  if (stem.length > maxStem) stem = stem.slice(0, maxStem)

  let out = stem + ext
  out = out.replace(/^[.\-_]+/, '')
  out = out.replace(/_{2,}/g, '_')
  if (!out || out.startsWith('.') || out.startsWith('-') || out.startsWith('_')) {
    out = 'arquivo' + (ext || '')
  }

  // validar resolve dentro de dir
  const candidato = resolve(dirDownloads, out)
  if (!dentroDe(dirDownloads, candidato) && resolve(dirDownloads) !== candidato) {
    // se o join escapar (não deveria após basename), forçar
    out = 'arquivo'
  }
  const finalPath = resolve(dirDownloads, out)
  if (!dentroDe(dirDownloads, finalPath) && resolve(dirDownloads) !== finalPath) {
    out = 'arquivo'
  }

  return out
}

/**
 * Nome legível: `relatorio.pdf`, colisão → `relatorio_1.pdf`.
 * Timestamp só se não houver nome utilizável.
 */
export function resolverCaminhoDownload(
  dirDownloads: string,
  nomeBruto: string
): { caminho: string; nomeOriginal: string; nomeSalvo: string; renomeado: boolean } {
  const nomeOriginal = String(nomeBruto || '') || 'arquivo'
  let base = sanitizarNomeArquivo(nomeOriginal, dirDownloads)

  // se sanitização caiu em genérico e havia só lixo, timestamp como fallback
  if (base === 'arquivo' && (!nomeOriginal || /[\\/]/.test(nomeOriginal))) {
    base = sanitizarNomeArquivo(`download-${Date.now()}`, dirDownloads)
  }

  const ext = extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base

  let nomeSalvo = base
  let caminho = join(dirDownloads, nomeSalvo)
  let renomeado = false
  let i = 1
  while (existsSync(caminho)) {
    nomeSalvo = `${stem}_${i}${ext}`
    // re-sanitizar o nome com sufixo (cap 120)
    nomeSalvo = sanitizarNomeArquivo(nomeSalvo, dirDownloads)
    // se sanitizar removeu o _i, forçar padrão seguro
    if (existsSync(join(dirDownloads, nomeSalvo)) && nomeSalvo === base) {
      nomeSalvo = sanitizarNomeArquivo(`${stem}_${i}${ext || '.bin'}`, dirDownloads)
    }
    caminho = join(dirDownloads, nomeSalvo)
    renomeado = true
    i += 1
    if (i > 9999) {
      nomeSalvo = sanitizarNomeArquivo(`download-${Date.now()}${ext}`, dirDownloads)
      caminho = join(dirDownloads, nomeSalvo)
      break
    }
  }

  // última guarda path traversal
  if (!dentroDe(dirDownloads, caminho)) {
    nomeSalvo = 'arquivo'
    caminho = join(dirDownloads, nomeSalvo)
    let j = 1
    while (existsSync(caminho)) {
      nomeSalvo = `arquivo_${j}`
      caminho = join(dirDownloads, nomeSalvo)
      j++
    }
    renomeado = true
  }

  return { caminho, nomeOriginal, nomeSalvo, renomeado }
}
