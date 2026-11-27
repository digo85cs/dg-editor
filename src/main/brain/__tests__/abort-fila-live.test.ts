import { describe, it, expect } from 'vitest'
import http from 'http'

/**
 * LIVE (DG_LIVE_OLLAMA=1): abort do cliente cancela a geracao no Ollama.
 * 3 aborts (req.destroy apos 3s) numa geracao longa; o pedido trivial
 * seguinte deve responder no tempo normal — fila zumbi nao pode existir.
 * Medido em 27/11: triviais 2098/1631/1666ms, 4o pedido 948ms.
 */
const LIVE = process.env.DG_LIVE_OLLAMA === '1'
const OLLAMA = 'http://127.0.0.1:11434'

function chatAbort(model: string, delayMs: number): Promise<string> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Ensaio longo, 3000 palavras, historia da computacao.' }],
      stream: false,
      options: { num_predict: 1500, num_ctx: 4096 }
    })
    const req = http.request(
      OLLAMA + '/api/chat',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        res.resume()
        res.on('end', () => resolve('completou'))
      }
    )
    req.on('error', () => resolve('abortado'))
    req.write(body)
    req.end()
    setTimeout(() => {
      try { req.destroy() } catch { /* */ }
      resolve('destroy-sent')
    }, delayMs)
    setTimeout(() => resolve('timeout-sem-resposta'), delayMs + 2000)
  })
}

async function trivial(model: string): Promise<{ ms: number; eval?: number }> {
  const t0 = Date.now()
  const j = (await (
    await fetch(OLLAMA + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'oi', options: { num_predict: 4 }, stream: false, keep_alive: '30m' })
    })
  ).json()) as { eval_count?: number }
  return { ms: Date.now() - t0, eval: j.eval_count }
}

describe.runIf(LIVE)('FASE4 abort cancela geracao (Ollama real)', () => {
  it('3 aborts + 4o pedido rapido', async () => {
    const modelo = 'qwen2.5-coder:1.5b'
    await fetch(OLLAMA + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt: 'oi', options: { num_predict: 2 }, stream: false, keep_alive: '30m' })
    })
    const tempos: number[] = []
    for (let i = 0; i < 3; i++) {
      await chatAbort(modelo, 3000)
      tempos.push((await trivial(modelo)).ms)
    }
    const quarto = (await trivial(modelo)).ms
    console.log('[FASE4] triviais pos-abort=' + tempos.join('/') + 'ms | 4o=' + quarto + 'ms')
    // Se o abort nao cancelasse, cada trivial ficaria atras de ~1500 tokens
    // de geracao (~6min no 1.5b desta maquina). Limite generoso: 60s.
    for (const t of [...tempos, quarto]) expect(t).toBeLessThan(60_000)
  }, 300_000)
})
