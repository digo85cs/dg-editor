import { promises as fsp, existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { randomBytes, createHash } from 'crypto'
import { caminhoSeguro } from '../ipc-seguro'
import { resolverRaizDGEditor } from '../paths'
import { dglog } from '../dglog'
import type { EditProposta } from './cliente'
import { filtrarHunks, listarHunks, type HunkInfo } from './hunks'

export type EditPendente = EditProposta & {
  id: string
  absPath: string
  status: 'pendente' | 'aplicado' | 'rejeitado'
  /** origem da proposta — fila unificada Agent/OpenClaw */
  origem?: 'agent' | 'openclaw' | 'manual'
  /** sha256(16) do arquivo no momento da proposta; ausente = arquivo nao existia ou legado */
  hashAlvo?: string
  /** true se o arquivo existia ao registrar; false se nao existia (diff de criacao); undefined = legado */
  alvoExistia?: boolean
}

let pendentes = new Map<string, EditPendente>()

// Estado por projeto ja visitado na sessao: trocar de raiz (DG_ROOT) nao pode
// misturar propostas — cada projeto tem o seu .dg-editor/openclaw/pendentes.json.
const visitados = new Map<string, Map<string, EditPendente>>()
let raizStore: string | null = null

// ---------------------------------------------------------------------------
// Persistencia em disco: <projeto>/.dg-editor/openclaw/pendentes.json.
// Sobrevive a fechar/abrir o app. Gravacao atomica (.tmp + rename) e carga
// tolerante a JSON corrompido (renomeia para .corrompido e segue vazio).
// ---------------------------------------------------------------------------

function storePath(): string {
  return join(resolverRaizDGEditor(), '.dg-editor', 'openclaw', 'pendentes.json')
}

function carregarStore(): void {
  const raiz = resolverRaizDGEditor()
  if (raiz === raizStore) return
  if (raizStore !== null) {
    // guarda o estado do projeto anterior em memoria antes de trocar
    visitados.set(raizStore, pendentes)
    pendentes = new Map()
  }
  // primeira visita a esta raiz na sessao: se ja foi vista, restaura da memoria
  // (sem reler o disco — o disco so e fonte na primeira visita)
  const conhecido = visitados.get(raiz)
  if (conhecido) {
    pendentes = conhecido
    raizStore = raiz
    return
  }
  raizStore = raiz
  // Se raizStore era null (primeira chamada do processo), `pendentes` pode ja
  // conter registros feitos antes da primeira gravacao — NAO zerar; so mesclar.
  try {
    const p = storePath()
    if (!existsSync(p)) return
    const j = JSON.parse(readFileSync(p, 'utf8'))
    const lista = Array.isArray(j) ? j : j?.pendentes
    if (!Array.isArray(lista)) throw new Error('formato inesperado')
    let n = 0
    for (const item of lista) {
      if (!item || typeof item.id !== 'string' || typeof item.absPath !== 'string') continue
      if (item.status !== 'pendente') continue // so recarrega o que ainda espera aprovacao
      if (pendentes.has(item.id)) continue
      pendentes.set(item.id, item as EditPendente)
      n++
    }
    if (n) dglog('[propostas] ' + n + ' pendente(s) restaurada(s) do disco')
  } catch (e) {
    dglog('[propostas] store corrompido, renomeando para .corrompido', { erro: String(e) }, 'warn')
    try { renameSync(storePath(), storePath() + '.corrompido') } catch { /* */ }
  }
}

function persistirStore(): void {
  try {
    carregarStore()
    const p = storePath()
    mkdirSync(dirname(p), { recursive: true })
    const lista = [...pendentes.values()].filter((x) => x.status === 'pendente')
    const tmp = p + '.tmp'
    writeFileSync(tmp, JSON.stringify({ pendentes: lista }, null, 1), 'utf8')
    renameSync(tmp, p)
  } catch (e) {
    dglog('[propostas] falha ao gravar store', { erro: String(e) }, 'warn')
  }
}

export function limparPendentes(): void {
  carregarStore()
  pendentes.clear()
  persistirStore()
}

export function listarPendentes(): EditPendente[] {
  carregarStore()
  return [...pendentes.values()].filter((p) => p.status === 'pendente')
}

function hashArquivo(abs: string): { existia: boolean; hash?: string } {
  try {
    return { existia: true, hash: hashConteudo(readFileSync(abs, 'utf8')) }
  } catch {
    return { existia: false }
  }
}

function registrarUm(
  e: EditProposta,
  pastas: string[],
  origem: EditPendente['origem'],
  okList: EditPendente[],
  rejeitados: Array<{ path: string; erro: string }>
): void {
  let absFinal: string | null = null
  const seg = caminhoSeguro(e.path, pastas)
  if (!seg.ok) {
    for (const raiz of pastas) {
      const cand = resolve(raiz, e.path)
      const s = caminhoSeguro(cand, pastas)
      if (s.ok) {
        absFinal = s.abs
        break
      }
    }
    if (!absFinal) {
      const erroSeg = 'erro' in seg ? String(seg.erro) : 'path fora das pastas'
      rejeitados.push({ path: e.path, erro: erroSeg })
      return
    }
  } else {
    absFinal = seg.abs
  }
  const id = randomBytes(8).toString('hex')
  const alvo = hashArquivo(absFinal)
  const p: EditPendente = {
    id,
    path: e.path,
    unifiedDiff: e.unifiedDiff,
    absPath: absFinal,
    status: 'pendente',
    origem,
    hashAlvo: alvo.hash,
    alvoExistia: alvo.existia
  }
  pendentes.set(id, p)
  okList.push(p)
}

/** Substitui a fila (OpenClaw pedir). */
export function registrarPendentes(
  edits: EditProposta[],
  pastas: string[],
  origem: EditPendente['origem'] = 'openclaw'
): { ok: boolean; pendentes: EditPendente[]; rejeitados: Array<{ path: string; erro: string }> } {
  limparPendentes()
  return adicionarPendentes(edits, pastas, origem)
}

/** Acumula na fila sem limpar (Agent / multi-turno). */
export function adicionarPendentes(
  edits: EditProposta[],
  pastas: string[],
  origem: EditPendente['origem'] = 'agent'
): { ok: boolean; pendentes: EditPendente[]; rejeitados: Array<{ path: string; erro: string }> } {
  carregarStore()
  const okList: EditPendente[] = []
  const rejeitados: Array<{ path: string; erro: string }> = []
  for (const e of edits) {
    registrarUm(e, pastas, origem, okList, rejeitados)
  }
  persistirStore()
  return { ok: true, pendentes: okList, rejeitados }
}

export function obterPendente(id: string): EditPendente | null {
  carregarStore()
  return pendentes.get(id) || null
}

export function marcarRejeitado(id: string): boolean {
  carregarStore()
  const p = pendentes.get(id)
  if (!p || p.status !== 'pendente') return false
  p.status = 'rejeitado'
  persistirStore()
  return true
}

export function listarHunksPendente(id: string): { ok: boolean; erro?: string; hunks?: HunkInfo[] } {
  const p = obterPendente(id)
  if (!p || p.status !== 'pendente') return { ok: false, erro: 'pendente inexistente' }
  return { ok: true, hunks: listarHunks(p.unifiedDiff) }
}

/** Mantém só os hunks aceitos; se vazio, rejeita o pendente. */
export function definirHunksPendente(
  id: string,
  indicesAceitos: number[]
): { ok: boolean; erro?: string; pendente?: EditPendente; rejeitado?: boolean } {
  const p = obterPendente(id)
  if (!p || p.status !== 'pendente') return { ok: false, erro: 'pendente inexistente' }
  if (!indicesAceitos.length) {
    p.status = 'rejeitado'
    persistirStore()
    return { ok: true, rejeitado: true, pendente: p }
  }
  const novo = filtrarHunks(p.unifiedDiff, indicesAceitos)
  if (!novo.trim()) return { ok: false, erro: 'diff vazio apos filtro' }
  p.unifiedDiff = novo
  persistirStore()
  return { ok: true, pendente: p }
}

export function atualizarDiffPendente(
  id: string,
  unifiedDiff: string
): { ok: boolean; erro?: string; pendente?: EditPendente } {
  const p = obterPendente(id)
  if (!p || p.status !== 'pendente') return { ok: false, erro: 'pendente inexistente' }
  p.unifiedDiff = String(unifiedDiff || '')
  persistirStore()
  return { ok: true, pendente: p }
}

/**
 * Aplica unified diff simples (hunks @@) sobre o arquivo atual.
 * Suporta create se o arquivo não existir e o diff for só adições.
 */
export function aplicarUnifiedDiff(original: string, diff: string): { ok: boolean; resultado?: string; erro?: string } {
  const lines = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  // remove trailing empty from split if file ended with newline handled below
  const diffLines = String(diff || '').replace(/\r\n/g, '\n').split('\n')
  const hunks: Array<{ oldStart: number; lines: string[] }> = []
  let i = 0
  while (i < diffLines.length) {
    const m = diffLines[i].match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/)
    if (!m) {
      i++
      continue
    }
    const oldStart = parseInt(m[1], 10)
    const body: string[] = []
    i++
    while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
      if (diffLines[i].startsWith('diff ') || diffLines[i].startsWith('index ') || diffLines[i].startsWith('---') || diffLines[i].startsWith('+++')) {
        break
      }
      body.push(diffLines[i])
      i++
    }
    hunks.push({ oldStart, lines: body })
  }
  if (!hunks.length) {
    // se o "diff" for o arquivo completo novo sem hunks, recusar
    return { ok: false, erro: 'diff sem hunks @@' }
  }

  // Aplica do fim para o início para não deslocar offsets
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart)
  let out = [...lines]
  // se original vazio e split deu [''], trate como sem linhas
  if (original === '') out = []

  for (const h of sorted) {
    const start = Math.max(0, h.oldStart - 1)
    const resultChunk: string[] = []
    let cursor = start
    for (const ln of h.lines) {
      if (ln.startsWith('+') && !ln.startsWith('+++')) {
        resultChunk.push(ln.slice(1))
      } else if (ln.startsWith('-') && !ln.startsWith('---')) {
        // remove: avança no original
        if (out[cursor] === undefined && original !== '') {
          return { ok: false, erro: 'diff nao aplica: linha ausente em -' }
        }
        cursor++
      } else if (ln.startsWith(' ') || ln === '') {
        const expected = ln.startsWith(' ') ? ln.slice(1) : ''
        if (out[cursor] !== undefined && out[cursor] !== expected && ln.startsWith(' ')) {
          // contexto frouxo: ainda avança
        }
        if (out[cursor] !== undefined) {
          resultChunk.push(out[cursor])
          cursor++
        } else if (ln.startsWith(' ')) {
          resultChunk.push(expected)
        }
      } else if (ln.startsWith('\\')) {
        /* "No newline at end of file" */
      } else {
        // linha sem prefixo: tratar como contexto
        if (out[cursor] !== undefined) {
          resultChunk.push(out[cursor])
          cursor++
        }
      }
    }
    const end = cursor
    out = [...out.slice(0, start), ...resultChunk, ...out.slice(end)]
  }

  let resultado = out.join('\n')
  if (original.endsWith('\n') && !resultado.endsWith('\n')) resultado += '\n'
  return { ok: true, resultado }
}

async function escreverAtomico(caminho: string, conteudo: string): Promise<void> {
  const dir = dirname(caminho)
  const tmp = resolve(dir, `.oc-${randomBytes(4).toString('hex')}.tmp`)
  try {
    await fsp.writeFile(tmp, conteudo, 'utf8')
    await fsp.rename(tmp, caminho)
  } catch (e) {
    try {
      await fsp.unlink(tmp)
    } catch {
      /* */
    }
    throw e
  }
}

export function hashConteudo(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16)
}

/** Preview em memória (antes/depois + linhas tocadas) sem gravar disco. */
export async function previewPendente(
  id: string,
  pastas: string[]
): Promise<{
  ok: boolean
  erro?: string
  absPath?: string
  antes?: string
  depois?: string
  linhasDel?: number[]
  linhasAdd?: number[]
}> {
  const p = obterPendente(id)
  if (!p) return { ok: false, erro: 'pendente inexistente' }
  if (p.status !== 'pendente') return { ok: false, erro: 'ja processado: ' + p.status }
  const seg = caminhoSeguro(p.absPath, pastas)
  if (!seg.ok) {
    return { ok: false, erro: 'erro' in seg ? String(seg.erro) : 'path fora das pastas' }
  }
  let original = ''
  try {
    original = await fsp.readFile(seg.abs, 'utf8')
  } catch {
    original = ''
  }
  const applied = aplicarUnifiedDiff(original, p.unifiedDiff)
  if (!applied.ok || applied.resultado == null) return { ok: false, erro: applied.erro || 'falha ao aplicar' }
  const hunks = listarHunks(p.unifiedDiff)
  const linhasDel: number[] = []
  const linhasAdd: number[] = []
  for (const h of hunks) {
    let oldLine = h.oldStart
    let newLine = h.newStart
    for (const ln of h.lines) {
      if (ln.startsWith('+') && !ln.startsWith('+++')) {
        linhasAdd.push(newLine)
        newLine++
      } else if (ln.startsWith('-') && !ln.startsWith('---')) {
        linhasDel.push(oldLine)
        oldLine++
      } else if (ln.startsWith(' ') || ln === '') {
        oldLine++
        newLine++
      }
    }
  }
  return {
    ok: true,
    absPath: seg.abs,
    antes: original,
    depois: applied.resultado,
    linhasDel,
    linhasAdd
  }
}

export async function aplicarPendenteAprovado(
  id: string,
  pastas: string[]
): Promise<{ ok: boolean; erro?: string; absPath?: string; hashAntes?: string; hashDepois?: string }> {
  const p = obterPendente(id)
  if (!p || p.status !== 'pendente') return { ok: false, erro: 'pendente inexistente' }
  const seg = caminhoSeguro(p.absPath, pastas)
  if (!seg.ok) {
    return { ok: false, erro: 'erro' in seg ? String(seg.erro) : 'path fora das pastas' }
  }
  const stale = alvoDesatualizado(p, seg.abs)
  if (stale) return { ok: false, erro: stale }
  let original = ''
  try {
    original = await fsp.readFile(seg.abs, 'utf8')
  } catch {
    original = ''
  }
  const applied = aplicarUnifiedDiff(original, p.unifiedDiff)
  if (!applied.ok || applied.resultado == null) return { ok: false, erro: applied.erro || 'falha ao aplicar' }
  const hashAntes = hashConteudo(original)
  const hashDepois = hashConteudo(applied.resultado)
  try {
    await fsp.mkdir(dirname(seg.abs), { recursive: true })
    await escreverAtomico(seg.abs, applied.resultado)
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
  p.status = 'aplicado'
  persistirStore()
  return { ok: true, absPath: seg.abs, hashAntes, hashDepois }
}

/** Recusa diff velho: o arquivo mudou (ou passou a existir/deixar de existir) depois da proposta. */
function alvoDesatualizado(p: EditPendente, abs: string): string | null {
  if (p.alvoExistia === undefined) return null // legado sem rastreio
  const atual = hashArquivo(abs)
  if (p.alvoExistia) {
    if (!atual.existia) return 'arquivo alvo foi removido depois da proposta — recusado'
    if (atual.hash !== p.hashAlvo) return 'arquivo alvo mudou depois da proposta — recusado'
    return null
  }
  if (atual.existia) return 'arquivo alvo passou a existir depois da proposta — recusado'
  return null
}
