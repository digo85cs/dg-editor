/**
 * Catálogo de músicas livres por estilo (Kevin MacLeod / incompetech, CC BY 4.0).
 * O download é opcional e só acontece quando o usuário pede; o crédito é gravado
 * junto das faixas para cumprir a licença.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pastaMusicas } from './musicas'
import { rodar } from './core'

export type EstiloMusical =
  | 'alegre'
  | 'epica'
  | 'tensa'
  | 'calma'
  | 'misterio'
  | 'infantil'
  | 'jazz'
  | 'eletronica'
  | 'triste'
  | 'corporativo'

export type Faixa = {
  id: string
  titulo: string
  estilo: EstiloMusical
  autor: string
  licenca: 'CC BY 4.0'
  credito: string
  url: string
}

export const ESTILOS: { id: EstiloMusical; rotulo: string }[] = [
  { id: 'alegre', rotulo: 'Alegre / upbeat' },
  { id: 'epica', rotulo: 'Épica / trailer' },
  { id: 'tensa', rotulo: 'Tensa / suspense' },
  { id: 'calma', rotulo: 'Calma / relax' },
  { id: 'misterio', rotulo: 'Mistério / cômico' },
  { id: 'infantil', rotulo: 'Infantil / engraçada' },
  { id: 'jazz', rotulo: 'Jazz / lounge' },
  { id: 'eletronica', rotulo: 'Eletrônica / 8-bit' },
  { id: 'triste', rotulo: 'Triste / dramática' },
  { id: 'corporativo', rotulo: 'Corporativo / inspiracional' }
]

const BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'
const AUTOR = 'Kevin MacLeod'
const LICENCA = 'CC BY 4.0' as const
const CREDITO = 'Music by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0'

function faixa(id: string, titulo: string, estilo: EstiloMusical): Faixa {
  return {
    id,
    titulo,
    estilo,
    autor: AUTOR,
    licenca: LICENCA,
    credito: CREDITO,
    url: BASE + encodeURIComponent(titulo) + '.mp3'
  }
}

export const CATALOGO: Faixa[] = [
  faixa('carefree', 'Carefree', 'alegre'),
  faixa('life-of-riley', 'Life of Riley', 'alegre'),
  faixa('wholesome', 'Wholesome', 'alegre'),
  faixa('five-armies', 'Five Armies', 'epica'),
  faixa('heroic-age', 'Heroic Age', 'epica'),
  faixa('future-gladiator', 'Future Gladiator', 'epica'),
  faixa('epic-unease', 'Epic Unease', 'tensa'),
  faixa('volatile-reaction', 'Volatile Reaction', 'tensa'),
  faixa('wallpaper', 'Wallpaper', 'calma'),
  faixa('meditation-impromptu-01', 'Meditation Impromptu 01', 'calma'),
  faixa('chill-wave', 'Chill Wave', 'calma'),
  faixa('river-flute', 'River Flute', 'calma'),
  faixa('ghost-story', 'Ghost Story', 'misterio'),
  faixa('sneaky-snitch', 'Sneaky Snitch', 'misterio'),
  faixa('dark-fog', 'Dark Fog', 'misterio'),
  faixa('fluffing-a-duck', 'Fluffing a Duck', 'infantil'),
  faixa('monkeys-spinning-monkeys', 'Monkeys Spinning Monkeys', 'infantil'),
  faixa('lobby-time', 'Lobby Time', 'jazz'),
  faixa('acidjazz', 'AcidJazz', 'eletronica'),
  faixa('electrodoodle', 'Electrodoodle', 'eletronica'),
  faixa('bit-shift', 'Bit Shift', 'eletronica'),
  faixa('heartbreaking', 'Heartbreaking', 'triste'),
  faixa('inspired', 'Inspired', 'corporativo')
]

export function acharFaixa(id: string): Faixa | undefined {
  return CATALOGO.find((f) => f.id === id)
}

function arquivoDaFaixa(f: Faixa): string {
  return join(pastaMusicas(), f.estilo, f.id + '.mp3')
}

export function catalogoLivres(): {
  ok: boolean
  pasta: string
  total: number
  estilos: { id: EstiloMusical; rotulo: string; total: number; faixas: (Faixa & { baixada: boolean; bytes?: number })[] }[]
} {
  const pasta = pastaMusicas()
  return {
    ok: true,
    pasta,
    total: CATALOGO.length,
    estilos: ESTILOS.map((e) => {
      const faixas = CATALOGO.filter((f) => f.estilo === e.id).map((f) => {
        const caminho = arquivoDaFaixa(f)
        const baixada = existsSync(caminho) && statSync(caminho).size > 100 * 1024
        return { ...f, baixada, bytes: baixada ? statSync(caminho).size : undefined }
      })
      return { id: e.id, rotulo: e.rotulo, total: faixas.length, faixas }
    })
  }
}

type Baixada = { id: string; titulo: string; caminho: string; bytes: number; duracaoSeg?: number }
type Falha = { id: string; titulo: string; erro: string }

export function gravarCreditos(faixas: Faixa[], pasta: string): string {
  const caminho = join(pasta, 'CREDITOS.json')
  let atuais: Record<string, unknown> = {}
  try {
    atuais = JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, unknown>
  } catch {
    /* primeiro download */
  }
  for (const f of faixas) {
    atuais[f.id] = { titulo: f.titulo, autor: f.autor, licenca: f.licenca, credito: f.credito, url: f.url }
  }
  writeFileSync(caminho, JSON.stringify(atuais, null, 2), 'utf8')
  return caminho
}

async function baixarUma(f: Faixa, sobrescrever: boolean): Promise<Baixada> {
  const destino = arquivoDaFaixa(f)
  if (!sobrescrever && existsSync(destino) && statSync(destino).size > 100 * 1024) {
    const p = await duracao(destino)
    return { id: f.id, titulo: f.titulo, caminho: destino, bytes: statSync(destino).size, duracaoSeg: p }
  }
  mkdirSync(join(pastaMusicas(), f.estilo), { recursive: true })
  const res = await fetch(f.url, {
    signal: AbortSignal.timeout(180_000),
    headers: { 'User-Agent': 'DG-Editor/0.3 (banco-musicas)' }
  })
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status)
  const tipo = (res.headers.get('content-type') || '').toLowerCase()
  if (tipo && !/audio|octet-stream|mpeg/.test(tipo)) throw new Error('resposta inesperada: ' + tipo)
  const tmp = destino + '.part'
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(tmp))
  const bytes = statSync(tmp).size
  if (bytes < 100 * 1024) throw new Error('arquivo pequeno demais (' + bytes + ' bytes)')
  if (bytes > 30 * 1024 * 1024) throw new Error('arquivo grande demais')
  const p = await duracao(tmp)
  if (p === undefined) throw new Error('não é um áudio válido')
  renameSync(tmp, destino)
  return { id: f.id, titulo: f.titulo, caminho: destino, bytes, duracaoSeg: p }
}

async function duracao(caminho: string): Promise<number | undefined> {
  const r = await rodar(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', caminho],
    30_000
  )
  const n = Number(String(r.stdout || '').trim())
  return r.ok && Number.isFinite(n) && n > 0 ? +n.toFixed(2) : undefined
}

export async function baixarFaixas(opts: {
  estilo?: string
  ids?: string[]
  sobrescrever?: boolean
}): Promise<{
  ok: boolean
  pasta: string
  baixadas: Baixada[]
  falhas: Falha[]
  creditos?: string
  erro?: string
}> {
  const estilo = String(opts.estilo || '').trim()
  const ids = Array.isArray(opts.ids) ? opts.ids.map(String) : []
  let alvo: Faixa[] = []
  if (ids.length) {
    const desconhecidas = ids.filter((id) => !acharFaixa(id))
    if (desconhecidas.length) {
      return { ok: false, pasta: pastaMusicas(), baixadas: [], falhas: [], erro: 'faixa desconhecida: ' + desconhecidas.join(', ') }
    }
    alvo = ids.map((id) => acharFaixa(id) as Faixa)
  } else if (estilo) {
    if (!ESTILOS.some((e) => e.id === estilo)) {
      return { ok: false, pasta: pastaMusicas(), baixadas: [], falhas: [], erro: 'estilo desconhecido: ' + estilo }
    }
    alvo = CATALOGO.filter((f) => f.estilo === estilo)
  } else {
    return { ok: false, pasta: pastaMusicas(), baixadas: [], falhas: [], erro: 'informe o estilo ou os ids das faixas' }
  }

  const baixadas: Baixada[] = []
  const falhas: Falha[] = []
  for (const f of alvo) {
    try {
      baixadas.push(await baixarUma(f, opts.sobrescrever === true))
    } catch (e) {
      falhas.push({ id: f.id, titulo: f.titulo, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  const creditos = baixadas.length ? gravarCreditos(alvo.filter((f) => baixadas.some((b) => b.id === f.id)), pastaMusicas()) : undefined
  return { ok: baixadas.length > 0, pasta: pastaMusicas(), baixadas, falhas, creditos }
}
