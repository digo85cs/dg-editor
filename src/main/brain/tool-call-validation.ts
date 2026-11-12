import type { McpTool } from '../mcp/client'
import { CodigoErro, criarErro, type ErroApp } from '../../shared/erros'

export interface ToolCallNorm {
  name: string
  arguments: Record<string, unknown>
}

export function normalizarArgs(bruto: unknown): Record<string, unknown> {
  if (!bruto) return {}
  if (typeof bruto === 'string') {
    const s = bruto.trim()
    if (!s) return {}
    try {
      const p = JSON.parse(s)
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      return {}
    }
    return {}
  }
  if (typeof bruto === 'object' && !Array.isArray(bruto)) return bruto as Record<string, unknown>
  return {}
}

/** Remove artefatos de schema achatados por modelos pequenos e coage tipos básicos. */
export function sanitizarArgs(brutos: Record<string, unknown>, schema: unknown): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  const props = (schema as { properties?: Record<string, { type?: string }> })?.properties || {}
  const lixo = new Set(['type', 'description', 'properties', 'required', 'object', 'nil', '[]', 'Lista', 'lista'])

  for (const [k, v] of Object.entries(brutos)) {
    if (lixo.has(k)) continue
    const def = props[k]
    if (!def) {
      if (v === null || v === undefined) continue
      if (typeof v === 'object') {
        const pareceSchema = typeof v === 'object' && v !== null && ('type' in (v as object) || 'properties' in (v as object))
        if (pareceSchema) continue
      }
      saida[k] = v
      continue
    }
    if (def.type === 'integer' || def.type === 'number') {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      if (!Number.isNaN(n)) saida[k] = n
    } else if (def.type === 'string') {
      if (typeof v === 'string') saida[k] = v
      else if (v !== null && v !== undefined) saida[k] = String(v)
    } else if (def.type === 'boolean') {
      saida[k] = v === true || v === 'true'
    } else if (def.type === 'array' && Array.isArray(v)) {
      saida[k] = v
    } else if (def.type === 'object' && typeof v === 'object' && v !== null) {
      const pareceSchema = 'type' in (v as object) || 'properties' in (v as object)
      if (!pareceSchema) saida[k] = v
    }
  }
  return saida
}

function schemaRequired(schema: unknown): string[] {
  const r = (schema as { required?: unknown })?.required
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}

export function criarErroTool(codigo: CodigoErro, mensagem: string, detalhe?: string): ErroApp {
  return criarErro(codigo, mensagem, 'Revise a chamada da ferramenta ou tente novamente.', detalhe)
}

export function validarChamadaTool(
  nome: string,
  args: Record<string, unknown>,
  toolsDisponiveis: McpTool[]
): { ok: true; tool: McpTool; args: Record<string, unknown> } | { ok: false; erro: string; erroApp: ErroApp } {
  const n = (nome || '').trim()
  if (!n) {
    const e = criarErroTool(CodigoErro.ERR_TOOL_CALL_INVALID, 'Chamada de ferramenta sem nome.')
    return { ok: false, erro: e.mensagem, erroApp: e }
  }
  if (n === 'agente_executar') {
    const e = criarErroTool(CodigoErro.ERR_TOOL_CALL_INVALID, 'A ferramenta agente_executar está bloqueada no loop interno.')
    return { ok: false, erro: e.mensagem, erroApp: e }
  }
  const tool = toolsDisponiveis.find((t) => t.name === n)
  if (!tool) {
    const sugs = toolsDisponiveis.map((t) => t.name).slice(0, 12).join(', ')
    const e = criarErroTool(CodigoErro.ERR_TOOL_UNKNOWN, 'Ferramenta desconhecida: ' + n + '.', sugs ? 'Disponíveis (amostra): ' + sugs : undefined)
    return { ok: false, erro: e.mensagem, erroApp: e }
  }
  const sane = sanitizarArgs(args, tool.inputSchema)
  const missing = schemaRequired(tool.inputSchema).filter((k) => sane[k] === undefined || sane[k] === null || sane[k] === '')
  if (missing.length) {
    const e = criarErroTool(CodigoErro.ERR_TOOL_CALL_INVALID, 'Faltam argumentos obrigatórios para ' + n + ': ' + missing.join(', ') + '.')
    return { ok: false, erro: e.mensagem, erroApp: e }
  }
  return { ok: true, tool, args: sane }
}

