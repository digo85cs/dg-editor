"use strict";
// paths.ts - resolucao centralizada de paths do DG Editor
// Estado do app (log, dossie, continuidade) -> userData
// Estado por projeto (cache, chat) -> pasta do projeto
Object.defineProperty(exports, "__esModule", { value: true });
exports.appDataDir = appDataDir;
exports.logDir = logDir;
exports.dossieDir = dossieDir;
exports.projectStateDir = projectStateDir;
exports.cwdDiagnostico = cwdDiagnostico;
exports.resolverRaizProjeto = resolverRaizProjeto;
exports.fonteRaizResolvida = fonteRaizResolvida;
exports.caminhoDentroDaRaiz = caminhoDentroDaRaiz;
exports.pareceCaminhoArquivo = pareceCaminhoArquivo;
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
/**
 * Tenta obter o app do Electron.
 * Dentro do Electron -> modulo real.
 * Em Node puro (servidor MCP via stdio) -> electron nao existe e cai no fallback.
 */
function getElectronApp() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        if (typeof electron === 'object' && electron && electron.app && typeof electron.app.getPath === 'function') {
            return electron.app;
        }
        return null;
    }
    catch {
        return null;
    }
}
function userDataFallback() {
    const ap = process.env.APPDATA;
    if (ap)
        return (0, path_1.join)(ap, 'dg-editor');
    return (0, path_1.join)((0, os_1.homedir)(), '.config', 'dg-editor');
}
function garantir(dir) {
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    return dir;
}
/** Diretorio raiz de estado do app. %APPDATA%/dg-editor no Windows. */
function appDataDir() {
    const app = getElectronApp();
    const dir = app ? app.getPath('userData') : userDataFallback();
    return garantir(dir);
}
/** Diretorio de logs do app (independe do cwd). */
function logDir() {
    return garantir((0, path_1.join)(appDataDir(), 'logs'));
}
/** Diretorio de dossie/continuidade do app. */
function dossieDir() {
    return garantir((0, path_1.join)(appDataDir(), 'dossie'));
}
/** Diretorio de estado DENTRO do projeto analisado (.dg-editor). */
function projectStateDir(root) {
    return garantir((0, path_1.join)(root, '.dg-editor'));
}
/** Aviso se o cwd e diferente da pasta do projeto (diagnostico). */
function cwdDiagnostico() {
    const cwd = process.cwd();
    const userData = appDataDir();
    return { cwd, userData, divergente: !cwd.startsWith(userData) };
}
let _raizCache = null;
let _raizLogada = false;
function ehRaizProjeto(dir) {
    return (0, fs_1.existsSync)((0, path_1.join)(dir, 'package.json')) && (0, fs_1.existsSync)((0, path_1.join)(dir, '.dg-editor'));
}
/**
 * Cascata deterministica de raiz do projeto.
 * 1) process.env.DG_ROOT (se existir em disco)
 * 2) arquivo .dg-root na cwd (conteudo = caminho)
 * 3) subir a partir de __dirname ate achar package.json + .dg-editor/
 * 4) process.cwd() se for raiz valida
 * 5) erro explicito
 */
function resolverRaizProjeto(forcar = false) {
    if (_raizCache && !forcar)
        return _raizCache.raiz;
    // 1. env
    const env = (process.env.DG_ROOT || '').trim();
    if (env && (0, fs_1.existsSync)(env)) {
        const abs = (0, path_1.resolve)(env);
        _raizCache = { raiz: abs, fonte: 'env:DG_ROOT' };
        logRaizUmaVez();
        return abs;
    }
    // 2. .dg-root (procura em cwd e sobe ate 4 niveis)
    let probe = process.cwd();
    for (let i = 0; i < 6; i++) {
        const marker = (0, path_1.join)(probe, '.dg-root');
        if ((0, fs_1.existsSync)(marker)) {
            try {
                const conteudo = (0, fs_1.readFileSync)(marker, 'utf8').trim().split(/\r?\n/)[0].trim();
                if (conteudo && (0, fs_1.existsSync)(conteudo)) {
                    const abs = (0, path_1.resolve)(conteudo);
                    _raizCache = { raiz: abs, fonte: 'arquivo:.dg-root' };
                    logRaizUmaVez();
                    return abs;
                }
            }
            catch { /* ignora */ }
        }
        const pai = (0, path_1.dirname)(probe);
        if (pai === probe)
            break;
        probe = pai;
    }
    // 3. subir a partir de __dirname
    let dir = (0, path_1.resolve)(__dirname);
    for (let i = 0; i < 10; i++) {
        if (ehRaizProjeto(dir)) {
            _raizCache = { raiz: dir, fonte: 'subida:package+dg-editor' };
            logRaizUmaVez();
            return dir;
        }
        // tambem tenta pai imediato se __dirname for .../out/main ou .../bin/main
        const pai = (0, path_1.dirname)(dir);
        if (pai === dir)
            break;
        dir = pai;
    }
    // 4. cwd se valido
    const cwd = (0, path_1.resolve)(process.cwd());
    if (ehRaizProjeto(cwd)) {
        _raizCache = { raiz: cwd, fonte: 'cwd' };
        logRaizUmaVez();
        return cwd;
    }
    // 5. falha
    _raizCache = { raiz: '', fonte: 'falha' };
    logRaizUmaVez();
    throw new Error('DG_ROOT nao resolvido: defina DG_ROOT, crie .dg-root, ou rode dentro do projeto com package.json+.dg-editor/');
}
function fonteRaizResolvida() {
    if (!_raizCache)
        resolverRaizProjeto();
    return _raizCache.fonte;
}
function logRaizUmaVez() {
    if (_raizLogada || !_raizCache)
        return;
    _raizLogada = true;
    const msg = '[dg-paths] raiz=' + (_raizCache.raiz || '(vazia)') + ' fonte=' + _raizCache.fonte;
    try {
        process.stderr.write(msg + '\n');
    }
    catch {
        console.error(msg);
    }
}
/**
 * Resolve caminho relativo/absoluto dentro da raiz.
 * Rejeita path traversal com erro claro.
 */
function caminhoDentroDaRaiz(raiz, alvo) {
    const abs = (0, path_1.isAbsolute)(alvo) ? (0, path_1.normalize)((0, path_1.resolve)(alvo)) : (0, path_1.normalize)((0, path_1.resolve)(raiz, alvo));
    const rel = (0, path_1.relative)(raiz, abs).replace(/\\/g, '/');
    if (rel.startsWith('..') || (0, path_1.isAbsolute)(rel)) {
        throw new Error('caminho fora da raiz do projeto: ' + alvo);
    }
    return { abs, rel };
}
/** True se o texto parece caminho de arquivo (tem / ou \\ ou extensao .ts/.js/.md). */
function pareceCaminhoArquivo(s) {
    const t = (s || '').trim();
    if (!t)
        return false;
    if (/[\\/]/.test(t))
        return true;
    if (/\.(tsx?|jsx?|mjs|cjs|json|md)$/i.test(t))
        return true;
    return false;
}
