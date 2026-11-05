/**
 * Chat simples em stream (OpenAI-compatible e Ollama).
 * Cada trecho vai para onDelta; o retorno e o texto completo.
 */
import { request as httpRequest, type IncomingMessage } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { OLLAMA_URL } from './ollama'

export type DeltaFn = (trecho: string) => void

function lerStream(
  urlStr: string,
  corpo: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  onLinha: (linha: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const lib = u.protocol === 'https:' ? httpsRequest : httpRequest
    const dados = Buffer.from(JSON.stringify(corpo), 'utf8')
    let settled = false
    const fim = (err?: Error) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    const req = lib(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': String(dados.length)
        }
      },
      (res: IncomingMessage) => {
        if ((res.statusCode || 0) >= 400) {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            fim(new Error('HTTP ' + res.statusCode + ' ' + Buffer.concat(chunks).toString('utf8').slice(0, 180)))
          })
          return
        }
        let resto = ''
        res.on('data', (c: Buffer) => {
          resto += c.toString('utf8')
          let nl = resto.indexOf('\n')
          while (nl >= 0) {
            const linha = resto.slice(0, nl).trim()
            resto = resto.slice(nl + 1)
            if (linha) onLinha(linha)
            nl = resto.indexOf('\n')
          }
        })
        res.on('end', () => {
          const ultimo = resto.trim()
          if (ultimo) onLinha(ultimo)
          fim()
        })
      }
    )
    req.on('error', (e) => fim(e instanceof Error ? e : new Error(String(e))))
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.write(dados)
    req.end()
  })
}

export async function streamOllamaChat(opts: {
  model: string
  user: string
  system?: string
  numPredict: number
  timeoutMs: number
  onDelta: DeltaFn
}): Promise<string> {
  let texto = ''
  await lerStream(
    OLLAMA_URL + '/api/chat',
    {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system || 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.' },
        { role: 'user', content: opts.user }
      ],
      stream: true,
      keep_alive: '2m',
      options: { num_ctx: 4096, temperature: 0.3, num_predict: opts.numPredict }
    },
    {},
    opts.timeoutMs,
    (linha) => {
      try {
        const j = JSON.parse(linha) as { message?: { content?: string } }
        const pedaco = j.message?.content || ''
        if (!pedaco) return
        texto += pedaco
        opts.onDelta(pedaco)
      } catch {
        /* linha incompleta */
      }
    }
  )
  return texto
}

export async function streamOpenAIChat(opts: {
  baseUrl: string
  apiKey: string
  model: string
  user: string
  system?: string
  numPredict: number
  timeoutMs: number
  onDelta: DeltaFn
}): Promise<string> {
  let texto = ''
  const base = opts.baseUrl.replace(/\/$/, '')
  await lerStream(
    base + '/chat/completions',
    {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system || 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.' },
        { role: 'user', content: opts.user }
      ],
      temperature: 0.3,
      max_tokens: opts.numPredict,
      stream: true
    },
    {
      Authorization: 'Bearer ' + opts.apiKey,
      'HTTP-Referer': 'https://dg-editor.local',
      'X-Title': 'DG Editor'
    },
    opts.timeoutMs,
    (linha) => {
      const cru = linha.startsWith('data:') ? linha.slice(5).trim() : linha
      if (!cru || cru === '[DONE]') return
      try {
        const j = JSON.parse(cru) as { choices?: Array<{ delta?: { content?: string } }> }
        const pedaco = j.choices?.[0]?.delta?.content || ''
        if (!pedaco) return
        texto += pedaco
        opts.onDelta(pedaco)
      } catch {
        /* evento SSE ignorado */
      }
    }
  )
  return texto
}
