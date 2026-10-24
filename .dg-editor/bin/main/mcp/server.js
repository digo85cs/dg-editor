"use strict";
// Servidor MCP do DG Editor.
// Expoe o vault (.dg-editor), o dossie e o historico do chat como tools
// consumiveis por qualquer cliente MCP (Claude Desktop, Cursor, Maestro).
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const zod_1 = require("zod");
const dossie_1 = require("../dossie");
const paths_1 = require("../paths");
const chatstore_1 = require("../chatstore");
const indice_1 = require("../brain/indice");
const editar_1 = require("../brain/editar");
const RAIZ = process.env.DG_ROOT || process.cwd();
const VAULT = (0, paths_1.projectStateDir)(RAIZ);
function dentroDoVault(p) {
    const abs = (0, node_path_1.resolve)(p);
    const rel = (0, node_path_1.relative)(VAULT, abs);
    return !rel.startsWith('..') && !rel.includes('..');
}
const TOOLS = [
    {
        name: 'dossie_read',
        description: 'Le o dossie atual do DG Editor (.dg-editor/dossie.txt)',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'dossie_write',
        description: 'Grava o dossie a partir do historico do chat (substitui, nunca anexa)',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Raiz do projeto' },
                resumo: { type: 'string', description: 'Resumo do estado atual' },
                proximaAcao: { type: 'string', description: 'Proxima acao planejada' }
            },
            required: ['root']
        }
    },
    {
        name: 'dossie_snapshot',
        description: 'Snapshot estruturado do dossie (root, atualizadoEm, totalMensagens, provedor, resumo)',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'vault_list',
        description: 'Lista arquivos do vault (.dg-editor), opcionalmente filtrando por subpasta',
        inputSchema: {
            type: 'object',
            properties: { subpasta: { type: 'string', description: 'Subpasta opcional, ex: backup' } },
            required: []
        }
    },
    {
        name: 'vault_read',
        description: 'Le o conteudo de um arquivo do vault (path relativo ao .dg-editor)',
        inputSchema: {
            type: 'object',
            properties: { caminho: { type: 'string' } },
            required: ['caminho']
        }
    },
    {
        name: 'vault_write',
        description: 'Escreve um arquivo no vault (path relativo ao .dg-editor). Recusa sair do vault.',
        inputSchema: {
            type: 'object',
            properties: {
                caminho: { type: 'string' },
                conteudo: { type: 'string' },
                sobrescrever: { type: 'boolean' }
            },
            required: ['caminho', 'conteudo']
        }
    },
    {
        name: 'projeto_arvore',
        description: 'Arvore de arquivos do projeto (respeita .gitignore basico: node_modules, out, .git)',
        inputSchema: {
            type: 'object',
            properties: {
                maxProfundidade: { type: 'number' },
                filtro: { type: 'string', description: 'Substring no nome do arquivo' }
            },
            required: []
        }
    },
    {
        name: 'codigo_buscar',
        description: 'Busca simbolos no indice de codigo (funcao/classe/tipo). Aceita sinonimos (pick->escolher, get->ler).',
        inputSchema: {
            type: 'object',
            properties: {
                termo: { type: 'string', description: 'Substring ou sinonimo do nome do simbolo' },
                tipo: {
                    type: 'string',
                    description: 'funcao | classe | tipo | todos',
                    enum: ['funcao', 'classe', 'tipo', 'todos']
                }
            },
            required: ['termo']
        }
    },
    {
        name: 'codigo_ler',
        description: 'Le o corpo de UMA funcao/simbolo pelo nome (nunca o arquivo inteiro).',
        inputSchema: {
            type: 'object',
            properties: {
                nome: { type: 'string', description: 'Nome exato do simbolo (ex: escolherModelo)' }
            },
            required: ['nome']
        }
    },
    {
        name: 'codigo_editar',
        description: 'Substitui uma ancora unica num arquivo. Se verificar=true (default), roda tsc e reverte se falhar.',
        inputSchema: {
            type: 'object',
            properties: {
                arquivo: { type: 'string', description: 'Caminho relativo a raiz do projeto' },
                ancora: { type: 'string', description: 'Trecho existente que deve aparecer exatamente 1 vez' },
                novo: { type: 'string', description: 'Texto que substitui a ancora' },
                verificar: { type: 'boolean', description: 'Rodar typecheck apos editar (default true)' }
            },
            required: ['arquivo', 'ancora', 'novo']
        }
    }
];
const server = new index_js_1.Server({ name: 'dg-editor-vault', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
        if (name === 'dossie_read') {
            const txt = await (0, dossie_1.lerDossie)();
            return { content: [{ type: 'text', text: txt || '(dossie vazio)' }] };
        }
        if (name === 'dossie_write') {
            const parsed = zod_1.z.object({
                root: zod_1.z.string(),
                resumo: zod_1.z.string().optional(),
                proximaAcao: zod_1.z.string().optional()
            }).parse(args);
            const destino = await (0, dossie_1.gravarDossie)((0, chatstore_1.loadChat)(parsed.root), {
                root: parsed.root,
                resumo: parsed.resumo,
                proximaAcao: parsed.proximaAcao
            });
            return { content: [{ type: 'text', text: 'dossie gravado em ' + destino }] };
        }
        if (name === 'dossie_snapshot') {
            const snap = await (0, dossie_1.dossieSnapshot)();
            // root sempre reflete a raiz real do servidor (DG_ROOT ou cwd), nao dado historico do arquivo
            const resposta = { ...(snap || {}), root: RAIZ };
            return { content: [{ type: 'text', text: JSON.stringify(resposta, null, 2) }] };
        }
        if (name === 'vault_list') {
            const sub = args.subpasta;
            const base = sub ? (0, node_path_1.join)(VAULT, sub) : VAULT;
            if (!dentroDoVault(base))
                throw new Error('caminho fora do vault');
            const entradas = await node_fs_1.promises.readdir(base, { withFileTypes: true });
            const linhas = entradas.map((e) => (e.isDirectory() ? '[D] ' : '[F] ') + e.name);
            return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] };
        }
        if (name === 'vault_read') {
            const p = args.caminho;
            const abs = (0, node_path_1.join)(VAULT, p);
            if (!dentroDoVault(abs))
                throw new Error('caminho fora do vault');
            const txt = await node_fs_1.promises.readFile(abs, 'utf8');
            return { content: [{ type: 'text', text: txt }] };
        }
        if (name === 'vault_write') {
            const { caminho, conteudo, sobrescrever } = args;
            const abs = (0, node_path_1.join)(VAULT, caminho);
            if (!dentroDoVault(abs))
                throw new Error('caminho fora do vault');
            if (!sobrescrever) {
                try {
                    await node_fs_1.promises.access(abs);
                    throw new Error('arquivo existe; use sobrescrever: true');
                }
                catch (e) {
                    if (e.message.includes('sobrescrever'))
                        throw e;
                }
            }
            await node_fs_1.promises.mkdir((0, node_path_1.join)(abs, '..'), { recursive: true });
            await node_fs_1.promises.writeFile(abs, conteudo, 'utf8');
            return { content: [{ type: 'text', text: 'escrito ' + caminho }] };
        }
        if (name === 'projeto_arvore') {
            const { maxProfundidade = 3, filtro } = args;
            const ignorar = new Set(['node_modules', 'out', '.git', 'dist', '.dg-editor']);
            const linhas = [];
            async function walk(dir, nivel) {
                if (nivel > maxProfundidade)
                    return;
                const ents = await node_fs_1.promises.readdir(dir, { withFileTypes: true });
                for (const e of ents) {
                    if (ignorar.has(e.name))
                        continue;
                    if (filtro && !e.name.toLowerCase().includes(filtro.toLowerCase())) {
                        if (e.isDirectory())
                            await walk((0, node_path_1.join)(dir, e.name), nivel + 1);
                        continue;
                    }
                    linhas.push('  '.repeat(nivel) + (e.isDirectory() ? '/' : '') + e.name);
                    if (e.isDirectory())
                        await walk((0, node_path_1.join)(dir, e.name), nivel + 1);
                }
            }
            await walk(RAIZ, 0);
            return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] };
        }
        if (name === 'codigo_buscar') {
            const parsed = zod_1.z.object({
                termo: zod_1.z.string(),
                tipo: zod_1.z.enum(['funcao', 'classe', 'tipo', 'todos']).optional()
            }).parse(args);
            const hits = (0, indice_1.buscarSimbolos)(RAIZ, parsed.termo, parsed.tipo || 'todos');
            return { content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }] };
        }
        if (name === 'codigo_ler') {
            const parsed = zod_1.z.object({ nome: zod_1.z.string() }).parse(args);
            const hit = (0, indice_1.lerSimbolo)(RAIZ, parsed.nome);
            if (!hit) {
                return { content: [{ type: 'text', text: 'simbolo nao encontrado: ' + parsed.nome }], isError: true };
            }
            return { content: [{ type: 'text', text: JSON.stringify(hit, null, 2) }] };
        }
        if (name === 'codigo_editar') {
            const parsed = zod_1.z.object({
                arquivo: zod_1.z.string(),
                ancora: zod_1.z.string(),
                novo: zod_1.z.string(),
                verificar: zod_1.z.boolean().optional()
            }).parse(args);
            const res = (0, editar_1.editarPorAncora)(RAIZ, parsed.arquivo, parsed.ancora, parsed.novo, parsed.verificar !== false);
            return {
                content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
                isError: !res.ok
            };
        }
        throw new Error('tool desconhecida: ' + name);
    }
    catch (e) {
        return { content: [{ type: 'text', text: 'ERRO: ' + e.message }], isError: true };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('[mcp-dg-editor] servidor ativo no stdio');
}
main().catch((e) => {
    console.error('[mcp-dg-editor] falhou:', e);
    process.exit(1);
});
