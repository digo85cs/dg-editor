/**
 * Subagentes em background: rodam executarAgente fora da fila do chat,
 * persistem estado em <raiz>/.dg-editor/tarefas/<id>.json e avisam o
 * renderer pelo evento 'agente:background' ao concluir.
 *
 * v1: paralelo ao chat (nao passa pela fila serial). Como dois agentes
 * podem editar os mesmos arquivos, o padrao e para tarefas de leitura/
 * pesquisa/geracao; edicoes pesadas seguem por /paralelo (worktree).
 */
import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { executarAgente, type PassoAgente } from '../brain/agent'
import { dglog } from '../dglog'

export type StatusTarefa = 'rodando' | 'ok' | 'erro' | 'cancelada'

export type TarefaBackground = {
  id: string
  raiz: string
  pedido: string
  agente?: string
  status: StatusTarefa
  inicioEm: string
  fimEm?: string
  duracaoMs?: number
  texto?: string
  erro?: string
  passos?: number
}

const EM_ANDAMENTO = new Map<string, { controller: AbortController; tarefa: TarefaBackground }>()

function dirTarefas(raiz: string): string {
  const d = join(raiz, '.dg-editor', 'tarefas')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function arqTarefa(raiz: string, id: string): string {
  return join(dirTarefas(raiz), id + '.json')
}

function persistir(t: TarefaBackground): void {
  try {
    writeFileSync(arqTarefa(t.raiz, t.id), JSON.stringify(t, null, 2), 'utf8')
  } catch (e) {
    dglog('[background] persistir falhou: ' + String((e as Error).message || e))
  }
}

function emitir(t: TarefaBackground): void {
  const payload = {
    id: t.id,
    raiz: t.raiz,
    pedido: t.pedido.slice(0, 140),
    status: t.status,
    duracaoMs: t.duracaoMs,
    erro: t.erro,
    resumo: (t.texto || '').slice(0, 280)
  }
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send('agente:background', payload)
    } catch { /* janela morta */ }
  }
}

function carregar(raiz: string, id: string): TarefaBackground | null {
  try {
    const p = arqTarefa(raiz, id)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8')) as TarefaBackground
  } catch {
    return null
  }
}

export function listarBackground(raiz: string, limite = 20): TarefaBackground[] {
  try {
    return readdirSync(dirTarefas(raiz))
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(dirTarefas(raiz), f), 'utf8')) as TarefaBackground
        } catch {
          return null
        }
      })
      .filter((t): t is TarefaBackground => !!t && t.raiz === raiz)
      .sort((a, b) => (a.inicioEm < b.inicioEm ? 1 : -1))
      .slice(0, limite)
  } catch {
    return []
  }
}

export function statusBackground(raiz: string, id: string): TarefaBackground | null {
  const emAnd = EM_ANDAMENTO.get(id)
  if (emAnd && emAnd.tarefa.raiz === raiz) return { ...emAnd.tarefa }
  return carregar(raiz, id)
}

export function cancelarBackground(raiz: string, id: string): { ok: boolean; erro?: string } {
  const emAnd = EM_ANDAMENTO.get(id)
  if (!emAnd || emAnd.tarefa.raiz !== raiz) {
    const t = carregar(raiz, id)
    if (t && t.status === 'rodando') {
      // persistida como rodando mas sem controller (app reiniciou) — marca erro
      t.status = 'erro'
      t.erro = 'interrompida (app reiniciado)'
      t.fimEm = new Date().toISOString()
      persistir(t)
      return { ok: true }
    }
    return { ok: false, erro: 'tarefa nao encontrada ou ja finalizada' }
  }
  emAnd.controller.abort()
  emAnd.tarefa.status = 'cancelada'
  emAnd.tarefa.fimEm = new Date().toISOString()
  persistir(emAnd.tarefa)
  EM_ANDAMENTO.delete(id)
  emitir(emAnd.tarefa)
  return { ok: true }
}

export function iniciarBackground(
  raiz: string,
  pedido: string,
  opts?: { agente?: string; contextoExtra?: string }
): { ok: boolean; id?: string; erro?: string } {
  const limpo = String(pedido || '').trim()
  if (!limpo) return { ok: false, erro: 'pedido vazio' }
  if (!existsSync(raiz)) return { ok: false, erro: 'raiz inexistente' }

  // Limite de background simultaneos por raiz (protege RAM/CPU local).
  const ativos = [...EM_ANDAMENTO.values()].filter((e) => e.tarefa.raiz === raiz).length
  if (ativos >= 3) {
    return { ok: false, erro: 'ja ha 3 tarefas em background nesta pasta — aguarde ou cancele uma (/tarefas)' }
  }

  const id = Date.now().toString(36) + randomBytes(3).toString('hex')
  const tarefa: TarefaBackground = {
    id,
    raiz,
    pedido: limpo.slice(0, 2000),
    agente: opts?.agente,
    status: 'rodando',
    inicioEm: new Date().toISOString()
  }
  persistir(tarefa)

  const controller = new AbortController()
  EM_ANDAMENTO.set(id, { controller, tarefa })

  const t0 = Date.now()
  void (async () => {
    try {
      const r = await executarAgente(raiz, limpo, {
        agente: opts?.agente,
        modo: 'agent',
        contextoExtra: opts?.contextoExtra,
        signal: controller.signal
      })
      tarefa.status = r.ok === false ? 'erro' : 'ok'
      tarefa.texto = (r.texto || '').slice(0, 20000)
      tarefa.passos = (r.passos || []).length
      if (r.ok === false) tarefa.erro = 'agente retornou ok=false'
    } catch (e) {
      const msg = String((e as Error).message || e)
      tarefa.status = controller.signal.aborted ? 'cancelada' : 'erro'
      tarefa.erro = msg.slice(0, 500)
    } finally {
      tarefa.fimEm = new Date().toISOString()
      tarefa.duracaoMs = Date.now() - t0
      persistir(tarefa)
      EM_ANDAMENTO.delete(id)
      dglog('[background] ' + id + ' ' + tarefa.status + ' ' + tarefa.duracaoMs + 'ms')
      emitir(tarefa)
    }
  })()

  return { ok: true, id }
}

/** Limpa tarefas finalizadas ha mais de `dias` (chamado no boot, best-effort). */
export function limparBackgroundAntigas(raiz: string, dias = 7): number {
  const corte = Date.now() - dias * 86_400_000
  let n = 0
  for (const t of listarBackground(raiz, 200)) {
    if (t.status === 'rodando') continue
    const fim = t.fimEm ? Date.parse(t.fimEm) : Date.parse(t.inicioEm)
    if (fim < corte) {
      try {
        unlinkSync(arqTarefa(raiz, t.id))
        n++
      } catch { /* */ }
    }
  }
  return n
}
