/**
 * verificar-store-projeto.mjs — aceite: o store de propostas pertence ao PROJETO
 *
 * Roda a implementação REAL de `src/main/openclaw/diffs.ts` (compilada), não um mock.
 *
 *   P1  Propostas de um projeto ficam no .dg-editor/openclaw/ daquele projeto
 *   P2  Trocar de projeto NÃO mostra propostas do projeto anterior (mesma sessão)
 *   P3  Voltar ao projeto anterior restaura as propostas dele (mesma sessão)
 *   P4  Reabrir o app restaura as propostas do projeto ativo (módulo novo)
 *   P5  O arquivo de um projeto não é corrompido pelo outro
 *
 * IMPORTANTE — a diferença que faz o teste correto:
 *   trocar de projeto = muda DG_ROOT, módulo continua o MESMO (o app não reinicia)
 *   reabrir o app     = módulo NOVO, lê tudo do disco
 *
 * Uso (dentro de C:\dev\DGEditor):
 *   npx tsc -p src/main/tsconfig.json
 *   node scripts/verificar-store-projeto.mjs
 *
 * Saída: 0 = aprovado, 1 = reprovado, 2 = build não encontrado.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ_REPO = process.env.DG_REPO || process.cwd();
const TMP = path.join(os.tmpdir(), 'dg-store-' + Date.now());
const PROJ_A = path.join(TMP, 'projetoA');
const PROJ_B = path.join(TMP, 'projetoB');

const results = [];
function check(id, desc, ok, detail) {
  results.push({ id, desc, ok, detail });
  console.log(`${ok ? 'PASSA' : 'FALHA'}  ${id}  ${desc}${detail ? '  -> ' + detail : ''}`);
}

const candidatos = [
  path.join(RAIZ_REPO, 'out', 'main', 'openclaw', 'diffs.js'),
  path.join(RAIZ_REPO, '.dg-editor', 'bin', 'main', 'openclaw', 'diffs.js'),
  path.join(RAIZ_REPO, 'dist-app', 'win-unpacked', 'resources', 'app', 'out', 'main', 'openclaw', 'diffs.js'),
];
const build = candidatos.find(p => fs.existsSync(p));
if (!build) {
  console.error('ERRO: não achei diffs.js compilado. Procurado em:\n  ' + candidatos.join('\n  '));
  console.error('Rode o build primeiro: npx tsc -p src/main/tsconfig.json');
  process.exit(2);
}
console.log('Build em uso: ' + build + '\n');

fs.mkdirSync(PROJ_A, { recursive: true });
fs.mkdirSync(PROJ_B, { recursive: true });

const envOriginal = process.env.DG_ROOT;

/** módulo novo — simula o app abrindo */
const abrirApp = async () => {
  const url = pathToFileURL(build).href + '?boot=' + Date.now() + Math.random();
  return await import(url);
};

const storeDe = (proj) => path.join(proj, '.dg-editor', 'openclaw', 'pendentes.json');

const idsVistos = (mod) => {
  try { return mod.listarPendentes().map(x => path.basename(x.absPath || x.path || x.id || '?')).sort(); }
  catch (e) { return ['<erro: ' + e.message.slice(0, 50) + '>']; }
};
const contaEm = (lista, nome) => lista.filter(x => x === nome).length;

function propor(proj, nome, de, para) {
  fs.writeFileSync(path.join(proj, nome), de + '\n', 'utf8');
  return {
    path: nome,
    unifiedDiff: `--- a/${nome}\n+++ b/${nome}\n@@ -1 +1 @@\n-${de}\n+${para}\n`,
  };
}
const lerDisco = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')).pendentes || []; } catch { return []; } };

(async () => {
  // ================= SESSÃO 1 =================
  process.env.DG_ROOT = PROJ_A;
  const mod = await abrirApp();                 // app abre no projeto A

  let r = null;
  try { r = mod.adicionarPendentes([propor(PROJ_A, 'arquivo-a.ts', 'const a = 1', 'const a = 2')], [PROJ_A]); }
  catch (e) { console.log('         (nota: ' + e.message.slice(0, 90) + ')'); }

  const arqA = storeDe(PROJ_A);
  check('P1.1', 'store criado dentro do projeto A', fs.existsSync(arqA), arqA.replace(TMP, '…'));
  if (r) check('P1.2', 'a proposta foi aceita (não rejeitada por caminho)',
    (r.pendentes || []).length === 1 && (r.rejeitados || []).length === 0,
    'aceitas=' + (r.pendentes || []).length + ' rejeitadas=' + (r.rejeitados || []).length);

  // ---- P2: troca de projeto DENTRO da mesma sessão (mesmo módulo) ----
  process.env.DG_ROOT = PROJ_B;
  const vistosB = idsVistos(mod);
  check('P2.1', 'no projeto B a lista não traz proposta de A',
    contaEm(vistosB, 'arquivo-a.ts') === 0, 'viu: ' + JSON.stringify(vistosB));

  try { mod.adicionarPendentes([propor(PROJ_B, 'arquivo-b.ts', 'const b = 1', 'const b = 2')], [PROJ_B]); }
  catch (e) { console.log('         (nota: ' + e.message.slice(0, 70) + ')'); }

  const arqB = storeDe(PROJ_B);
  check('P2.2', 'store criado dentro do projeto B', fs.existsSync(arqB), arqB.replace(TMP, '…'));
  check('P2.3', 'arquivo de B não contém proposta de A',
    !lerDisco(arqB).some(x => String(x.absPath || '').includes('arquivo-a.ts')),
    JSON.stringify(lerDisco(arqB).map(x => path.basename(x.absPath || '?'))));

  // ---- P3: volta para A DENTRO da mesma sessão ----
  process.env.DG_ROOT = PROJ_A;
  const vistosA = idsVistos(mod);
  check('P3.1', 'de volta ao projeto A, as propostas de A reaparecem',
    contaEm(vistosA, 'arquivo-a.ts') >= 1, 'viu: ' + JSON.stringify(vistosA));
  check('P3.2', 'de volta ao projeto A, propostas de B não aparecem',
    contaEm(vistosA, 'arquivo-b.ts') === 0, 'viu: ' + JSON.stringify(vistosA));

  // ---- P5: integridade dos arquivos ----
  check('P5.1', 'arquivo de A continua íntegro depois de tudo', lerDisco(arqA).length >= 1,
    'itens em A: ' + lerDisco(arqA).length);
  check('P5.2', 'arquivo de B continua íntegro depois de tudo', lerDisco(arqB).length >= 1,
    'itens em B: ' + lerDisco(arqB).length);

  // ================= SESSÃO 2 — reabrir o app =================
  delete process.env.DG_ROOT;                   // ambiente limpo, como num boot real
  process.env.DG_ROOT = PROJ_B;
  const mod2 = await abrirApp();                // app abre de novo, no projeto B
  const vistosBoot = idsVistos(mod2);
  check('P4.1', 'reabrir o app no projeto B restaura a proposta de B',
    contaEm(vistosBoot, 'arquivo-b.ts') >= 1, 'viu: ' + JSON.stringify(vistosBoot));
  check('P4.2', 'reabrir o app no projeto B não traz proposta de A',
    contaEm(vistosBoot, 'arquivo-a.ts') === 0, 'viu: ' + JSON.stringify(vistosBoot));

  // ---------- limpeza ----------
  if (envOriginal === undefined) delete process.env.DG_ROOT; else process.env.DG_ROOT = envOriginal;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }

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
