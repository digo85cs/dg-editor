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
