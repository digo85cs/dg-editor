import { ipcMain } from 'electron'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { exigirString, exigirArrayStrings, isErroPayload, exigirObjeto } from '../ipc-seguro'
import { lerConfigOpenClaw, salvarConfigOpenClaw } from './config'
import { limparToken, salvarToken, tokenConfigurado } from './secrets'
import { pedirOpenClaw } from './cliente'
import {
  aplicarPendenteAprovado,
  listarPendentes,
  marcarRejeitado,
  obterPendente,
  registrarPendentes
} from './diffs'
import { listarAuditoria, registrarAuditoria } from './auditoria'
import type { ArquivoAbertoCtx } from './contexto'

function estruturaRasa(raiz: string, max = 80): string {
  const linhas: string[] = []
  try {
    const ents = readdirSync(raiz)
    for (const name of ents) {
      if (name === 'node_modules' || name === '.git' || name === 'out') continue
      const full = join(raiz, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      linhas.push((st.isDirectory() ? 'd ' : 'f ') + name)
      if (linhas.length >= max) break
    }
  } catch {
    return ''
  }
  return linhas.join('\n')
}

export function registerOpenClawIpc(): void {
  ipcMain.handle('openclaw:config-get', () => ({ ok: true, config: lerConfigOpenClaw() }))

  ipcMain.handle('openclaw:config-set', (_e, parcial: unknown) => {
    const o = exigirObjeto(parcial, 'config')
    if (isErroPayload(o)) return o
    const cfg = salvarConfigOpenClaw({
      endpoint: typeof o.endpoint === 'string' ? o.endpoint : undefined,
      model: typeof o.model === 'string' ? o.model : undefined,
      timeoutMs: typeof o.timeoutMs === 'number' ? o.timeoutMs : undefined,
      maxContextBytes: typeof o.maxContextBytes === 'number' ? o.maxContextBytes : undefined
    })
    return { ok: true, config: cfg }
  })

  ipcMain.handle('openclaw:token-set', (_e, token: unknown) => {
    const t = exigirString(token, 'token')
    if (isErroPayload(t)) return t
    return salvarToken(t)
  })

  ipcMain.handle('openclaw:token-clear', () => limparToken())

  ipcMain.handle('openclaw:token-status', () => ({
    ok: true,
    configurado: tokenConfigurado()
  }))

  ipcMain.handle('openclaw:pedir', async (_e, payload: unknown) => {
    const o = exigirObjeto(payload, 'payload')
    if (isErroPayload(o)) return o
    const prompt = typeof o.prompt === 'string' ? o.prompt : ''
    if (!prompt.trim()) return { ok: false, erro: 'prompt vazio' }
    const pastas = Array.isArray(o.pastas)
      ? o.pastas.filter((x): x is string => typeof x === 'string')
      : []
    if (!pastas.length) return { ok: false, erro: 'nenhuma pasta aberta' }

    const arquivosAbertos: ArquivoAbertoCtx[] = []
    if (Array.isArray(o.arquivosAbertos)) {
      for (const a of o.arquivosAbertos) {
        if (!a || typeof a !== 'object') continue
        const rec = a as Record<string, unknown>
        if (typeof rec.path !== 'string') continue
        arquivosAbertos.push({
          path: rec.path,
          conteudo: typeof rec.conteudo === 'string' ? rec.conteudo : undefined,
          selecao: typeof rec.selecao === 'string' ? rec.selecao : undefined
        })
      }
    }

    const raiz = pastas[0]
    const r = await pedirOpenClaw({
      prompt,
      arquivosAbertos,
      raiz,
      estruturaDir: estruturaRasa(raiz)
    })
    registrarAuditoria({
      ts: new Date().toISOString(),
      acao: 'pedir',
      detalhe: r.ok ? `edits=${r.edits?.length || 0}` : r.erro
    })
    if (!r.ok) return r
    const reg = registrarPendentes(r.edits || [], pastas)
    return {
      ok: true,
      mensagem: r.mensagem,
      pendentes: reg.pendentes,
      rejeitados: reg.rejeitados
    }
  })

  ipcMain.handle('openclaw:pendentes', () => ({ ok: true, pendentes: listarPendentes() }))

  ipcMain.handle('openclaw:aplicar', async (_e, id: unknown, pastas: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    const p = exigirArrayStrings(pastas, 'pastas')
    if (isErroPayload(p)) return p
    const pend = obterPendente(i)
    const r = await aplicarPendenteAprovado(i, p)
    if (r.ok) {
      registrarAuditoria({
        ts: new Date().toISOString(),
        acao: 'aplicar',
        id: i,
        path: r.absPath || pend?.absPath,
        hashAntes: r.hashAntes,
        hashDepois: r.hashDepois
      })
    }
    return r
  })

  ipcMain.handle('openclaw:rejeitar', (_e, id: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    const pend = obterPendente(i)
    const ok = marcarRejeitado(i)
    if (ok) {
      registrarAuditoria({
        ts: new Date().toISOString(),
        acao: 'rejeitar',
        id: i,
        path: pend?.absPath
      })
    }
    return { ok }
  })

  ipcMain.handle('openclaw:auditoria-listar', (_e, limite?: unknown) => {
    const n = typeof limite === 'number' ? limite : 50
    return { ok: true, entradas: listarAuditoria(n) }
  })
}
