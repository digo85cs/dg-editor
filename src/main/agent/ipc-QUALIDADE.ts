import { ipcMain } from 'electron'
import { exigirString, isErroPayload, exigirArrayStrings } from '../ipc-seguro'
import { criarCheckpoint, listarCheckpoints, restaurarCheckpoint, ultimoCheckpoint } from './checkpoint'
// IPCs opcionais (modulos ausentes no repo atual) — carregamento seguro, sem require estatico de arquivo inexistente.
for (const spec of ['./mencoes-ipc', './contexto-ipc', './orquestrador-ipc', './fila-ipc', './plano-ipc'] as const) {
  void import(spec)
    .then((m: any) => {
      const fn = m?.registrarMencoesIpc || m?.registrarContextoIpc || m?.registrarOrquestradorIpc || m?.registrarFilaIpc || m?.registrarPlanoIpc
      if (typeof fn === 'function') fn()
    })
    .catch(() => { /* modulo opcional ausente */ })
}
import { registrarSimbolosIpc } from '../simbolos-ipc'
import { expandirMencoes } from './mencoes'
import { orquestrarAgentes } from './orquestrador'
import { cancelarFilaAgente, enfileirarAgente, statusFilaAgente } from './fila'
import { executarAgente } from '../brain/agent'
import { emSafeMode } from '../safe-mode'
import { listarAgentes } from '../brain/agentes'
import { getRaizVault } from '../vault/indice'
import { listarModos, salvarModos } from '../modes'
import { obterPermissoes, salvarPermissoes } from '../permissoes'
import { montarContextoProjeto } from './contexto-projeto'
import { montarContextoImplicito } from './contexto-implicito'
import {
  salvarPlano,
  lerPlano,
  limparPlano,
  marcarPasso,
  atualizarPassos,
  proximoPassoPendente,
  type PassoPlano
} from './plano'
import {
  aplicarPropostaComCheckpoint,
  listarPendentes,
  marcarRejeitado
} from './propostas'
import {
  listarHunksPendente,
  definirHunksPendente,
  previewPendente
} from '../openclaw/diffs'
import {
  rodarTypecheck,
  rodarTestes,
  listarDiagnosticosRecentes,
  registrarDiagnosticoManual
} from './diagnosticos'
import { gerarContinuidade, dossieDirDoApp } from '../bridge-adapta'

type AbaCtx = {
  path: string
  conteudo?: string
  ativa?: boolean
}

function parseAbas(raw: unknown): AbaCtx[] {
  if (!Array.isArray(raw)) return []
  const out: AbaCtx[] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    if (typeof o.path !== 'string') continue
    out.push({
      path: o.path,
      conteudo: typeof o.conteudo === 'string' ? o.conteudo : undefined,
      ativa: o.ativa === true
    })
  }
  return out
}

export function registerAgentExtrasIpc(): void {
  ipcMain.handle('agente:checkpoint-criar', async (_e, arquivos: unknown, origem?: unknown) => {
    if (!Array.isArray(arquivos) || !arquivos.every((x) => typeof x === 'string')) {
      return { ok: false, erro: 'arquivos deve ser string[]' }
    }
    const ck = await criarCheckpoint(arquivos as string[], typeof origem === 'string' ? origem : 'manual')
    return { ok: true, checkpoint: ck }
  })

  ipcMain.handle('agente:checkpoint-listar', (_e, limite?: unknown) => {
    const n = typeof limite === 'number' ? limite : 10
    return { ok: true, checkpoints: listarCheckpoints(n) }
  })

  ipcMain.handle('agente:checkpoint-restaurar', async (_e, id: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    return restaurarCheckpoint(i)
  })

  ipcMain.handle('agente:checkpoint-desfazer', async () => {
    const u = ultimoCheckpoint()
    if (!u) return { ok: false, erro: 'nenhum checkpoint' }
    return restaurarCheckpoint(u.id)
  })

  ipcMain.handle('dg:modes:listar', () => ({ ok: true, modos: listarModos() }))
  ipcMain.handle('dg:modes:salvar', (_e, modos) => salvarModos(modos as any))
  ipcMain.handle('dg:permissoes:obter', () => ({ ok: true, permissoes: obterPermissoes() }))
  ipcMain.handle('dg:permissoes:salvar', (_e, p) => salvarPermissoes(p as any))

  try { registrarSimbolosIpc() } catch(e) { console.warn('[simbolos-ipc]', e) }

  ipcMain.handle('contexto:projeto', async (_e, raiz: unknown, consulta?: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    const q = typeof consulta === 'string' ? consulta : undefined
    return { ok: true, texto: await montarContextoProjeto(r, q), vault: getRaizVault() }
  })

  ipcMain.handle(
    'agente:orquestrar',
    async (_e, raiz: unknown, pedido: unknown, filaIds?: unknown) => {
      if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
      const r = exigirString(raiz, 'raiz')
      if (isErroPayload(r)) return r
      const p = exigirString(pedido, 'pedido')
      if (isErroPayload(p)) return p
      const fila = Array.isArray(filaIds) ? filaIds.filter((x): x is string => typeof x === 'string') : undefined
      const exp = await expandirMencoes({ raiz: r, pergunta: p })
      return enfileirarAgente(async (signal) => {
        if (signal.aborted) throw new Error('cancelado pelo usuario')
        return orquestrarAgentes(r, exp.perguntaLimpa, fila, exp.contextoExtra || undefined)
      }).catch((err: any) => ({ ok: false, erro: String((err as Error).message || err) }))
    }
  )

  ipcMain.handle('agente:listar', (_e, raiz: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    return {
      ok: true,
      agentes: listarAgentes(r).map((a: any) => ({ id: a.id, nome: a.nome, especialidade: a.especialidade }))
    }
  })

  ipcMain.handle('agente:plano-ler', () => ({ ok: true, plano: lerPlano() }))

  ipcMain.handle('agente:fila-status', () => ({ ok: true, ...statusFilaAgente() }))

  ipcMain.handle('agente:cancelar', () => cancelarFilaAgente())

  ipcMain.handle('propostas:listar', () => ({ ok: true, pendentes: listarPendentes() }))
  ipcMain.handle('agente:propostas', () => ({ ok: true, pendentes: listarPendentes() }))

  ipcMain.handle('propostas:hunks', (_e, id: unknown) => {
    return listarHunksPendente(typeof id === 'string' ? id : '')
  })

  ipcMain.handle('propostas:definir-hunks', (_e, id: unknown, indices: unknown) => {
    const nums = Array.isArray(indices) ? indices.filter((n): n is number => typeof n === 'number') : []
    return definirHunksPendente(typeof id === 'string' ? id : '', nums)
  })

  ipcMain.handle('propostas:preview', async (_e, id: unknown, pastas: unknown) => {
    const p = exigirArrayStrings(pastas, 'pastas')
    if (isErroPayload(p)) return p
    return previewPendente(typeof id === 'string' ? id : '', p)
  })

  ipcMain.handle('agente:aplicar-proposta', async (_e, id: unknown, pastas: unknown) => {
    const p = exigirArrayStrings(pastas, 'pastas')
    if (isErroPayload(p)) return p
    return aplicarPropostaComCheckpoint(typeof id === 'string' ? id : '', p)
  })

  ipcMain.handle('agente:rejeitar-proposta', (_e, id: unknown) => {
    const ok = marcarRejeitado(typeof id === 'string' ? id : '')
    return ok ? { ok: true } : { ok: false, erro: 'pendente inexistente' }
  })
}
