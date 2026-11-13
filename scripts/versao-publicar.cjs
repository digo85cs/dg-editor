#!/usr/bin/env node
/**
 * Atualiza a versão do DG Editor, regenera o dossiê, (opcionalmente) compila os
 * artefatos, commita, cria tag e publica no GitHub Releases.
 *
 * Uso:
 *   node scripts/versao-publicar.cjs --patch
 *   node scripts/versao-publicar.cjs --minor --build
 *   node scripts/versao-publicar.cjs --versao=0.3.0
 *   node scripts/versao-publicar.cjs --minor --sem-build --sem-release
 *
 * Flags: --patch (padrão) | --minor | --major | --versao=x.y.z
 *        --build (gera instalador Windows + APK antes de publicar)
 *        --sem-push, --sem-release, --dry-run
 */
'use strict';

const { existsSync, readFileSync, writeFileSync, readdirSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = join(__dirname, '..');
const args = process.argv.slice(2);
const tem = (f) => args.includes(f);

function citar(a) {
  return /[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a
}

function rodar(bin, argv, opts = {}) {
  const base = {
    cwd: opts.cwd || RAIZ,
    stdio: opts.capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8'
  }
  // No Windows, npm/gh são .cmd/.exe: executa via shell com argumentos citados.
  const r =
    process.platform === 'win32'
      ? spawnSync([bin, ...argv].map(citar).join(' '), { ...base, shell: true })
      : spawnSync(bin, argv, base)
  if (opts.capturar) return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  if (r.status !== 0) throw new Error(bin + ' ' + argv.join(' ') + ' saiu com código ' + r.status);
  return { ok: true, out: '', err: '' };
}

function git(argv, capturar = true) {
  return rodar('git', argv, { capturar });
}

function lerJson(rel) {
  return JSON.parse(readFileSync(join(RAIZ, rel), 'utf8'));
}

function gravarJson(rel, dados) {
  writeFileSync(join(RAIZ, rel), JSON.stringify(dados, null, 2) + '\n', 'utf8');
}

function versaoAtual() {
  return lerJson('package.json').version;
}

function calcularNova(vAtual) {
  const explicita = args.find((a) => a.startsWith('--versao='));
  if (explicita) {
    const v = explicita.split('=')[1].trim();
    if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('versão inválida: ' + v);
    return v;
  }
  const [ma, mi, pa] = vAtual.split('.').map(Number)
  if (tem('--major')) return ma + 1 + '.0.0';
  if (tem('--minor')) return ma + '.' + (mi + 1) + '.0';
  return ma + '.' + mi + '.' + (pa + 1);
}

function bump(v) {
  const pkg = lerJson('package.json');
  pkg.version = v;
  gravarJson('package.json', pkg);
  if (existsSync(join(RAIZ, 'package-lock.json'))) {
    const lock = lerJson('package-lock.json');
    lock.version = v;
    if (lock.packages && lock.packages['']) lock.packages[''].version = v;
    gravarJson('package-lock.json', lock);
  }
  console.log('[versao] package.json → ' + v);
}

function dossie() {
  if (existsSync(join(RAIZ, 'scripts', 'dossie.cjs'))) {
    rodar(process.execPath, [join('scripts', 'dossie.cjs')]);
  }
}

function copiarArtefatos(origem, v) {
  const nomes = [
    'DG-Editor-' + v + '-x64.exe',
    'DG-Editor-' + v + '-x64.exe.blockmap',
    'DG-Editor-Portable-' + v + '.exe',
    'latest.yml'
  ];
  const oneDrive = process.env.DG_ONEDRIVE_APP || join(process.env.OneDrive || join(require('node:os').homedir(), 'OneDrive'), 'APP');
  const { copyFileSync, mkdirSync } = require('node:fs');
  mkdirSync(join(RAIZ, 'dist-app'), { recursive: true });
  mkdirSync(oneDrive, { recursive: true });
  for (const nome of nomes) {
    const de = join(origem, nome);
    if (!existsSync(de)) continue;
    copyFileSync(de, join(RAIZ, 'dist-app', nome));
    if (/\.exe$/i.test(nome)) copyFileSync(de, join(oneDrive, nome));
  }
  console.log('[versao] artefatos copiados para dist-app e ' + oneDrive);
}

function build() {
  const v = versaoAtual();
  const saida = join('tmp', 'dist-release-' + v);
  console.log('[versao] compilando aplicação...');
  rodar('npm', ['run', 'build'], { cwd: RAIZ });
  console.log('[versao] empacotando instalador Windows...');
  // Pasta de saída isolada evita o lock do app.asar em dist-app por antivírus/indexador.
  rodar('npx', ['electron-builder', '--win', 'nsis', 'portable', '--x64', '-c.directories.output=' + saida], { cwd: RAIZ });
  copiarArtefatos(join(RAIZ, saida), v);
  console.log('[versao] compilando APK Android...');
  try {
    rodar(process.execPath, [join('scripts', 'apps', 'build.cjs'), '--tipo=apk']);
  } catch (e) {
    console.warn('[versao] aviso: APK não gerado (' + e.message + ')');
  }
}

function artefatos(v) {
  const lista = [];
  const add = (dir, nome) => {
    const p = join(RAIZ, dir, nome);
    if (existsSync(p)) lista.push(p);
  };
  const fixos = ['DG-Editor-' + v + '-x64.exe', 'DG-Editor-' + v + '-x64.exe.blockmap', 'DG-Editor-Portable-' + v + '.exe', 'latest.yml'];
  for (const n of fixos) add('dist-app', n);
  const pastaApk = join(RAIZ, 'dist-apps');
  if (existsSync(pastaApk)) {
    for (const n of readdirSync(pastaApk)) if (/\.apk$/i.test(n)) add('dist-apps', n);
  }
  return lista;
}

function sha256(arquivo) {
  return createHash('sha256').update(readFileSync(arquivo)).digest('hex');
}

function tituloCommit(v) {
  return 'release: v' + v;
}

function notasRelease(v, assets) {
  const tagAnterior = git(['describe', '--tags', '--abbrev=0', 'HEAD']).out;
  const intervalo = tagAnterior && tagAnterior !== 'v' + v ? tagAnterior + '..HEAD' : 'HEAD~10..HEAD';
  const commits = git(['log', intervalo, '--pretty=format:- %h %s', '--no-merges']).out;
  const linhas = [
    '# DG Editor v' + v,
    '',
    '## Mudanças',
    commits || '- Atualização de versão.',
    '',
    '## Instalação',
    '- **Instalador:** `DG-Editor-' + v + '-x64.exe` (NSIS, x64).',
    '- **Portátil:** `DG-Editor-Portable-' + v + '.exe`.',
    '- **Android:** `DG-Apps-*.apk` (debug, instalável fora da loja).',
    '',
    '## Verificação'
  ];
  for (const a of assets) linhas.push('- `' + a.split(/[\\/]/).pop() + '` — SHA256 `' + sha256(a) + '`');
  linhas.push('', 'Gerado automaticamente por `scripts/versao-publicar.cjs`.');
  return linhas.join('\n');
}

function commitEtag(v) {
  const caminhos = [
    'package.json',
    'package-lock.json',
    '.gitignore',
    'DOSSIE.md',
    'electron.vite.config.ts',
    '.dgrules',
    '.github',
    'build',
    'docs',
    'resources',
    'scripts',
    'src',
    'test',
    'qa-artifacts/baseline.json',
    'apps/mobile/www',
    'apps/mobile/package.json',
    'apps/mobile/package-lock.json',
    'apps/mobile/capacitor.config.json'
  ].filter((p) => existsSync(join(RAIZ, p)));
  git(['add', '--', ...caminhos]);
  const status = git(['status', '--porcelain']).out;
  if (status) {
    const restantes = status.split('\n').filter((l) => l.trim());
    console.log('[versao] alterações fora dos caminhos versionados (ignoradas):\n' + restantes.map((l) => '  ' + l).join('\n'));
  }
  const staged = git(['diff', '--cached', '--name-only']).out;
  if (staged) {
    git(['commit', '-m', tituloCommit(v)]);
  } else {
    console.log('[versao] nada novo para commitar; seguindo com tag/release.');
  }
  const tag = 'v' + v;
  const jaExiste = git(['tag', '--list', tag]).out;
  if (jaExiste) throw new Error('tag ' + tag + ' já existe');
  git(['tag', '-a', tag, '-m', 'DG Editor ' + tag]);
  console.log('[versao] tag ' + tag + ' criada');
}

function push(v) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  console.log('[versao] enviando branch ' + branch + ' e tag v' + v + '...');
  git(['push', 'origin', branch], false);
  git(['push', 'origin', 'v' + v], false);
}

function release(v) {
  const ghOk = rodar('gh', ['auth', 'status'], { capturar: true }).ok;
  if (!ghOk) {
    console.warn('[versao] gh sem autenticação; release não criada. Rode: gh auth login');
    return;
  }
  const assets = artefatos(v);
  const tag = 'v' + v;
  const notas = join(RAIZ, 'tmp', 'release-' + v + '.md');
  require('node:fs').mkdirSync(join(RAIZ, 'tmp'), { recursive: true });
  writeFileSync(notas, notasRelease(v, assets), 'utf8');

  const existente = rodar('gh', ['release', 'view', tag], { capturar: true });
  if (existente.ok) {
    rodar('gh', ['release', 'edit', tag, '--title', 'DG Editor v' + v, '--notes-file', notas], { cwd: RAIZ });
    if (assets.length) rodar('gh', ['release', 'upload', tag, ...assets, '--clobber'], { cwd: RAIZ });
  } else {
    const argv = ['release', 'create', tag, '--title', 'DG Editor v' + v, '--notes-file', notas];
    if (assets.length) argv.push(...assets);
    rodar('gh', argv, { cwd: RAIZ });
  }
  console.log('[versao] release: https://github.com/digo85cs/dg-editor/releases/tag/' + tag);
}

function main() {
  const atual = versaoAtual();
  const nova = calcularNova(atual);
  console.log('[versao] ' + atual + ' → ' + nova + (tem('--dry-run') ? ' (dry-run)' : ''));
  if (tem('--dry-run')) {
    console.log('[versao] caminhos:', git(['status', '--porcelain']).out.split('\n').filter(Boolean).length, 'alteração(ões)');
    return;
  }

  bump(nova);
  if (tem('--build')) build();
  dossie();

  commitEtag(nova);
  if (!tem('--sem-push')) push(nova);
  if (!tem('--sem-release')) release(nova);
  console.log('[versao] concluído: v' + nova);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[versao] ERRO: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  }
}

module.exports = { versaoAtual, calcularNova, artefatos };
