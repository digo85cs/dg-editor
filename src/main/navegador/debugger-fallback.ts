/**
 * Fallback CDP via webContents.debugger para iframes cross-origin / sandbox.
 * Anexa só sob demanda; SEMPRE detach no finally.
 */
import type { WebContents, WebFrameMain } from 'electron'
import { dglog } from '../dglog'

type FrameRef = number | string | undefined

type FrameNode = {
  frame?: { id: string; url?: string; name?: string }
  childFrames?: FrameNode[]
}

function achatarFrames(
  node: FrameNode,
  out: Array<{ id: string; url: string; name: string }> = []
): Array<{ id: string; url: string; name: string }> {
  if (node.frame?.id) {
    out.push({
      id: node.frame.id,
      url: node.frame.url || '',
      name: node.frame.name || ''
    })
  }
  for (const c of node.childFrames || []) achatarFrames(c, out)
  return out
}

function resolverFrameId(
  flat: Array<{ id: string; url: string; name: string }>,
  frameRef: FrameRef,
  mainFrameId: string
): string | null {
  if (frameRef === undefined || frameRef === null || frameRef === '') return mainFrameId
  // flat[0] costuma ser o main; framesInSubtree indexa só filhos → flat[1+] ≈ índice 0
  if (typeof frameRef === 'number') {
    // Preferir alinhamento com framesInSubtree: índice N = flat[N+1] se flat[0] é main
    if (flat.length > frameRef + 1 && flat[0].id === mainFrameId) {
      return flat[frameRef + 1]?.id || null
    }
    return flat[frameRef]?.id || null
  }
  const s = String(frameRef)
  const hit = flat.find((f) => f.url.includes(s) || f.name.includes(s))
  return hit?.id || null
}

let attachCount = 0

async function comDebugger<T>(
  wc: WebContents,
  fn: () => Promise<T>
): Promise<T> {
  let anexouAqui = false
  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3')
      anexouAqui = true
      attachCount++
      dglog('[navegador] debugger.attach sob demanda')
    }
    return await fn()
  } finally {
    if (anexouAqui) {
      try {
        if (wc.debugger.isAttached()) {
          wc.debugger.detach()
          dglog('[navegador] debugger.detach')
        }
      } catch (e) {
        dglog('[navegador] debugger.detach falhou: ' + String((e as Error).message || e))
      }
    }
  }
}

/**
 * Avalia script no frame via CDP (Page.createIsolatedWorld + Runtime.evaluate).
 */
export async function avaliarViaDebugger(
  wc: WebContents,
  frameRef: FrameRef,
  script: string
): Promise<{ ok: true; dados: unknown } | { ok: false; erro: string }> {
  return comDebugger(wc, async () => {
    await wc.debugger.sendCommand('Page.enable')
    await wc.debugger.sendCommand('Runtime.enable')
    const tree = (await wc.debugger.sendCommand('Page.getFrameTree')) as {
      frameTree: FrameNode
    }
    const flat = achatarFrames(tree.frameTree)
    const mainId = tree.frameTree.frame?.id || flat[0]?.id
    if (!mainId) return { ok: false as const, erro: 'Page.getFrameTree sem frame raiz' }
    const frameId = resolverFrameId(flat, frameRef, mainId)
    if (!frameId) {
      return {
        ok: false as const,
        erro:
          'frameId nao encontrado no FrameTree (ref=' +
          String(frameRef) +
          ' flat=' +
          flat.length +
          ')'
      }
    }

    let ctxId: number | null = null
    try {
      const world = (await wc.debugger.sendCommand('Page.createIsolatedWorld', {
        frameId,
        worldName: 'dg-nav-' + Date.now()
      })) as { executionContextId: number }
      ctxId = world.executionContextId
    } catch (e1) {
      // retry com grantUniveralAccess (typo histórico do CDP)
      try {
        const world2 = (await wc.debugger.sendCommand('Page.createIsolatedWorld', {
          frameId,
          worldName: 'dg-nav-' + Date.now(),
          grantUniveralAccess: true
        })) as { executionContextId: number }
        ctxId = world2.executionContextId
      } catch (e2) {
        return {
          ok: false as const,
          erro:
            'createIsolatedWorld: ' +
            String((e1 as Error).message || e1) +
            ' | ' +
            String((e2 as Error).message || e2)
        }
      }
    }

    const avaliado = (await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: '(' + script + ')',
      contextId: ctxId,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    })) as {
      result?: { value?: unknown; type?: string; description?: string; subtype?: string }
      exceptionDetails?: { text?: string; exception?: { description?: string } }
    }

    if (avaliado.exceptionDetails) {
      const msg =
        avaliado.exceptionDetails.exception?.description ||
        avaliado.exceptionDetails.text ||
        'Runtime.evaluate exception'
      return { ok: false as const, erro: msg }
    }
    // se o script já é IIFE que retorna valor
    return { ok: true as const, dados: avaliado.result?.value }
  })
}

function ehErroSeguranca(e: unknown): boolean {
  const msg = String((e as Error)?.message || e)
  return /security|cross-origin|cross origin|CSP|Blocked|Access|isolated|sandboxed|cannot be accessed/i.test(
    msg
  )
}

export type ResultadoExtracao =
  | { ok: true; dados: unknown; tentouDebugger?: boolean }
  | { ok: false; erro: string; tentouDebugger?: boolean }

/**
 * 1) frame.executeJavaScript
 * 2) em falha de segurança (ou forceDebugger), CDP debugger
 */
export async function extrairDoFrame(
  wc: WebContents,
  frameRef: FrameRef,
  script: string,
  resolverFrame: (wc: WebContents, frame?: FrameRef) => WebFrameMain | null,
  opts?: { forceDebugger?: boolean }
): Promise<ResultadoExtracao> {
  if (!opts?.forceDebugger) {
    try {
      const alvo = resolverFrame(wc, frameRef)
      if (!alvo) return { ok: false, erro: 'frame nao encontrado' }
      const dados = await alvo.executeJavaScript(script, true)
      return { ok: true, dados }
    } catch (e) {
      if (!ehErroSeguranca(e) && frameRef === undefined) {
        return { ok: false, erro: String((e as Error).message || e) }
      }
      // cai no debugger
      dglog('[navegador] executeJavaScript falhou, tentando debugger: ' + String((e as Error).message || e))
    }
  }

  try {
    const r = await avaliarViaDebugger(wc, frameRef, script)
    if (r.ok) return { ok: true, dados: r.dados, tentouDebugger: true }
    return { ok: false, erro: r.erro, tentouDebugger: true }
  } catch (e) {
    return {
      ok: false,
      erro: String((e as Error).message || e),
      tentouDebugger: true
    }
  }
}
