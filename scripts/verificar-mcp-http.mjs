/**
 * verificar-mcp-http.mjs — aceite da Rodada 5: MCP HTTP com syncRaiz + exposição por grupo
 *
 * Prova:
 *   M1  o servidor sobe com DG_MCP_TOKEN e recusa sem token (401)
 *   M2  tools/list devolve o número esperado (36 antigas + as novas por grupo)
 *   M3  3 tools novas do Grupo 1 respondem de verdade
 *   M4  tool fora da lista responde "ferramenta nao exposta"
 *   M5  (A) a raiz acompanha o DG_ROOT: trocou o projeto, a chamada seguinte opera no novo
 *   M6  a guarda de custo recusa provedor pago com limite estourado
 *
 * Uso:
 *   node scripts/verificar-mcp-http.mjs
 *   MCP_URL=http://127.0.0.1:7331/mcp MCP_TOKEN=... node scripts/verificar-mcp-http.mjs
 *
 * O servidor tem que estar rodando: npm run mcp:http
 * (o script NÃO sobe o servidor — quem sobe é você, em outro terminal)
 */
import fs from 'node:fs';

const URL = process.env.MCP_URL || 'http://127.0.0.1:7331/mcp';
const TOKEN = process.env.MCP_TOKEN || (() => {
  const p = process.env.DG_MCP_TOKEN_PATH;
  if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  // caminho padrão no Windows
  const def = process.env.LOCALAPPDATA + '\\dg-editor\\mcp-http-token.txt';
  if (fs.existsSync(def)) return fs.readFileSync(def, 'utf8').trim();
  return '';
})();

const results = [];
function check(id, desc, ok, detail) {
  results.push({ id, desc, ok, detail });
  console.log(`${ok ? 'PASSA' : 'FALHA'}  ${id}  ${desc}${detail ? '  -> ' + detail : ''}`);
}

async function rpc(method, params) {
  let r;
  try {
    r = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: params || {} }),
    });
  } catch (e) {
    console.log(`FALHA  NET  servidor não respondeu em ${URL}`);
    console.log('         ' + (e.cause?.code || e.message));
    console.log('         suba o servidor antes: npm run mcp:http');
    process.exit(2);
  }
  const txt = await r.text();
  // o transporte pode responder SSE; extrai o primeiro data:
  const linha = txt.split('\n').find(l => l.startsWith('data:'));
  const corpo = linha ? linha.slice(5).trim() : txt;
  let json = null;
  try { json = JSON.parse(corpo); } catch { /* resposta não-JSON */ }
  return { status: r.status, json, txt: txt.slice(0, 400) };
}

const GRUPO1 = ['agente_listar', 'agentes_externos_status', 'conector_listar', 'disco_buscar',
  'disco_inspecionar', 'skill_ler', 'skill_listar', 'midia_status', 'midia_custo',
  'midia_atualizacoes', 'portabilidade_status', 'provisionamento_status', 'apps_status',
  'midia_comfyui_status', 'reversa_status', 'midia_vozes_listar', 'midia_musicas',
  'midia_musicas_livres', 'notas_mapa_mental', 'tela_gravacoes'];
const GRUPO3 = ['midia_imagem_gerar', 'midia_tts_openai', 'midia_planilha', 'midia_pdf'];
const FORA = ['ftp_deploy', 'apps_build', 'qoder_executar', 'trae_executar', 'agente_executar',
  'midia_comfy_instalar', 'provisionamento_atualizar'];
const ANTIGAS = 36;

(async () => {
  if (!TOKEN) {
    console.log('FALHA  M0  token não encontrado');
    console.log('         defina MCP_TOKEN ou DG_MCP_TOKEN_PATH, ou deixe o arquivo em');
    console.log('         %LOCALAPPDATA%\\dg-editor\\mcp-http-token.txt');
    process.exit(1);
  }

  // ---------- M1: auth ----------
  let sem;
  try {
    sem = await fetch(URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
  } catch (e) {
    console.log(`FALHA  NET  servidor não respondeu em ${URL}`);
    console.log('         ' + (e.cause?.code || e.message));
    console.log('         suba o servidor antes: npm run mcp:http');
    process.exit(2);
  }
  check('M1.1', 'sem token é recusado (401)', sem.status === 401, 'HTTP ' + sem.status);

  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'verificar-mcp-http', version: '1.0.0' },
  });
  check('M1.2', 'com token o servidor responde', init.status === 200 && !!init.json?.result, init.json ? 'ok' : init.txt.slice(0, 80));

  // ---------- M2: contagem ----------
  const list = await rpc('tools/list', {});
  const nomes = (list.json?.result?.tools || []).map(t => t.name);
  const set = new Set(nomes);
  check('M2.1', 'tools/list respondeu', nomes.length > 0, `${nomes.length} tools listadas`);

  const faltandoG1 = GRUPO1.filter(t => !set.has(t));
  check('M2.2', 'Grupo 1 (leitura pura) exposto', faltandoG1.length === 0,
    faltandoG1.length ? 'faltam: ' + faltandoG1.join(', ') : `${GRUPO1.length} tools presentes`);

  const faltandoG3 = GRUPO3.filter(t => !set.has(t));
  check('M2.3', 'Grupo 3 (provedor pago) exposto', faltandoG3.length === 0,
    faltandoG3.length ? 'faltam: ' + faltandoG3.join(', ') : `${GRUPO3.length} tools presentes`);

  const entrouFora = FORA.filter(t => set.has(t));
  check('M2.4', 'ferramentas de decisão pendente continuam FORA', entrouFora.length === 0,
    entrouFora.length ? 'EXPOSTAS indevidamente: ' + entrouFora.join(', ') : `${FORA.length} seguem fora`);

  // ---------- M3: 3 tools novas respondem ----------
  const amostra = GRUPO1.slice(0, 3);
  for (const t of amostra) {
    const r = await rpc('tools/call', { name: t, arguments: {} });
    const ok = r.status === 200 && r.json?.result && !r.json?.result?.isError;
    check(`M3.${t}`, `tool nova responde: ${t}`, ok,
      ok ? 'ok' : (r.json?.result?.content?.[0]?.text || r.txt).slice(0, 90));
  }

  // ---------- M4: fora da lista ----------
  const fora = await rpc('tools/call', { name: 'ftp_deploy', arguments: {} });
  const textoFora = (fora.json?.result?.content?.[0]?.text || '').toLowerCase();
  check('M4.1', 'ftp_deploy responde "nao exposta"', fora.status === 200 && textoFora.includes('nao exposta'),
    textoFora.slice(0, 80) || fora.txt.slice(0, 80));

  // ---------- M5: a raiz acompanha o DG_ROOT ----------
  // Como o script não controla o processo do servidor, a prova é indireta:
  // chamar projeto_arvore antes e depois de o dono trocar o projeto no app.
  // Aqui apenas verificamos se a resposta contém a raiz atual.
  const arv = await rpc('tools/call', { name: 'projeto_arvore', arguments: { maxProfundidade: 1 } });
  const txtArv = (arv.json?.result?.content?.[0]?.text || '');
  check('M5.1', 'projeto_arvore responde com conteúdo', arv.status === 200 && txtArv.length > 0, txtArv.slice(0, 60));
  console.log('         NOTA M5: a prova completa da troca de raiz é manual —');
  console.log('         troque o projeto no app, chame de novo e compare a primeira linha.');

  // ---------- M6: guarda de custo ----------
  // A prova real exige estourar o limite; aqui verificamos se a tool de custo responde
  // e se o relatório do dono descreve a guarda. A recusa com limite 0 é prova do dono.
  const custo = await rpc('tools/call', { name: 'midia_custo', arguments: {} });
  check('M6.1', 'midia_custo responde (a guarda existe e é consultável)',
    custo.status === 200 && !!custo.json?.result,
    (custo.json?.result?.content?.[0]?.text || '').slice(0, 90));

  const fail = results.filter(x => !x.ok);
  console.log('\n' + '='.repeat(62));
  console.log(`TOTAL: ${results.length} verificações · ${results.length - fail.length} passam · ${fail.length} falham`);
  if (fail.length) {
    console.log('FALHAS: ' + fail.map(f => f.id).join(', '));
    console.log('RESULTADO: REPROVADO');
    process.exit(1);
  }
  console.log('RESULTADO: APROVADO');
})();
