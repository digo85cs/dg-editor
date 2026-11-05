/**
 * Módulo de Caminhos do DG Editor
 * Refatorado para usar path.resolve() e evitar caminhos hardcoded
 */

import { resolve, join, isAbsolute, relative } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

// ============================================================================
// FUNÇÕES DE CAMINHOS PRINCIPAIS
// ============================================================================

/**
 * Resolve o caminho raiz do DG Editor
 * 
 * Hierarquia de resolução:
 * 1. DG_ROOT (variável de ambiente)
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

  // 2. Padrão Windows
  if (process.platform === 'win32') {
    const windowsPath = 'D:\\CURSOR\\DG Editor';
    if (existsSync(windowsPath)) {
      return resolve(windowsPath);
    }
  }

  // 3. Padrão Linux/macOS
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
 * 1. Caminho do package.json mais próximo
 * 2. Raiz do DG Editor
 * 3. Pasta atual
 */
export function resolverRaizProjeto(): string {
  try {
    // Tentar encontrar package.json mais próximo
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
 * Retorna a fonte da resolução da raiz do projeto
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
// FUNÇÕES DE CAMINHOS DO SISTEMA
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
 * Resolve um caminho relativo a partir do diretório home do usuário
 */
export function resolveFromHome(...caminhos: string[]): string {
  return resolve(homedir(), ...caminhos);
}

/**
 * Verifica se um caminho está dentro de outro caminho
 */
export function isInsidePath(caminho: string, container: string): boolean {
  const resolvedCaminho = resolve(caminho);
  const resolvedContainer = resolve(container);
  
  // Normalizar para comparar
  const relativePath = relative(resolvedContainer, resolvedCaminho);
  
  // Se a relativePath não começar com '..', então está dentro
  return !relativePath.startsWith('..') && 
         !relativePath.includes('..' + (process.platform === 'win32' ? '\\' : '/'));
}

/**
 * Verifica se um caminho é seguro (dentro da raiz do projeto)
 */
export function isSafePath(caminho: string, raiz?: string): boolean {
  const raizProjeto = raiz || resolverRaizProjeto();
  
  if (!isAbsolute(caminho)) {
    // Caminho relativo - verificar se resolve para dentro da raiz
    const resolved = resolve(raizProjeto, caminho);
    return isInsidePath(resolved, raizProjeto);
  }
  
  // Caminho absoluto - verificar se está dentro da raiz
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
// CAMINHOS ESPECÍFICOS DO DG EDITOR
// ============================================================================

/**
 * Caminho do diretório .dg-editor
 */
export function getDgEditorDir(): string {
  return resolveFromRaiz('.dg-editor');
}

/**
 * Caminho do diretório de logs
 */
export function getLogsDir(): string {
  return resolveFromRaiz('.dg-editor', 'logs');
}

/**
 * Caminho do diretório de backups
 */
export function getBackupsDir(): string {
  return resolveFromRaiz('.dg-editor', 'backup');
}

/**
 * Caminho do diretório de memórias
 */
export function getMemoriaDir(): string {
  return resolveFromRaiz('.dg-editor', 'memoria');
}

/**
 * Caminho do diretório de chats
 */
export function getChatsDir(): string {
  return resolveFromRaiz('.dg-editor', 'chats');
}

/**
 * Caminho do diretório de índices
 */
export function getIndiceDir(): string {
  return resolveFromRaiz('.dg-editor', 'indice');
}

/**
 * Caminho do diretório de modelos
 */
export function getModelosDir(): string {
  return resolveFromRaiz('.dg-editor', 'modelos');
}

/**
 * Caminho do arquivo de configuração principal
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
 * Caminho do diretório node_modules
 */
export function getNodeModulesPath(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'node_modules');
}

/**
 * Caminho do diretório out (build)
 */
export function getOutDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'out');
}

/**
 * Caminho do diretório src
 */
export function getSrcDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'src');
}

/**
 * Caminho do diretório resources
 */
export function getResourcesDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'resources');
}

/**
 * Caminho do diretório scripts
 */
export function getScriptsDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'scripts');
}

/**
 * Caminho do diretório docs
 */
export function getDocsDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'docs');
}

/**
 * Caminho do diretório qa-artifacts
 */
export function getQaArtifactsDir(raizProjeto?: string): string {
  const raiz = raizProjeto || resolverRaizProjeto();
  return resolve(raiz, 'qa-artifacts');
}

// ============================================================================
// CAMINHOS DO ELECTRON
// ============================================================================

/**
 * Caminho do diretório de dados do usuário (appData)
 */
export function getUserDataPath(): string {
  const { app } = require('electron');
  return app.getPath('userData');
}

/**
 * Caminho do diretório de cache do usuário
 */
export function getCachePath(): string {
  const { app } = require('electron');
  return app.getPath('cache');
}

/**
 * Caminho do diretório de logs do Electron
 */
export function getElectronLogsPath(): string {
  const { app } = require('electron');
  return join(app.getPath('userData'), 'logs');
}

/**
 * Caminho do executável do Electron
 */
export function getElectronExecutable(): string {
  const { app } = require('electron');
  return app.getPath('exe');
}

// ============================================================================
// FUNÇÕES DE VALIDAÇÃO DE CAMINHOS
// ============================================================================

/**
 * Valida e resolve um caminho de forma segura
 * 
 * @param caminho - Caminho a ser validado
 * @param raiz - Raiz de referência (opcional, padrão: raiz do projeto)
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
    
    // Verificar se está dentro da raiz
    if (!isInsidePath(resolved, raizProjeto)) {
      return { ok: false, erro: 'Caminho fora da raiz permitida' };
    }
    
    return { ok: true, abs: normalizePath(resolved) };
  } catch (e) {
    return { ok: false, erro: `Erro ao validar caminho: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Valida e resolve múltiplos caminhos
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
// FUNÇÕES DE RESOLUÇÃO DE CAMINHOS RELATIVOS
// ============================================================================

/**
 * Resolve um caminho relativo a partir de outro caminho
 */
export function resolveRelative(caminhoBase: string, caminhoRelativo: string): string {
  return resolve(caminhoBase, caminhoRelativo);
}

/**
 * Obtém o caminho relativo entre dois caminhos absolutos
 */
export function getRelativePath(caminhoBase: string, caminhoAlvo: string): string {
  return relative(caminhoBase, caminhoAlvo);
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  // Funções principais
  resolverRaizDGEditor,
  resolverRaizProjeto,
  fonteRaizResolvida,
  
  // Funções de resolve
  resolveFromRaiz,
  resolveFromProject,
  resolveFromHome,
  
  // Funções de validação
  isInsidePath,
  isSafePath,
  validarCaminho,
  validarCaminhos,
  
  // Funções de caminho relativo
  resolveRelative,
  getRelativePath,
  normalizePath,
  
  // Caminhos específicos
  getDgEditorDir,
  getLogsDir,
  getBackupsDir,
  getMemoriaDir,
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
