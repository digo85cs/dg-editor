/** Stub Etapa 1 — substituído na Etapa 2 pelos módulos de domínio. */
import type { ComandoAutomacao } from './allowlist'
import type { ContextoExecucao } from './guard'
export async function executarComandoDominio(
  cmd: ComandoAutomacao,
  _args: Record<string, unknown>,
  _ctx: ContextoExecucao
): Promise<{ ok: boolean; dados?: unknown; erro?: string; comandoExecutado: string }> {
  return { ok: false, erro: `domínio não implementado (Etapa 2): ${cmd.dominio}/${cmd.id}`, comandoExecutado: cmd.id }
}
