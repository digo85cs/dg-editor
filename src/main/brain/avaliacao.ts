/**
 * Avaliação automática de qualidade de modelo (10 perguntas + verificadores).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { ollamaHttpJson, OLLAMA_URL } from './ollama'
import { dglog } from '../dglog'

export interface ItemAvaliacao {
  id: string
  pergunta: string
  verificar: (resposta: string) => boolean
  dica: string
}

export interface ResultadoAvaliacao {
  modelo: string
  nota: number
  acertos: number
  total: number
  falhas: { id: string; dica: string; amostra: string }[]
  em: string
}

const PERGUNTAS: ItemAvaliacao[] = [
  {
    id: 'pt-br',
    pergunta: 'Responda em uma frase: qual a capital do Brasil?',
    verificar: (r) => /bras[ií]lia/i.test(r),
    dica: 'deve mencionar Brasília'
  },
  {
    id: 'soma',
    pergunta: 'Quanto é 7+5? Responda só o número.',
    verificar: (r) => /\b12\b/.test(r),
    dica: 'deve conter 12'
  },
  {
    id: 'lang',
    pergunta: 'Qual linguagem usa print("hi")? Uma palavra.',
    verificar: (r) => /python/i.test(r),
    dica: 'deve mencionar Python'
  },
  {
    id: 'json',
    pergunta: 'Escreva um JSON mínimo com chave "ok": true. Só o JSON.',
    verificar: (r) => /"ok"\s*:\s*true/.test(r),
    dica: 'deve ter "ok": true'
  },
  {
    id: 'curto',
    pergunta: 'Diga apenas a palavra PING.',
    verificar: (r) => /ping/i.test(r) && r.trim().length < 40,
    dica: 'deve ser curto e conter PING'
  },
  {
    id: 'html',
    pergunta: 'Qual tag HTML cria um parágrafo? Só a tag.',
    verificar: (r) => /<p>|p\b/i.test(r),
    dica: 'deve mencionar p'
  },
  {
    id: 'git',
    pergunta: 'Comando git para ver status. Só o comando.',
    verificar: (r) => /git\s+status/i.test(r),
    dica: 'deve ter git status'
  },
  {
    id: 'regex',
    pergunta: 'O que \d significa em regex? Uma frase curta.',
    verificar: (r) => /d[ií]gito|numero|number|digit/i.test(r),
    dica: 'deve falar de dígito/número'
  },
  {
    id: 'lista',
    pergunta: 'Liste 3 cores primárias de luz, separadas por vírgula.',
    verificar: (r) => {
      const t = r.toLowerCase()
      return /verm|red/.test(t) && /verde|green/.test(t) && /azul|blue/.test(t)
    },
    dica: 'RGB'
  },
  {
    id: 'bool',
    pergunta: 'true AND false em lógica booleana vale? Responda true ou false.',
    verificar: (r) => /\bfalse\b/i.test(r),
    dica: 'deve ser false'
  }
]

function dirAval(raiz: string): string {
  return join(raiz, '.dg-editor', 'avaliacoes')
}

async function perguntarModelo(modelo: string, pergunta: string): Promise<string> {
  const r = (await ollamaHttpJson(
    OLLAMA_URL + '/api/chat',
    {
      model: modelo,
      messages: [
        { role: 'system', content: 'Responda de forma curta e objetiva em pt-BR.' },
        { role: 'user', content: pergunta }
      ],
      stream: false,
      options: { num_predict: 64, temperature: 0 }
    },
    'POST',
    60000
  )) as { message?: { content?: string } }
  return String(r?.message?.content || '').trim()
}

export async function rodarAvaliacao(raiz: string, modeloId: string): Promise<ResultadoAvaliacao> {
  const falhas: ResultadoAvaliacao['falhas'] = []
  let acertos = 0
  for (const item of PERGUNTAS) {
    try {
      const resp = await perguntarModelo(modeloId, item.pergunta)
      if (item.verificar(resp)) acertos++
      else falhas.push({ id: item.id, dica: item.dica, amostra: resp.slice(0, 120) })
    } catch (e) {
      falhas.push({
        id: item.id,
        dica: item.dica,
        amostra: String((e as Error)?.message || e).slice(0, 120)
      })
    }
  }
  const total = PERGUNTAS.length
  const nota = Math.round((acertos / total) * 10 * 10) / 10
  const out: ResultadoAvaliacao = {
    modelo: modeloId,
    nota,
    acertos,
    total,
    falhas,
    em: new Date().toISOString()
  }
  try {
    const d = dirAval(raiz)
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
    const safe = modeloId.replace(/[^\w.-]+/g, '_')
    writeFileSync(join(d, safe + '.json'), JSON.stringify(out, null, 2), 'utf-8')
  } catch (e) {
    dglog('[avaliacao] salvar falhou: ' + String(e))
  }
  return out
}

export function lerUltimaAvaliacao(raiz: string, modeloId: string): ResultadoAvaliacao | null {
  try {
    const safe = modeloId.replace(/[^\w.-]+/g, '_')
    const p = join(dirAval(raiz), safe + '.json')
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8')) as ResultadoAvaliacao
  } catch {
    return null
  }
}
