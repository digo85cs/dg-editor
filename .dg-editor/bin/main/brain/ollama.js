"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OLLAMA_URL = void 0;
exports.ollamaHttpJson = ollamaHttpJson;
exports.detectarGpu = detectarGpu;
exports.escolherModelo = escolherModelo;
exports.ollamaPing = ollamaPing;
exports.listModelos = listModelos;
exports.getOllamaStatus = getOllamaStatus;
exports.askOllama = askOllama;
/**
 * Unico ponto de contato com o Ollama local.
 * URL, escolha de modelo e chat simples vivem aqui.
 */
const child_process_1 = require("child_process");
const http_1 = require("http");
const fs_1 = require("fs");
const path_1 = require("path");
const dglog_1 = require("../dglog");
exports.OLLAMA_URL = 'http://127.0.0.1:11434';
function loadDgConfig() {
    const p = (0, path_1.join)(process.cwd(), 'dg-config.json');
    if (!(0, fs_1.existsSync)(p))
        return {};
    try {
        return JSON.parse((0, fs_1.readFileSync)(p, 'utf-8'));
    }
    catch {
        return {};
    }
}
/**
 * POST/GET JSON com timeout real: AbortController cancela a request HTTP.
 * (Node http.request + abort → req.destroy)
 */
function httpJson(url, corpo, method = 'POST', timeoutMs = 120000, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('abort ollama'));
            return;
        }
        const dados = corpo === null ? null : Buffer.from(JSON.stringify(corpo), 'utf8');
        let settled = false;
        const req = (0, http_1.request)(url, {
            method,
            timeout: timeoutMs,
            headers: dados
                ? { 'Content-Type': 'application/json', 'Content-Length': dados.length }
                : {}
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                if (settled)
                    return;
                settled = true;
                const txt = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error('HTTP ' + res.statusCode + ': ' + txt.slice(0, 200)));
                    return;
                }
                try {
                    resolve(txt ? JSON.parse(txt) : {});
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        const onAbort = () => {
            if (settled)
                return;
            settled = true;
            try {
                req.destroy(new Error('abort ollama (AbortController)'));
            }
            catch { /* */ }
            reject(new Error('timeout/abort ollama apos ' + timeoutMs + 'ms'));
        };
        if (signal) {
            if (signal.aborted)
                onAbort();
            else
                signal.addEventListener('abort', onAbort, { once: true });
        }
        req.on('error', (e) => {
            if (settled)
                return;
            settled = true;
            reject(e);
        });
        req.on('timeout', () => onAbort());
        if (dados)
            req.write(dados);
        req.end();
    });
}
/** Wrapper com AbortController: timeout cancela de fato a conexao. */
async function ollamaHttpJson(url, corpo, method = 'POST', timeoutMs = 120000) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        return await httpJson(url, corpo, method, timeoutMs, ac.signal);
    }
    finally {
        clearTimeout(timer);
    }
}
function httpGet(path, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const req = (0, http_1.request)(exports.OLLAMA_URL + path, { method: 'GET', timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        });
        req.on('error', () => resolve({ status: 0, body: '' }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
        req.end();
    });
}
async function detectarGpu() {
    try {
        const r = (await ollamaHttpJson(exports.OLLAMA_URL + '/api/ps', {}, 'POST', 5000).catch(() => null));
        if (r && r.models && r.models.length > 0) {
            const vram = r.models.reduce((s, m) => s + (m.size_vram || 0), 0) / 1024 / 1024 / 1024;
            return vram > 0.5;
        }
    }
    catch { /* assume CPU */ }
    return false;
}
/**
 * Unica API publica de escolha de modelo.
 * NAO rebaixa 7b/14b para 3b em CPU — o 7b e o teto pratico medido.
 */
async function escolherModelo(tarefa = 'codigo', opts = {}) {
    const { escolherModeloPorTarefa } = await Promise.resolve().then(() => __importStar(require('./registry')));
    const escolhido = await escolherModeloPorTarefa(tarefa, opts);
    (0, dglog_1.dglog)('[ollama] escolherModelo(' + tarefa + ') = ' + escolhido +
        (opts.preferirQualidade ? ' [preferirQualidade]' : ''));
    return escolhido;
}
function ollamaInstalado() {
    try {
        const out = (0, child_process_1.execSync)(process.platform === 'win32' ? 'where ollama' : 'which ollama', {
            encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000
        }).trim();
        return out.length > 0;
    }
    catch {
        return false;
    }
}
async function ollamaPing() {
    const { status } = await httpGet('/api/tags', 5000);
    return status === 200;
}
async function listModelos() {
    const { status, body } = await httpGet('/api/tags', 5000);
    if (status !== 200)
        return [];
    try {
        const json = JSON.parse(body);
        return (json.models || []).map((m) => m.name);
    }
    catch {
        return [];
    }
}
async function getOllamaStatus() {
    const installed = ollamaInstalado();
    if (!installed)
        return { installed: false, reachable: false, models: [], error: 'Ollama nao instalado' };
    const reachable = await ollamaPing();
    if (!reachable)
        return { installed: true, reachable: false, models: [], error: 'Ollama instalado, mas parado' };
    const nomes = await listModelos();
    return {
        installed: true,
        reachable: true,
        models: nomes.map((name) => ({ name, size: 0, modifiedAt: '' }))
    };
}
/** Chat simples (sem tools) — usado por analyzer/chat IPC. */
async function askOllama(prompt, context, tarefa = 'codigo', opts = {}) {
    const { limitesPorTarefa } = await Promise.resolve().then(() => __importStar(require('./registry')));
    const model = await escolherModelo(tarefa, opts);
    const lim = limitesPorTarefa(tarefa);
    (0, dglog_1.dglog)('[ollama] ask modelo=' + model + ' tarefa=' + tarefa +
        ' num_predict=' + lim.num_predict + ' timeoutMs=' + lim.timeoutMs);
    const cfg = loadDgConfig();
    const r = (await ollamaHttpJson(exports.OLLAMA_URL + '/api/chat', {
        model,
        messages: [
            {
                role: 'system',
                content: 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.'
            },
            { role: 'user', content: (context ? `Contexto:\n${context}\n\n` : '') + `Pedido: ${prompt}` }
        ],
        stream: false,
        keep_alive: cfg.ollama?.keepAlive || '30s',
        options: {
            num_ctx: 8192,
            temperature: 0.3,
            num_predict: lim.num_predict
        }
    }, 'POST', lim.timeoutMs));
    return { text: r.message?.content || '', provider: 'ollama', model };
}
