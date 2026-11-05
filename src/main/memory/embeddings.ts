import { request } from 'http'
import fs from 'fs'
import path from 'path'
import { dglog } from '../dglog'
import { OLLAMA_URL } from '../brain/ollama'

/**
 * Memoria semantica local do DG Editor.
 * Embeddings via nomic-embed-text no Ollama local - zero dependencia externa.
 * Indice em disco: JSON com vetores por turno de conversa.
 */

const MODELO_EMB = 'nomic-embed-text'

export interface EntradaMemoria {
  id: string
  at: number
  role: 'user' | 'assistant'
  texto: string
  vetor: number[]
}

interface Indice {
  versao: number
  modelo: string
  entradas: EntradaMemoria[]
}

function caminhoIndice(raiz: string): string {
  return path.join(raiz, '.dg-editor', 'memoria', 'indice.json')
}

function httpJson(url: string, corpo: unknown, timeout = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const dados = Buffer.from(JSON.stringify(corpo), 'utf8')
    const req = request(
      url,
      {
        method: 'POST',
        timeout,
        headers: { 'Content-Type': 'application/json', 'Content-Length': dados.length }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error('HTTP ' + res.statusCode + ': ' + txt.slice(0, 200)))
            return
          }
          try { resolve(JSON.parse(txt)) } catch (e) { reject(e) }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('timeout embeddings')) })
    req.write(dados)
    req.end()
  })
}

export async function gerarEmbedding(texto: string): Promise<number[] | null> {
  try {
    const r = (await httpJson(OLLAMA_URL + '/api/embeddings', { model: MODELO_EMB, prompt: texto })) as { embedding?: number[] }
    if (!r || !Array.isArray(r.embedding) || r.embedding.length === 0) return null
    return r.embedding
  } catch (e) {
    dglog('[memoria] embedding falhou: ' + String(e))
    return null
  }
}

export function cosseno(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function carregarIndice(raiz: string): Indice {
  const p = caminhoIndice(raiz)
  try {
    if (!fs.existsSync(p)) return { versao: 1, modelo: MODELO_EMB, entradas: [] }
    const bruto = JSON.parse(fs.readFileSync(p, 'utf8')) as Indice
    if (!bruto.entradas) bruto.entradas = []
    return bruto
  } catch (e) {
    dglog('[memoria] indice corrompido, recriando: ' + String(e))
    return { versao: 1, modelo: MODELO_EMB, entradas: [] }
  }
}

export function salvarIndice(raiz: string, idx: Indice): void {
  const p = caminhoIndice(raiz)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(idx), 'utf8')
  fs.renameSync(tmp, p)
}

export async function indexarTurno(
  raiz: string,
  role: 'user' | 'assistant',
  texto: string
): Promise<void> {
  if (!texto || texto.trim().length < 20) return
  const vetor = await gerarEmbedding(texto.slice(0, 4000))
  if (!vetor) return

  const idx = carregarIndice(raiz)
  idx.entradas.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    at: Date.now(),
    role,
    texto: texto.slice(0, 4000),
    vetor
  })

  // limite de memoria: mantem os 2000 turnos mais recentes com vetor
  const MAX = 2000
  if (idx.entradas.length > MAX) {
    idx.entradas = idx.entradas.slice(idx.entradas.length - MAX)
  }
  salvarIndice(raiz, idx)
}

export async function buscarSemelhantes(
  raiz: string,
  consulta: string,
  k = 4,
  limiar = 0.45
): Promise<EntradaMemoria[]> {
  const alvo = await gerarEmbedding(consulta)
  if (!alvo) return []

  const idx = carregarIndice(raiz)
  if (idx.entradas.length === 0) return []

  const pontuadas = idx.entradas
    .map((e) => ({ entrada: e, score: cosseno(alvo, e.vetor) }))
    .filter((x) => x.score >= limiar)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  return pontuadas.map((x) => x.entrada)
}