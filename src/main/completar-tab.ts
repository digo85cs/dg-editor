/**
 * Completar a linha no editor. So o modelo pequeno 1.5b.
 * Nao entra na fila do chat e nao carrega 7b nem 14b.
 */
import { request as httpRequest } from 'http'
import { guardianPodeOperar } from './guardian'

const URL_OLLAMA = 'http://127.0.0.1:11434'
const MODELO_TAB = 'qwen2.5-coder:1.5b'

let sequencia = 0

function primeiraLinha(bruto: string, prefixo: string): string {
  const limpo = bruto.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim()
  const linha = limpo.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || ''
  const cauda = prefixo.slice(-40).trim()
  let out = linha
  if (cauda && out.startsWith(cauda)) out = out.slice(cauda.length)
  return out.trim().slice(0, 80)
}

function pedir(prefixo: string, sufixo: string): Promise<string> {
  const corpo = Buffer.from(JSON.stringify({
    model: MODELO_TAB,
    stream: false,
    keep_alive: '2m',
    messages: [
      {
        role: 'system',
        content: 'Voce completa a proxima linha de codigo. Responda so o trecho novo, sem markdown e sem repetir o que ja foi escrito.'
      },
      {
        role: 'user',
        content: prefixo.slice(-1200) + '<CURSOR>' + sufixo.slice(0, 240)
      }
    ],
    options: { num_ctx: 2048, temperature: 0.1, num_predict: 24 }
  }), 'utf8')

  return new Promise((resolve) => {
    const req = httpRequest(URL_OLLAMA + '/api/chat', {
      method: 'POST',
      timeout: 3500,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(corpo.length)
      }
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        if ((res.statusCode || 0) >= 400) {
          resolve('')
          return
        }
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { message?: { content?: string } }
          resolve(primeiraLinha(j.message?.content || '', prefixo))
        } catch {
          resolve('')
        }
      })
    })
    req.on('error', () => resolve(''))
    req.on('timeout', () => {
      req.destroy()
      resolve('')
    })
    req.write(corpo)
    req.end()
  })
}

/** Devolve no maximo uma linha. Vazio se o guardiao segurou ou o modelo nao respondeu. */
export async function completarTrecho(prefixo: string, sufixo: string): Promise<string> {
  const id = ++sequencia
  if (!guardianPodeOperar()) return ''
  const texto = await pedir(prefixo, sufixo)
  return id === sequencia ? texto : ''
}
