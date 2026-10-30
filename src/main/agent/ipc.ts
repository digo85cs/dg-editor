import { ipcMain } from 'electron'
import { exigirString, isErroPayload, exigirArrayStrings } from '../ipc-seguro'
import { criarCheckpoint, listarCheckpoints, restaurarCheckpoint, ultimoCheckpoint } from './checkpoint'
import { montarContextoProjeto } from './contexto-projeto'
import { expandirMencoes } from './mencoes'
import { orquestrarAgentes } from './orquestrador'
import { cancelarFilaAgente, enfileirarAgente, statusFilaAgente } from './fila'
import { executarAgente } from '../brain/agent'
import { emSafeMode } from '../safe-mode'
import { listarAgentes } from '../brain/agentes'
import { getRaizVault } from '../vault/indice'
import { salvarPlano, lerPlano, limparPlano } from './plano'
import {
  aplicarPropostaComCheckpoint,
  listarPendentes,
  marcarRejeitado
} from './propostas'

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

  ipcMain.handle('contexto:projeto', async (_e, raiz: unknown, consulta?: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    const q = typeof consulta === 'string' ? consulta : undefined
    return { ok: true, texto: await montarContextoProjeto(r, q), vault: getRaizVault() }
  })

  ipcMain.handle(
    'agente:orquestrar',
    async (e, raiz: unknown, pedido: unknown, filaIds?: unknown) => {
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
      }).catch((err) => ({ ok: false, erro: String((err as Error).message || err) }))
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

  ipcMain.handle('agente:cancelar', () => cancelarFilaAgente())

  ipcMain.handle('agente:propostas', () => ({ ok: true, pendentes: listarPendentes() }))

  ipcMain.handle('agente:aplicar-proposta', async (_e, id: unknown, pastas: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    const p = exigirArrayStrings(pastas, 'pastas')
    if (isErroPayload(p)) return p
    return aplicarPropostaComCheckpoint(i, p)
  })

  ipcMain.handle('agente:rejeitar-proposta', (_e, id: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    return { ok: marcarRejeitado(i) }
  })

  ipcMain.handle('agente:plano-salvar', (_e, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false, erro: 'payload' }
    const o = payload as Record<string, unknown>
    if (typeof o.texto !== 'string' || typeof o.raiz !== 'string') return { ok: false, erro: 'texto/raiz' }
    salvarPlano({
      texto: o.texto,
      raiz: o.raiz,
      salvoEm: new Date().toISOString(),
      agente: typeof o.agente === 'string' ? o.agente : undefined
    })
    return { ok: true }
  })

  ipcMain.handle('agente:plano-ler', () => {
    const p = lerPlano()
    return { ok: true, plano: p }
  })

  ipcMain.handle('agente:plano-limpar', () => {
    limparPlano()
    return { ok: true }
  })

  /** Execução enfileirada com menções, proposeWrites, eventos e cancelamento */
  ipcMain.handle('agente:pedir', async (e, payload: unknown) => {
    if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
    if (!payload || typeof payload !== 'object') return { ok: false, erro: 'payload invalido' }
    const o = payload as Record<string, unknown>
    const raiz = typeof o.raiz === 'string' ? o.raiz : ''
    const pergunta = typeof o.pergunta === 'string' ? o.pergunta : ''
    if (!raiz || !pergunta) return { ok: false, erro: 'raiz/pergunta obrigatorios' }
    const modo = o.modo === 'plan' ? 'plan' : 'agent'
    const agente = typeof o.agente === 'string' ? o.agente : undefined
    const pastas = Array.isArray(o.pastas)
      ? o.pastas.filter((x): x is string => typeof x === 'string')
      : [raiz]
    const selecao = typeof o.selecao === 'string' ? o.selecao : undefined
    const arquivoAtivo = typeof o.arquivoAtivo === 'string' ? o.arquivoAtivo : undefined
    const proposeWrites = o.proposeWrites !== false
    const exp = await expandirMencoes({ raiz, pergunta, selecao, arquivoAtivo })
    const sender = e.sender
    const t0 = Date.now()
    try {
      const r = await enfileirarAgente(async (signal) =>
        executarAgente(raiz, exp.perguntaLimpa, {
          modo,
          agente,
          contextoExtra: exp.contextoExtra || undefined,
          proposeWrites: modo === 'agent' ? proposeWrites : false,
          pastas,
          signal,
          onEvent: (ev) => {
            try {
              if (!sender.isDestroyed()) sender.send('agente:progresso', ev)
            } catch {
              /* */
            }
          }
        })
      )
      if (modo === 'plan' && r.texto) {
        salvarPlano({ texto: r.texto, raiz, salvoEm: new Date().toISOString(), agente })
      }
      return {
        ok: true,
        texto: r.texto,
        modelo: r.modelo,
        passos: r.passos,
        propostas: r.propostas || [],
        duracaoMs: r.duracaoMs || Date.now() - t0,
        modo,
        mencoes: exp.mencoes,
        fila: statusFilaAgente()
      }
    } catch (err) {
      return { ok: false, erro: String((err as Error).message || err) }
    }
  })

  /** Executa o último plano salvo em modo agent */
  ipcMain.handle('agente:executar-plano', async (e, payload?: unknown) => {
    if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
    const plano = lerPlano()
    if (!plano?.texto) return { ok: false, erro: 'nenhum plano salvo' }
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const raiz = typeof o.raiz === 'string' ? o.raiz : plano.raiz
    const pastas = Array.isArray(o.pastas)
      ? o.pastas.filter((x): x is string => typeof x === 'string')
      : [raiz]
    const pedido =
      'Execute o plano aprovado abaixo. Use tools conforme necessario.\n\n' + plano.texto
    const sender = e.sender
    const t0 = Date.now()
    try {
      const r = await enfileirarAgente(async (signal) =>
        executarAgente(raiz, pedido, {
          modo: 'agent',
          agente: plano.agente,
          proposeWrites: true,
          pastas,
          signal,
          onEvent: (ev) => {
            try {
              if (!sender.isDestroyed()) sender.send('agente:progresso', ev)
            } catch {
              /* */
            }
          }
        })
      )
      return {
        ok: true,
        texto: r.texto,
        modelo: r.modelo,
        passos: r.passos,
        propostas: r.propostas || [],
        duracaoMs: r.duracaoMs || Date.now() - t0,
        modo: 'agent'
      }
    } catch (err) {
      return { ok: false, erro: String((err as Error).message || err) }
    }
  })
}
