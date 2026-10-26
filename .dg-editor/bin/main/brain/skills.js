"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarSkills = listarSkills;
exports.lerSkill = lerSkill;
exports.skillsRelevantes = skillsRelevantes;
exports.garantirSkillsPadrao = garantirSkillsPadrao;
/**
 * Skills locais em .dg-editor/skills/*.md
 * Frontmatter simples: titulo, gatilho
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function dirSkills(raiz) {
    return path_1.default.join(raiz, '.dg-editor', 'skills');
}
function parseMd(arquivo, bruto) {
    const id = path_1.default.basename(arquivo, '.md');
    let titulo = id;
    let gatilho = id;
    let corpo = bruto;
    const fm = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fm) {
        const meta = fm[1];
        corpo = fm[2];
        const t = meta.match(/titulo:\s*(.+)/i);
        const g = meta.match(/gatilho:\s*(.+)/i);
        if (t)
            titulo = t[1].trim();
        if (g)
            gatilho = g[1].trim();
    }
    return { id, titulo, gatilho, instrucao: corpo.trim(), arquivo };
}
function listarSkills(raiz) {
    const dir = dirSkills(raiz);
    if (!fs_1.default.existsSync(dir))
        return [];
    return fs_1.default.readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
        const abs = path_1.default.join(dir, f);
        const s = parseMd(f, fs_1.default.readFileSync(abs, 'utf8'));
        s.arquivo = abs;
        return s;
    });
}
function lerSkill(raiz, id) {
    return listarSkills(raiz).find((s) => s.id === id || s.titulo === id) || null;
}
/** Escolhe skills cujo gatilho aparece na pergunta. */
function skillsRelevantes(raiz, pergunta, limite = 2) {
    const q = pergunta.toLowerCase();
    return listarSkills(raiz)
        .filter((s) => {
        const parts = s.gatilho.toLowerCase().split(/[,|;]/).map((x) => x.trim()).filter(Boolean);
        return parts.some((p) => q.includes(p));
    })
        .slice(0, limite);
}
function garantirSkillsPadrao(raiz) {
    const dir = dirSkills(raiz);
    fs_1.default.mkdirSync(dir, { recursive: true });
    const padroes = [
        {
            nome: 'editar-seguro.md',
            conteudo: `---
titulo: Edicao segura
gatilho: editar, trocar, alterar, codigo_editar, MAX_ITER
---
Antes de editar codigo, use codigo_buscar/codigo_ler para localizar o simbolo.
Edite apenas com codigo_editar e ancora unica. Nunca reescreva o arquivo inteiro.`
        },
        {
            nome: 'arvore-projeto.md',
            conteudo: `---
titulo: Arvore do projeto
gatilho: arvore, arquivos, projeto_arvore, quantos arquivos
---
Para contar ou listar arquivos, chame a tool projeto_arvore e responda em linguagem natural com o numero.`
        }
    ];
    for (const p of padroes) {
        const dest = path_1.default.join(dir, p.nome);
        if (!fs_1.default.existsSync(dest))
            fs_1.default.writeFileSync(dest, p.conteudo, 'utf8');
    }
}
