"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.montarContexto = montarContexto;
exports.blocoMemoria = blocoMemoria;
const chatstore_1 = require("../chatstore");
const embeddings_1 = require("./embeddings");
const dglog_1 = require("../dglog");
const JANELA_PADRAO = 8;
async function montarContexto(raiz, pergunta, janela = JANELA_PADRAO) {
    const historico = (0, chatstore_1.loadChat)(raiz);
    const recentes = historico.slice(-janela);
    const linhasJanela = recentes.map((m) => {
        const quem = m.role === 'user' ? 'DONO' : 'DG';
        return quem + ': ' + m.content.slice(0, 600);
    });
    let profundas = [];
    try {
        const antigas = await (0, embeddings_1.buscarSemelhantes)(raiz, pergunta, 4, 0.45);
        const textosJanela = recentes.map((m) => m.content.slice(0, 120));
        profundas = antigas
            .filter((e) => {
            const inicio = e.texto.slice(0, 120);
            return !textosJanela.some((t) => t === inicio);
        })
            .map((e) => {
            const quem = e.role === 'user' ? 'DONO' : 'DG';
            const quando = new Date(e.at).toLocaleDateString('pt-BR');
            return '[' + quando + '] ' + quem + ': ' + e.texto.slice(0, 600);
        });
    }
    catch (e) {
        (0, dglog_1.dglog)('[memoria] busca semantica falhou: ' + String(e));
    }
    return {
        janela: linhasJanela.join('\n'),
        profundas: profundas.join('\n'),
        total: recentes.length + profundas.length
    };
}
function blocoMemoria(ctx) {
    const partes = [];
    if (ctx.profundas) {
        partes.push('### MEMORIA PROFUNDA (turnos antigos relevantes)');
        partes.push(ctx.profundas);
    }
    if (ctx.janela) {
        partes.push('### CONVERSA RECENTE');
        partes.push(ctx.janela);
    }
    return partes.join('\n\n');
}
