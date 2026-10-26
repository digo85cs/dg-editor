"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErroProvider = void 0;
exports.classificarHttp = classificarHttp;
exports.marcarCursorCliAprovado = marcarCursorCliAprovado;
exports.cursorCliAprovadoNaSessao = cursorCliAprovadoNaSessao;
exports.resolverBinarioCursorAgent = resolverBinarioCursorAgent;
exports.chamarCursorCli = chamarCursorCli;
exports.chamarProvider = chamarProvider;
exports.chamarProviderSharp = chamarProviderSharp;
exports.disponivel = disponivel;
/**
 * Adapters unificados: Ollama local + OpenAI-compatible (OpenRouter etc) + cursor-cli.
 * Nenhuma chave no codigo — so process.env[cfg.apiKeyEnv].
 */
const http_1 = require("http");
const https_1 = require("https");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const url_1 = require("url");
const dglog_1 = require("../dglog");
const ollama_1 = require("./ollama");
const paths_1 = require("../paths");
class ErroProvider extends Error {
    kind;
    status;
    providerId;
    constructor(kind, message, providerId, status) {
        super(message);
        this.kind = kind;
        this.providerId = providerId;
        this.status = status;
        this.name = 'ErroProvider';
    }
}
exports.ErroProvider = ErroProvider;
function httpJsonUrl(urlStr, corpo, method, timeoutMs, headers, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new ErroProvider('timeout', 'abort antes do request', 'unknown'));
            return;
        }
        const u = new url_1.URL(urlStr);
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https_1.request : http_1.request;
        const dados = corpo === null ? null : Buffer.from(JSON.stringify(corpo), 'utf8');
        let settled = false;
        const req = lib({
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            method,
            timeout: timeoutMs,
            headers: {
                ...headers,
                ...(dados
                    ? { 'Content-Type': 'application/json', 'Content-Length': String(dados.length) }
                    : {})
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                if (settled)
                    return;
                settled = true;
                resolve({
                    status: res.statusCode || 0,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });
        const onAbort = () => {
            if (settled)
                return;
            settled = true;
            try {
                req.destroy();
            }
            catch { /* */ }
            reject(new ErroProvider('timeout', 'timeout/abort apos ' + timeoutMs + 'ms', 'unknown'));
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
            const code = e.code || '';
            if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
                reject(new ErroProvider('rede', String(e.message), 'unknown'));
            }
            else if (code === 'ETIMEDOUT' || /timeout/i.test(String(e.message))) {
                reject(new ErroProvider('timeout', String(e.message), 'unknown'));
            }
            else {
                reject(new ErroProvider('rede', String(e.message), 'unknown'));
            }
        });
        req.on('timeout', () => onAbort());
        if (dados)
            req.write(dados);
        req.end();
    });
}
function classificarHttp(status, body, providerId) {
    if (status === 429)
        return new ErroProvider('rate_limit', 'HTTP 429: ' + body.slice(0, 200), providerId, status);
    if (status === 401 || status === 403)
        return new ErroProvider('auth', 'HTTP ' + status + ': ' + body.slice(0, 200), providerId, status);
    if (status >= 500)
        return new ErroProvider('server', 'HTTP ' + status + ': ' + body.slice(0, 200), providerId, status);
    return new ErroProvider('outro', 'HTTP ' + status + ': ' + body.slice(0, 200), providerId, status);
}
function parseArgs(raw) {
    if (!raw)
        return {};
    if (typeof raw === 'object' && !Array.isArray(raw))
        return raw;
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
        }
        catch {
            return {};
        }
    }
    return {};
}
async function adapterOllama(cfg, mensagens, tools, signal) {
    const base = cfg.baseUrl.replace(/\/$/, '') || ollama_1.OLLAMA_URL;
    const corpo = {
        model: cfg.modelo,
        messages: mensagens.map((m) => {
            const out = { role: m.role, content: m.content || '' };
            if (m.tool_calls)
                out.tool_calls = m.tool_calls;
            if (m.tool_name)
                out.tool_name = m.tool_name;
            return out;
        }),
        stream: false,
        options: {
            temperature: 0.3,
            num_ctx: 8192,
            num_predict: cfg.numPredict
        }
    };
    if (tools && tools.length > 0) {
        corpo.tools = tools.map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description || t.name,
                parameters: t.inputSchema || { type: 'object', properties: {} }
            }
        }));
    }
    let status = 0;
    let body = '';
    try {
        const r = await httpJsonUrl(base + '/api/chat', corpo, 'POST', cfg.timeoutMs, {}, signal);
        status = r.status;
        body = r.body;
    }
    catch (e) {
        if (e instanceof ErroProvider) {
            e.providerId = cfg.id;
            throw e;
        }
        throw new ErroProvider('rede', String(e), cfg.id);
    }
    if (status >= 400)
        throw classificarHttp(status, body, cfg.id);
    let json;
    try {
        json = JSON.parse(body);
    }
    catch {
        throw new ErroProvider('outro', 'JSON invalido do Ollama', cfg.id);
    }
    const msg = json.message || {};
    const tool_calls = (msg.tool_calls || [])
        .map((c) => ({
        function: {
            name: String(c.function?.name || ''),
            arguments: parseArgs(c.function?.arguments)
        }
    }))
        .filter((c) => c.function.name);
    return {
        content: msg.content || '',
        tool_calls,
        modeloUsado: cfg.modelo,
        providerId: cfg.id,
        bruto: json
    };
}
async function adapterOpenAI(cfg, mensagens, tools, signal) {
    const keyName = cfg.apiKeyEnv || '';
    const key = keyName ? process.env[keyName] : undefined;
    if (!key) {
        throw new ErroProvider('auth', 'chave ausente: env ' + keyName, cfg.id, 401);
    }
    const base = cfg.baseUrl.replace(/\/$/, '');
    const msgs = mensagens.map((m) => {
        if (m.role === 'tool') {
            return {
                role: 'tool',
                content: m.content || '',
                tool_call_id: m.tool_call_id || m.name || 'tool',
                name: m.tool_name || m.name
            };
        }
        const out = { role: m.role, content: m.content || '' };
        if (m.tool_calls && m.tool_calls.length) {
            out.tool_calls = m.tool_calls.map((tc, i) => ({
                id: tc.id || 'call_' + i,
                type: 'function',
                function: {
                    name: tc.function.name,
                    arguments: typeof tc.function.arguments === 'string'
                        ? tc.function.arguments
                        : JSON.stringify(tc.function.arguments || {})
                }
            }));
        }
        return out;
    });
    const corpo = {
        model: cfg.modelo,
        messages: msgs,
        temperature: 0.3,
        max_tokens: cfg.numPredict
    };
    if (tools && tools.length > 0) {
        corpo.tools = tools.map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description || t.name,
                parameters: t.inputSchema || { type: 'object', properties: {} }
            }
        }));
    }
    let status = 0;
    let body = '';
    try {
        const r = await httpJsonUrl(base + '/chat/completions', corpo, 'POST', cfg.timeoutMs, {
            Authorization: 'Bearer ' + key,
            'HTTP-Referer': 'https://dg-editor.local',
            'X-Title': 'DG Editor'
        }, signal);
        status = r.status;
        body = r.body;
    }
    catch (e) {
        if (e instanceof ErroProvider) {
            e.providerId = cfg.id;
            throw e;
        }
        throw new ErroProvider('rede', String(e), cfg.id);
    }
    if (status >= 400)
        throw classificarHttp(status, body, cfg.id);
    let json;
    try {
        json = JSON.parse(body);
    }
    catch {
        throw new ErroProvider('outro', 'JSON invalido OpenAI-compatible', cfg.id);
    }
    const msg = json.choices?.[0]?.message || {};
    const tool_calls = (msg.tool_calls || [])
        .map((c) => ({
        function: {
            name: String(c.function?.name || ''),
            arguments: parseArgs(c.function?.arguments)
        }
    }))
        .filter((c) => c.function.name);
    return {
        content: msg.content || '',
        tool_calls,
        modeloUsado: json.model || cfg.modelo,
        providerId: cfg.id,
        bruto: json,
        usage: json.usage
    };
}
const CURSOR_STATUS_REL = (0, path_1.join)('.dg-editor', 'cursor-cli-status.json');
function marcarCursorCliAprovado(ok, detalhe) {
    try {
        const raiz = (0, paths_1.resolverRaizProjeto)();
        const p = (0, path_1.join)(raiz, CURSOR_STATUS_REL);
        (0, fs_1.mkdirSync)((0, path_1.join)(raiz, '.dg-editor'), { recursive: true });
        (0, fs_1.writeFileSync)(p, JSON.stringify({ ok, at: new Date().toISOString(), detalhe: (detalhe || '').slice(0, 120) }, null, 2), 'utf8');
    }
    catch { /* nao bloqueia */ }
}
function cursorCliAprovadoNaSessao() {
    if (process.env.DG_CURSOR_CLI_OK === '1')
        return true;
    try {
        const raiz = (0, paths_1.resolverRaizProjeto)();
        const p = (0, path_1.join)(raiz, CURSOR_STATUS_REL);
        if (!(0, fs_1.existsSync)(p))
            return false;
        const j = JSON.parse((0, fs_1.readFileSync)(p, 'utf8'));
        if (!j.ok)
            return false;
        const age = Date.now() - new Date(j.at || 0).getTime();
        return age >= 0 && age < 24 * 3600 * 1000;
    }
    catch {
        return false;
    }
}
function resolverBinarioCursorAgent() {
    const fallbackPs1 = (0, path_1.join)(process.env.LOCALAPPDATA || '', 'cursor-agent', 'cursor-agent.ps1');
    // Preferir .ps1: spawn de .cmd no Windows com shell:false gera EINVAL
    if ((0, fs_1.existsSync)(fallbackPs1))
        return fallbackPs1;
    try {
        const outs = (0, child_process_1.execFileSync)('where.exe', ['cursor-agent'], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000
        }).trim().split(/\r?\n/).filter(Boolean);
        const ps1 = outs.find((p) => p.toLowerCase().endsWith('.ps1'));
        if (ps1 && (0, fs_1.existsSync)(ps1))
            return ps1;
    }
    catch { /* ignore */ }
    return (0, fs_1.existsSync)(fallbackPs1) ? fallbackPs1 : null;
}
/**
 * cursor-cli SEMPRE em --mode ask (somente leitura). Nunca edita.
 */
async function chamarCursorCli(cfg, mensagem) {
    const bin = cfg.binario || resolverBinarioCursorAgent();
    if (!bin) {
        throw new ErroProvider('rede', 'binario cursor-agent nao encontrado', cfg.id);
    }
    const preview = mensagem.slice(0, 80);
    (0, dglog_1.dglog)('[cursor-cli] start msg=' + JSON.stringify(preview) + ' timeoutMs=' + cfg.timeoutMs);
    const raiz = (0, paths_1.resolverRaizProjeto)();
    const args = ['-p', mensagem, '--mode', 'ask', '--trust', '--output-format', 'text'];
    if (cfg.modelo && cfg.modelo !== 'cursor-agent') {
        args.push('--model', cfg.modelo);
    }
    // workspace como arg separado (espacos seguros)
    args.push('--workspace', raiz);
    // Sempre via powershell -File no .ps1 (evita EINVAL do .cmd)
    const ps1 = bin.toLowerCase().endsWith('.ps1')
        ? bin
        : (0, path_1.join)(process.env.LOCALAPPDATA || '', 'cursor-agent', 'cursor-agent.ps1');
    if (!(0, fs_1.existsSync)(ps1)) {
        throw new ErroProvider('rede', 'cursor-agent.ps1 nao encontrado', cfg.id);
    }
    const cmd = 'powershell.exe';
    const cmdArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args];
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let killedByTimeout = false;
        const child = (0, child_process_1.spawn)(cmd, cmdArgs, {
            cwd: raiz,
            windowsHide: true,
            shell: false,
            env: { ...process.env }
        });
        const killHard = () => {
            try {
                child.kill('SIGKILL');
            }
            catch { /* */ }
            try {
                if (process.platform === 'win32' && child.pid) {
                    (0, child_process_1.spawn)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false });
                }
            }
            catch { /* */ }
        };
        const tSoft = setTimeout(() => {
            killedByTimeout = true;
            try {
                child.kill('SIGTERM');
            }
            catch { /* */ }
            setTimeout(killHard, 5000);
        }, cfg.timeoutMs);
        child.stdout?.on('data', (d) => { stdout += d.toString(); });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (e) => {
            clearTimeout(tSoft);
            reject(new ErroProvider('rede', String(e), cfg.id));
        });
        child.on('close', (code) => {
            clearTimeout(tSoft);
            if (killedByTimeout) {
                reject(new ErroProvider('timeout', 'cursor-cli timeout apos ' + cfg.timeoutMs + 'ms', cfg.id));
                return;
            }
            const errL = (stderr || '').toLowerCase();
            if (code !== 0) {
                if (/authentication|not logged in|api.key|login/.test(errL)) {
                    reject(new ErroProvider('auth', stderr.slice(0, 200) || 'auth cursor-cli', cfg.id, 401));
                    return;
                }
                if (/trust|workspace trust|workspace directory does not exist/.test(errL)) {
                    reject(new ErroProvider('auth', stderr.slice(0, 200) || 'trust/workspace cursor-cli', cfg.id));
                    return;
                }
                reject(new ErroProvider('server', (stderr || stdout || 'exit ' + code).slice(0, 300), cfg.id, code || 1));
                return;
            }
            let texto = stdout.trim();
            // tenta JSON se parecer
            if (texto.startsWith('{')) {
                try {
                    const j = JSON.parse(texto);
                    texto = String(j.result || j.text || j.message || j.content || texto);
                }
                catch { /* texto puro */ }
            }
            resolve({
                content: texto,
                tool_calls: [],
                modeloUsado: 'cursor-agent',
                providerId: cfg.id
            });
        });
    });
}
async function chamarProvider(cfg, mensagens, tools) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
    try {
        if (cfg.formato === 'cursor-cli') {
            const ultima = [...mensagens].reverse().find((m) => m.role === 'user');
            const msg = ultima?.content || mensagens.map((m) => m.content).filter(Boolean).join('\n');
            return await chamarCursorCli(cfg, msg);
        }
        if (cfg.formato === 'ollama') {
            return await adapterOllama(cfg, mensagens, tools, ac.signal);
        }
        return await adapterOpenAI(cfg, mensagens, tools, ac.signal);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Igual a chamarProvider, mas loga o id efetivo (chamarProviderSharp). */
async function chamarProviderSharp(cfg, mensagens, tools) {
    const r = await chamarProvider(cfg, mensagens, tools);
    (0, dglog_1.dglog)('[provider] sharp id=' + r.providerId + ' modelo=' + r.modeloUsado);
    return r;
}
function disponivel(cfg) {
    if (cfg.formato === 'cursor-cli' || cfg.tipo === 'cli') {
        const bin = cfg.binario || resolverBinarioCursorAgent();
        return !!bin && cursorCliAprovadoNaSessao();
    }
    if (cfg.tipo === 'local')
        return true;
    if (!cfg.apiKeyEnv)
        return false;
    const v = process.env[cfg.apiKeyEnv];
    return typeof v === 'string' && v.trim().length > 0;
}
