export enum CodigoErro {
  // Infra / ambiente
  ERR_OLLAMA_OFFLINE = 'ERR_OLLAMA_OFFLINE',
  ERR_OLLAMA_MODEL_MISSING = 'ERR_OLLAMA_MODEL_MISSING',
  ERR_LLM_APIKEY_MISSING = 'ERR_LLM_APIKEY_MISSING',
  ERR_LLM_TIMEOUT = 'ERR_LLM_TIMEOUT',
  ERR_LLM_EMPTY_RESPONSE = 'ERR_LLM_EMPTY_RESPONSE',
  // Contrato / dado
  ERR_IPC_SHAPE_MISMATCH = 'ERR_IPC_SHAPE_MISMATCH',
  ERR_ANALYSIS_EMPTY = 'ERR_ANALYSIS_EMPTY',
  ERR_ANALYSIS_PARSE = 'ERR_ANALYSIS_PARSE',
  // Sistema de arquivos
  ERR_FOLDER_NOT_FOUND = 'ERR_FOLDER_NOT_FOUND',
  ERR_FOLDER_PERMISSION = 'ERR_FOLDER_PERMISSION',
  ERR_FILE_READ = 'ERR_FILE_READ',
  // Tool call
  ERR_TOOL_CALL_INVALID = 'ERR_TOOL_CALL_INVALID',
  ERR_TOOL_UNKNOWN = 'ERR_TOOL_UNKNOWN',
  ERR_TOOL_LOOP_CAP = 'ERR_TOOL_LOOP_CAP',
  // Catch-all
  ERR_UNKNOWN = 'ERR_UNKNOWN',
}

export interface ErroApp {
  codigo: CodigoErro
  mensagem: string
  acao?: string
  detalhe?: string
}

const CODIGOS = new Set<string>(Object.values(CodigoErro))

export function criarErro(codigo: CodigoErro, mensagem: string, acao?: string, detalhe?: string): ErroApp {
  return {
    codigo,
    mensagem,
    ...(acao ? { acao } : {}),
    ...(detalhe ? { detalhe } : {}),
  }
}

export function isErroApp(v: unknown): v is ErroApp {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.codigo === 'string' &&
    CODIGOS.has(o.codigo) &&
    typeof o.mensagem === 'string' &&
    o.mensagem.trim().length > 0
  )
}
