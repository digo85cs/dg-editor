/**
 * Guard de automação (Etapa 1). Ponto ÚNICO de execução.
 * Fluxo: allow-list -> valida args -> sanitiza -> aprovação -> audit inicio -> exec -> audit fim.
 */
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { dglog } from '../dglog'
import { getMainWindow } from '../ipc'
import { registrarEntrada, sanitizarArgs } from './audit'
import { contemPadraoProibido, obterComando, type ComandoAutomacao } from './allowlist'
import { executarComandoDominio } from './dispatch'

export interface ContextoExecucao { origem: string; janelaId?: number }
export interface ResultadoExecucao { ok: boolean; resultado?: unknown; erro?: string; auditId: string }

type RespostaAprovacao = { id: string; aprovado: boolean; confirmacao?: string }
const pendentes = new Map<string, { cmd: ComandoAutomacao; args: Record<string, unknown>; contexto: ContextoExecucao; resolve: (r: RespostaAprovacao) => void; timer: NodeJS.Timeout }>()

export function resolverAprovacao(resp: RespostaAprovacao): boolean {
  const p = pendentes.get(resp.id)
  if (!p) return false
  clearTimeout(p.timer)
  pendentes.delete(resp.id)
  p.resolve(resp)
  return true
}

function validarArgs(cmd: ComandoAutomacao, args: Record<string, unknown>): string | null {
  const schema = cmd.schemaArgs
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'args deve ser objeto'
  const req = schema.required || []
  for (const k of req) if (!(k in args)) return `arg obrigatório ausente: ${k}`
  const props = schema.properties || {}
  for (const [k, def] of Object.entries(props)) {
    if (!(k in args) || args[k] === undefined || args[k] === null) continue
    const v = args[k]
    if (def.type === 'array') { if (!Array.isArray(v)) return `${k} deve ser array` }
    else if (def.type === 'number') { if (typeof v !== 'number') return `${k} deve ser number` }
    else if (def.type === 'boolean') { if (typeof v !== 'boolean') return `${k} deve ser boolean` }
    else if (def.type === 'string') { if (typeof v !== 'string') return `${k} deve ser string` }
    if (def.enum && typeof v === 'string' && !def.enum.includes(v)) return `${k} inválido`
  }
  if (schema.additionalProperties === false) {
    for (const k of Object.keys(args)) if (!props[k]) return `arg não permitido: ${k}`
  }
  return null
}

async function pedirAprovacao(cmd: ComandoAutomacao, args: Record<string, unknown>, contexto: ContextoExecucao): Promise<{ aprovado: boolean; id: string; motivo?: string }> {
  const id = randomUUID()
  const win = (contexto.janelaId ? BrowserWindow.fromId(contexto.janelaId) : null) || getMainWindow()
  const payload = {
    id,
    comandoId: cmd.id,
    descricao: cmd.descricao,
    dominio: cmd.dominio,
    risco: cmd.risco,
    nivelAprovacao: cmd.nivelAprovacao,
    args: sanitizarArgs(args),
    timeoutMs: 5 * 60 * 1000
  }
  if (!win || win.isDestroyed()) return { aprovado: false, id, motivo: 'janela indisponível para aprovação' }
  win.webContents.send('automation:aprovacao-pendente', payload)
  const resp = await new Promise<RespostaAprovacao>((resolve) => {
    const timer = setTimeout(() => {
      pendentes.delete(id)
      resolve({ id, aprovado: false })
    }, 5 * 60 * 1000)
    pendentes.set(id, { cmd, args, contexto, resolve, timer })
  })
  if (!resp.aprovado) return { aprovado: false, id, motivo: 'recusado ou timeout' }
  if (cmd.nivelAprovacao === 'forte' && resp.confirmacao !== 'CONFIRMAR') {
    return { aprovado: false, id, motivo: 'confirmação forte ausente/inválida' }
  }
  return { aprovado: true, id }
}

export async function executar(
  comandoId: string,
  args: Record<string, unknown>,
  contexto: ContextoExecucao
): Promise<ResultadoExecucao> {
  const ts = () => new Date().toISOString()
  const auditBase = (resultado: string, duracao_ms: number, id_aprovacao: string | null) =>
    registrarEntrada({ timestamp: ts(), comando: comandoId, args: args || {}, resultado, duracao_ms, hash_da_entrada_anterior: '', id_aprovacao })

  // a) allow-list
  const cmd = obterComando(comandoId)
  if (!cmd) {
    await auditBase('rejeitado: comando nao autorizado', 0, null)
    return { ok: false, erro: 'comando não autorizado', auditId: 'rejeitado' }
  }
  // b) valida args
  const argsObj = (args && typeof args === 'object' && !Array.isArray(args) ? args : {}) as Record<string, unknown>
  const erroVal = validarArgs(cmd, argsObj)
  if (erroVal) {
    await auditBase('rejeitado: args inválidos - ' + erroVal, 0, null)
    return { ok: false, erro: erroVal, auditId: 'rejeitado' }
  }
  // defesa extra: padrões proibidos em strings
  const textoArgs = JSON.stringify(sanitizarArgs(argsObj))
  const proibido = contemPadraoProibido(textoArgs)
  if (proibido) {
    await auditBase('rejeitado: padrão proibido', 0, null)
    return { ok: false, erro: 'padrão proibido detectado', auditId: 'rejeitado' }
  }
  // c) sanitiza (para logs/aprovação) — argsObj segue para exec
  // d) aprovação
  let idAprovacao: string | null = null
  if (cmd.nivelAprovacao !== 'automatico') {
    const ap = await pedirAprovacao(cmd, argsObj, contexto)
    idAprovacao = ap.id
    if (!ap.aprovado) {
      await auditBase('recusado pelo usuario: ' + (ap.motivo || ''), 0, idAprovacao)
      return { ok: false, erro: ap.motivo || 'recusado pelo usuário', auditId: idAprovacao }
    }
  }
  // e) iniciado
  await auditBase('iniciado', 0, idAprovacao)
  const t0 = Date.now()
  try {
    // f) executa
    const r = await executarComandoDominio(cmd, argsObj, contexto)
    const dur = Date.now() - t0
    // g) concluído/erro
    await auditBase(r.ok ? 'concluido' : 'erro: ' + (r.erro || ''), dur, idAprovacao)
    return { ok: r.ok, resultado: r.dados, erro: r.erro, auditId: idAprovacao || 'auto' }
  } catch (e) {
    const dur = Date.now() - t0
    const msg = e instanceof Error ? e.message : String(e)
    dglog('[automation:guard] exceção ' + comandoId + ': ' + msg)
    await auditBase('erro: ' + msg, dur, idAprovacao)
    return { ok: false, erro: msg, auditId: idAprovacao || 'auto' }
  }
}
