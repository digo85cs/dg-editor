import { promises as fsp } from 'fs'
import { aplicarEol, detectarEol, escreverAtomico, type EolKind } from '../fs-atomico'

export async function lerNotaArquivo(caminho: string): Promise<{
  texto: string
  eol: EolKind
}> {
  const buf = await fsp.readFile(caminho)
  const texto = buf.toString('utf8')
  return { texto, eol: detectarEol(texto) }
}

/**
 * Salva UTF-8 preservando EOL original do arquivo (ou o informado).
 * Conteúdo do editor pode vir com \n; reaplicamos CRLF se necessário.
 */
export async function salvarNotaAtomica(
  caminho: string,
  conteudo: string,
  eol: EolKind
): Promise<void> {
  const final = aplicarEol(conteudo, eol)
  await escreverAtomico(caminho, final)
}
