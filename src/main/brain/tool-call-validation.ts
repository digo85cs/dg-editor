import type { McpTool } from '../mcp/client'

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

export function validarChamadaTool(
  nome: string,
  args: Record<string, unknown>,
  toolsDisponiveis: McpTool[]
): { ok: true; tool: McpTool; args: Record<string, unknown> } | { ok: false; erro: string } {
  const n = (nome || '').trim()
  if (!n) return { ok: false, erro: 'tool_call sem nome' }
  if (n === 'agente_executar') return { ok: false, erro: 'tool agente_executar bloqueada no loop interno' }
  const tool = toolsDisponiveis.find((t) => t.name === n)
  if (!tool) {
    const sugs = toolsDisponiveis.map((t) => t.name).slice(0, 12).join(', ')
    return { ok: false, erro: 'tool desconhecida: ' + n + (sugs ? '. Disponíveis (amostra): ' + sugs : '') }
  }
  const sane = sanitizarArgs(args, tool.inputSchema)
  const missing = schemaRequired(tool.inputSchema).filter((k) => sane[k] === undefined || sane[k] === null || sane[k] === '')
  if (missing.length) return { ok: false, erro: 'argumentos obrigatórios ausentes para ' + n + ': ' + missing.join(', ') }
  return { ok: true, tool, args: sane }
}
