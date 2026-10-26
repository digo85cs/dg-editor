"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectarGpu = exports.escolherModelo = void 0;
exports.profundidadeExecucaoAgente = profundidadeExecucaoAgente;
exports.executarAgente = executarAgente;
exports.historico = historico;
const client_1 = require("../mcp/client");
const hybrid_1 = require("../memory/hybrid");
const embeddings_1 = require("../memory/embeddings");
const dglog_1 = require("../dglog");
const chatstore_1 = require("../chatstore");
const registry_1 = require("./registry");
const providers_1 = require("./providers");
const skills_1 = require("./skills");
const agentes_1 = require("./agentes");
/**
 * Agente do DG Editor: fila hibrida (OpenRouter → Ollama) com failover.
 */
const MAX_ITER = 6;
/** Profundidade de executarAgente — bloqueia agente_executar recursivo. */
let profundidadeAgente = 0;
function profundidadeExecucaoAgente() {
    return profundidadeAgente;
}
var ollama_1 = require("./ollama");
Object.defineProperty(exports, "escolherModelo", { enumerable: true, get: function () { return ollama_1.escolherModelo; } });
Object.defineProperty(exports, "detectarGpu", { enumerable: true, get: function () { return ollama_1.detectarGpu; } });
const SYSTEM = `Voce e o DG, agente interno do DG Editor.
Voce opera o projeto localmente usando ferramentas (tools) do MCP interno.
Regras:
- Use as tools para ler e escrever arquivos do projeto, consultar o dossie e a arvore.
- Nunca invente conteudo de arquivo: leia antes de afirmar.
- Respostas curtas, tecnicas, em portugues do Brasil.
- Se a tool falhar, relate o erro e proponha alternativa.`;
/**
 * Modelos pequenos em CPU confundem o schema da tool com os argumentos,
 * achatando "type: object / properties / required" dentro do valor.
 * Esta funcao remove esses artefatos e mantem so os valores reais.
 */
/** Ollama as vezes devolve arguments como STRING JSON. Normaliza para objeto. */
function normalizarArgs(bruto) {
    if (!bruto)
        return {};
    if (typeof bruto === 'string') {
        const s = bruto.trim();
        if (!s)
            return {};
        try {
            const p = JSON.parse(s);
            if (p && typeof p === 'object' && !Array.isArray(p))
                return p;
        }
        catch { /* nao e JSON valido */ }
        return {};
    }
    if (typeof bruto === 'object' && !Array.isArray(bruto))
        return bruto;
    return {};
}
function sanitizarArgs(brutos, schema) {
    const saida = {};
    const props = schema?.properties || {};
    // chaves que sao metadados de schema, jamais argumentos reais
    const lixo = new Set(['type', 'description', 'properties', 'required', 'object', 'nil', '[]', 'Lista', 'lista']);
    for (const [k, v] of Object.entries(brutos)) {
        if (lixo.has(k))
            continue;
        const def = props[k];
        // se nao esta no schema, mas e um valor escalar valido, aceita
        if (!def) {
            if (v === null || v === undefined)
                continue;
            if (typeof v === 'object') {
                // objeto aninhado de schema: descarta
                const pareceSchema = typeof v === 'object' && v !== null &&
                    ('type' in v || 'properties' in v);
                if (pareceSchema)
                    continue;
            }
            saida[k] = v;
            continue;
        }
        // coage ao tipo declarado
        if (def.type === 'integer' || def.type === 'number') {
            const n = typeof v === 'number' ? v : parseInt(String(v), 10);
            if (!Number.isNaN(n))
                saida[k] = n;
        }
        else if (def.type === 'string') {
            if (typeof v === 'string')
                saida[k] = v;
            else if (v !== null && v !== undefined)
                saida[k] = String(v);
        }
        else if (def.type === 'boolean') {
            saida[k] = v === true || v === 'true';
        }
        else if (def.type === 'array' && Array.isArray(v)) {
            saida[k] = v;
        }
        else if (def.type === 'object' && typeof v === 'object' && v !== null) {
            const pareceSchema = 'type' in v || 'properties' in v;
            if (!pareceSchema)
                saida[k] = v;
        }
    }
    return saida;
}
/**
 * Modelos pequenos (3b) as vezes escrevem o tool_call como TEXTO em vez de
 * emitir tool_calls estruturado. Esta funcao detecta esse caso e devolve
 * { nome, args } para execucao manual do loop.
 * Aceita: {"name":"x","arguments":{...}} ou {"name":"x"} isolado no texto.
 */
function extrairToolDoTexto(texto, toolsDisponiveis) {
    (0, dglog_1.dglog)('[extrairToolDoTexto] len=' +
        (texto ? texto.length : 0) +
        ' input=' +
        JSON.stringify(texto ? texto.slice(0, 200) : ''));
    if (!texto)
        return null;
    const nomes = new Set(toolsDisponiveis.map((t) => t.name));
    // Remove cercas markdown ```json ... ``` antes de parsear
    let limpo = texto.trim();
    const cerca = limpo.match(/^```(?:json|JSON)?\s*([\s\S]*?)```\s*$/);
    if (cerca)
        limpo = cerca[1].trim();
    // Varredura com balanceamento de chaves: resiste a objetos aninhados.
    const blocos = extrairBlocosJson(limpo);
    for (const raw of blocos) {
        let obj;
        try {
            obj = JSON.parse(raw);
        }
        catch {
            continue;
        }
        if (!obj || typeof obj !== 'object')
            continue;
        // formato A: { name, arguments } / { name, parameters }
        const o = obj;
        const nome = typeof o.name === 'string' ? o.name : '';
        if (nome && nomes.has(nome)) {
            const bruto = (o.arguments ?? o.parameters);
            const args = bruto && typeof bruto === 'object' && !Array.isArray(bruto)
                ? bruto
                : {};
            return { nome, args };
        }
        // formato B: { "projeto_arvore": {...} }  (nome como chave)
        for (const k of Object.keys(o)) {
            if (nomes.has(k)) {
                const v = o[k];
                const args = v && typeof v === 'object' && !Array.isArray(v)
                    ? v
                    : {};
                return { nome: k, args };
            }
        }
    }
    // formato C: citacao da tool por nome, sem JSON valido.
    // Ex: 'projeto_arvore({"profundidade": 2})' ou 'tool: projeto_arvore'
    for (const nome of nomes) {
        const idx = limpo.indexOf(nome);
        if (idx < 0)
            continue;
        const resto = limpo.slice(idx + nome.length);
        const paren = resto.match(/^\s*\(/);
        if (!paren)
            continue;
        const abre = idx + nome.length + resto.indexOf('(');
        const argsTxt = extrairPrimeiroBloco(limpo, abre, '(', ')');
        if (argsTxt === null)
            continue;
        try {
            const parsed = JSON.parse(argsTxt);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { nome, args: parsed };
            }
        }
        catch {
            return { nome, args: {} };
        }
    }
    (0, dglog_1.dglog)('[extrairToolDoTexto] nenhum tool_call reconhecido');
    return null;
}
/**
 * Localiza blocos JSON validos no texto respeitando aninhamento de chaves.
 * IMPORTANTE: devolve o bloco COM as chaves externas — extrairPrimeiroBloco
 * retorna so o miolo; sem reembrulhar, JSON.parse falha.
 */
function extrairBlocosJson(texto) {
    const saida = [];
    let i = 0;
    while (i < texto.length) {
        const abre = texto.indexOf('{', i);
        if (abre < 0)
            break;
        const miolo = extrairPrimeiroBloco(texto, abre, '{', '}');
        if (miolo === null) {
            i = abre + 1;
            continue;
        }
        saida.push('{' + miolo + '}');
        i = abre + miolo.length + 2;
    }
    return saida;
}
/** Extrai o conteudo entre o delimitador de abertura e o fechamento correspondente. */
function extrairPrimeiroBloco(texto, posAbre, abre, fecha) {
    if (texto[posAbre] !== abre)
        return null;
    let nivel = 0;
    let dentroString = false;
    let escape = false;
    for (let i = posAbre; i < texto.length; i++) {
        const c = texto[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (c === '\\') {
            escape = true;
            continue;
        }
        if (c === '"') {
            dentroString = !dentroString;
            continue;
        }
        if (dentroString)
            continue;
        if (c === abre)
            nivel++;
        else if (c === fecha) {
            nivel--;
            if (nivel === 0)
                return texto.slice(posAbre + 1, i);
        }
    }
    return null;
}
function pareceJsonTool(texto) {
    const t = (texto || '').trim();
    if (!t)
        return false;
    if (/^```/.test(t))
        return true;
    return /^\s*\{\s*"name"\s*:/.test(t) || /^\s*\{\s*"\w+"\s*:\s*\{/.test(t);
}
function sintetizarDeTools(passos) {
    const tools = passos.filter((p) => p.tipo === 'tool' && p.resultado);
    if (tools.length === 0)
        return 'Nao obtive resultado das ferramentas.';
    const partes = [];
    for (const t of tools) {
        const linhas = String(t.resultado || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
        partes.push('A tool "' + t.nome + '" retornou ' + linhas.length + ' linhas.' +
            (linhas.length > 0 ? ' Trecho:\n' + linhas.slice(0, 30).join('\n') : ''));
    }
    return partes.join('\n\n');
}
async function finalizarAgente(raiz, pergunta, modelo, texto, passos) {
    let final = texto;
    if (pareceJsonTool(final) || !final.trim()) {
        final = sintetizarDeTools(passos);
    }
    passos.push({ tipo: 'texto', texto: final });
    (0, chatstore_1.appendChat)(raiz, { role: 'user', content: pergunta, at: Date.now(), provider: modelo });
    (0, chatstore_1.appendChat)(raiz, { role: 'assistant', content: final, at: Date.now(), provider: modelo });
    await (0, embeddings_1.indexarTurno)(raiz, 'user', pergunta);
    await (0, embeddings_1.indexarTurno)(raiz, 'assistant', final);
    return { texto: final, modelo, passos };
}
async function rodarLoopComProvider(raiz, pergunta, cfg, tools, systemExtra) {
    const mensagens = [
        { role: 'system', content: SYSTEM + systemExtra },
        { role: 'user', content: pergunta }
    ];
    const toolDefs = tools.length
        ? tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
        }))
        : undefined;
    const passos = [];
    const assinaturasFeitas = new Set();
    let pediuResumo = false;
    const labelModelo = cfg.modelo;
    for (let i = 0; i < MAX_ITER; i++) {
        const jaUsouTool = passos.some((p) => p.tipo === 'tool');
        if (jaUsouTool && !pediuResumo) {
            mensagens.push({
                role: 'user',
                content: 'Com o resultado da tool acima, responda em portugues do Brasil, em linguagem natural. Nao emita JSON nem chame tools de novo.'
            });
            pediuResumo = true;
        }
        const toolsAgora = !jaUsouTool ? toolDefs : undefined;
        const r = await (0, providers_1.chamarProviderSharp)(cfg, mensagens, toolsAgora);
        let chamadas = r.tool_calls.map((c) => ({
            function: {
                name: c.function.name,
                arguments: normalizarArgs(c.function.arguments)
            }
        }));
        (0, dglog_1.dglog)('[agente] iter=' + i + ' provider=' + cfg.id +
            ' | tool_calls=' + chamadas.length +
            ' | content=' + (r.content ? r.content.length + 'c' : 'vazio'));
        if (chamadas.length === 0 && r.content && !jaUsouTool) {
            const extraido = extrairToolDoTexto(r.content, tools);
            if (extraido) {
                (0, dglog_1.dglog)('[agente] FALLBACK texto->tool: ' + extraido.nome);
                chamadas = [{ function: { name: extraido.nome, arguments: extraido.args } }];
                mensagens.push({
                    role: 'assistant',
                    content: r.content,
                    tool_calls: chamadas.map((c, idx) => ({
                        id: 'call_' + idx,
                        type: 'function',
                        function: {
                            name: c.function.name,
                            arguments: c.function.arguments
                        }
                    }))
                });
            }
        }
        if (chamadas.length === 0 && jaUsouTool && pareceJsonTool(r.content || '')) {
            (0, dglog_1.dglog)('[agente] modelo repetiu JSON apos tool; sintetizando');
            return finalizarAgente(raiz, pergunta, labelModelo, '', passos);
        }
        if (chamadas.length === 0) {
            (0, dglog_1.dglog)('[agente] final apos ' + (i + 1) + ' iteracoes via ' + cfg.id);
            return finalizarAgente(raiz, pergunta, labelModelo, r.content || '', passos);
        }
        if (r.tool_calls.length > 0) {
            mensagens.push({
                role: 'assistant',
                content: r.content || '',
                tool_calls: r.tool_calls.map((c, idx) => ({
                    id: 'call_' + idx,
                    type: 'function',
                    function: {
                        name: c.function.name,
                        arguments: c.function.arguments
                    }
                }))
            });
        }
        for (let ti = 0; ti < chamadas.length; ti++) {
            const ch = chamadas[ti];
            const nome = ch.function?.name || '';
            const schemaDaTool = tools.find((t) => t.name === nome)?.inputSchema;
            const args = sanitizarArgs(normalizarArgs(ch.function?.arguments), schemaDaTool);
            const sig = nome + '|' + JSON.stringify(args);
            if (assinaturasFeitas.has(sig)) {
                (0, dglog_1.dglog)('[agente] tool repetida ignorada: ' + sig.slice(0, 80));
                return finalizarAgente(raiz, pergunta, labelModelo, '', passos);
            }
            assinaturasFeitas.add(sig);
            (0, dglog_1.dglog)('[agente] tool ' + nome + ' ' + JSON.stringify(args).slice(0, 120));
            const res = await (0, client_1.chamarTool)(nome, args);
            passos.push({ tipo: 'tool', nome, args, resultado: res.texto });
            mensagens.push({
                role: 'tool',
                tool_name: nome,
                tool_call_id: 'call_' + ti,
                name: nome,
                content: res.texto.slice(0, 6000)
            });
        }
    }
    (0, dglog_1.dglog)('[agente] limite de iteracoes; sintetizando');
    return finalizarAgente(raiz, pergunta, labelModelo, '', passos);
}
async function executarAgente(raiz, pergunta, modeloForcadoOuOpcoes) {
    const opcoes = typeof modeloForcadoOuOpcoes === 'string'
        ? { modeloForcado: modeloForcadoOuOpcoes }
        : modeloForcadoOuOpcoes || {};
    if (profundidadeAgente > 0) {
        throw new Error('Recursao bloqueada: agente_executar/executarAgente nao pode ser chamado de dentro de outro executarAgente');
    }
    profundidadeAgente++;
    const tInicio = Date.now();
    const tentativasOut = [];
    try {
        const tarefa = opcoes.tarefa || 'codigo';
        const modeloForcado = opcoes.modeloForcado;
        (0, skills_1.garantirSkillsPadrao)(raiz);
        (0, agentes_1.garantirAgentesPadrao)(raiz);
        const agenteId = opcoes.agente || 'revisor';
        const ag = (0, agentes_1.lerAgente)(raiz, agenteId);
        const blocoAgente = ag
            ? '\n\n### AGENTE ATIVO: ' + ag.nome + '\nEspecialidade: ' + ag.especialidade +
                (ag.skills.length ? '\nSkills: ' + ag.skills.join(', ') : '') +
                '\n\n' + ag.system
            : '';
        const ctx = await (0, hybrid_1.montarContexto)(raiz, pergunta);
        const memoria = (0, hybrid_1.blocoMemoria)(ctx);
        const skills = (0, skills_1.skillsRelevantes)(raiz, pergunta);
        const blocoSkills = skills.length
            ? '\n\n### SKILLS ATIVAS\n' + skills.map((s) => '- ' + s.titulo + ': ' + s.instrucao).join('\n')
            : '';
        const systemExtra = blocoAgente + (memoria ? '\n\n' + memoria : '') + blocoSkills;
        let tools = [];
        try {
            tools = await (0, client_1.listarTools)();
            // Anti-recursao: nunca expor agente_executar ao loop interno
            tools = tools.filter((t) => t.name !== 'agente_executar');
            (0, dglog_1.dglog)('[agente] ' + tools.length + ' tools disponiveis (sem agente_executar)');
        }
        catch (e) {
            (0, dglog_1.dglog)('[agente] MCP indisponivel: ' + String(e));
        }
        await (0, registry_1.garantirCatalogoOpenRouter)();
        let fila;
        try {
            fila = (0, registry_1.filaPronta)(tarefa, { pedido: pergunta });
        }
        catch (e) {
            throw e;
        }
        if (modeloForcado) {
            fila = [
                {
                    id: 'forcado:' + modeloForcado,
                    tipo: 'local',
                    formato: 'ollama',
                    modelo: modeloForcado,
                    baseUrl: 'http://127.0.0.1:11434',
                    numPredict: 1024,
                    timeoutMs: 300_000
                },
                ...fila.filter((p) => p.modelo !== modeloForcado)
            ];
        }
        const maxTentativas = fila.length;
        let saltos = 0;
        const MAX_SALTOS = 5;
        for (let pi = 0; pi < maxTentativas; pi++) {
            const cfg = fila[pi];
            const st = (0, registry_1.disponivel)(cfg);
            if (st !== 'ok') {
                const motivo = st;
                try {
                    process.stderr.write('[dg-fila] pulando ' + cfg.id + '/' + cfg.modelo + ' motivo=' + motivo + '\n');
                }
                catch { /* */ }
                (0, dglog_1.dglog)('[provider] tarefa=' + tarefa + ' tentou=' + cfg.id + ' motivo=' + motivo + ' resultado=pulado');
                (0, registry_1.appendFailoverLog)(raiz, { tarefa, tentou: cfg.id, motivo, resultado: 'pulado' });
                tentativasOut.push({ provider: cfg.id, resultado: 'pulado: ' + motivo });
                saltos++;
                if (saltos >= MAX_SALTOS)
                    break;
                continue;
            }
            let retriesServer = 0;
            while (retriesServer < 2) {
                const t0 = Date.now();
                try {
                    (0, dglog_1.dglog)('[provider] tarefa=' + tarefa + ' tentou=' + cfg.id +
                        ' motivo=tentativa resultado=...');
                    const resp = await rodarLoopComProvider(raiz, pergunta, cfg, tools, systemExtra);
                    const ms = Date.now() - t0;
                    (0, dglog_1.dglog)('[provider] tarefa=' + tarefa + ' tentou=' + cfg.id +
                        ' motivo=ok resultado=ok');
                    (0, registry_1.appendFailoverLog)(raiz, {
                        tarefa,
                        tentou: cfg.id,
                        motivo: 'ok modelo=' + resp.modelo,
                        resultado: 'ok',
                        ms
                    });
                    tentativasOut.push({ provider: cfg.id, resultado: 'ok' });
                    return {
                        ...resp,
                        ok: true,
                        tentativas: tentativasOut,
                        duracaoMs: Date.now() - tInicio
                    };
                }
                catch (e) {
                    const ms = Date.now() - t0;
                    const err = e instanceof providers_1.ErroProvider
                        ? e
                        : new providers_1.ErroProvider('outro', String(e), cfg.id);
                    const kind = err.kind;
                    const motivo = kind + ': ' + err.message.slice(0, 160);
                    (0, dglog_1.dglog)('[provider] tarefa=' + tarefa + ' tentou=' + cfg.id +
                        ' motivo=' + motivo + ' resultado=falhou');
                    (0, registry_1.appendFailoverLog)(raiz, { tarefa, tentou: cfg.id, motivo, resultado: 'falhou', ms });
                    tentativasOut.push({ provider: cfg.id, resultado: 'falhou: ' + motivo });
                    if (kind === 'modelo_morto') {
                        try {
                            process.stderr.write('[dg-failover] ' + cfg.id + '/' + cfg.modelo + ' morto, tentando proximo\n');
                        }
                        catch { /* */ }
                        saltos++;
                        if (saltos >= MAX_SALTOS) {
                            break;
                        }
                        break; // proximo da fila
                    }
                    if (kind === 'rate_limit' || kind === 'auth' || kind === 'timeout') {
                        saltos++;
                        if (saltos >= MAX_SALTOS)
                            break;
                        break;
                    }
                    if (kind === 'server' || kind === 'rede') {
                        retriesServer++;
                        if (retriesServer < 2) {
                            (0, dglog_1.dglog)('[provider] retentativa no mesmo provider ' + cfg.id);
                            continue;
                        }
                        saltos++;
                        if (saltos >= MAX_SALTOS)
                            break;
                        break;
                    }
                    saltos++;
                    if (saltos >= MAX_SALTOS)
                        break;
                    break;
                }
            }
            if (saltos >= MAX_SALTOS)
                break;
        }
        const lista = tentativasOut.map((t) => t.provider + ' (' + t.resultado + ')').join('; ');
        throw new Error('Fila esgotada para tarefa=' + tarefa + '. Tentados: ' + (lista || '(nenhum)'));
    }
    finally {
        profundidadeAgente--;
    }
}
async function historico(raiz) {
    return (0, chatstore_1.loadChat)(raiz);
}
