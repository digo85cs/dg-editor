"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarRegistry = listarRegistry;
exports.registrarModelo = registrarModelo;
exports.escolherModeloPorTarefa = escolherModeloPorTarefa;
/**
 * Registro de modelos (local Ollama + endpoints online opcionais).
 * escolherModelo(tarefa) consulta este registry.
 */
const ollama_1 = require("./ollama");
const REGISTRO_BASE = [
    { nome: 'qwen2.5-coder:1.5b', tipo: 'local', contexto: 4096, forca: 3, tarefas: ['chat', 'codigo'] },
    { nome: 'qwen2.5-coder:3b', tipo: 'local', contexto: 8192, forca: 5, tarefas: ['chat', 'codigo'] },
    { nome: 'qwen2.5-coder:7b', tipo: 'local', contexto: 8192, forca: 7, tarefas: ['codigo', 'raciocinio'] },
    { nome: 'qwen2.5-coder:14b', tipo: 'local', contexto: 8192, forca: 9, tarefas: ['codigo', 'raciocinio'] },
    { nome: 'llama3.2', tipo: 'local', contexto: 4096, forca: 5, tarefas: ['chat', 'raciocinio'] }
];
let extras = [];
function listarRegistry() {
    return [...REGISTRO_BASE, ...extras];
}
function registrarModelo(m) {
    extras = extras.filter((x) => x.nome !== m.nome);
    extras.push(m);
}
async function escolherModeloPorTarefa(tarefa) {
    const t = tarefa === 'chat' || tarefa === 'simples' ? 'chat'
        : tarefa === 'raciocinio' || tarefa === 'estrategia' ? 'raciocinio'
            : 'codigo';
    const disponiveis = await (0, ollama_1.listModelos)();
    const candidatos = listarRegistry()
        .filter((m) => m.tipo === 'local')
        .filter((m) => m.tarefas.includes(t))
        .filter((m) => disponiveis.some((d) => d === m.nome || d.startsWith(m.nome)))
        .sort((a, b) => {
        if (t === 'chat')
            return a.forca - b.forca; // mais rapido
        return b.forca - a.forca; // mais forte
    });
    if (candidatos.length > 0)
        return candidatos[0].nome;
    // fallback: qualquer local disponivel do registry
    const qualquer = listarRegistry()
        .filter((m) => m.tipo === 'local')
        .filter((m) => disponiveis.some((d) => d === m.nome || d.startsWith(m.nome)))
        .sort((a, b) => b.forca - a.forca);
    if (qualquer.length > 0)
        return qualquer[0].nome;
    return t === 'chat' ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:3b';
}
