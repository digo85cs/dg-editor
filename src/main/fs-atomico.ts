/**
 * Escrita atômica UTF-8: grava em arquivo temporário no mesmo diretório e renomeia.
 * Evita truncar o destino se o processo cair no meio do write.
 */
import { promises as fsp } from 'fs'
import { dirname, join, basename } from 'path'
import { randomBytes } from 'crypto'

export type EolKind = 'lf' | 'crlf'

export function detectarEol(texto: string): EolKind {
  return /\r\n/.test(texto) ? 'crlf' : 'lf'
}

/** Normaliza quebras internas para o EOL desejado (conteúdo lógico em LF no editor). */
export function aplicarEol(texto: string, eol: EolKind): string {
  const lf = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf
}

export async function escreverAtomico(caminho: string, conteudo: string): Promise<void> {
  const dir = dirname(caminho)
  const nome = basename(caminho)
  const tmp = join(dir, `.${nome}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await fsp.writeFile(tmp, conteudo, 'utf8')
    await fsp.rename(tmp, caminho)
  } catch (e) {
    try {
      await fsp.unlink(tmp)
    } catch {
      /* ignore */
    }
    throw e
  }
}
