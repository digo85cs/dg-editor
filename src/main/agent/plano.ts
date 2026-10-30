/**
 * Persiste o último plano + checklist de passos para execução incremental.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

export type PassoPlano = {
  id: string
  texto: string
  feito: boolean
  checkpointId?: string
}

export type PlanoSalvo = {
  texto: string
  raiz: string
  salvoEm: string
  agente?: string
  passos?: PassoPlano[]
}

function pathPlano(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, 'agent-last-plan.json')
}

/** Extrai passos numerados / bullets do markdown do plano. */
export function extrairPassosDoTexto(texto: string): PassoPlano[] {
  const linhas = String(texto || '').split(/\r?\n/)
  const passos: PassoPlano[] = []
  for (const ln of linhas) {
    const m = ln.match(/^\s*(?:\d+[.)]\s+|[-*]\s+(?=\S))(.+)$/)
    if (!m) continue
    const t = m[1].trim()
    if (t.length < 3) continue
    // ignora headings tipo "- Objetivo:" curtos demais já filtrados
    passos.push({
      id: randomBytes(4).toString('hex'),
      texto: t.slice(0, 500),
      feito: false
    })
  }
  return passos.slice(0, 40)
}

export function salvarPlano(p: PlanoSalvo): void {
  const passos = p.passos?.length ? p.passos : extrairPassosDoTexto(p.texto)
  const full: PlanoSalvo = { ...p, passos }
  writeFileSync(pathPlano(), JSON.stringify(full, null, 2), 'utf8')
}

export function lerPlano(): PlanoSalvo | null {
  try {
    if (!existsSync(pathPlano())) return null
    const p = JSON.parse(readFileSync(pathPlano(), 'utf8')) as PlanoSalvo
    if (!p.passos?.length && p.texto) {
      p.passos = extrairPassosDoTexto(p.texto)
    }
    return p
  } catch {
    return null
  }
}

export function limparPlano(): void {
  try {
    if (existsSync(pathPlano())) unlinkSync(pathPlano())
  } catch {
    /* */
  }
}

export function marcarPasso(
  passoId: string,
  feito: boolean,
  checkpointId?: string
): PlanoSalvo | null {
  const p = lerPlano()
  if (!p?.passos) return null
  const passo = p.passos.find((x) => x.id === passoId)
  if (!passo) return null
  passo.feito = feito
  if (checkpointId) passo.checkpointId = checkpointId
  salvarPlano(p)
  return p
}

export function atualizarPassos(passos: PassoPlano[]): PlanoSalvo | null {
  const p = lerPlano()
  if (!p) return null
  p.passos = passos
  salvarPlano(p)
  return p
}

export function proximoPassoPendente(): PassoPlano | null {
  const p = lerPlano()
  if (!p?.passos) return null
  return p.passos.find((x) => !x.feito) || null
}
