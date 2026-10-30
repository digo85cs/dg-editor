import { ipcMain } from 'electron'
import { exigirString, isErroPayload, exigirArrayStrings } from '../ipc-seguro'
import { criarCheckpoint, listarCheckpoints, restaurarCheckpoint, ultimoCheckpoint } from './checkpoint'
import { montarContextoProjeto } from './contexto-projeto'
import { montarContextoImplicito, type AbaCtx } from './contexto-implicito'
import { expandirMencoes } from './mencoes'
import { orquestrarAgentes } from './orquestrador'
import { cancelarFilaAgente, enfileirarAgente, statusFilaAgente } from './fila'
import { executarAgente } from '../brain/agent'
import { emSafeMode } from '../safe-mode'
import { listarAgentes } from '../brain/agentes'
import { getRaizVault } from '../vault/indice'
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
  definirHunksPendente
} from '../openclaw/diffs'
import {
  rodarTypecheck,
  rodarTestes,
  listarDiagnosticosRecentes,
  registrarDiagnosticoManual
} from './diagnosticos'

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

  /** Fila unificada Agent + OpenClaw */
  ipcMain.handle('agente:propostas', () => ({ ok: true, pendentes: listarPendentes() }))
  ipcMain.handle('propostas:listar', () => ({ ok: true, pendentes: listarPendentes() }))

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

  ipcMain.handle('propostas:hunks', (_e, id: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    return listarHunksPendente(i)
  })

  ipcMain.handle('propostas:definir-hunks', (_e, id: unknown, indices: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    if (!Array.isArray(indices) || !indices.every((x) => typeof x === 'number')) {
      return { ok: false, erro: 'indices deve ser number[]' }
    }
    return definirHunksPendente(i, indices as number[])
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
    return { ok: true, plano: lerPlano() }
  })

  ipcMain.handle('agente:plano-ler', () => {
    const p = lerPlano()
    return { ok: true, plano: p }
  })

  ipcMain.handle('agente:plano-limpar', () => {
    limparPlano()
    return { ok: true }
  })

  ipcMain.handle('agente:plano-marcar-passo', (_e, passoId: unknown, feito: unknown, checkpointId?: unknown) => {
    const i = exigirString(passoId, 'passoId')
    if (isErroPayload(i)) return i
    const p = marcarPasso(i, feito === true, typeof checkpointId === 'string' ? checkpointId : undefined)
    return { ok: !!p, plano: p }
  })

  ipcMain.handle('agente:plano-atualizar-passos', (_e, passos: unknown) => {
    if (!Array.isArray(passos)) return { ok: false, erro: 'passos' }
    const limpos: PassoPlano[] = []
    for (const x of passos) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      if (typeof o.id !== 'string' || typeof o.texto !== 'string') continue
      limpos.push({
        id: o.id,
        texto: o.texto,
        feito: o.feito === true,
        checkpointId: typeof o.checkpointId === 'string' ? o.checkpointId : undefined
      })
    }
    const p = atualizarPassos(limpos)
    return { ok: !!p, plano: p }
  })

  ipcMain.handle('agente:verificar', async (_e, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false, erro: 'payload' }
    const o = payload as Record<string, unknown>
    const raiz = typeof o.raiz === 'string' ? o.raiz : ''
    if (!raiz) return { ok: false, erro: 'raiz' }
    const modo = o.modo === 'test' ? 'test' : 'typecheck'
    const d = modo === 'test' ? await rodarTestes(raiz) : await rodarTypecheck(raiz)
    return { ok: true, diagnostico: d, recentes: listarDiagnosticosRecentes(5) }
  })

  ipcMain.handle('agente:diagnosticos', () => ({
    ok: true,
    recentes: listarDiagnosticosRecentes(10)
  }))

  ipcMain.handle('agente:diagnostico-manual', (_e, texto: unknown) => {
    const t = exigirString(texto, 'texto')
    if (isErroPayload(t)) return t
    return { ok: true, diagnostico: registrarDiagnosticoManual(t) }
  })

  /** Execução enfileirada com menções, contexto implícito, proposeWrites, verify loop */
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
    const verificarApos = o.verificarApos === true
    const abas = parseAbas(o.abas)
    const exp = await expandirMencoes({ raiz, pergunta, selecao, arquivoAtivo })
    const implicito = await montarContextoImplicito({
      raiz,
      abas,
      incluirGit: o.incluirGit !== false,
      incluirDiagnosticos: true
    })
    const contextoExtra = [exp.contextoExtra, implicito].filter(Boolean).join('\n\n')
    const sender = e.sender
    const t0 = Date.now()
    const emit = (ev: unknown) => {
      try {
        if (!sender.isDestroyed()) sender.send('agente:progresso', ev)
      } catch {
        /* */
      }
    }
    try {
      const r = await enfileirarAgente(async (signal) => {
        let resp = await executarAgente(raiz, exp.perguntaLimpa, {
          modo,
          agente,
          contextoExtra: contextoExtra || undefined,
          proposeWrites: modo === 'agent' ? proposeWrites : false,
          pastas,
          signal,
          onEvent: emit as never
        })
        // Composer loop: typecheck → pedido de correção (máx. 1 rodada)
        if (verificarApos && modo === 'agent' && !signal.aborted) {
          emit({ tipo: 'status', texto: 'verificando typecheck…' })
          const diag = await rodarTypecheck(raiz)
          emit({
            tipo: 'status',
            texto: diag.ok ? 'typecheck ok' : 'typecheck falhou — corrigindo'
          })
          if (!diag.ok && diag.saida) {
            const fixPedido =
              'O typecheck falhou apos suas edicoes. Corrija os erros abaixo.\n\n```\n' +
              diag.saida.slice(0, 8000) +
              '\n```'
            resp = await executarAgente(raiz, fixPedido, {
              modo: 'agent',
              agente,
              contextoExtra: contextoExtra || undefined,
              proposeWrites: proposeWrites,
              pastas,
              signal,
              onEvent: emit as never
            })
            resp = {
              ...resp,
              texto:
                (resp.texto || '') +
                '\n\n— Verificação: typecheck falhou; rodada de correção executada.'
            }
          } else if (diag.ok) {
            resp = {
              ...resp,
              texto: (resp.texto || '') + '\n\n— Verificação: typecheck ok.'
            }
          }
        }
        return resp
      })
      if (modo === 'plan' && r.texto) {
        salvarPlano({ texto: r.texto, raiz, salvoEm: new Date().toISOString(), agente })
      }
      return {
        ok: true,
        texto: r.texto,
        modelo: r.modelo,
        passos: r.passos,
        propostas: r.propostas || listarPendentes(),
        duracaoMs: r.duracaoMs || Date.now() - t0,
        modo,
        mencoes: exp.mencoes,
        fila: statusFilaAgente(),
        plano: modo === 'plan' ? lerPlano() : undefined
      }
    } catch (err) {
      return { ok: false, erro: String((err as Error).message || err) }
    }
  })

  /** Executa o plano inteiro ou só o próximo passo pendente */
  ipcMain.handle('agente:executar-plano', async (e, payload?: unknown) => {
    if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
    const plano = lerPlano()
    if (!plano?.texto) return { ok: false, erro: 'nenhum plano salvo' }
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const raiz = typeof o.raiz === 'string' ? o.raiz : plano.raiz
    const pastas = Array.isArray(o.pastas)
      ? o.pastas.filter((x): x is string => typeof x === 'string')
      : [raiz]
    const soProximo = o.soProximo === true
    const passo = soProximo ? proximoPassoPendente() : null
    if (soProximo && !passo) return { ok: false, erro: 'nenhum passo pendente' }
    const pedido = soProximo
      ? 'Execute APENAS este passo do plano aprovado. Nao faca os outros.\n\nPasso: ' +
        passo!.texto +
        '\n\nContexto do plano:\n' +
        plano.texto
      : 'Execute o plano aprovado abaixo. Use tools conforme necessario.\n\n' + plano.texto
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
      let ckId: string | undefined
      if (soProximo && passo) {
        try {
          const paths = (r.propostas || []).map((p) => p.absPath).filter(Boolean)
          if (paths.length) {
            const ck = await criarCheckpoint(paths, 'plano:passo:' + passo.id)
            ckId = ck.id
          }
        } catch {
          /* */
        }
        marcarPasso(passo.id, true, ckId)
      }
      return {
        ok: true,
        texto: r.texto,
        modelo: r.modelo,
        passos: r.passos,
        propostas: r.propostas || listarPendentes(),
        duracaoMs: r.duracaoMs || Date.now() - t0,
        modo: 'agent',
        passoExecutado: passo || undefined,
        plano: lerPlano()
      }
    } catch (err) {
      return { ok: false, erro: String((err as Error).message || err) }
    }
  })
}
