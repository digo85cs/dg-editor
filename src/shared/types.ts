export interface AuthUser {
  username: string
  /** E-mail canônico do dono (único para contas do DG Editor). */
  email: string
  createdAt: number
}

export interface AuthSession {
  authenticated: true
  user: AuthUser
  token: string
  expiresAt: number
}

export interface AuthState {
  authenticated: boolean
  session?: AuthSession
  user?: AuthUser
}

export interface SystemProfile {
  platform: NodeJS.Platform
  arch: string
  hostname: string
  cpus: { model: string; cores: number; speed: number }[]
  totalMemory: number
  freeMemory: number
  osRelease: string
  gpu?: { name: string; vendor: string }[]
  disk: { total: number; free: number }
  nodeVersion: string
  electronVersion: string
  capturedAt: number
}

export interface FolderScanResult {
  root: string
  totalFiles: number
  totalDirs: number
  skippedDirs: number
  extensions: Record<string, number>
  topFiles: { path: string; size: number }[]
  scannedAt: number
  durationMs: number
}

export interface OllamaStatus {
  installed: boolean
  reachable: boolean
  models: { name: string; size: number; modifiedAt: string }[]
  error?: string
}

export interface BrainResponse {
  text: string
  provider: string
  model?: string
}

export interface BrainProvider {
  name: 'ollama' | 'api' | 'maestro'
  isAvailable(): Promise<boolean>
  listModels(): Promise<{ name: string }[]>
  ping(): Promise<boolean>
    ask(prompt: string, context: string, tarefa?: string): Promise<BrainResponse>
}

// ---------- Fase 1: análise, cache, onde-está, chat, regras ----------

export interface AnalysisReport {
  root: string
  analyzedAt: number
  provider: string
  model?: string
  oQueE: string
  stack: string
  estrutura: string
  pontosAtencao: string[]
  sugestoes: string[]
  raw?: string
}

export interface AnalysisCache {
  root: string
  analyzedAt: number
  provider: string
  report: AnalysisReport
  fileHashes: Record<string, string>
}

export interface AnalysisRunResult {
  fromCache: boolean
  changedFiles: string[]
  report: AnalysisReport
}

export interface WhereIsMatch {
  file: string
  line: number
  snippet: string
}

export interface WhereIsResult {
  query: string
  matches: WhereIsMatch[]
  scannedFiles: number
  durationMs: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  at: number
  provider?: string
}

// ---------- Fase 2: guardião, contas, tema, paleta ----------

export interface GuardianSnapshot {
  freeMemory: number
  totalMemory: number
  freePct: number
  cpuPercent: number
  ramOk: boolean
  at: number
}

export interface AccountsState {
  identidade: {
    username: string
    email: string
    tokenPrefix: string
    criadoEm: number
  }
  maquina: { hostname: string; plataforma: string; cpus: number; ramGB: string; forca: string }
  ia: { ollamaInstalado: boolean; ollamaRodando: boolean; modelos: string[]; provedores: { name: string; available: boolean; models: number }[] }
  guardian: GuardianSnapshot
}

export type Tema = 'escuro' | 'claro'

export interface PaletteCommand {
  id: string
  label: string
  hint?: string
}

// ---------- Diagnostico ao vivo ----------
export interface DiagnosticoModulo {
  id: string
  nome: string
  ok: boolean
  detalhe: string
  ms: number
}

export interface DiagnosticoResultado {
  modulos: DiagnosticoModulo[]
  ok: number
  total: number
  at: number
}
