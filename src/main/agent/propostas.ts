/**
 * Propostas de edição locais (mesmo contrato OpenClaw diffs) —
 * agente MCP em modo propose não escreve; acumula unified diffs.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, join, relative } from 'path'
import {
  registrarPendentes,
  listarPendentes,
  aplicarPendenteAprovado,
  marcarRejeitado,
  obterPendente,
  type EditPendente
} from '../openclaw/diffs'
import { criarCheckpoint } from './checkpoint'

const WRITE_TOOLS = new Set(['codigo_editar', 'vault_write', 'dossie_write'])

export function ehToolEscrita(nome: string): boolean {
  return WRITE_TOOLS.has(nome)
}

/** Gera unified diff linha a linha (replace completo). */
export function diffUnificado(pathLabel: string, antes: string, depois: string): string {
  const a = antes.replace(/\r\n/g, '\n').split('\n')
  const b = depois.replace(/\r\n/g, '\n').split('\n')
  // remove trailing empty from split if both empty file
  const lines: string[] = [
    '--- a/' + pathLabel,
    '+++ b/' + pathLabel,
    '@@ -1,' + Math.max(1, a.length) + ' +1,' + Math.max(1, b.length) + ' @@'
  ]
  for (const ln of a) lines.push('-' + ln)
  for (const ln of b) lines.push('+' + ln)
  return lines.join('\n') + '\n'
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
  const reg = registrarPendentes([{ path: abs, unifiedDiff }], pastas.length ? pastas : [raiz])
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
  const reg = registrarPendentes([{ path: abs, unifiedDiff }], pastas.length ? pastas : [raiz])
  if (!reg.pendentes.length) {
    return { ok: false, texto: 'proposta rejeitada ACL: ' + (reg.rejeitados[0]?.erro || '') }
  }
  return {
    ok: true,
    texto: 'PROPOSTA registrada id=' + reg.pendentes[0].id + ' path=' + rel + ' (aguardando aprovacao humana)',
    pendente: reg.pendentes[0]
  }
}

export async function aplicarPropostaComCheckpoint(
  id: string,
  pastas: string[]
): Promise<{ ok: boolean; erro?: string; checkpointId?: string; absPath?: string }> {
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
  return { ...r, checkpointId }
}

export {
  listarPendentes,
  marcarRejeitado,
  obterPendente,
  aplicarPendenteAprovado,
  type EditPendente
}
