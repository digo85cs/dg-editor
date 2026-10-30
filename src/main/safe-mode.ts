/** Flags de --safe-mode (sem agentes/MCP/watcher). */
let safeMode = false

export function ativarSafeMode(): void {
  safeMode = true
}

export function emSafeMode(): boolean {
  return safeMode
}

export function detectarSafeModeArgv(argv: string[] = process.argv): boolean {
  return argv.some((a) => a === '--safe-mode' || a === '--safemode')
}
