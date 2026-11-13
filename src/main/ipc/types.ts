/**
 * Tipos para handlers IPC do DG Editor
 * Centraliza todas as interfaces de payload e resultado para IPC
 */

import type { BrowserWindow, IpcMainEvent } from 'electron';

// ============================================================================
// TIPOS BASE
// ============================================================================

import type { ErroApp } from '@shared/erros';

/** Resultado base para todas as operacoes IPC */
export interface IpcResult<T = unknown> {
  ok: boolean;
  erro?: string | ErroApp;
  erroTexto?: string;
  dados?: T;
}

/** Payload com validacao de string */
export interface StringPayload {
  valor: string;
}

/** Payload com validacao de array de strings */
export interface StringArrayPayload {
  valores: string[];
}

// ============================================================================
// ARQUIVOS
// ============================================================================

/** Payload para ler arquivo */
export interface ArquivoLerPayload {
  caminho: string;
  pastas: string[];
}

/** Resultado da leitura de arquivo */
export interface ArquivoLerResult extends IpcResult {
  conteudo?: string;
  caminho?: string;
}

/** Payload para salvar arquivo */
export interface ArquivoSalvarPayload {
  caminho: string;
  conteudo: string;
  pastas: string[];
}

/** Resultado do salvamento de arquivo */
export interface ArquivoSalvarResult extends IpcResult {
  caminho?: string;
  bytes?: number;
}

/** Payload para listar diretorio */
export interface ArquivoListarPayload {
  caminho: string;
  pastas: string[];
}

/** Resultado da listagem de diretorio */
export interface ArquivoListarResult extends IpcResult {
  arquivos?: Array<{
    nome: string;
    caminho: string;
    tipo: 'arquivo' | 'diretorio';
    tamanho?: number;
    modificado?: string;
  }>;
}

/** Payload para verificar se arquivo existe */
export interface ArquivoExistePayload {
  caminho: string;
  pastas: string[];
}

/** Resultado da verificacao de existencia */
export interface ArquivoExisteResult extends IpcResult {
  existe?: boolean;
}

// ============================================================================
// TERMINAL
// ============================================================================

/** Opcoes para criar terminal */
export interface TerminalCreateOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
  shellExe?: string;
  shellId?: string;
}

/** Payload para criar terminal */
export interface TerminalCreatePayload {
  id: string;
  opts?: TerminalCreateOptions;
}

/** Resultado da criacao de terminal */
export interface TerminalCreateResult extends IpcResult {
  id?: string;
  ok: boolean;
}

/** Payload para escrever no terminal */
export interface TerminalWritePayload {
  id: string;
  data: string;
}

/** Payload para redimensionar terminal */
export interface TerminalResizePayload {
  id: string;
  cols: number;
  rows: number;
}

/** Payload para matar terminal */
export interface TerminalKillPayload {
  id: string;
}

/** Resultado do shell ativo */
export interface TerminalShellResult extends IpcResult {
  shell?: string;
  shells?: Array<{ id: string; nome: string; caminho: string }>;
}

// ============================================================================
// NAVEGADOR
// ============================================================================

/** Payload para abrir navegador */
export interface NavegadorAbrirPayload {
  url?: string;
}

/** Resultado da acao do navegador */
export interface NavegadorAbrirResult extends IpcResult {
  ok: boolean;
}

/** Payload para fechar navegador */
export type NavegadorFecharPayload = undefined;

/** Resultado do status do navegador embutido */
export interface NavegadorEmbedStatusResult extends IpcResult {
  visivel?: boolean;
  url?: string;
  janelaCriada?: boolean;
}

/** Payload para definir bounds do navegador */
export interface NavegadorBoundsPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Payload para mostrar/ocultar navegador */
export interface NavegadorMostrarPayload {
  mostrar: boolean;
}

// ============================================================================
// AGENT
// ============================================================================

/** Opcoes para executar agente */
export interface AgenteExecutarOptions {
  modeloForcado?: string;
  modo?: 'agent' | 'plan';
  agente?: string;
  contextoExtra?: string;
}

/** Payload para executar agente */
export interface AgenteExecutarPayload {
  root: string;
  pergunta: string;
  modeloOuOpcoes?: string | AgenteExecutarOptions;
}

/** Resultado da execucao do agente */
export interface AgenteExecutarResult extends IpcResult {
  texto?: string;
  modelo?: string;
  passos?: string[];
  duracaoMs?: number;
  modo?: string;
}

/** Resultado do modelo do agente */
export interface AgenteModeloResult extends IpcResult {
  modelo?: string;
}

/** Payload para historico do agente */
export interface AgenteHistoricoPayload {
  root: string;
}

/** Resultado do historico do agente */
export interface AgenteHistoricoResult extends IpcResult {
  mensagens?: Array<{
    role: string;
    content: string;
    at: number;
    provider?: string;
  }>;
}

// ============================================================================
// BRAIN / IA
// ============================================================================

/** Payload para perguntar ao brain */
export interface BrainAskPayload {
  prompt: string;
  context: string;
}

/** Resultado da pergunta ao brain */
export interface BrainAskResult extends IpcResult {
  text?: string;
  provider?: string;
  modelo?: string;
}

/** Resultado dos providers do brain */
export interface BrainProvidersResult extends IpcResult {
  providers?: Array<{ id: string; status: string; modelo?: string }>;
}

/** Resultado do status do Ollama */
export interface BrainOllamaStatusResult extends IpcResult {
  ativo?: boolean;
  url?: string;
  modelos?: string[];
}

/** Resultado da lista de modelos */
export interface BrainModelsResult extends IpcResult {
  modelos?: string[];
}

// ============================================================================
// GIT
// ============================================================================

/** Payload para status do git */
export interface GitStatusPayload {
  raiz: string;
}

/** Resultado do status do git */
export interface GitStatusResult extends IpcResult {
  branch?: string;
  status?: {
    modified?: string[];
    added?: string[];
    deleted?: string[];
    untracked?: string[];
  };
}

/** Payload para diff do git */
export interface GitDiffPayload {
  raiz: string;
  caminho: string;
}

/** Resultado do diff do git */
export interface GitDiffResult extends IpcResult {
  diff?: string;
}

/** Payload para listar repos */
export interface GitReposPayload {
  pastas: string[];
}

/** Resultado da listagem de repos */
export interface GitReposResult extends IpcResult {
  repos?: Array<{
    pasta: string;
    branch: string;
    status: string;
  }>;
}

// ============================================================================
// CHAT
// ============================================================================

/** Uso estimado de tokens/custo de um turno (persistido na mensagem). */
export interface ChatUsage {
  entrada: number;
  saida: number;
  total: number;
  custoUSD: number | null;
  estimado: true;
}

/** Mensagem de chat */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: number;
  provider?: string;
  em?: string;
  usage?: ChatUsage;
}

/** Payload para enviar mensagem de chat */
export interface ChatSendPayload {
  root: string;
  content: string;
  opts?: {
    agente?: string;
    modo?: string;
    arquivo?: string;
    anexos?: Array<{ nome: string; data: string; tipo: string }>;
    autoAprovar?: boolean;
  };
}

/** Resultado do envio de mensagem de chat */
export interface ChatSendResult extends IpcResult {
  ok: boolean;
  message?: ChatMessage;
  rota?: string;
  hibrido?: unknown;
  propostas?: unknown[];
  autoAprovacao?: { aplicada: boolean; motivo: string };
  diagnostico?: Record<string, unknown>;
  usage?: ChatUsage;
  tentativas?: string[];
}

/** Payload para carregar chat */
export interface ChatLoadPayload {
  root: string;
}

/** Resultado do carregamento de chat */
export interface ChatLoadResult extends IpcResult {
  mensagens?: ChatMessage[];
}

/** Payload para limpar chat */
export interface ChatClearPayload {
  root: string;
}

// ============================================================================
// ANALIS
// ============================================================================

/** Escopo de analise */
export type EscopoAnalise = 'rapida' | 'completa';

/** Payload para executar analise */
export interface AnaliseRunPayload {
  root: string;
  force?: boolean;
  escopo?: EscopoAnalise;
}

/** Resultado da analise */
export interface AnaliseResult extends IpcResult {
  root?: string;
  oQueE?: string;
  stack?: string;
  resumo?: string;
  problemas?: string[];
  sugestoes?: string[];
}

/** Payload para analise cached */
export interface AnaliseCachedPayload {
  root: string;
}

// ============================================================================
// ANALISE / WHEREIS
// ============================================================================

/** Payload para whereis */
export interface WhereisPayload {
  root: string;
  query: string;
}

/** Resultado do whereis */
export interface WhereisResult extends IpcResult {
  result?: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  formatted?: string;
}

// ============================================================================
// REGRAS (DG RULES)
// ============================================================================

/** Payload para verificar se regras existam */
export interface RegrasExistsPayload {
  root: string;
}

/** Resultado da verificacao de regras */
export interface RegrasExistsResult extends IpcResult {
  existe?: boolean;
}

/** Resultado da leitura de regras */
export interface RegrasReadResult extends IpcResult {
  texto?: string;
}

/** Payload para criar template de regras */
export interface RegrasCreateTemplatePayload {
  root: string;
}

/** Payload para escrever regras */
export interface RegrasWritePayload {
  root: string;
  texto: string;
}

// ============================================================================
// CONTA / TEMA / CONFIG
// ============================================================================

/** Resultado do estado de contas */
export interface AccountsStateResult extends IpcResult {
  estado?: Record<string, unknown>;
}

/** Resultado do tema */
export interface TemaResult extends IpcResult {
  tema?: 'escuro' | 'claro';
}

/** Payload para definir tema */
export interface TemaSetPayload {
  tema: 'escuro' | 'claro';
}

/** Resultado da configuracao de backup */
export interface ConfigBackupResult extends IpcResult {
  caminho?: string;
  motivo?: string;
}

// ============================================================================
// JANELA / APP
// ============================================================================

/** Resultado do estado da janela */
export interface JanelaEstadoResult extends IpcResult {
  maximizado?: boolean;
}

/** Resultado do zoom */
export interface JanelaZoomResult extends IpcResult {
  fator: number;
}

/** Resultado da tela cheia */
export interface JanelaTelaCheiaResult extends IpcResult {
  cheia: boolean;
}

/** Resultado da versao do app */
export interface AppVersionResult extends IpcResult {
  version?: string;
}

// ============================================================================
// BUSCA
// ============================================================================

/** Payload para busca de arquivos */
export interface BuscaArquivosPayload {
  root: string;
  query: string;
  limite?: number;
}

/** Resultado da busca de arquivos */
export interface BuscaArquivosResult extends IpcResult {
  arquivos?: Array<{
    caminho: string;
    nome: string;
    tipo: string;
    match?: string;
  }>;
}

/** Payload para busca de conteudo */
export interface BuscaConteudoPayload {
  root: string;
  query: string;
  opcoes?: {
    regex?: boolean;
    limite?: number;
    id?: string;
  };
}

/** Resultado da busca de conteudo */
export interface BuscaConteudoResult extends IpcResult {
  resultados?: Array<{
    arquivo: string;
    linha: number;
    conteudo: string;
    contexto?: string;
  }>;
}

/** Payload para cancelar busca */
export interface BuscaCancelarPayload {
  id: string;
}

// ============================================================================
// MCP
// ============================================================================

/** Resultado da listagem de tools MCP */
export interface McpToolsResult extends IpcResult {
  tools?: Array<{ name: string; description: string }>;
}

/** Resultado do status MCP */
export interface McpStatusResult extends IpcResult {
  ativo?: boolean;
}

// ============================================================================
// MEMORIA
// ============================================================================

/** Payload para listar memorias */
export interface MemoriaListarPayload {
  root: string;
}

/** Resultado da listagem de memorias */
export interface MemoriaListarResult extends IpcResult {
  itens?: Array<{
    id: string;
    texto: string;
    aceita?: boolean;
    criadoEm?: string;
  }>;
}

/** Payload para propor memoria */
export interface MemoriaProporPayload {
  root: string;
  texto: string;
}

/** Payload para decidir memoria */
export interface MemoriaDecidirPayload {
  root: string;
  id: string;
  aceitar: boolean;
}

/** Resultado do status da memoria */
export interface MemoriaStatusResult extends IpcResult {
  turnos?: number;
  modelo?: string;
}

// ============================================================================
// FOLDER / SELECAO
// ============================================================================

/** Resultado da selecao de pasta */
export interface FolderSelectResult extends IpcResult {
  canceled?: boolean;
  path?: string;
}

/** Payload para scan de pasta */
export interface FolderScanPayload {
  root: string;
}

// ============================================================================
// DOSSIE
// ============================================================================

/** Resultado da leitura do dossie */
export interface DossieLerResult extends IpcResult {
  dossie?: Record<string, unknown>;
}

/** Payload para gravar dossie */
export interface DossieGravarPayload {
  root: string;
}

/** Resultado do gravar dossie */
export interface DossieGravarResult extends IpcResult {
  caminho?: string;
}

/** Resultado do snapshot do dossie */
export interface DossieSnapshotResult extends IpcResult {
  snapshot?: Record<string, unknown>;
}

/** Resultado do caminho do dossie */
export interface DossieCaminhoResult extends IpcResult {
  caminho?: string;
}

// ============================================================================
// HIBRIDO
// ============================================================================

/** Payload para analisar hibrido */
export interface HibridoAnalisarPayload {
  root: string;
  pedido?: string;
  pastaAberta?: string;
}

/** Resultado da analise hibrida */
export interface HibridoAnalisarResult extends IpcResult {
  briefing?: Record<string, unknown>;
}

/** Payload para executar hibrido */
export interface HibridoExecutarPayload {
  root: string;
  pedido: string;
  opcoes?: {
    force?: boolean;
    modeloForcado?: string;
    pastaAberta?: string;
  };
}

/** Resultado da execucao hibrida */
export interface HibridoExecutarResult extends IpcResult {
  ok: boolean;
  texto: string;
  modelo: string;
  passos: string[];
  briefing?: Record<string, unknown>;
}

// ============================================================================
// MODELOS
// ============================================================================

/** Resultado da listagem de modelos */
export interface ModelosListarResult extends IpcResult {
  catalogo?: Record<string, unknown>;
  problemas?: string[];
}

/** Resultado do recarregar modelos */
export interface ModelosRecarregarResult extends IpcResult {
  catalogo?: Record<string, unknown>;
  problemas?: string[];
}

/** Payload para modelos para tarefa */
export interface ModelosParaTarefaPayload {
  tarefa: string;
}

/** Resultado dos modelos para tarefa */
export interface ModelosParaTarefaResult extends IpcResult {
  modelo?: string;
}

// ============================================================================
// SISTEMA
// ============================================================================

/** Resultado do perfil do sistema */
export interface SystemProfileResult extends IpcResult {
  perfil?: Record<string, unknown>;
}

/** Resultado da forca do perfil */
export interface SystemProfileStrengthResult extends IpcResult {
  forca?: string;
}

// ============================================================================
// VAULT
// ============================================================================

/** Payload para abrir vault */
export interface VaultAbrirPayload {
  caminho: string;
}

/** Resultado da abertura do vault */
export interface VaultAbrirResult extends IpcResult {
  ok: boolean;
  caminho?: string;
}

// ============================================================================
// INDICE / ADAPTA
// ============================================================================

/** Payload para status adapta */
export interface AdaptaStatusPayload {
  raiz?: string;
}

/** Resultado do status adapta */
export interface AdaptaStatusResult extends IpcResult {
  status?: Record<string, unknown>;
}

/** Resultado da geracao de continuidade */
export interface AdaptaGerarResult extends IpcResult {
  ok: boolean;
}

/** Payload para ler continuidade */
export interface AdaptaLerContinuidadePayload {
  regenerar?: boolean;
}

/** Resultado da leitura de continuidade */
export interface AdaptaLerContinuidadeResult extends IpcResult {
  continuidade?: string;
}

/** Payload para abrir adapta */
export interface AdaptaAbrirPayload {
  alvo: 'one' | 'hub' | 'maestro' | 'docs' | string;
}

// ============================================================================
// DIAGNOSTICO
// ============================================================================

/** Payload para rodar diagnostico */
export interface DiagnosticoRodarPayload {
  root?: string | null;
}

/** Resultado do diagnostico */
export interface DiagnosticoRodarResult extends IpcResult {
  diagnostico?: Record<string, unknown>;
}

// ============================================================================
// AUDITORIA
// ============================================================================

/** Payload para rodar auditoria */
export interface AuditoriaRodarPayload {
  opcoes?: {
    autoAtualizar?: boolean;
    reiniciarAoFim?: boolean;
  };
}

/** Resultado da auditoria */
export interface AuditoriaRodarResult extends IpcResult {
  resumo?: {
    ok: number;
    warn: number;
    erro: number;
    corrigidos: number;
    pendencias?: Array<{ id: string; descricao: string }>;
  };
}

/** Payload para auditoria periodica */
export interface AuditoriaPeriodicaPayload {
  ativar: boolean;
}

// ============================================================================
// INDICE
// ============================================================================

/** Payload para iniciar indice */
export interface IndiceIniciarPayload {
  root: string;
}

/** Resultado do indice */
export interface IndiceStatusResult extends IpcResult {
  total?: number;
  indexando?: boolean;
  erro?: string;
}

/** Payload para listar indice */
export interface IndiceListarPayload {
  filtro?: string;
}

/** Resultado da listagem do indice */
export interface IndiceListarResult extends IpcResult {
  itens?: Array<{
    caminho: string;
    simbolo: string;
    tipo: string;
    linha?: number;
  }>;
}

// ============================================================================
// QA
// ============================================================================

/** Payload para rodar QA */
export interface QaRunPayload {
  opcoes?: {
    suite?: string;
  };
}

/** Resultado do QA */
export interface QaRunResult extends IpcResult {
  relatorio?: Record<string, unknown>;
}

// ============================================================================
// SAFE MODE
// ============================================================================

/** Resultado do safe mode */
export interface SafeModeResult extends IpcResult {
  safeMode: boolean;
}

// ============================================================================
// AUTORIA / ORIENTADOR DE PROMPT
// ============================================================================

/** Payload para orientar prompt */
export interface OrientarPromptPayload {
  root: string;
  prompt: string;
}

/** Resultado do orientador de prompt */
export interface OrientarPromptResult extends IpcResult {
  resultado?: string;
  modelo?: string;
  elapsedMs?: number;
  tentativas?: Array<{
    tarefa: string;
    modelo: string;
    elapsedMs: number;
    erro?: string;
  }>;
}

// ============================================================================
// SKILLS
// ============================================================================

/** Payload para listar skills */
export interface SkillsListarPayload {
  raiz: string;
}

/** Resultado da listagem de skills */
export interface SkillsListarResult extends IpcResult {
  skills?: Array<{
    id: string;
    titulo: string;
    gatilho: string;
  }>;
}

// ============================================================================
// OPENCLAW
// ============================================================================

/** Resultado do status do token OpenClaw */
export interface OpenClawTokenStatusResult extends IpcResult {
  status?: string;
}

/** Payload para config OpenClaw */
export interface OpenClawConfigPayload {
  endpoint?: string;
  model?: string;
  token?: string;
}

// ============================================================================
// MENSAGENS / EVENTOS IPC
// ============================================================================

/** Evento de dados do terminal */
export interface TerminalDataEvent {
  id: string;
  data: string;
}

/** Evento de saida do terminal */
export interface TerminalExitEvent {
  id: string;
  code: number;
}

/** Evento de progresso do agente */
export interface AgenteProgressoEvent {
  progresso: number;
  mensagem: string;
  passos?: string[];
}

/** Evento de menu acao */
export interface MenuAcaoEvent {
  id: string;
}

/** Evento de delta do chat */
export interface ChatDeltaEvent {
  delta?: string;
  reset?: boolean;
}

/** Evento de navegador aberto */
export type NavegadorAbertoEvent = undefined;

/** Evento de navegador fechado */
export type NavegadorFechadoEvent = undefined;
