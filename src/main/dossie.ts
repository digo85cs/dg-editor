import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ChatMessage } from '../shared/types'

/**
 * Dossie automatico do DG Editor.
 * Grava/substitui .dg-editor/dossie.txt ao final de cada resposta do chat.
 * Serve de contexto de continuidade entre DG Editor, Maestro (Adapta) e Ollama.
 */

export interface DossieSnapshot {
  root: string
  atualizadoEm: number
  totalMensagens: number
  ultimoProvedor?: string
  resumo: string
}

function dossieDir(): string {
  return join(process.cwd(), '.dg-editor')
}

export function caminhoDossie(): string {
  return join(dossieDir(), 'dossie.txt')
}

/** Monta o texto do dossie a partir do historico do chat. */
export function montarDossie(
  historico: ChatMessage[],
  extra?: { resumo?: string; proximaAcao?: string; root?: string }
): string {
  const agora = new Date()
  const ultimas = historico.slice(-20)
  const porProvedor: Record<string, number> = {}
  for (const m of historico) {
    if (m.provider) porProvedor[m.provider] = (porProvedor[m.provider] || 0) + 1
  }
  const provedorRecente = [...historico].reverse().find((m) => m.provider)?.provider ?? 'n/d'

  const corpo: string[] = []
  corpo.push('=== DOSSIE DG EDITOR ===')
  corpo.push(`Atualizado em: ${agora.toISOString()}`)
  corpo.push(`Raiz: ${extra?.root ?? process.cwd()}`)
  corpo.push(`Total de mensagens no chat: ${historico.length}`)
  corpo.push(`Provedor mais recente: ${provedorRecente}`)
  corpo.push(`Contagem por provedor: ${JSON.stringify(porProvedor)}`)
  corpo.push('')
  if (extra?.resumo) {
    corpo.push('--- RESUMO DO ESTADO ---')
    corpo.push(extra.resumo)
    corpo.push('')
  }
  if (extra?.proximaAcao) {
    corpo.push('--- PROXIMA ACAO ---')
    corpo.push(extra.proximaAcao)
    corpo.push('')
  }
  corpo.push('--- ULTIMAS MENSAGENS ---')
  for (const m of ultimas) {
    const quem = m.role === 'user' ? 'DONO' : 'IA'
    const prov = m.provider ? ` [${m.provider}]` : ''
    const texto = m.content.replace(/\s+/g, ' ').slice(0, 600)
    corpo.push(`[${new Date(m.at).toISOString()}] ${quem}${prov}: ${texto}`)
  }
  corpo.push('=== FIM DO DOSSIE ===')
  return corpo.join('\n')
}

/** Grava (substitui) o dossie no disco. Nunca anexa. */
export async function gravarDossie(
  historico: ChatMessage[],
  extra?: { resumo?: string; proximaAcao?: string; root?: string }
): Promise<string> {
  const destino = caminhoDossie()
  await fs.mkdir(dirname(destino), { recursive: true })
  const texto = montarDossie(historico, extra)
  await fs.writeFile(destino, texto, 'utf8')
  return destino
}

/** Le o dossie atual (usado pelo bridge para a Adapta). */
export async function lerDossie(): Promise<string> {
  try {
    return await fs.readFile(caminhoDossie(), 'utf8')
  } catch {
    return ''
  }
}

/** Snapshot estruturado para a UI. */
export async function dossieSnapshot(): Promise<DossieSnapshot | null> {
  const texto = await lerDossie()
  if (!texto) return null
  const linhas = texto.split('\n')
  const pega = (prefixo: string) =>
    linhas.find((l) => l.startsWith(prefixo))?.slice(prefixo.length).trim()
  return {
    root: pega('Raiz:') ?? '',
    atualizadoEm: Date.parse(pega('Atualizado em:') ?? '') || 0,
    totalMensagens: Number(pega('Total de mensagens no chat:') ?? 0) || 0,
    ultimoProvedor: pega('Provedor mais recente:'),
    resumo: texto.slice(0, 400)
  }
}
