import { z } from 'zod'

const str = (d = '') => z.preprocess((v) => (v == null ? d : typeof v === 'string' ? v : String(v)), z.string())
const strArr = z.preprocess((v) => (Array.isArray(v) ? v.map((x) => (x == null ? '' : String(x))).filter((x) => x.trim()) : []), z.array(z.string()))

export const RelatorioSchema = z.object({
  root: str(),
  analyzedAt: z.preprocess((v) => (typeof v === 'number' && Number.isFinite(v) ? v : Date.now()), z.number()),
  provider: str('desconhecido'),
  model: z.preprocess((v) => (v == null || v === '' ? undefined : String(v)), z.string().optional()),
  oQueE: str(),
  stack: str(),
  estrutura: str(),
  pontosAtencao: strArr,
  sugestoes: strArr,
  raw: str(),
})

export type RelatorioNormalizado = z.infer<typeof RelatorioSchema>

export function normalizarRelatorio(raw: unknown): RelatorioNormalizado {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const base = {
    root: r.root,
    analyzedAt: r.analyzedAt,
    provider: r.provider,
    model: r.model,
    oQueE: r.oQueE ?? (r as any).oqueE ?? (r as any).o_que_e ?? '',
    stack: r.stack ?? '',
    estrutura: r.estrutura ?? '',
    pontosAtencao: r.pontosAtencao ?? (r as any).pontos_atencao ?? [],
    sugestoes: r.sugestoes ?? [],
    raw: r.raw ?? '',
  }
  return RelatorioSchema.parse(base)
}
