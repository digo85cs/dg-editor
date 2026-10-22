// Analysis report types
export interface AnalysisSection {
  title: string
  content: string
}

export interface AnalysisReport {
  systemDescription: string
  stackAndTech: string
  structure: string
  attentionPoints: string
  suggestions: string
  rawText: string
  provider: string
  model?: string
  generatedAt: number
  tokenEstimate: number
}

export interface FileIndexEntry {
  path: string
  relativePath: string
  extension: string
  size: number
  hash: string
  lines: number
  summary: string
  indexedAt: number
}

export interface FileIndex {
  root: string
  entries: FileIndexEntry[]
  builtAt: number
}

export interface Dgrules {
  exists: boolean
  path: string
  content: string
  rules: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface SearchMatch {
  file: string
  line: number
  content: string
}