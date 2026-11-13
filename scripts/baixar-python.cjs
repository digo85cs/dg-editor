#!/usr/bin/env node
'use strict';

/**
 * Baixa um Python portátil (python-build-standalone) para resources/python e
 * instala os pacotes gratuitos usados pela suíte de mídia, para que narração,
 * vozes locais e transcrição funcionem em um PC sem Python instalado.
 *
 * Uso:
 *   node scripts/baixar-python.cjs
 *   node scripts/baixar-python.cjs --forcar
 */
const { spawnSync } = require('node:child_process');
const { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RAIZ = join(__dirname, '..');
const DESTINO = join(RAIZ, 'resources', 'python');
const PY = join(DESTINO, 'python.exe');
const MARCADOR = join(DESTINO, '.dg-pronto.json');
const CACHE = join(tmpdir(), 'dg-editor-python-cache');
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

const GRUPOS = [
  { nome: 'essenciais', pacotes: ['edge-tts'], obrigatorio: true },
  { nome: 'transcricao', pacotes: ['faster-whisper'], obrigatorio: false },
  { nome: 'vozes-locais', pacotes: ['kokoro-onnx', 'piper-tts', 'supertonic'], obrigatorio: false }
];

function log(msg) {
  console.log('[python] ' + msg);
}

function rodar(bin, args, timeout = 600000) {
  return spawnSync(bin, args, { encoding: 'utf8', timeout, env: { ...process.env, PIP_NO_INPUT: '1' } });
}

function versaoPython() {
  if (!existsSync(PY)) return null;
  const r = rodar(PY, ['--version'], 30000);
  if (r.status !== 0) return null;
  return String(r.stdout || r.stderr || '').trim();
}

function pacoteInstalado(nome) {
  const r = rodar(PY, ['-m', 'pip', 'show', nome], 60000);
  if (r.status !== 0) return null;
  const m = String(r.stdout || '').match(/^Version:\s*(.+)$/m);
  return m ? m[1].trim() : 'instalado';
}

async function assetPython() {
  const res = await fetch('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest', {
    headers: { 'User-Agent': 'DG-Editor-build' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ao consultar python-build-standalone');
  const j = await res.json();
  const alvo = (j.assets || []).find((a) =>
    /cpython-3\.12\.\d+\+\d+-x86_64-pc-windows-msvc-install_only\.tar\.gz$/.test(a.name)
  );
  if (!alvo) throw new Error('asset do Python portátil não encontrado na release ' + j.tag_name);
  return { url: alvo.browser_download_url, nome: alvo.name };
}

async function baixar(url, destino) {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(destino) && statSync(destino).size > 15 * 1024 * 1024) {
    log('usando download em cache: ' + destino);
    return;
  }
  log('baixando ' + url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status + ' ao baixar Python');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
  if (statSync(destino).size < 15 * 1024 * 1024) throw new Error('download do Python incompleto');
}

function extrair(arquivo) {
  rmSync(DESTINO, { recursive: true, force: true });
  mkdirSync(join(RAIZ, 'resources'), { recursive: true });
  const r = spawnSync(TAR, ['-xzf', arquivo, '-C', join(RAIZ, 'resources')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('não foi possível extrair o Python: ' + (r.stderr || '').slice(0, 300));
  if (!existsSync(PY)) throw new Error('python.exe não encontrado após extrair');
}

function garantirPip() {
  if (pacoteInstalado('pip')) return true;
  log('instalando pip no Python portátil...');
  let r = rodar(PY, ['-m', 'ensurepip', '--upgrade'], 300000);
  if (r.status === 0) return true;
  const getPip = join(CACHE, 'get-pip.py');
  if (!existsSync(getPip)) {
    const dl = spawnSync('curl', ['-sSL', '-o', getPip, 'https://bootstrap.pypa.io/get-pip.py'], { encoding: 'utf8' });
    if (dl.status !== 0) throw new Error('falha ao baixar get-pip.py');
  }
  r = rodar(PY, [getPip, '--disable-pip-version-check', '--no-input'], 600000);
  if (r.status !== 0) throw new Error('falha ao instalar pip: ' + (r.stderr || '').slice(0, 300));
  return true;
}

function instalar(pacotes) {
  const r = rodar(
    PY,
    ['-m', 'pip', 'install', '--no-cache-dir', '--disable-pip-version-check', '--no-input', '--prefer-binary', ...pacotes],
    1800000
  );
  return { ok: r.status === 0, saida: String(r.stdout || '') + String(r.stderr || '') };
}

async function main() {
  if (process.platform !== 'win32') {
    log('plataforma ' + process.platform + ': Python portátil só é embutido no Windows.');
    return { ok: true, embutido: false };
  }
  if (existsSync(MARCADOR) && !process.argv.includes('--forcar')) {
    const estado = JSON.parse(readFileSync(MARCADOR, 'utf8'));
    log('Python portátil já embutido (' + (estado.versao || '?') + '), pacotes: ' + Object.keys(estado.pacotes || {}).join(', '));
    return { ok: true, embutido: true, ...estado };
  }

  if (!existsSync(PY)) {
    const asset = await assetPython();
    const arquivo = join(CACHE, basename(asset.nome));
    await baixar(asset.url, arquivo);
    extrair(arquivo);
  }
  const versao = versaoPython();
  if (!versao) throw new Error('python.exe embutido não executa');
  log(versao);
  garantirPip();

  const pacotes = {};
  const falhas = [];
  for (const grupo of GRUPOS) {
    const faltando = grupo.pacotes.filter((p) => !pacoteInstalado(p));
    if (!faltando.length) {
      for (const p of grupo.pacotes) pacotes[p] = pacoteInstalado(p);
      log(grupo.nome + ': já instalado');
      continue;
    }
    log(grupo.nome + ': instalando ' + faltando.join(', ') + '...');
    const r = instalar(faltando);
    if (!r.ok) {
      const motivo = (r.saida.match(/ERROR:.*$/m) || [r.saida.slice(-300)])[0];
      if (grupo.obrigatorio) throw new Error('falha ao instalar ' + faltando.join(', ') + ': ' + motivo);
      falhas.push({ grupo: grupo.nome, pacotes: faltando, motivo });
      log('aviso: ' + grupo.nome + ' indisponível: ' + motivo);
      continue;
    }
    for (const p of faltando) pacotes[p] = pacoteInstalado(p) || 'instalado';
    log(grupo.nome + ': pronto');
  }

  const estado = { versao, pacotes, falhas, em: new Date().toISOString() };
  writeFileSync(MARCADOR, JSON.stringify(estado, null, 2), 'utf8');
  log('Python portátil pronto em ' + DESTINO);
  if (falhas.length) log('grupos com falha (o app degrada sem eles): ' + falhas.map((f) => f.grupo).join(', '));
  return { ok: true, embutido: true, ...estado };
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[python] ERRO: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}

module.exports = { main, DESTINO };
