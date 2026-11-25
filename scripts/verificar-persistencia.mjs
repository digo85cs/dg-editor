#!/usr/bin/env node
/**
 * verificar-persistencia.mjs — aceite das correções B1 (histórico do agente) e B2 (propostas)
 *
 * Três modos:
 *   node verificar-persistencia.mjs                -> checagens estruturais (invariantes)
 *   node verificar-persistencia.mjs --snapshot      -> salva a linha de base ANTES do teste
 *   node verificar-persistencia.mjs --check         -> compara com a linha de base DEPOIS do teste
 *
 * O modo --check é o que prova B1 e B2 de verdade: ele exige que a contagem tenha AUMENTADO
 * e sobrevivido ao fechar/abrir.
 *
 * Uso:
 *   DG_ROOT=C:\dev\DGEditor node verificar-persistencia.mjs --snapshot
 *   (no app: peça algo ao painel Agente, feche o app, abra de novo)
 *   DG_ROOT=C:\dev\DGEditor node verificar-persistencia.mjs --check
 *
 * Sai com código 1 se qualquer verificação falhar.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.env.DG_ROOT || 'C:\\dev\\DGEditor';
const CHATS = path.join(ROOT, '.dg-editor', 'chats');
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const SNAPSHOT = path.join(ROOT, '.dg-editor', 'qa-snapshot.json');

const MODO = process.argv.includes('--snapshot') ? 'snapshot'
           : process.argv.includes('--check') ? 'check'
           : 'estrutural';

const CANDIDATOS_PROPOSTAS = [
  process.env.DG_PROPOSTAS_PATH,
  path.join(ROOT, '.dg-editor', 'openclaw', 'pendentes.json'),
  path.join(ROOT, '.dg-editor', 'openclaw', 'propostas-pendentes.json'),
  path.join(ROOT, '.dg-editor', 'propostas-pendentes.json'),
  path.join(ROOT, '.dg-editor', 'propostas', 'pendentes.json'),
  path.join(APPDATA, 'DG Editor', 'propostas-pendentes.json'),
  path.join(APPDATA, 'DG Editor', 'pendentes.json'),
].filter(Boolean);

const results = [];
function check(id, desc, ok, detail) {
  results.push({ id, desc, ok, detail });
  console.log(`${ok ? 'PASSA' : 'FALHA'}  ${id}  ${desc}${detail ? '  -> ' + detail : ''}`);
}

function lerChats() {
  if (!fs.existsSync(CHATS)) return { erro: `diretório não existe: ${CHATS}`, porArquivo: {}, total: 0, arquivos: 0, invalidos: [] };
  const arquivos = fs.readdirSync(CHATS).filter(f => f.toLowerCase().endsWith('.json'));
  const porArquivo = {};
  const invalidos = [];
  let total = 0;
  for (const f of arquivos) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(CHATS, f), 'utf8'));
      const msgs = Array.isArray(j) ? j : (j.mensagens || j.messages || j.historico || []);
      const n = Array.isArray(msgs) ? msgs.length : 0;
      porArquivo[f] = n;
      total += n;
    } catch (e) {
      invalidos.push(`${f}: ${e.message.slice(0, 40)}`);
      porArquivo[f] = -1;
    }
  }
  return { arquivos: arquivos.length, total, porArquivo, invalidos };
}

function lerPropostas() {
  const achado = CANDIDATOS_PROPOSTAS.find(p => fs.existsSync(p));
  if (!achado) return { caminho: null, qtd: 0, erro: null };
  try {
    const j = JSON.parse(fs.readFileSync(achado, 'utf8'));
    const lista = Array.isArray(j) ? j : (j.pendentes || j.propostas || j.items || []);
    return { caminho: achado, qtd: Array.isArray(lista) ? lista.length : -1, erro: null };
  } catch (e) {
    return { caminho: achado, qtd: 0, erro: e.message };
  }
}

const estado = () => ({ chats: lerChats(), propostas: lerPropostas(), quando: new Date().toISOString() });

if (MODO === 'snapshot') {
  const e = estado();
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(e, null, 1));
  console.log(`Linha de base salva em ${SNAPSHOT}`);
  console.log(`  conversas: ${e.chats.arquivos} · mensagens: ${e.chats.total} · propostas: ${e.propostas.qtd}`);
  console.log('\nAGORA: peça algo ao painel Agente, feche o app, abra de novo, e rode --check');
  process.exit(0);
}

if (MODO === 'check') {
  if (!fs.existsSync(SNAPSHOT)) {
    console.log(`FALHA  C0  linha de base não encontrada em ${SNAPSHOT}\n         rode primeiro: node verificar-persistencia.mjs --snapshot`);
    process.exit(1);
  }
  const antes = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const depois = estado();

  const deltaMsgs = depois.chats.total - antes.chats.total;
  check('B1.1', 'mensagem nova do painel Agente sobreviveu ao fechar/abrir', deltaMsgs > 0,
    `mensagens: ${antes.chats.total} -> ${depois.chats.total} (delta ${deltaMsgs >= 0 ? '+' : ''}${deltaMsgs})`);

  const cresceram = Object.keys(depois.chats.porArquivo).filter(f => (depois.chats.porArquivo[f] || 0) > (antes.chats.porArquivo[f] || 0));
  check('B1.2', 'a mensagem foi gravada em um arquivo de conversa identificável', cresceram.length > 0,
    cresceram.length ? `cresceram: ${cresceram.join(', ')}` : 'nenhum arquivo de conversa recebeu mensagem');

  const novos = Object.keys(depois.chats.porArquivo).filter(f => !(f in antes.chats.porArquivo));
  if (novos.length) console.log(`         (nota: ${novos.length} arquivo(s) de conversa novo(s): ${novos.slice(0, 3).join(', ')})`);

  const deltaProp = depois.propostas.qtd - antes.propostas.qtd;
  const naoZerou = !(antes.propostas.qtd > 0 && depois.propostas.qtd === 0);
  check('B2.1', 'propostas pendentes sobreviveram ao fechar/abrir', naoZerou,
    `propostas: ${antes.propostas.qtd} -> ${depois.propostas.qtd} (delta ${deltaProp >= 0 ? '+' : ''}${deltaProp})`);

  check('B2.2', 'propostas ficam em disco, não só em memória', !!depois.propostas.caminho,
    depois.propostas.caminho || 'nenhum arquivo de propostas encontrado');

  if (antes.propostas.qtd === 0 && depois.propostas.qtd === 0) {
    check('B2.3', 'o teste de B2 realmente exercitou uma proposta', false,
      'nada havia antes nem depois — o teste não provou nada. Crie uma proposta antes de fechar.');
  }
}

if (MODO === 'estrutural') {
  const e = estado();

  if (e.chats.erro) {
    check('S1', 'diretório de conversas existe', false, e.chats.erro);
  } else {
    check('S1', 'todos os arquivos de conversa são JSON válido', e.chats.invalidos.length === 0,
      e.chats.invalidos.length ? e.chats.invalidos.slice(0, 3).join(' | ') : `${e.chats.arquivos} arquivos válidos`);
    console.log(`         (contexto: ${e.chats.arquivos} conversas, ${e.chats.total} mensagens no total)`);
  }

  check('S2', 'store de propostas pendentes existe em disco', !!e.propostas.caminho,
    e.propostas.caminho || 'nenhum candidato existe:\n         ' + CANDIDATOS_PROPOSTAS.join('\n         '));

  if (e.propostas.caminho) {
    check('S2b', 'store de propostas é JSON válido', !e.propostas.erro,
      e.propostas.erro ? e.propostas.erro.slice(0, 80) : `válido, ${e.propostas.qtd} item(ns)`);
  }
}

const fail = results.filter(r => !r.ok);
console.log('\n' + '='.repeat(60));
console.log(`MODO: ${MODO}`);
console.log(`TOTAL: ${results.length} verificações · ${results.length - fail.length} passam · ${fail.length} falham`);
if (fail.length) {
  console.log('FALHAS: ' + fail.map(f => f.id).join(', '));
  console.log('RESULTADO: REPROVADO');
  process.exit(1);
}
console.log('RESULTADO: APROVADO');
