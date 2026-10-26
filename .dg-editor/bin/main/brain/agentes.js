"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarAgentes = listarAgentes;
exports.lerAgente = lerAgente;
exports.invocarAgente = invocarAgente;
exports.garantirAgentesPadrao = garantirAgentesPadrao;
/**
 * Agentes especializados em .dg-editor/agentes/*.md
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ollama_1 = require("./ollama");
function dirAgentes(raiz) {
    return path_1.default.join(raiz, '.dg-editor', 'agentes');
}
function parseAgente(arquivo, bruto) {
    const id = path_1.default.basename(arquivo, '.md');
    let nome = id;
    let especialidade = id;
    let skills = [];
    let system = bruto;
    const fm = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fm) {
        const meta = fm[1];
        system = fm[2].trim();
        const n = meta.match(/nome:\s*(.+)/i);
        const e = meta.match(/especialidade:\s*(.+)/i);
        const s = meta.match(/skills:\s*(.+)/i);
        if (n)
            nome = n[1].trim();
        if (e)
            especialidade = e[1].trim();
        if (s) {
            skills = s[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        }
    }
    return { id, nome, especialidade, system, skills, arquivo };
}
function listarAgentes(raiz) {
    const dir = dirAgentes(raiz);
    if (!fs_1.default.existsSync(dir))
        return [];
    return fs_1.default.readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
        const abs = path_1.default.join(dir, f);
        const a = parseAgente(f, fs_1.default.readFileSync(abs, 'utf8'));
        a.arquivo = abs;
        return a;
    });
}
function lerAgente(raiz, id) {
    return listarAgentes(raiz).find((a) => a.id === id || a.nome === id) || null;
}
async function invocarAgente(raiz, id, contexto, pedido) {
    const ag = lerAgente(raiz, id);
    if (!ag)
        return { ok: false, agente: id, texto: 'agente nao encontrado: ' + id };
    const prompt = pedido;
    const ctx = (ag.system ? ag.system + '\n\n' : '') + (contexto || '');
    const r = await (0, ollama_1.askOllama)(prompt, ctx, ag.especialidade.includes('racioc') ? 'raciocinio' : 'codigo');
    return { ok: true, agente: ag.nome, texto: r.text, modelo: r.model };
}
function garantirAgentesPadrao(raiz) {
    const dir = dirAgentes(raiz);
    fs_1.default.mkdirSync(dir, { recursive: true });
    // Nao sobrescreve agentes ja presentes em disco (playbooks expandídos).
    const padroes = [
        {
            nome: 'revisor.md',
            conteudo: `---
nome: Revisor
especialidade: revisão de mudança antes de merge
skills: leitor-codigo, refatorador, testador
---
Voce e o agente Revisor do DG Editor. Revise codigo com foco em bugs, tipos e clareza.
Responda em portugues do Brasil, curto e tecnico.`
        },
        {
            nome: 'arquiteto.md',
            conteudo: `---
nome: Arquiteto
especialidade: decisão estrutural
skills: leitor-codigo, refatorador, documentador
---
Voce e o agente Arquiteto do DG Editor. Pense em estrutura, fronteiras de modulo e riscos.
Responda em portugues do Brasil.`
        },
        {
            nome: 'seguranca.md',
            conteudo: `---
nome: Seguranca
especialidade: auditoria de segurança
skills: revisor-seguranca, leitor-codigo, documentador
---
Assume input hostil. Classifique por severidade. Nunca aprove sem evidencia no codigo.`
        },
        {
            nome: 'testador.md',
            conteudo: `---
nome: Testador
especialidade: estratégia de teste
skills: testador, leitor-codigo, debugger
---
Priorize teste que falha quando o codigo quebra. Rejeite teste que sempre passa.`
        },
        {
            nome: 'dg-engenheiro.md',
            conteudo: `---
nome: DG Engenheiro
especialidade: orquestração interna
skills: leitor-codigo, refatorador, testador, debugger, revisor-seguranca, documentador, arvore-projeto, editar-seguro
---
Voce e o engenheiro interno do DG Editor. Trabalha so com tools e skills locais. Antes de editar, le. Antes de pronto, typecheck.`
        }
    ];
    for (const p of padroes) {
        const dest = path_1.default.join(dir, p.nome);
        if (!fs_1.default.existsSync(dest))
            fs_1.default.writeFileSync(dest, p.conteudo, 'utf8');
    }
}
