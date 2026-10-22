export interface AuthUser {
  username: string
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
  ask(prompt: string, context: string): Promise<BrainResponse>
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