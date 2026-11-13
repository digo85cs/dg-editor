#!/usr/bin/env node
'use strict';

/**
 * Baixa ferramentas estáticas gratuitas (ffmpeg/ffprobe) para resources/bin,
 * de modo que o instalador funcione em um PC sem ffmpeg no PATH.
 *
 * Uso:
 *   node scripts/baixar-ferramentas.cjs
 *   node scripts/baixar-ferramentas.cjs --forcar
 */
const { spawnSync } = require('node:child_process');
const { copyFileSync, createWriteStream, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RAIZ = join(__dirname, '..');
const DESTINO = join(RAIZ, 'resources', 'bin', process.platform === 'win32' ? 'win32-x64' : process.platform + '-' + process.arch);
const URL_BUILD =
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const API_BUILD = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest';
const ASSET_BUILD = 'ffmpeg-master-latest-win64-gpl.zip';
const META = join(DESTINO, '.dg-build.json');
const CACHE = join(tmpdir(), 'dg-editor-ffmpeg-cache');
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const ZIP = join(CACHE, basename(URL_BUILD));

const OBRIGATORIOS = ['ffmpeg.exe', 'ffprobe.exe'];
const FILTROS_ESPERADOS = ['vidstabdetect', 'vidstabtransform', 'loudnorm', 'hqdn3d', 'unsharp', 'rubberband'];

function log(msg) {
  console.log('[ferramentas] ' + msg);
}

function tamanho(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

function ferramentaPronta() {
  return OBRIGATORIOS.every((n) => tamanho(join(DESTINO, n)) > 10 * 1024 * 1024);
}

async function baixar() {
  mkdirSync(CACHE, { recursive: true });
  if (tamanho(ZIP) > 50 * 1024 * 1024) {
    log('usando download em cache: ' + ZIP);
    return;
  }
  log('baixando ' + URL_BUILD);
  const res = await fetch(URL_BUILD, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status + ' ao baixar ffmpeg');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(ZIP));
  if (tamanho(ZIP) < 50 * 1024 * 1024) throw new Error('download incompleto (' + tamanho(ZIP) + ' bytes)');
  log('download concluído: ' + Math.round(tamanho(ZIP) / 1024 / 1024) + ' MB');
}

function extrair() {
  const pasta = join(CACHE, 'extraido');
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  let r = spawnSync(TAR, ['-xf', ZIP, '-C', pasta], { encoding: 'utf8' });
  if (r.status !== 0) {
    r = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath "' + ZIP + '" -DestinationPath "' + pasta + '" -Force'],
      { encoding: 'utf8' }
    );
  }
  if (r.status !== 0) throw new Error('não foi possível extrair o zip: ' + (r.stderr || '').slice(0, 300));
  return pasta;
}

function acharArquivo(dir, nome) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, item.name);
    if (item.isDirectory()) {
      const achado = acharArquivo(p, nome);
      if (achado) return achado;
    } else if (item.name.toLowerCase() === nome.toLowerCase()) {
      return p;
    }
  }
  return null;
}

function verificar() {
  const ffmpeg = join(DESTINO, 'ffmpeg.exe');
  const r = spawnSync(ffmpeg, ['-hide_banner', '-filters'], { encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, erro: 'ffmpeg embutido não executa' };
  const saida = String(r.stdout || '');
  const faltando = FILTROS_ESPERADOS.filter((f) => !saida.includes(' ' + f + ' '));
  const versao = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' });
  return {
    ok: true,
    versao: String(versao.stdout || '').split(/\r?\n/)[0],
    filtrosFaltando: faltando
  };
}

function metadadosBuild() {
  return { fonte: 'build', repo: 'BtbN/FFmpeg-Builds', tag: 'latest', asset: ASSET_BUILD, url: URL_BUILD };
}

/** Registra a data do build embutido para o app não baixar uma cópia igual. */
async function gravarMetadados() {
  const meta = { ...metadadosBuild(), build: '', instaladoEm: new Date().toISOString() };
  try {
    const res = await fetch(API_BUILD, { headers: { 'User-Agent': 'DG-Editor-build' } });
    if (res.ok) {
      const j = await res.json();
      const asset = (j.assets || []).find((a) => a.name === ASSET_BUILD);
      if (asset && asset.updated_at) meta.build = String(asset.updated_at).slice(0, 10);
      meta.tag = j.tag_name || 'latest';
    }
  } catch {
    /* offline: o app trata build vazio como "desconhecido" */
  }
  writeFileSync(META, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  log('metadados do build: ' + (meta.build || 'sem data (offline)'));
}

async function main() {
  if (process.platform !== 'win32') {
    log('plataforma ' + process.platform + ': ffmpeg estático só é embutido no Windows; usando o do sistema.');
    return { ok: true, embutido: false };
  }
  if (ferramentaPronta() && !process.argv.includes('--forcar')) {
    const v = verificar();
    log('ffmpeg/ffprobe já embutidos (' + Math.round(tamanho(join(DESTINO, 'ffmpeg.exe')) / 1024 / 1024) + ' MB)');
    if (v.ok) log(v.versao);
    if (!statSync(META, { throwIfNoEntry: false })) await gravarMetadados();
    return { ok: true, embutido: true, ...v };
  }
  await baixar();
  const pasta = extrair();
  mkdirSync(DESTINO, { recursive: true });
  for (const nome of OBRIGATORIOS) {
    const origem = acharArquivo(pasta, nome);
    if (!origem) throw new Error(nome + ' não encontrado no pacote baixado');
    const destino = join(DESTINO, nome);
    rmSync(destino, { force: true });
    copyFileSync(origem, destino);
    log('embutido: ' + destino + ' (' + Math.round(tamanho(destino) / 1024 / 1024) + ' MB)');
  }
  writeFileSync(
    join(DESTINO, 'LEIA-ME.txt'),
    'ffmpeg/ffprobe estáticos (build GPL) embutidos para o DG Editor funcionar sem instalar nada.\n' +
      'Origem: ' + URL_BUILD + '\n' +
      'Licença GPL: fonte em https://github.com/BtbN/FFmpeg-Builds e https://ffmpeg.org\n',
    'utf8'
  );
  rmSync(pasta, { recursive: true, force: true });
  await gravarMetadados();
  const v = verificar();
  if (!v.ok) throw new Error(v.erro);
  log(v.versao);
  if (v.filtrosFaltando.length) log('aviso: filtros ausentes no build: ' + v.filtrosFaltando.join(', '));
  return { ok: true, embutido: true, ...v };
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[ferramentas] ERRO: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}

module.exports = { main, DESTINO };
