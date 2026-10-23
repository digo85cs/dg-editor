"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.caminhoDossie = caminhoDossie;
exports.montarDossie = montarDossie;
exports.gravarDossie = gravarDossie;
exports.lerDossie = lerDossie;
exports.dossieSnapshot = dossieSnapshot;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const paths_1 = require("./paths");
function caminhoDossie() {
    return (0, node_path_1.join)((0, paths_1.dossieDir)(), 'dossie.txt');
}
/** Monta o texto do dossie a partir do historico do chat. */
function montarDossie(historico, extra) {
    const agora = new Date();
    const ultimas = historico.slice(-20);
    const porProvedor = {};
    for (const m of historico) {
        if (m.provider)
            porProvedor[m.provider] = (porProvedor[m.provider] || 0) + 1;
    }
    const provedorRecente = [...historico].reverse().find((m) => m.provider)?.provider ?? 'n/d';
    const corpo = [];
    corpo.push('=== DOSSIE DG EDITOR ===');
    corpo.push(`Atualizado em: ${agora.toISOString()}`);
    corpo.push(`Raiz: ${extra?.root ?? 'n/a'}${''}`);
    corpo.push(`Total de mensagens no chat: ${historico.length}`);
    corpo.push(`Provedor mais recente: ${provedorRecente}`);
    corpo.push(`Contagem por provedor: ${JSON.stringify(porProvedor)}`);
    corpo.push('');
    if (extra?.resumo) {
        corpo.push('--- RESUMO DO ESTADO ---');
        corpo.push(extra.resumo);
        corpo.push('');
    }
    if (extra?.proximaAcao) {
        corpo.push('--- PROXIMA ACAO ---');
        corpo.push(extra.proximaAcao);
        corpo.push('');
    }
    corpo.push('--- ULTIMAS MENSAGENS ---');
    for (const m of ultimas) {
        const quem = m.role === 'user' ? 'DONO' : 'IA';
        const prov = m.provider ? ` [${m.provider}]` : '';
        const texto = m.content.replace(/\s+/g, ' ').slice(0, 600);
        corpo.push(`[${new Date(m.at).toISOString()}] ${quem}${prov}: ${texto}`);
    }
    corpo.push('=== FIM DO DOSSIE ===');
    return corpo.join('\n');
}
/** Grava (substitui) o dossie no disco. Nunca anexa. */
async function gravarDossie(historico, extra) {
    const destino = caminhoDossie();
    await node_fs_1.promises.mkdir((0, node_path_1.dirname)(destino), { recursive: true });
    const texto = montarDossie(historico, extra);
    await node_fs_1.promises.writeFile(destino, texto, 'utf8');
    return destino;
}
/** Le o dossie atual (usado pelo bridge para a Adapta). */
async function lerDossie() {
    try {
        return await node_fs_1.promises.readFile(caminhoDossie(), 'utf8');
    }
    catch {
        return '';
    }
}
/** Snapshot estruturado para a UI. */
async function dossieSnapshot() {
    const texto = await lerDossie();
    if (!texto)
        return null;
    const linhas = texto.split('\n');
    const pega = (prefixo) => linhas.find((l) => l.startsWith(prefixo))?.slice(prefixo.length).trim();
    return {
        root: pega('Raiz:') ?? '',
        atualizadoEm: Date.parse(pega('Atualizado em:') ?? '') || 0,
        totalMensagens: Number(pega('Total de mensagens no chat:') ?? 0) || 0,
        ultimoProvedor: pega('Provedor mais recente:'),
        resumo: texto.slice(0, 400)
    };
}
