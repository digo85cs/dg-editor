"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gerarEmbedding = gerarEmbedding;
exports.cosseno = cosseno;
exports.carregarIndice = carregarIndice;
exports.salvarIndice = salvarIndice;
exports.indexarTurno = indexarTurno;
exports.buscarSemelhantes = buscarSemelhantes;
const http_1 = require("http");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dglog_1 = require("../dglog");
const ollama_1 = require("../brain/ollama");
/**
 * Memoria semantica local do DG Editor.
 * Embeddings via nomic-embed-text no Ollama local - zero dependencia externa.
 * Indice em disco: JSON com vetores por turno de conversa.
 */
const MODELO_EMB = 'nomic-embed-text';
function caminhoIndice(raiz) {
    return path_1.default.join(raiz, '.dg-editor', 'memoria', 'indice.json');
}
function httpJson(url, corpo, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const dados = Buffer.from(JSON.stringify(corpo), 'utf8');
        const req = (0, http_1.request)(url, {
            method: 'POST',
            timeout,
            headers: { 'Content-Type': 'application/json', 'Content-Length': dados.length }
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const txt = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error('HTTP ' + res.statusCode + ': ' + txt.slice(0, 200)));
                    return;
                }
                try {
                    resolve(JSON.parse(txt));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('timeout embeddings')); });
        req.write(dados);
        req.end();
    });
}
async function gerarEmbedding(texto) {
    try {
        const r = (await httpJson(ollama_1.OLLAMA_URL + '/api/embeddings', { model: MODELO_EMB, prompt: texto }));
        if (!r || !Array.isArray(r.embedding) || r.embedding.length === 0)
            return null;
        return r.embedding;
    }
    catch (e) {
        (0, dglog_1.dglog)('[memoria] embedding falhou: ' + String(e));
        return null;
    }
}
function cosseno(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function carregarIndice(raiz) {
    const p = caminhoIndice(raiz);
    try {
        if (!fs_1.default.existsSync(p))
            return { versao: 1, modelo: MODELO_EMB, entradas: [] };
        const bruto = JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
        if (!bruto.entradas)
            bruto.entradas = [];
        return bruto;
    }
    catch (e) {
        (0, dglog_1.dglog)('[memoria] indice corrompido, recriando: ' + String(e));
        return { versao: 1, modelo: MODELO_EMB, entradas: [] };
    }
}
function salvarIndice(raiz, idx) {
    const p = caminhoIndice(raiz);
    fs_1.default.mkdirSync(path_1.default.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    fs_1.default.writeFileSync(tmp, JSON.stringify(idx), 'utf8');
    fs_1.default.renameSync(tmp, p);
}
async function indexarTurno(raiz, role, texto) {
    if (!texto || texto.trim().length < 20)
        return;
    const vetor = await gerarEmbedding(texto.slice(0, 4000));
    if (!vetor)
        return;
    const idx = carregarIndice(raiz);
    idx.entradas.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        at: Date.now(),
        role,
        texto: texto.slice(0, 4000),
        vetor
    });
    // limite de memoria: mantem os 2000 turnos mais recentes com vetor
    const MAX = 2000;
    if (idx.entradas.length > MAX) {
        idx.entradas = idx.entradas.slice(idx.entradas.length - MAX);
    }
    salvarIndice(raiz, idx);
}
async function buscarSemelhantes(raiz, consulta, k = 4, limiar = 0.45) {
    const alvo = await gerarEmbedding(consulta);
    if (!alvo)
        return [];
    const idx = carregarIndice(raiz);
    if (idx.entradas.length === 0)
        return [];
    const pontuadas = idx.entradas
        .map((e) => ({ entrada: e, score: cosseno(alvo, e.vetor) }))
        .filter((x) => x.score >= limiar)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    return pontuadas.map((x) => x.entrada);
}
