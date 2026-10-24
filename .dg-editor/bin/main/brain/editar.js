"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editarPorAncora = editarPorAncora;
/**
 * Edicao segura por ancora unica + typecheck opcional com rollback.
 */
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function contarOcorrencias(texto, ancora) {
    if (!ancora)
        return 0;
    let n = 0;
    let i = 0;
    while (true) {
        const p = texto.indexOf(ancora, i);
        if (p < 0)
            break;
        n++;
        i = p + ancora.length;
    }
    return n;
}
function editarPorAncora(raiz, arquivo, ancora, novo, verificar = true) {
    const abs = path_1.default.isAbsolute(arquivo) ? arquivo : path_1.default.join(raiz, arquivo);
    const rel = path_1.default.relative(raiz, abs).replace(/\\/g, '/');
    if (rel.startsWith('..') || path_1.default.isAbsolute(rel)) {
        return { ok: false, mensagem: 'arquivo fora da raiz do projeto' };
    }
    if (!fs_1.default.existsSync(abs)) {
        return { ok: false, mensagem: 'arquivo nao encontrado: ' + rel };
    }
    const original = fs_1.default.readFileSync(abs, 'utf8');
    const n = contarOcorrencias(original, ancora);
    if (n === 0)
        return { ok: false, mensagem: 'ancora nao encontrada', ocorrencias: 0 };
    if (n > 1)
        return { ok: false, mensagem: 'ancora ambigua (' + n + ' ocorrencias)', ocorrencias: n };
    const editado = original.replace(ancora, novo);
    fs_1.default.writeFileSync(abs, editado, 'utf8');
    if (!verificar) {
        return { ok: true, mensagem: 'editado ' + rel + ' (sem typecheck)', ocorrencias: 1 };
    }
    try {
        (0, child_process_1.execFileSync)('npx', ['tsc', '--noEmit'], {
            cwd: raiz,
            encoding: 'utf8',
            timeout: 120000,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return {
            ok: true,
            mensagem: 'editado ' + rel + ' + typecheck ok',
            ocorrencias: 1,
            typecheck: { ok: true, saida: '' }
        };
    }
    catch (e) {
        const err = e;
        const saida = String(err.stdout || '') + String(err.stderr || err.message || e);
        fs_1.default.writeFileSync(abs, original, 'utf8');
        return {
            ok: false,
            mensagem: 'typecheck falhou; arquivo revertido',
            ocorrencias: 1,
            typecheck: { ok: false, saida: saida.slice(0, 4000) }
        };
    }
}
