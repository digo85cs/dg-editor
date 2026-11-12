/**
 * Configuracoes Centralizadas do DG Editor
 * 
 * Este modulo centraliza todas as configuracoes do aplicativo,
 * incluindo configuracoes de:
 * - Ollama (IA local)
 * - Caminhos do sistema
 * - Limites de recursos
 * - Configuracoes de build
 * - Configuracoes de desenvolvimento
 */

import { resolve, join, isAbsolute } from 'path';
import { homedir } from 'os';

// ============================================================================
// CONFIGURACOES DE AMBIENTE
// ============================================================================

/**
 * Verifica se esta em modo de desenvolvimento
 */
export const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Verifica se esta em modo de teste
 */
export const IS_TEST = process.env.NODE_ENV === 'test';

/**
 * Verifica se esta em modo de producao
 */
export const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Verifica se e um smoke test
 */
export const IS_SMOKE = process.env.DG_NAV_SMOKE === '1';

/**
 * Verifica se e um teste E2E
 */
export const IS_E2E = process.env.DG_QA_E2E === '1';

/**
 * Verifica se permite multiplas instancias
 */
export const ALLOW_MULTI_INSTANCE = process.env.DG_ALLOW_MULTI === '1';

/**
 * Verifica se esta em smoke com embed
 */
export const IS_SMOKE_EMBED = IS_SMOKE && process.env.DG_NAV_SMOKE_EMBED === '1';

// ============================================================================
// CONFIGURACOES DE CAMINHOS
// ============================================================================

/**
 * Caminho raiz do DG Editor (pasta oficial)
 * Padrao: D:\CURSOR\DG Editor
 * Alternativa: Definir via DG_ROOT
 */
export function getRaizDGEditor(): string {
  const dgRoot = process.env.DG_ROOT;
  if (dgRoot && isAbsolute(dgRoot)) {
    return dgRoot;
  }
  
  // Padrao Windows
  if (process.platform === 'win32') {
    return 'D:\\CURSOR\\DG Editor';
  }
  
  // Padrao Linux/macOS
  return join(homedir(), 'DG Editor');
}

/**
 * Caminho do diretorio .dg-editor
 */
export function getDgEditorDir(): string {
  return join(getRaizDGEditor(), '.dg-editor');
}

/**
 * Caminho do diretorio de logs
 */
export function getLogsDir(): string {
  return join(getDgEditorDir(), 'logs');
}

/**
 * Caminho do diretorio de backups
 */
export function getBackupsDir(): string {
  return join(getDgEditorDir(), 'backup');
}

/**
 * Caminho do diretorio de memoria
 */
export function getMemoriaDir(): string {
  return join(getDgEditorDir(), 'memoria');
}

/**
 * Caminho do diretorio de chats
 */
export function getChatsDir(): string {
  return join(getDgEditorDir(), 'chats');
}

/**
 * Caminho do diretorio de indice
 */
export function getIndiceDir(): string {
  return join(getDgEditorDir(), 'indice');
}

/**
 * Caminho do diretorio de modelos
 */
export function getModelosDir(): string {
  return join(getDgEditorDir(), 'modelos');
}

/**
 * Caminho do arquivo de configuracao do Ollama
 */
export function getOllamaConfigPath(): string {
  return join(getRaizDGEditor(), 'dg-config.json');
}

// ============================================================================
// CONFIGURACOES DO OLLAMA
// ============================================================================

/**
 * Configuracoes padrao do Ollama
 */
export interface OllamaConfig {
  url: string;
  fastModel: string;
  chatModel: string;
  keepAlive: string;
}

/**
 * Configuracoes do Ollama a partir do dg-config.json
 */
export function getOllamaConfig(): OllamaConfig {
  try {
    // Tentar ler do dg-config.json
    const fs = require('fs');
    const configPath = getOllamaConfigPath();
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.ollama) {
        return {
          url: config.ollama.url || 'http://127.0.0.1:11434',
          fastModel: config.ollama.fastModel || 'qwen2.5-coder:1.5b',
          chatModel: config.ollama.chatModel || 'qwen2.5-coder:3b',
          keepAlive: config.ollama.keepAlive || '30s',
        };
      }
    }
  } catch {
    // Retornar configuracao padrao
  }
  
  // Configuracao padrao
  return {
    url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    fastModel: 'qwen2.5-coder:1.5b',
    chatModel: 'qwen2.5-coder:3b',
    keepAlive: '30s',
  };
}

/**
 * URL do Ollama
 */
export function getOllamaUrl(): string {
  return getOllamaConfig().url;
}

/**
 * Modelo rapido do Ollama (para tarefas rapidas)
 */
export function getOllamaFastModel(): string {
  return getOllamaConfig().fastModel;
}

/**
 * Modelo de chat do Ollama
 */
export function getOllamaChatModel(): string {
  return getOllamaConfig().chatModel;
}

/**
 * Tempo de keep-alive do Ollama
 */
export function getOllamaKeepAlive(): string {
  return getOllamaConfig().keepAlive;
}

// ============================================================================
// CONFIGURACOES DE RECURSOS
// ============================================================================

/**
 * Limites de recursos
 */
export interface ResourceLimits {
  memory: {
    max: number; // MB
    warn: number; // MB
    critical: number; // MB
  };
  cpu: {
    max: number; // %
    warn: number; // %
    critical: number; // %
  };
  timeout: {
    analysis: number; // ms
    chat: number; // ms
    agent: number; // ms
  };
}

/**
 * Limites padrao de recursos
 */
export const DEFAULT_LIMITS: ResourceLimits = {
  memory: {
    max: 4096, // 4GB
    warn: 3072, // 3GB
    critical: 2048, // 2GB
  },
  cpu: {
    max: 90, // 90%
    warn: 75, // 75%
    critical: 85, // 85%
  },
  timeout: {
    analysis: 300000, // 5 minutos
    chat: 120000, // 2 minutos
    agent: 600000, // 10 minutos
  },
};

/**
 * Obtem os limites de recursos
 */
export function getResourceLimits(): ResourceLimits {
  return DEFAULT_LIMITS;
}

// ============================================================================
// CONFIGURACOES DE AUDITORIA
// ============================================================================

/**
 * Opcoes padrao de auditoria
 */
export interface AuditoriaOptions {
  bootLeve: boolean;
  autoAtualizar: boolean;
  reiniciarAoFim: boolean;
  intervaloPeriodico: number; // ms
}

/**
 * Opcoes padrao de auditoria
 */
export const OPCOES_AUDITORIA_PADRAO: AuditoriaOptions = {
  bootLeve: false,
  autoAtualizar: false,
  reiniciarAoFim: false,
  intervaloPeriodico: 1800000, // 30 minutos
};

// ============================================================================
// CONFIGURACOES DE SEGURANCA
// ============================================================================

/**
 * Lista de caminhos permitidos para acessar arquivos
 */
export const ALLOWED_PATHS = [
  'D:\\CURSOR\\DG Editor',
  'C:\\Users',
  homedir(),
];

/**
 * Extensoes de arquivo permitidas para anexos
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv',
  'txt', 'md', 'json', 'yaml', 'yml', 'xml',
  'mp3', 'm4a', 'wav', 'ogg', 'flac', 'mp4', 'aac',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
];

/**
 * Tipos MIME permitidos para anexos
 */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/x-yaml',
  'text/yaml',
  'audio/*',
  'video/*',
];

// ============================================================================
// CONFIGURACOES DE TEMA
// ============================================================================

/**
 * Temas disponiveis
 */
export type Tema = 'escuro' | 'claro' | 'sistema';

/**
 * Tema padrao
 */
export const DEFAULT_TEMA: Tema = 'escuro';

/**
 * Obtem o tema atual (persistido em userData/tema.json via modulo tema).
 */
export function getTema(): Tema {
  try {
    // require lazy: evita carregar electron.app antes do ready em imports cedo
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const t = require('./tema') as { lerTema: () => Tema }
    return t.lerTema()
  } catch {
    return DEFAULT_TEMA
  }
}

/**
 * Define o tema (grava em userData/tema.json).
 */
export function setTema(tema: Tema): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const t = require('./tema') as { salvarTema: (x: Tema) => void }
    t.salvarTema(tema === 'claro' ? 'claro' : 'escuro')
  } catch (e) {
    console.warn('[config] setTema:', e)
  }
}

// ============================================================================
// CONFIGURACOES DE BUILD
// ============================================================================

/**
 * Configuracoes de build do Electron
 */
export interface BuildConfig {
  appId: string;
  productName: string;
  copyright: string;
  outputDir: string;
  buildResourcesDir: string;
}

/**
 * Configuracoes de build padrao
 */
export const BUILD_CONFIG: BuildConfig = {
  appId: 'com.dgeditor.app',
  productName: 'DG Editor',
  copyright: 'Copyright (c) Rodrigo Soares',
  outputDir: 'dist-app',
  buildResourcesDir: 'resources',
};

/**
 * Obtem a configuracao de build
 */
export function getBuildConfig(): BuildConfig {
  return BUILD_CONFIG;
}

// ============================================================================
// CONFIGURACOES DE NAVEGADOR
// ============================================================================

/**
 * Configuracoes do navegador embutido
 */
export interface NavegadorConfig {
  width: number;
  height: number;
  backgroundColor: string;
  userAgent: string;
  allowScripts: boolean;
  allowForms: boolean;
}

/**
 * Configuracoes padrao do navegador
 */
export const NAVEGADOR_CONFIG: NavegadorConfig = {
  width: 1280,
  height: 800,
  backgroundColor: '#1a1a1a',
  userAgent: 'DG Editor Browser',
  allowScripts: true,
  allowForms: true,
};

/**
 * Obtem a configuracao do navegador
 */
export function getNavegadorConfig(): NavegadorConfig {
  return NAVEGADOR_CONFIG;
}

// ============================================================================
// CONFIGURACOES DE TERMINAL
// ============================================================================

/**
 * Configuracoes do terminal
 */
export interface TerminalConfig {
  defaultShell: string;
  defaultCols: number;
  defaultRows: number;
  fontFamily: string;
  fontSize: number;
}

/**
 * Configuracoes padrao do terminal
 */
export const TERMINAL_CONFIG: TerminalConfig = {
  defaultShell: 'pwsh', // PowerShell 7
  defaultCols: 80,
  defaultRows: 24,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  fontSize: 13,
};

/**
 * Obtem a configuracao do terminal
 */
export function getTerminalConfig(): TerminalConfig {
  return TERMINAL_CONFIG;
}

// ============================================================================
// FUNCOES DE CONVENIENCIA
// ============================================================================

/**
 * Resolve um caminho relativo a partir da raiz do DG Editor
 */
export function resolveFromRaiz(...caminhos: string[]): string {
  return resolve(getRaizDGEditor(), ...caminhos);
}

/**
 * Resolve um caminho relativo a partir do diretorio .dg-editor
 */
export function resolveFromDgEditor(...caminhos: string[]): string {
  return resolve(getDgEditorDir(), ...caminhos);
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  // Ambiente
  IS_DEV,
  IS_TEST,
  IS_PROD,
  IS_SMOKE,
  IS_E2E,
  ALLOW_MULTI_INSTANCE,
  IS_SMOKE_EMBED,
  
  // Caminhos
  getRaizDGEditor,
  getDgEditorDir,
  getLogsDir,
  getBackupsDir,
  getMemoriaDir,
  getChatsDir,
  getIndiceDir,
  getModelosDir,
  getOllamaConfigPath,
  
  // Ollama
  getOllamaConfig,
  getOllamaUrl,
  getOllamaFastModel,
  getOllamaChatModel,
  getOllamaKeepAlive,
  
  // Recursos
  getResourceLimits,
  DEFAULT_LIMITS,
  
  // Auditoria
  OPCOES_AUDITORIA_PADRAO,
  
  // Seguranca
  ALLOWED_PATHS,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_TYPES,
  
  // Tema
  getTema,
  setTema,
  DEFAULT_TEMA,
  
  // Build
  getBuildConfig,
  BUILD_CONFIG,
  
  // Navegador
  getNavegadorConfig,
  NAVEGADOR_CONFIG,
  
  // Terminal
  getTerminalConfig,
  TERMINAL_CONFIG,
  
  // Conveniencia
  resolveFromRaiz,
  resolveFromDgEditor,
};
