"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.conectarMcp = conectarMcp;
exports.listarTools = listarTools;
exports.chamarTool = chamarTool;
exports.desconectarMcp = desconectarMcp;
exports.mcpAtivo = mcpAtivo;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const dglog_1 = require("../dglog");
const path_1 = __importDefault(require("path"));
/**
 * Cliente MCP interno do DG Editor.
 * Fala com o NOSSO servidor local (subprocesso node) por stdio.
 * Nenhuma conexao externa: o transporte e um pipe com o proprio processo filho.
 */
let client = null;
let transport = null;
let conectando = null;
function serverJs() {
    // aponta para o binario isolado em .dg-editor/bin (fora do out/ do electron-vite)
    const raiz = process.env.DG_ROOT || process.cwd();
    return path_1.default.join(raiz, '.dg-editor', 'bin', 'main', 'mcp', 'server.js');
}
async function conectarMcp() {
    if (client)
        return client;
    if (conectando)
        return conectando;
    conectando = (async () => {
        const alvo = serverJs();
        (0, dglog_1.dglog)('[mcp-client] conectando em ' + alvo);
        transport = new stdio_js_1.StdioClientTransport({
            command: process.execPath,
            args: [alvo],
            env: {
                ...process.env,
                DG_ROOT: process.env.DG_ROOT || process.cwd(),
                ELECTRON_RUN_AS_NODE: '1'
            },
            stderr: 'pipe'
        });
        const c = new index_js_1.Client({ name: 'dg-editor', version: '0.2.0' }, { capabilities: {} });
        await c.connect(transport);
        (0, dglog_1.dglog)('[mcp-client] conectado');
        client = c;
        return c;
    })();
    try {
        return await conectando;
    }
    finally {
        conectando = null;
    }
}
async function listarTools() {
    const c = await conectarMcp();
    const r = await c.listTools();
    return (r.tools || []);
}
async function chamarTool(nome, args) {
    try {
        const c = await conectarMcp();
        const r = await c.callTool({ name: nome, arguments: args });
        const conteudo = r.content || [];
        const texto = conteudo
            .filter((p) => p.type === 'text' && typeof p.text === 'string')
            .map((p) => p.text)
            .join('\n');
        return { ok: !r.isError, texto, bruto: r };
    }
    catch (e) {
        (0, dglog_1.dglog)('[mcp-client] erro em ' + nome + ': ' + String(e));
        return { ok: false, texto: 'falha ao chamar ' + nome + ': ' + String(e) };
    }
}
async function desconectarMcp() {
    if (client) {
        try {
            await client.close();
        }
        catch { /* ignora */ }
        client = null;
    }
    transport = null;
}
function mcpAtivo() {
    return client !== null;
}
