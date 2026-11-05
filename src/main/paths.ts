/**
 * Modulo de Caminhos do DG Editor
 * Refatorado para usar path.resolve() e evitar caminhos hardcoded
 */

import { resolve, join, isAbsolute, relative, normalize } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { RAIZ_WINDOWS_CANONICA } from '../shared/raiz-canonica';

export { RAIZ_WINDOWS_CANONICA } from '../shared/raiz-canonica';

// ============================================================================
// FUNCOES DE CAMINHOS PRINCIPAIS
// ============================================================================

/**
 * Resolve o caminho raiz do DG Editor
 * 
 * Hierarquia de resolucao:
 * 1. DG_ROOT (variavel de ambiente)
 * 2. D:\CURSOR\DG Editor (Windows)
 * 3. ~/DG Editor (Linux/macOS)
 * 4. Pasta atual (fallback)
 */
export function resolverRaizDGEditor(): string {
  // 1. Verificar DG_ROOT
  const dgRoot = process.env.DG_ROOT;
  if (dgRoot && isAbsolute(dgRoot)) {
    return resolve(dgRoot);
  }

  // 2. Padrao Windows
  if (process.platform === 'win32') {
    const windowsPath = 'D:\\CURSOR\\DG Editor';
    if (existsSync(windowsPath)) {
      return resolve(windowsPath);
    }
  }

  // 3. Padrao Linux/macOS
  const homePath = join(homedir(), 'DG Editor');
  if (existsSync(homePath)) {
    return resolve(homePath);
  }

  // 4. Fallback: pasta atual do processo
  return resolve(process.cwd());
}

/**
 * Resolve o caminho raiz do projeto atual
 * 
 * Tentativa:
 * 1. Caminho do package.json mais proximo
 * 2. Raiz do DG Editor
 * 3. Pasta atual
 */
export function resolverRaizProjeto(): string {
  try {
    // Tentar encontrar package.json mais proximo
    let currentDir = process.cwd();
    const maxDepth = 10;
    let depth = 0;

    while (depth < maxDepth) {
      const pkgPath = join(currentDir, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = require(pkgPath);
          if (pkg.name === 'dg-editor') {
            return resolve(currentDir);
          }
        } catch {
          // Ignorar erros de leitura
        }
      }

      const parentDir = resolve(currentDir, '..');
      if (parentDir === currentDir) {
        // Chegou na raiz
        break;
      }
      currentDir = parentDir;
      depth++;
    }

    // Fallback: raiz do DG Editor
    return resolverRaizDGEditor();
  } catch {
    // Fallback final: pasta atual
    return resolve(process.cwd());
  }
}

/**
 * Retorna a fonte da resolucao da raiz do projeto
 */
export function fonteRaizResolvida(): string {
  try {
    let currentDir = process.cwd();
    const maxDepth = 10;
    let depth = 0;

    while (depth < maxDepth) {
      const pkgPath = join(currentDir, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = require(pkgPath);
          if (pkg.name === 'dg-editor') {
            return `package.json em ${currentDir}`;
          }
        } catch {
          // Ignorar
        }
      }

      const parentDir = resolve(currentDir, '..');
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
      depth++;
    }

    return `DG_ROOT (${resolverRaizDGEditor()})`;
  } catch {
    return `process.cwd() (${process.cwd()})`;
  }
}

// ============================================================================
// FUNCOES DE CAMINHOS DO SISTEMA
// ============================================================================

/**
 * Resolve um caminho relativo a partir da raiz do DG Editor
 */
export function resolveFromRaiz(...caminhos: string[]): string {
  return resolve(resolverRaizDGEditor(), ...caminhos);
}

/**
 * Resolve um caminho relativo a partir da raiz do projeto
 */
export function resolveFromProject(...caminhos: string[]): string {
  return resolve(resolverRaizProjeto(), ...caminhos);
}

/**
 * Resolve um caminho relativo a partir do diretorio home do usuario
 */
export function resolveFromHome(...caminhos: string[]): string {
  return resolve(homedir(), ...caminhos);
}

/**
 * Verifica se um caminho esta dentro de outro caminho
 */
export function isInsidePath(caminho: string, container: string): boolean {
  const resolvedCaminho = resolve(caminho);
  const resolvedContainer = resolve(container);
  
  // Normalizar para comparar
  const relativePath = relative(resolvedContainer, resolvedCaminho);
  
  // Se a relativePath nao comecar com '..', entao esta dentro
  return !relativePath.startsWith('..') && 
         !relativePath.includes('..' + (process.platform === 'win32' ? '\\' : '/'));
}

/**
 * Verifica se um caminho e seguro (dentro da raiz do projeto)
 */
export function isSafePath(caminho: string, raiz?: string): boolean {
  const raizProjeto = raiz || resolverRaizProjeto();
  
  if (!isAbsolute(caminho)) {
    // Caminho relativo - verificar se resolve para dentro da raiz
    const resolved = resolve(raizProjeto, caminho);
    return isInsidePath(resolved, raizProjeto);
  }
  
  // Caminho absoluto - verificar se esta dentro da raiz
  return isInsidePath(caminho, raizProjeto);
}

/**
 * Normaliza um caminho para uso no sistema de arquivos
 */
export function normalizePath(caminho: string): string {
  // Converter para o formato do SO
  if (process.platform === 'win32') {
    return caminho.replace(/\//g, '\\');
  }
  return caminho.replace(/\\/g, '/');
}

// ============================================================================
// CAMINHOS ESPECIFICOS DO DG EDITOR
// ============================================================================

/**
 * Caminho do diretorio .dg-editor
 */
export function getDgEditorDir(): string {
  return resolveFromRaiz('.dg-editor');
}

/**
 * Caminho do diretorio de logs
 */
export function getLogsDir(): string {
  return resolveFromRaiz('.dg-editor', 'logs');
}

/**
 * Caminho do diretorio de backups
 */
export function getBackupsDir(): string {
  return resolveFromRaiz('.dg-editor', 'backup');
}

/**
 * Caminho do diretorio de memorias
 */
export function getMemoriaDir(): string {
  return resolveFromRaiz('.dg-editor', 'memoria');
}

/**
 * Caminho do diretorio de dossie
 */
export function getDossieDir(): string {
  return resolveFromRaiz('.dg-editor', 'dossie');
}

/**
 * Caminho do diretorio de chats
 */
export function getChatsDir(): string {
  return resolveFromRaiz('.dg-editor', 'chats');
}

/**
 * Caminho do diretorio de indices
 */
export function getIndiceDir(): string {
  return resolveFromRaiz('.dg-editor', 'indice');
}

/**
 * Caminho do diretorio de modelos
 */
export function getModelosDir(): string {
  return resolveFromRaiz('.dg-editor', 'modelos');
}

/**
 * Caminho do arquivo de configuracao principal
 */
export function getConfigPath(): string {
  return resolveFromRaiz('dg-config.json');
}

/**
 * Caminho do arquivo de .dgrules
 */
export function getDgRulesPath(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, '.dgrules');
}

/**
 * Caminho do arquivo package.json
 */
export function getPackageJsonPath(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'package.json');
}

/**
 * Caminho do diretorio node_modules
 */
export function getNodeModulesPath(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'node_modules');
}

/**
 * Caminho do diretorio out (build)
 */
export function getOutDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'out');
}

/**
 * Caminho do diretorio src
 */
export function getSrcDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'src');
}

/**
 * Caminho do diretorio resources
 */
export function getResourcesDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'resources');
}

/**
 * Caminho do diretorio scripts
 */
export function getScriptsDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'scripts');
}

/**
 * Caminho do diretorio docs
 */
export function getDocsDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'docs');
}

/**
 * Caminho do diretorio qa-artifacts
 */
export function getQaArtifactsDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'qa-artifacts');
}

// ============================================================================
// CAMINHOS DO ELECTRON
// ============================================================================

/**
 * Caminho do diretorio de dados do usuario (appData)
 */
export function getUserDataPath(): string {
  const { app } = require('electron');
  return app.getPath('userData');
}

/**
 * Caminho do diretorio de cache do usuario
 */
export function getCachePath(): string {
  const { app } = require('electron');
  return app.getPath('cache');
}

/**
 * Caminho do diretorio de logs do Electron
 */
export function getElectronLogsPath(): string {
  const { app } = require('electron');
  return join(app.getPath('userData'), 'logs');
}

/**
 * Caminho do executavel do Electron
 */
export function getElectronExecutable(): string {
  const { app } = require('electron');
  return app.getPath('exe');
}

// ============================================================================
// FUNCOES DE VALIDACAO DE CAMINHOS
// ============================================================================

/**
 * Valida e resolve um caminho de forma segura
 * 
 * @param caminho - Caminho a ser validado
 * @param raiz - Raiz de referencia (opcional, padrao: raiz do projeto)
 * @returns { ok: boolean, abs?: string, erro?: string }
 */
export function validarCaminho(caminho: string, raiz?: string): { ok: boolean, abs?: string, erro?: string } {
  try {
    const raizProjeto = raiz || resolverRaizProjeto();
    
    // Verificar path traversal
    if (caminho.includes('..') || 
        (process.platform === 'win32' && caminho.includes('\\..'))) {
      return { ok: false, erro: 'Path traversal detectado' };
    }
    
    // Resolver caminho
    const resolved = isAbsolute(caminho) 
      ? resolve(caminho)
      : resolve(raizProjeto, caminho);
    
    // Verificar se esta dentro da raiz
    if (!isInsidePath(resolved, raizProjeto)) {
      return { ok: false, erro: 'Caminho fora da raiz permitida' };
    }
    
    return { ok: true, abs: normalizePath(resolved) };
  } catch (e) {
    return { ok: false, erro: `Erro ao validar caminho: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Valida e resolve multiplos caminhos
 */
export function validarCaminhos(caminhos: string[], raiz?: string): { ok: boolean, abs: string[], erros: string[] } {
  const result: string[] = [];
  const erros: string[] = [];
  
  for (const caminho of caminhos) {
    const validado = validarCaminho(caminho, raiz);
    if (validado.ok && validado.abs) {
      result.push(validado.abs);
    } else {
      erros.push(`${caminho}: ${validado.erro}`);
    }
  }
  
  return {
    ok: erros.length === 0,
    abs: result,
    erros
  };
}

// ============================================================================
// FUNCOES DE RESOLUCAO DE CAMINHOS RELATIVOS
// ============================================================================

/**
 * Resolve um caminho relativo a partir de outro caminho
 */
export function resolveRelative(caminhoBase: string, caminhoRelativo: string): string {
  return resolve(caminhoBase, caminhoRelativo);
}

/**
 * Obtem o caminho relativo entre dois caminhos absolutos
 */
export function getRelativePath(caminhoBase: string, caminhoAlvo: string): string {
  return relative(caminhoBase, caminhoAlvo);
}

// ============================================================================
// FUNCOES DE COMPATIBILIDADE COM paths.ts (legacy)
// ============================================================================

/**
 * Diretorio raiz de estado do app - compatibilidade com paths.ts
 */
export function appDataDir(): string {
  const dir = getUserDataPath();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Diretorio de logs - compatibilidade com paths.ts
 */
export function logDir(): string {
  const dir = getLogsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Diretorio de dossie - compatibilidade com paths.ts
 */
export function dossieDir(): string {
  const dir = getDossieDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Diretorio de estado dentro do projeto
 */
export function projectStateDir(root: string): string {
  const dir = join(root, '.dg-editor');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Diagnostico de cwd
 */
export function cwdDiagnostico(): { cwd: string; userData: string; divergente: boolean } {
  const cwd = process.cwd();
  const userData = appDataDir();
  return { cwd, userData, divergente: !cwd.startsWith(userData) };
}

/**
 * Resolve caminho dentro da raiz - compatibilidade
 */
export function caminhoDentroDaRaiz(raiz: string, alvo: string): { abs: string; rel: string } {
  const abs = isAbsolute(alvo) ? normalize(resolve(alvo)) : normalize(resolve(raiz, alvo));
  const rel = relative(raiz, abs).replace(/\\/g, '/');
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('caminho fora da raiz do projeto: ' + alvo);
  }
  return { abs, rel };
}

/**
 * Verifica se o texto parece caminho de arquivo
 */
export function pareceCaminhoArquivo(s: string): boolean {
  const t = (s || '').trim();
  if (!t) return false;
  if (/[\\/]/.test(t)) return true;
  if(/\.(tsx?|jsx?|mjs|cjs|json|md)$/i.test(t)) return true;
  return false;
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  // Funcoes principais
  resolverRaizDGEditor,
  resolverRaizProjeto,
  fonteRaizResolvida,
  
  // Funcoes de resolve
  resolveFromRaiz,
  resolveFromProject,
  resolveFromHome,
  
  // Funcoes de validacao
  isInsidePath,
  isSafePath,
  validarCaminho,
  validarCaminhos,
  
  // Funcoes de caminho relativo
  resolveRelative,
  getRelativePath,
  normalizePath,
  
  // Funcoes de compatibilidade (legacy)
  appDataDir,
  logDir,
  dossieDir,
  projectStateDir,
  cwdDiagnostico,
  caminhoDentroDaRaiz,
  pareceCaminhoArquivo,
  
  // Caminhos especificos
  getDgEditorDir,
  getLogsDir,
  getBackupsDir,
  getMemoriaDir,
  getDossieDir,
  getChatsDir,
  getIndiceDir,
  getModelosDir,
  getConfigPath,
  getDgRulesPath,
  getPackageJsonPath,
  getNodeModulesPath,
  getOutDir,
  getSrcDir,
  getResourcesDir,
  getScriptsDir,
  getDocsDir,
  getQaArtifactsDir,
  
  // Caminhos do Electron
  getUserDataPath,
  getCachePath,
  getElectronLogsPath,
  getElectronExecutable,
};
