import { ipcMain } from 'electron'
import { exigirString, isErroPayload } from '../ipc-seguro'
import { criarCheckpoint, listarCheckpoints, restaurarCheckpoint, ultimoCheckpoint } from './checkpoint'
import { detectarMençãoProjeto, montarContextoProjeto } from './contexto-projeto'
import { orquestrarAgentes } from './orquestrador'
import { enfileirarAgente, statusFilaAgente } from './fila'
import { executarAgente } from '../brain/agent'
import { emSafeMode } from '../safe-mode'
import { listarAgentes } from '../brain/agentes'
import { getRaizVault } from '../vault/indice'

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

  ipcMain.handle('contexto:projeto', (_e, raiz: unknown, consulta?: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    const q = typeof consulta === 'string' ? consulta : undefined
    return { ok: true, texto: montarContextoProjeto(r, q), vault: getRaizVault() }
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
      const mencao = detectarMençãoProjeto(p)
      const extra = mencao.tem ? montarContextoProjeto(r, mencao.consulta) : undefined
      return enfileirarAgente(() => orquestrarAgentes(r, mencao.consulta || p, fila, extra))
    }
  )

  ipcMain.handle('agente:listar', (_e, raiz: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    return {
      ok: true,
      agentes: listarAgentes(r).map((a) => ({ id: a.id, nome: a.nome, especialidade: a.especialidade }))
    }
  })

  ipcMain.handle('agente:fila-status', () => ({ ok: true, ...statusFilaAgente() }))

  /** Execução enfileirada com @projeto e modo plan|agent */
  ipcMain.handle(
    'agente:pedir',
    async (
      _e,
      payload: unknown
    ) => {
      if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
      if (!payload || typeof payload !== 'object') return { ok: false, erro: 'payload invalido' }
      const o = payload as Record<string, unknown>
      const raiz = typeof o.raiz === 'string' ? o.raiz : ''
      const pergunta = typeof o.pergunta === 'string' ? o.pergunta : ''
      if (!raiz || !pergunta) return { ok: false, erro: 'raiz/pergunta obrigatorios' }
      const modo = o.modo === 'plan' ? 'plan' : 'agent'
      const agente = typeof o.agente === 'string' ? o.agente : undefined
      const mencao = detectarMençãoProjeto(pergunta)
      const contextoExtra = mencao.tem ? montarContextoProjeto(raiz, mencao.consulta) : undefined
      const t0 = Date.now()
      try {
        const r = await enfileirarAgente(() =>
          executarAgente(raiz, mencao.consulta || pergunta, {
            modo,
            agente,
            contextoExtra
          })
        )
        return {
          ok: true,
          texto: r.texto,
          modelo: r.modelo,
          passos: r.passos,
          duracaoMs: r.duracaoMs || Date.now() - t0,
          modo,
          fila: statusFilaAgente()
        }
      } catch (e) {
        return { ok: false, erro: String((e as Error).message || e) }
      }
    }
  )
}
