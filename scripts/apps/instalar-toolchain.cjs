#!/usr/bin/env node
'use strict';

/**
 * Instala o toolchain Android sem Android Studio:
 * cmdline-tools -> platform-tools + platforms;android-35 + build-tools;35.0.0.
 * Tudo fora do repositório em %LOCALAPPDATA%/dg-editor/android-sdk.
 */
const { spawn, spawnSync } = require('node:child_process');
const { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { homedir } = require('node:os');
const https = require('node:https');

const RAIZ = join(__dirname, '..', '..');
const CMDLINE_URL =
  process.env.DG_CMDLINE_TOOLS_URL ||
  'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
// Capacitor 7 compila com source/target 21; Temurin 21 e gratuito e portatil.
const JDK_URL =
  process.env.DG_JDK_URL ||
  'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse';
const JAVA_MINIMO = 21;
const PACOTES = ['platform-tools', 'platforms;android-35', 'build-tools;35.0.0'];

function sdkDir() {
  return (
    process.env.DG_ANDROID_SDK ||
    (process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'dg-editor', 'android-sdk')
      : join(homedir(), '.dg-editor', 'android-sdk'))
  );
}

function marcador() {
  return join(sdkDir(), '.dg-toolchain.json');
}

function jdkDir() {
  return process.env.DG_JAVA_HOME || join(dirname(sdkDir()), 'jdk-21');
}

function log(msg) {
  console.log('[apps:toolchain] ' + msg);
}

function lerJava(bin, origem) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  const txt = String((r.stderr || '') + (r.stdout || ''));
  const m = txt.match(/version "(\d+)(?:\.(\d+))?/);
  if (r.status !== 0 || !m) return null;
  const major = Number(m[1]);
  return {
    versao: txt.split(/\r?\n/)[0].trim(),
    major,
    ok: major >= JAVA_MINIMO,
    origem
  };
}

function javaOk() {
  const embutido = join(jdkDir(), 'bin', 'java.exe');
  if (existsSync(embutido)) {
    const j = lerJava(embutido, 'embutido');
    if (j) return j;
  }
  const sistema = lerJava('java', 'sistema');
  if (sistema) return sistema;
  return null;
}

function javaHome() {
  return existsSync(join(jdkDir(), 'bin', 'java.exe')) ? jdkDir() : process.env.JAVA_HOME || '';
}

async function instalarJava21() {
  const atual = javaOk();
  if (atual && atual.ok) return atual;
  if (process.platform !== 'win32') {
    throw new Error('instale o JDK 21 manualmente (JAVA_HOME) e rode de novo.');
  }
  const destino = jdkDir();
  log('JDK 21 ausente (atual: ' + (atual ? atual.versao : 'nenhum') + '); baixando Temurin 21...');
  const zip = destino + '.zip';
  await baixar(JDK_URL, zip);
  const tmp = destino + '.tmp';
  rmSync(tmp, { recursive: true, force: true });
  log('extraindo JDK 21...');
  extrair(zip, tmp);
  const pastas = require('node:fs').readdirSync(tmp, { withFileTypes: true }).filter((d) => d.isDirectory());
  const raiz = pastas.find((d) => existsSync(join(tmp, d.name, 'bin', 'java.exe')));
  if (!raiz) throw new Error('pacote do JDK 21 nao contem bin/java.exe');
  rmSync(destino, { recursive: true, force: true });
  renameSync(join(tmp, raiz.name), destino);
  rmSync(tmp, { recursive: true, force: true });
  rmSync(zip, { force: true });
  const novo = javaOk();
  if (!novo || !novo.ok) throw new Error('JDK 21 instalado mas nao executou: ' + destino);
  log('JDK 21 pronto: ' + destino);
  return novo;
}

function baixar(url, destino, redirecionamentos = 0) {
  return new Promise((resolve, reject) => {
    if (redirecionamentos > 5) return reject(new Error('muitos redirecionamentos'));
    const req = https.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        baixar(res.headers.location, destino, redirecionamentos + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' em ' + url));
        return;
      }
      mkdirSync(dirname(destino), { recursive: true });
      const total = Number(res.headers['content-length'] || 0);
      let baixado = 0;
      let ultimo = 0;
      const out = createWriteStream(destino);
      res.on('data', (chunk) => {
        baixado += chunk.length;
        if (total && Date.now() - ultimo > 3000) {
          ultimo = Date.now();
          log('baixando ' + Math.round((baixado / total) * 100) + '% (' + Math.round(total / 1048576) + ' MB)');
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(destino)));
      out.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout no download')));
    req.on('error', reject);
  });
}

function extrair(zip, destino) {
  mkdirSync(destino, { recursive: true });
  const tarWindows = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const bin = existsSync(tarWindows) ? tarWindows : 'tar';
  const r = spawnSync(bin, ['-xf', zip, '-C', destino], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('falha ao extrair: ' + (r.stderr || r.error || 'tar'));
}

function acharSdkManager() {
  return join(sdkDir(), 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
}

function rodarSdk(argumentos, entrada) {
  return new Promise((resolve, reject) => {
    const bin = acharSdkManager();
    const env = {
      ...process.env,
      ANDROID_HOME: sdkDir(),
      ANDROID_SDK_ROOT: sdkDir()
    };
    // .bat no Windows só executa via shell (cmd.exe)
    const p = spawn(bin, argumentos, {
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let saida = '';
    p.stdout.on('data', (d) => {
      saida += d;
      process.stdout.write(String(d));
    });
    p.stderr.on('data', (d) => {
      saida += d;
      process.stderr.write(String(d));
    });
    if (entrada) p.stdin.end(entrada);
    else p.stdin.end();
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(saida);
      else reject(new Error('sdkmanager saiu com código ' + code));
    });
  });
}

function status() {
  const sdk = sdkDir();
  const java = javaOk();
  let instalado = false;
  try {
    const j = JSON.parse(readFileSync(marcador(), 'utf8'));
    instalado = j.ok === true && PACOTES.every((p) => (j.pacotes || []).includes(p));
  } catch {
    /* sem marcador */
  }
  return {
    ok: !!(java && java.ok && instalado),
    sdk,
    java,
    javaHome: javaHome(),
    jdk: jdkDir(),
    sdkmanager: existsSync(acharSdkManager()),
    pacotes: PACOTES,
    cmdlineTools: existsSync(acharSdkManager())
  };
}

async function instalar() {
  const java = await instalarJava21();

  const sdk = sdkDir();
  mkdirSync(sdk, { recursive: true });
  if (!existsSync(acharSdkManager())) {
    const zip = join(sdk, 'cmdline-tools.zip');
    if (!existsSync(zip) || statSync(zip).size < 50 * 1048576) {
      log('baixando Android cmdline-tools...');
      await baixar(CMDLINE_URL, zip);
    } else {
      log('reaproveitando download existente');
    }
    const tmp = join(sdk, '.extrair');
    rmSync(tmp, { recursive: true, force: true });
    log('extraindo...');
    extrair(zip, tmp);
    const origem = existsSync(join(tmp, 'cmdline-tools'))
      ? join(tmp, 'cmdline-tools')
      : join(tmp, 'cmdline-tools', 'latest');
    const destino = join(sdk, 'cmdline-tools', 'latest');
    rmSync(destino, { recursive: true, force: true });
    mkdirSync(dirname(destino), { recursive: true });
    renameSync(origem, destino);
    rmSync(tmp, { recursive: true, force: true });
    rmSync(zip, { force: true });
    log('cmdline-tools instalado em ' + destino);
  } else {
    log('cmdline-tools já instalado');
  }

  log('aceitando licenças...');
  await rodarSdk(['--sdk_root=' + sdk, '--licenses'], Array(40).fill('y').join('\n') + '\n');

  log('instalando ' + PACOTES.join(', ') + '...');
  await rodarSdk(['--sdk_root=' + sdk, ...PACOTES]);
  writeFileSync(
    marcador(),
    JSON.stringify(
      { ok: true, instaladoEm: new Date().toISOString(), java: java.versao, javaHome: javaHome(), pacotes: PACOTES },
      null,
      2
    )
  );
  log('toolchain pronto: ' + sdk);
  return status();
}

if (require.main === module) {
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    process.exit(status().ok ? 0 : 1);
  }
  instalar()
    .then((s) => {
      console.log(JSON.stringify({ ok: true, status: s }, null, 2));
    })
    .catch((e) => {
      console.error('[apps:toolchain] ERRO: ' + (e && e.message ? e.message : e));
      process.exit(1);
    });
}

module.exports = { sdkDir, jdkDir, javaHome, status, instalar, javaOk, PACOTES, RAIZ };
