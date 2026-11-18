/**
 * Guarda de custo — ledger de uso de providers pagos + classificação de erros
 * de cobrança. NÃO bloqueia chamadas explícitas (a tool específica já é o
 * opt-in); registra tudo e sinaliza erros de saldo/cota para fallback limpo.
 *
 * Ledger: <raiz>/.dg-editor/uso-custo.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type RegistroUso = {
  ts: string
  motor: string
  ok: boolean
  custoUsd?: number
  detalhe?: string
}

type Ledger = { registros: RegistroUso[] }

function arquivoLedger(raiz: string): string {
  return join(raiz, '.dg-editor', 'uso-custo.json')
}

function lerLedger(raiz: string): Ledger {
  try {
    const f = arquivoLedger(raiz)
    if (!existsSync(f)) return { registros: [] }
    const j = JSON.parse(readFileSync(f, 'utf8')) as Ledger
    return { registros: Array.isArray(j.registros) ? j.registros : [] }
  } catch {
    return { registros: [] }
  }
}

/** Registra uma tentativa de provider (grátis ou pago). Fire-and-forget seguro. */
export function registrarUso(
  raiz: string,
  motor: string,
  ok: boolean,
  extra?: { custoUsd?: number; detalhe?: string }
): void {
  try {
    const l = lerLedger(raiz)
    l.registros.push({
      ts: new Date().toISOString(),
      motor,
      ok,
      custoUsd: extra?.custoUsd,
      detalhe: extra?.detalhe?.slice(0, 200)
    })
    // Mantém no máximo 2000 registros (janela recente).
    if (l.registros.length > 2000) l.registros = l.registros.slice(-2000)
    const dir = join(raiz, '.dg-editor')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(arquivoLedger(raiz), JSON.stringify(l, null, 2), 'utf8')
  } catch {
    /* ledger é best-effort */
  }
}

/** Resumo de uso por motor (para painel/diagnóstico). */
export function resumoUso(raiz: string): { motor: string; total: number; ok: number; custoUsd: number }[] {
  const mapa = new Map<string, { motor: string; total: number; ok: number; custoUsd: number }>()
  for (const r of lerLedger(raiz).registros) {
    const m = mapa.get(r.motor) || { motor: r.motor, total: 0, ok: 0, custoUsd: 0 }
    m.total++
    if (r.ok) m.ok++
    m.custoUsd += r.custoUsd || 0
    mapa.set(r.motor, m)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total)
}

/** Detecta erros de cobrança/cota que devem acionar fallback, não retry cego. */
export function ehErroCobranca(erro: string | undefined): boolean {
  if (!erro) return false
  const t = erro.toLowerCase()
  return (
    /\b402\b|payment required|insufficient (credits|balance|funds|quota)|billing|credit balance|saldo insuficiente|requires payment|exceeded your current quota|quota exceeded|rate limit/.test(
      t
    )
  )
}

/** Aviso padrão para tools pagas — sempre visível na resposta. */
export function avisoCusto(motor: string, ok: boolean): string {
  return ok
    ? `Custo registrado no ledger (.dg-editor/uso-custo.json) — motor pago: ${motor}.`
    : ''
}
