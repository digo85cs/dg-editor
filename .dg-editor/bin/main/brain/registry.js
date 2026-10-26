"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarRegistry = listarRegistry;
exports.registrarModelo = registrarModelo;
exports.normalizarTarefa = normalizarTarefa;
exports.disponivel = disponivel;
exports.filaDeModelos = filaDeModelos;
exports.limitesPorTarefa = limitesPorTarefa;
exports.statsSelecao = statsSelecao;
exports.escolherModeloPorTarefa = escolherModeloPorTarefa;
exports.escolherModelo = escolherModelo;
exports.appendFailoverLog = appendFailoverLog;
/**
 * Fila de providers por tarefa (online → local fallback).
 * Entradas online sem chave ficam na fila com disponivel=false.
 */
const ollama_1 = require("./ollama");
const dglog_1 = require("../dglog");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const providers_1 = require("./providers");
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const KEY_ENV = 'OPENROUTER_API_KEY';
const REGISTRO_BASE = [
    { nome: 'qwen2.5-coder:1.5b', tipo: 'local', contexto: 4096, forca: 3, tokS: 35.5, tarefas: ['chat', 'codigo'] },
    { nome: 'qwen2.5-coder:3b', tipo: 'local', contexto: 8192, forca: 5, tokS: 18.8, tarefas: ['chat', 'codigo'] },
    { nome: 'qwen2.5-coder:7b', tipo: 'local', contexto: 8192, forca: 7, tokS: 7.8, tarefas: ['codigo', 'raciocinio'] },
    { nome: 'qwen2.5-coder:14b', tipo: 'local', contexto: 8192, forca: 9, tokS: 3.8, tarefas: ['codigo', 'raciocinio'] },
    { nome: 'llama3.2', tipo: 'local', contexto: 4096, forca: 5, tokS: 9.7, tarefas: ['chat', 'raciocinio'] }
];
let extras = [];
const STATS_FILE = '.dg-editor/modelos-stats.json';
function listarRegistry() {
    return [...REGISTRO_BASE, ...extras];
}
function registrarModelo(m) {
    extras = extras.filter((x) => x.nome !== m.nome);
    extras.push(m);
}
function normalizarTarefa(tarefa) {
    const t = (tarefa || 'codigo').toLowerCase();
    if (t === 'chat' || t === 'simples')
        return 'chat';
    if (t === 'raciocinio' || t === 'estrategia')
        return 'raciocinio';
    return 'codigo';
}
function disponivel(cfg) {
    return (0, providers_1.disponivel)(cfg);
}
function cfg(partial) {
    return partial;
}
/** Fila ordenada por tarefa. Online sem chave permanece (disponivel=false em runtime). */
function filaDeModelos(tarefa, _opcoes) {
    const t = normalizarTarefa(String(tarefa));
    if (t === 'chat') {
        return [
            cfg({
                id: 'openrouter:gpt-4o-mini',
                tipo: 'online',
                formato: 'openai',
                modelo: 'openai/gpt-4o-mini',
                baseUrl: OPENROUTER_BASE,
                apiKeyEnv: KEY_ENV,
                numPredict: 512,
                timeoutMs: 120_000
            }),
            cfg({
                id: 'ollama:qwen2.5-coder:1.5b',
                tipo: 'local',
                formato: 'ollama',
                modelo: 'qwen2.5-coder:1.5b',
                baseUrl: OLLAMA_BASE,
                numPredict: 512,
                timeoutMs: 120_000
            })
        ];
    }
    if (t === 'raciocinio') {
        return [
            cfg({
                id: 'openrouter:llama-3.3-70b',
                tipo: 'online',
                formato: 'openai',
                modelo: 'meta-llama/llama-3.3-70b-instruct',
                baseUrl: OPENROUTER_BASE,
                apiKeyEnv: KEY_ENV,
                numPredict: 2048,
                timeoutMs: 600_000
            }),
            cfg({
                id: 'ollama:llama3.2',
                tipo: 'local',
                formato: 'ollama',
                modelo: 'llama3.2:latest',
                baseUrl: OLLAMA_BASE,
                numPredict: 2048,
                timeoutMs: 600_000
            }),
            cfg({
                id: 'ollama:qwen2.5-coder:14b',
                tipo: 'local',
                formato: 'ollama',
                modelo: 'qwen2.5-coder:14b',
                baseUrl: OLLAMA_BASE,
                numPredict: 2048,
                timeoutMs: 600_000
            })
        ];
    }
    // codigo
    return [
        cfg({
            id: 'openrouter:deepseek-chat',
            tipo: 'online',
            formato: 'openai',
            modelo: 'deepseek/deepseek-chat',
            baseUrl: OPENROUTER_BASE,
            apiKeyEnv: KEY_ENV,
            numPredict: 1024,
            timeoutMs: 300_000
        }),
        cfg({
            id: 'openrouter:qwen-2.5-coder-32b',
            tipo: 'online',
            formato: 'openai',
            modelo: 'qwen/qwen-2.5-coder-32b-instruct',
            baseUrl: OPENROUTER_BASE,
            apiKeyEnv: KEY_ENV,
            numPredict: 1024,
            timeoutMs: 300_000
        }),
        cfg({
            id: 'ollama:qwen2.5-coder:7b',
            tipo: 'local',
            formato: 'ollama',
            modelo: 'qwen2.5-coder:7b',
            baseUrl: OLLAMA_BASE,
            numPredict: 1024,
            timeoutMs: 300_000
        }),
        cfg({
            id: 'ollama:qwen2.5-coder:3b',
            tipo: 'local',
            formato: 'ollama',
            modelo: 'qwen2.5-coder:3b',
            baseUrl: OLLAMA_BASE,
            numPredict: 512,
            timeoutMs: 180_000
        })
    ];
}
function limitesPorTarefa(tarefa) {
    const fila = filaDeModelos(tarefa);
    const local = fila.find((p) => p.tipo === 'local') || fila[0];
    return { num_predict: local.numPredict, timeoutMs: local.timeoutMs };
}
function matchModelo(disponiveis, pref) {
    const exact = disponiveis.find((d) => d === pref);
    if (exact)
        return exact;
    const prefix = disponiveis.find((d) => d.startsWith(pref));
    if (prefix)
        return prefix;
    const base = pref.split(':')[0];
    const tag = pref.includes(':') ? pref.slice(pref.indexOf(':') + 1) : '';
    return (disponiveis.find((d) => {
        if (d === base || d.startsWith(base + ':')) {
            if (!tag)
                return true;
            const rest = d.slice(base.length + 1);
            return rest === tag || rest.startsWith(tag);
        }
        return false;
    }) || null);
}
function registrarSelecao(raiz, modelo, tarefa, motivo, origem = 'pipeline') {
    try {
        const p = path_1.default.join(raiz, STATS_FILE);
        fs_1.default.mkdirSync(path_1.default.dirname(p), { recursive: true });
        let data = { selecionados: {}, selecionadosPipeline: {}, ultimo: {} };
        if (fs_1.default.existsSync(p)) {
            try {
                data = { ...data, ...JSON.parse(fs_1.default.readFileSync(p, 'utf8')) };
            }
            catch { /* */ }
        }
        if (!data.selecionadosPipeline)
            data.selecionadosPipeline = {};
        data.selecionados[modelo] = (data.selecionados[modelo] || 0) + 1;
        if (origem === 'pipeline') {
            data.selecionadosPipeline[modelo] = (data.selecionadosPipeline[modelo] || 0) + 1;
        }
        data.ultimo[tarefa] = modelo;
        data.ultimo.motivo = motivo;
        data.ultimo.origem = origem;
        data.ultimo.em = new Date().toISOString();
        fs_1.default.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
        (0, dglog_1.dglog)('[registry] selecao origem=' + origem + ' modelo=' + modelo + ' | ' + motivo);
    }
    catch { /* */ }
}
function statsSelecao(raiz) {
    const p = path_1.default.join(raiz, STATS_FILE);
    try {
        if (!fs_1.default.existsSync(p))
            return { selecionados: {}, selecionadosPipeline: {}, ultimo: {} };
        const data = JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
        return {
            selecionados: data.selecionados || {},
            selecionadosPipeline: data.selecionadosPipeline || {},
            ultimo: data.ultimo || {}
        };
    }
    catch {
        return { selecionados: {}, selecionadosPipeline: {}, ultimo: {} };
    }
}
/**
 * Compat: retorna o primeiro provider disponivel da fila (local se online sem chave).
 */
async function escolherModeloPorTarefa(tarefa, opts = {}) {
    const t = normalizarTarefa(String(tarefa));
    const fila = filaDeModelos(t, opts);
    const origem = opts.origem || 'pipeline';
    for (const p of fila) {
        if (!disponivel(p)) {
            (0, dglog_1.dglog)('[registry] pula ' + p.id + ' (chave ausente)');
            continue;
        }
        if (p.tipo === 'local') {
            const instalados = await (0, ollama_1.listModelos)();
            const hit = matchModelo(instalados, p.modelo);
            if (!hit) {
                (0, dglog_1.dglog)('[registry] pula ' + p.id + ' (modelo nao instalado)');
                continue;
            }
            registrarSelecao(process.env.DG_ROOT || process.cwd(), hit, t, 'fila→' + p.id, origem);
            return hit;
        }
        // online disponivel
        registrarSelecao(process.env.DG_ROOT || process.cwd(), p.modelo, t, 'fila→' + p.id, origem);
        return p.modelo;
    }
    // fallback duro
    const fb = t === 'chat' ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:7b';
    registrarSelecao(process.env.DG_ROOT || process.cwd(), fb, t, 'fallback duro', origem);
    return fb;
}
async function escolherModelo(tarefa = 'codigo', opts = {}) {
    return escolherModeloPorTarefa(tarefa, opts);
}
/** Historico de failover para auditoria-providers.md */
function appendFailoverLog(raiz, entrada) {
    try {
        const p = path_1.default.join(raiz, '.dg-editor', 'auditoria-providers.md');
        fs_1.default.mkdirSync(path_1.default.dirname(p), { recursive: true });
        if (!fs_1.default.existsSync(p)) {
            fs_1.default.writeFileSync(p, '# Auditoria de providers\n\nHistorico de failover (sem chaves).\n\n', 'utf8');
        }
        const linha = `- ${new Date().toISOString()} | tarefa=${entrada.tarefa} | tentou=${entrada.tentou} | ` +
            `motivo=${entrada.motivo} | resultado=${entrada.resultado}` +
            (entrada.ms != null ? ` | ${entrada.ms}ms` : '') +
            '\n';
        fs_1.default.appendFileSync(p, linha, 'utf8');
    }
    catch { /* */ }
}
