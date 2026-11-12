/**
 * Sanitizacao de path e validacao leve de payload IPC.
 * Nunca acessar disco se o caminho sair da raiz aberta.
 */
import { resolve, relative, isAbsolute, normalize } from 'path'

export type ResultadoCaminho =
  | { ok: true; abs: string; rel: string; erro?: string }
  | { ok: false; erro: string }

/** Resolve e garante que o caminho esta dentro de uma das raizes abertas. */
export function caminhoSeguro(
  p: unknown,
  raizesAbertas: string | string[] | null | undefined
): ResultadoCaminho {
  if (typeof p !== 'string' || !p.trim()) {
    return { ok: false, erro: 'caminho invalido: vazio' }
  }
  const lista = Array.isArray(raizesAbertas)
    ? raizesAbertas.filter((r) => typeof r === 'string' && r.trim())
    : raizesAbertas
      ? [raizesAbertas]
      : []
  if (!lista.length) {
    return { ok: false, erro: 'caminho invalido: nenhuma raiz aberta' }
  }
  let abs: string
  try {
    abs = normalize(resolve(p.trim()))
  } catch {
    return { ok: false, erro: 'caminho invalido: nao resolvivel' }
  }
  for (const raiz of lista) {
    let raizAbs: string
    try {
      raizAbs = normalize(resolve(raiz))
    } catch {
      continue
    }
    const rel = relative(raizAbs, abs).replace(/\\/g, '/')
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return { ok: true, abs, rel: rel || '.' }
    }
  }
  return { ok: false, erro: 'caminho fora da raiz aberta' }
}

export type ErroPayload = { ok: false; erro: string }

export function exigirString(v: unknown, campo: string): string | ErroPayload {
  if (typeof v !== 'string') return { ok: false, erro: `payload invalido: ${campo} deve ser string` }
  return v
}

export function exigirStringOuNulo(v: unknown, campo: string): string | null | ErroPayload {
  if (v == null) return null
  if (typeof v !== 'string') return { ok: false, erro: `payload invalido: ${campo} deve ser string|null` }
  return v
}

export function exigirBoolean(v: unknown, campo: string, padrao = false): boolean | ErroPayload {
  if (v === undefined) return padrao
  if (typeof v !== 'boolean') return { ok: false, erro: `payload invalido: ${campo} deve ser boolean` }
  return v
}

export function exigirArrayStrings(v: unknown, campo: string): string[] | ErroPayload {
  if (v == null) return []
  if (!Array.isArray(v)) return { ok: false, erro: `payload invalido: ${campo} deve ser array` }
  if (!v.every((x) => typeof x === 'string')) {
    return { ok: false, erro: `payload invalido: ${campo} so aceita strings` }
  }
  return v as string[]
}

export function exigirObjeto(v: unknown, campo: string): Record<string, unknown> | ErroPayload {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return { ok: false, erro: `payload invalido: ${campo} deve ser objeto` }
  }
  return v as Record<string, unknown>
}

export function isErroPayload(v: unknown): v is ErroPayload {
  return !!v && typeof v === 'object' && (v as ErroPayload).ok === false && 'erro' in (v as object)
}
