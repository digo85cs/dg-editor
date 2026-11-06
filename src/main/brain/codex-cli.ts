/**
 * Stub (BLOCO 3) — módulo codex-cli ausente no repositório.
 * Mantém compilação de providers/registry; indisponível em runtime.
 */
export type CodexKind = 'auth' | 'timeout' | 'cancelled' | 'unavailable' | 'rede' | 'server' | 'protocol' | 'outro'
export class CodexCliError extends Error {
  kind: CodexKind
  constructor(kind: CodexKind, message: string) {
    super(message)
    this.name = 'CodexCliError'
    this.kind = kind
  }
}
export interface CodexStatus { installed: boolean; authenticated: boolean; available: boolean }
export interface CodexResult { text: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number } }
export function resolverBinarioCodex(): string | null { return null }
export function statusCodexEmCache(): CodexStatus | null { return { installed: false, authenticated: false, available: false } }
export async function executarCodex(_opts: Record<string, unknown>): Promise<CodexResult> {
  throw new CodexCliError('unavailable', 'codex-cli não está disponível neste build')
}
