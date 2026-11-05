/**
 * Propostas de edição locais (mesmo contrato OpenClaw diffs) —
 * agente MCP em modo propose não escreve; acumula unified diffs.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, join, relative } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  adicionarPendentes,
  listarPendentes,
  aplicarPendenteAprovado,
  marcarRejeitado,
  obterPendente,
  type EditPendente
} from '../openclaw/diffs'
import { gerarDiffUnificado } from '../openclaw/hunks'
import { criarCheckpoint } from './checkpoint'

const WRITE_TOOLS = new Set(['codigo_editar', 'vault_write', 'dossie_write'])

export function ehToolEscrita(nome: string): boolean {
  return WRITE_TOOLS.has(nome)
}

/** Gera unified diff com hunks (LCS). */
export function diffUnificado(pathLabel: string, antes: string, depois: string): string {
  return gerarDiffUnificado(pathLabel, antes, depois)
}

export function proporCodigoEditar(
  raiz: string,
  args: { arquivo?: string; ancora?: string; novo?: string },
  pastas: string[]
): { ok: boolean; texto: string; pendente?: EditPendente } {
  const arquivo = String(args.arquivo || '')
  const ancora = String(args.ancora || '')
  const novo = String(args.novo ?? '')
  const abs = resolve(arquivo.startsWith('/') || /^[A-Za-z]:/.test(arquivo) ? arquivo : join(raiz, arquivo))
  if (!existsSync(abs)) return { ok: false, texto: 'arquivo nao encontrado: ' + arquivo }
  const antes = readFileSync(abs, 'utf8')
  const n = ancora ? antes.split(ancora).length - 1 : 0
  if (!ancora || n === 0) return { ok: false, texto: 'ancora nao encontrada' }
  if (n > 1) return { ok: false, texto: 'ancora ambigua (' + n + ')' }
  const depois = antes.replace(ancora, novo)
  const rel = relative(raiz, abs).replace(/\\/g, '/') || abs
  const unifiedDiff = diffUnificado(rel, antes, depois)
  const reg = adicionarPendentes([{ path: abs, unifiedDiff }], pastas.length ? pastas : [raiz], 'agent')
  if (!reg.pendentes.length) {
    return { ok: false, texto: 'proposta rejeitada ACL: ' + (reg.rejeitados[0]?.erro || '') }
  }
  return {
    ok: true,
    texto: 'PROPOSTA registrada id=' + reg.pendentes[0].id + ' path=' + rel + ' (aguardando aprovacao humana)',
    pendente: reg.pendentes[0]
  }
}

export function proporEscritaCompleta(
  raiz: string,
  caminho: string,
  conteudo: string,
  pastas: string[]
): { ok: boolean; texto: string; pendente?: EditPendente } {
  const abs = resolve(caminho.startsWith('/') || /^[A-Za-z]:/.test(caminho) ? caminho : join(raiz, caminho))
  const antes = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
  const rel = relative(raiz, abs).replace(/\\/g, '/') || abs
  const unifiedDiff = diffUnificado(rel, antes, String(conteudo ?? ''))
  const reg = adicionarPendentes([{ path: abs, unifiedDiff }], pastas.length ? pastas : [raiz], 'agent')
  if (!reg.pendentes.length) {
    return { ok: false, texto: 'proposta rejeitada ACL: ' + (reg.rejeitados[0]?.erro || '') }
  }
  return {
    ok: true,
    texto: 'PROPOSTA registrada id=' + reg.pendentes[0].id + ' path=' + rel + ' (aguardando aprovacao humana)',
    pendente: reg.pendentes[0]
  }
}

const execFileAsync = promisify(execFile)

function normPath(p: string): string {
  return resolve(p).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
}

/** Commit local so do arquivo aceito, e so se a pasta aberta for a raiz do git. */
async function commitArquivoAceito(absPath: string, pastas: string[], id: string): Promise<string | undefined> {
  let top = ''
  try {
    const r = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: resolve(absPath, '..'),
      windowsHide: true,
      timeout: 4000
    })
    top = String(r.stdout || '').trim()
  } catch {
    return undefined
  }
  const topN = normPath(top)
  const raizAbertaEhRepo = pastas.some((p) => normPath(p) === topN)
  const arquivoNoProjeto = pastas.some((p) => {
    const n = normPath(p)
    const a = normPath(absPath)
    return a === n || a.startsWith(n + '/')
  })
  if (!raizAbertaEhRepo || !arquivoNoProjeto) return undefined
  const msg = 'dg: alteracao aceita ' + id.slice(0, 8)
  try {
    await execFileAsync('git', ['add', '--', absPath], { cwd: top, windowsHide: true, timeout: 8000 })
    await execFileAsync('git', ['commit', '-m', msg, '--', absPath], { cwd: top, windowsHide: true, timeout: 15000 })
    return msg
  } catch {
    return undefined
  }
}

export async function aplicarPropostaComCheckpoint(
  id: string,
  pastas: string[]
): Promise<{ ok: boolean; erro?: string; checkpointId?: string; absPath?: string; commit?: string }> {
  const pend = obterPendente(id)
  if (!pend) return { ok: false, erro: 'pendente inexistente' }
  let checkpointId: string | undefined
  try {
    const ck = await criarCheckpoint([pend.absPath], 'agente:aplicar')
    checkpointId = ck.id
  } catch {
    /* best-effort */
  }
  const r = await aplicarPendenteAprovado(id, pastas)
  let commit: string | undefined
  if (r.ok && r.absPath) commit = await commitArquivoAceito(r.absPath, pastas, id)
  return { ...r, checkpointId, commit }
}

export {
  listarPendentes,
  marcarRejeitado,
  obterPendente,
  aplicarPendenteAprovado,
  type EditPendente
}
