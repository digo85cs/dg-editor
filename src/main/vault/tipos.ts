import type { EolKind } from '../fs-atomico'

export type FrontmatterVault = {
  /** Bloco bruto entre --- (sem os delimitadores), ou '' se ausente */
  raw: string
  titulo?: string
  aliases: string[]
  tags: string[]
  /** Outras chaves simples chave: valor (string) */
  extras: Record<string, string>
}

export type NotaVault = {
  path: string
  rel: string
  basename: string
  titulo: string
  frontmatter: FrontmatterVault
  tags: string[]
  /** Alvos [[link]] crus (sem alias display) */
  linksOut: string[]
  eol: EolKind
  mtimeMs: number
}

export type EstadoVault = {
  aberto: boolean
  raiz: string | null
  totalNotas: number
  indexando: boolean
}

export type ResumoNota = {
  path: string
  rel: string
  titulo: string
  tags: string[]
}
