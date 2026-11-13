#!/usr/bin/env node
'use strict';

/**
 * Construtor "Apps": gera APK Android (Capacitor) e instalador Windows,
 * publicando sempre uma cópia em %OneDrive%/APP.
 *
 * Uso:
 *   node scripts/apps/build.cjs --status
 *   node scripts/apps/build.cjs --tipo=apk
 *   node scripts/apps/build.cjs --tipo=win
 *   node scripts/apps/build.cjs --tipo=tudo
 *   node scripts/apps/build.cjs --publicar
 */
const { spawn, spawnSync } = require('node:child_process');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} = require('node:fs');
const { basename, join } = require('node:path');
const { homedir } = require('node:os');
const toolchain = require('./instalar-toolchain.cjs');

const RAIZ = join(__dirname, '..', '..');
const APP_MOBILE = join(RAIZ, 'apps', 'mobile');
const ANDROID = join(APP_MOBILE, 'android');
const DIST_APPS = join(RAIZ, 'dist-apps');
const DIST_WIN = join(RAIZ, 'dist-app');
const ONEDRIVE =
  process.env.DG_ONEDRIVE_APP ||
  join(process.env.OneDrive || join(homedir(), 'OneDrive'), 'APP');
const GRADLE = join(ANDROID, 'gradlew.bat');
const CAP_CLI = join(APP_MOBILE, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');

function log(msg) {
  console.log('[apps] ' + msg);
}

function versaoApp() {
  try {
    return JSON.parse(readFileSync(join(APP_MOBILE, 'package.json'), 'utf8')).version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function executar(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const cwd = opts.cwd || RAIZ;
    const janela = opts.silencioso ? 'ignore' : 'inherit';
    log('> ' + basename(bin) + ' ' + args.join(' '));
    const p = spawn(bin, args, {
      cwd,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ['ignore', janela, janela]
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(basename(bin) + ' saiu com código ' + code));
    });
  });
}

/** Executa .bat/.cmd no Windows via shell (cmd.exe). */
function executarCmd(linha, opts = {}) {
  return new Promise((resolve, reject) => {
    log('> ' + linha);
    const janela = opts.silencioso ? 'ignore' : 'inherit';
    const p = spawn(linha, {
      cwd: opts.cwd || RAIZ,
      env: { ...process.env, ...(opts.env || {}) },
      shell: true,
      stdio: ['ignore', janela, janela]
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('comando saiu com código ' + code + ': ' + linha));
    });
  });
}

function copiar(origem, destinoDir) {
  mkdirSync(destinoDir, { recursive: true });
  const destino = join(destinoDir, basename(origem));
  copyFileSync(origem, destino);
  log('copiado: ' + destino + ' (' + Math.round(statSync(destino).size / 1024) + ' KB)');
  return destino;
}

function artefatos(dir, tipo) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => (tipo === 'apk' ? /\.apk$/i : /\.exe$/i).test(f))
    .map((f) => {
      const caminho = join(dir, f);
      const st = statSync(caminho);
      return { nome: f, caminho, bytes: st.size, atualizadoEm: st.mtime.toISOString() };
    })
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

function status() {
  const s = toolchain.status();
  return {
    ok: s.ok,
    android: s,
    mobile: {
      projeto: existsSync(APP_MOBILE),
      dependencias: existsSync(CAP_CLI),
      androidGerado: existsSync(ANDROID)
    },
    versao: versaoApp(),
    distApps: DIST_APPS,
    oneDrive: ONEDRIVE,
    apk: artefatos(DIST_APPS, 'apk'),
    instaladores: artefatos(DIST_WIN, 'exe'),
    publicados: [...artefatos(ONEDRIVE, 'apk'), ...artefatos(ONEDRIVE, 'exe')]
  };
}

async function prepararMobile() {
  if (!existsSync(CAP_CLI)) {
    log('instalando dependências do app mobile...');
    if (process.platform === 'win32') {
      await executarCmd('npm install --no-audit --no-fund', { cwd: APP_MOBILE });
    } else {
      await executar('npm', ['install', '--no-audit', '--no-fund'], { cwd: APP_MOBILE });
    }
  }
  if (!existsSync(ANDROID)) {
    log('gerando projeto Android (Capacitor)...');
    await executar(process.execPath, [CAP_CLI, 'add', 'android'], { cwd: APP_MOBILE });
  }
  const sdk = toolchain.sdkDir().replace(/\\/g, '/');
  writeFileSync(join(ANDROID, 'local.properties'), 'sdk.dir=' + sdk + '\n', 'utf8');
  aplicarVersaoAndroid();

  await executar(process.execPath, [CAP_CLI, 'sync', 'android'], { cwd: APP_MOBILE });
  aplicarIcones();
}

/** Mantém versionCode/versionName do APK iguais à versão de apps/mobile/package.json. */
function aplicarVersaoAndroid() {
  const gradle = join(ANDROID, 'app', 'build.gradle');
  if (!existsSync(gradle)) return;
  const versao = versaoApp();
  const partes = versao.split(/[.-]/).map((x) => Number(x) || 0);
  const code = (partes[0] || 0) * 10000 + (partes[1] || 0) * 100 + (partes[2] || 0);
  let txt = readFileSync(gradle, 'utf8');
  txt = txt.replace(/versionCode\s+\d+/, 'versionCode ' + code);
  txt = txt.replace(/versionName\s+"[^"]*"/, 'versionName "' + versao + '"');
  writeFileSync(gradle, txt, 'utf8');
  log('versão Android: ' + versao + ' (code ' + code + ')');
}

function aplicarIcones() {
  const fonte = join(RAIZ, 'resources', 'dg-editor-1024.png');
  if (!existsSync(fonte)) return;
  const densidades = {
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192
  };
  const frente = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [dens, lado] of Object.entries(densidades)) {
    const dir = join(ANDROID, 'app', 'src', 'main', 'res', 'mipmap-' + dens);
    if (!existsSync(dir)) continue;
    for (const nome of ['ic_launcher.png', 'ic_launcher_round.png']) {
      const destino = join(dir, nome);
      const r = spawnSync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-i', fonte, '-vf', 'scale=' + lado + ':' + lado, '-frames:v', '1', destino],
        { encoding: 'utf8' }
      );
      if (r.status !== 0) log('aviso: ícone ' + nome + ' (' + dens + ') não gerado');
    }
    const ladoFg = frente[dens];
    const fg = join(dir, 'ic_launcher_foreground.png');
    const vf =
      'scale=' + Math.round(ladoFg * 0.62) + ':' + Math.round(ladoFg * 0.62) +
      ':force_original_aspect_ratio=decrease,' +
      'pad=' + ladoFg + ':' + ladoFg + ':(ow-iw)/2:(oh-ih)/2:color=0x00000000';
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fonte, '-vf', vf, '-frames:v', '1', fg], {
      encoding: 'utf8'
    });
  }
}

function validarApk(arquivo) {
  const sdk = toolchain.sdkDir();
  const aapt2 = join(sdk, 'build-tools', '35.0.0', 'aapt2.exe');
  const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const info = { ok: false, pacote: '', versao: '', bytes: statSync(arquivo).size };
  if (existsSync(aapt2)) {
    const r = spawnSync(aapt2, ['dump', 'badging', arquivo], { encoding: 'utf8' });
    const txt = String(r.stdout || '');
    const pac = txt.match(/package: name='([^']+)'/);
    const ver = txt.match(/versionName='([^']+)'/);
    if (r.status === 0 && pac) {
      info.ok = true;
      info.pacote = pac[1];
      info.versao = ver ? ver[1] : '';
    }
  }
  if (!info.ok && existsSync(tar)) {
    const r = spawnSync(tar, ['-tf', arquivo], { encoding: 'utf8' });
    const txt = String(r.stdout || '');
    info.ok = r.status === 0 && txt.includes('classes.dex') && txt.includes('AndroidManifest.xml');
  }
  if (!info.ok) throw new Error('APK inválido ou ilegível: ' + arquivo);
  return info;
}

async function buildApk() {
  if (!toolchain.status().ok) {
    log('toolchain Android ausente; instalando...');
    await toolchain.instalar();
  }
  await prepararMobile();
  const env = {
    ANDROID_HOME: toolchain.sdkDir(),
    ANDROID_SDK_ROOT: toolchain.sdkDir()
  };
  const homeJava = toolchain.javaHome();
  if (homeJava) env.JAVA_HOME = homeJava;
  log('compilando APK (Gradle)...');
  await executarCmd('"' + GRADLE + '" --no-daemon assembleDebug', { cwd: ANDROID, env });

  const original = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!existsSync(original)) throw new Error('APK não encontrado em ' + original);
  mkdirSync(DIST_APPS, { recursive: true });
  const destino = join(DIST_APPS, 'DG-Apps-' + versaoApp() + '.apk');
  rmSync(destino, { force: true });
  copyFileSync(original, destino);
  const info = validarApk(destino);
  log('APK válido: ' + info.pacote + ' v' + info.versao + ' (' + Math.round(info.bytes / 1024) + ' KB)');
  copiar(destino, ONEDRIVE);
  return { tipo: 'apk', caminho: destino, ...info };
}

async function buildWin() {
  log('gerando instalador e portátil Windows...');
  if (process.platform === 'win32') {
    await executarCmd('npm run dist:win:installer', { cwd: RAIZ });
  } else {
    await executar('npm', ['run', 'dist:win:installer'], { cwd: RAIZ });
  }
  const exes = artefatos(DIST_WIN, 'exe');
  if (!exes.length) throw new Error('nenhum .exe gerado em ' + DIST_WIN);
  const publicados = exes.map((e) => copiar(e.caminho, ONEDRIVE));
  return { tipo: 'win', artefatos: exes, publicados };
}

function publicarExistentes() {
  const arquivos = [...artefatos(DIST_APPS, 'apk'), ...artefatos(DIST_WIN, 'exe')];
  if (!arquivos.length) throw new Error('nada para publicar; rode o build antes');
  const destinos = arquivos.map((a) => copiar(a.caminho, ONEDRIVE));
  return { ok: true, destinos };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    return;
  }
  if (args.includes('--setup')) {
    const s = await toolchain.instalar();
    console.log(JSON.stringify({ ok: true, status: s }, null, 2));
    return;
  }
  if (args.includes('--publicar')) {
    console.log(JSON.stringify(publicarExistentes(), null, 2));
    return;
  }
  const tipoArg = args.find((a) => a.startsWith('--tipo='));
  const tipo = tipoArg ? tipoArg.split('=')[1] : 'tudo';
  mkdirSync(DIST_APPS, { recursive: true });
  mkdirSync(ONEDRIVE, { recursive: true });

  const resultado = {};
  if (tipo === 'apk' || tipo === 'tudo') resultado.apk = await buildApk();
  if (tipo === 'win' || tipo === 'tudo') resultado.win = await buildWin();
  if (!resultado.apk && !resultado.win) throw new Error('tipo inválido: ' + tipo);
  // Dossiê reflete versões e artefatos recém-gerados.
  spawnSync(process.execPath, [join(RAIZ, 'scripts', 'dossie.cjs')], { cwd: RAIZ, stdio: 'inherit' });
  console.log(JSON.stringify({ ok: true, ...resultado, oneDrive: ONEDRIVE }, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[apps] ERRO: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  });
}

module.exports = { status, buildApk, buildWin, publicarExistentes, DIST_APPS, ONEDRIVE };
