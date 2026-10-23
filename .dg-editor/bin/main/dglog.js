"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dglog = dglog;
// dglog.ts — log em arquivo do DG Editor
const fs_1 = require("fs");
const path_1 = require("path");
const paths_1 = require("./paths");
const LOG_DIR = (0, paths_1.logDir)();
const LOG_FILE = (0, path_1.join)(LOG_DIR, 'dg-log.txt');
function dglog(msg) {
    const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
    try {
        (0, fs_1.mkdirSync)(LOG_DIR, { recursive: true });
        (0, fs_1.appendFileSync)(LOG_FILE, linha + '\n', 'utf-8');
    }
    catch { /* ignora */ }
}
