/**
 * Persistência de mapas mentais em `.dg-editor/mapas/<nome>.md`.
 * O outline Markdown é a fonte de verdade; o layout é calculado na renderização.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { lerNotaArquivo, salvarNotaAtomica } from '../vault/io'
import { contarNos, parseOutline, profundidadeMax, serializarOutline } from './outline'

export type ResumoMapa = {
  nome: string
  caminho: string
  mtimeMs: number
  nos: number
}

export function pastaMapas(raiz: string): string {
  return join(resolve(raiz), '.dg-editor', 'mapas')
}

export function nomeMapaSeguro(nome: unknown): string | null {
  if (typeof nome !== 'string') return null
  const base = nome.trim().replace(/\.md$/i, '')
  if (!base || /[/\\<>:"|?*\u0000-\u001f]/.test(base) || base === '.' || base === '..') return null
  const limpo = base.replace(/^\.+/, '').trim().slice(0, 80)
  if (!limpo || limpo === '.' || limpo === '..') return null
  return limpo
}

function caminhoDoMapa(raiz: string, nome: string): string | null {
  const seguro = nomeMapaSeguro(nome)
  if (!seguro) return null
  const pasta = pastaMapas(raiz)
  const abs = resolve(pasta, seguro + '.md')
  const rel = relative(pasta, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return abs
}

export function listarMapas(raiz: string): ResumoMapa[] {
  const pasta = pastaMapas(raiz)
  if (!existsSync(pasta)) return []
  const out: ResumoMapa[] = []
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (!entrada.isFile() || !/\.md$/i.test(entrada.name)) continue
    const caminho = join(pasta, entrada.name)
    let nos = 0
    try {
      const texto = readFileSync(caminho, 'utf8')
      const arvore = parseOutline(texto)
      if (arvore) nos = contarNos(arvore)
    } catch {
      /* arquivo ilegível ainda aparece na lista */
    }
    let mtimeMs = 0
    try {
      mtimeMs = statSync(caminho).mtimeMs
    } catch {
      /* */
    }
    out.push({ nome: entrada.name.replace(/\.md$/i, ''), caminho, mtimeMs, nos })
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs || a.nome.localeCompare(b.nome))
}

export async function salvarMapa(
  raiz: string,
  nome: string,
  outline: string
): Promise<
  | { ok: true; nome: string; caminho: string; nos: number; profundidade: number }
  | { ok: false; erro: string }
> {
  const abs = caminhoDoMapa(raiz, nome)
  if (!abs) return { ok: false, erro: 'nome de mapa inválido' }
  const arvore = parseOutline(outline)
  if (!arvore) return { ok: false, erro: 'o outline está vazio — adicione ao menos um tópico' }
  try {
    mkdirSync(pastaMapas(raiz), { recursive: true })
    await salvarNotaAtomica(abs, serializarOutline(arvore), 'lf')
    return {
      ok: true,
      nome: nomeMapaSeguro(nome) || nome,
      caminho: abs,
      nos: contarNos(arvore),
      profundidade: profundidadeMax(arvore)
    }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

export async function carregarMapa(
  raiz: string,
  nome: string
): Promise<{ ok: true; nome: string; outline: string; caminho: string } | { ok: false; erro: string }> {
  const abs = caminhoDoMapa(raiz, nome)
  if (!abs) return { ok: false, erro: 'nome de mapa inválido' }
  if (!existsSync(abs)) return { ok: false, erro: 'mapa não encontrado: ' + nome }
  try {
    const { texto } = await lerNotaArquivo(abs)
    return { ok: true, nome: nomeMapaSeguro(nome) || nome, outline: texto, caminho: abs }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

export function excluirMapa(raiz: string, nome: string): { ok: true } | { ok: false; erro: string } {
  const abs = caminhoDoMapa(raiz, nome)
  if (!abs) return { ok: false, erro: 'nome de mapa inválido' }
  if (!existsSync(abs)) return { ok: false, erro: 'mapa não encontrado: ' + nome }
  try {
    rmSync(abs)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}
