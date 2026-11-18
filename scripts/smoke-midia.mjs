var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/raiz-canonica.ts
var RAIZ_WINDOWS_DEV, RAIZ_WINDOWS_CANONICA;
var init_raiz_canonica = __esm({
  "src/shared/raiz-canonica.ts"() {
    "use strict";
    RAIZ_WINDOWS_DEV = "C:\\dev\\DGEditor";
    RAIZ_WINDOWS_CANONICA = RAIZ_WINDOWS_DEV;
  }
});

// scripts/electron-stub.mjs
var electron_stub_exports = {};
__export(electron_stub_exports, {
  BrowserWindow: () => BrowserWindow,
  Menu: () => Menu,
  Notification: () => Notification,
  Tray: () => Tray,
  app: () => app,
  clipboard: () => clipboard,
  default: () => electron_stub_default,
  dialog: () => dialog,
  ipcMain: () => ipcMain,
  nativeTheme: () => nativeTheme,
  safeStorage: () => safeStorage,
  session: () => session,
  shell: () => shell
});
var safeStorage, app, ipcMain, BrowserWindow, shell, dialog, session, nativeTheme, Tray, Menu, Notification, clipboard, electron_stub_default;
var init_electron_stub = __esm({
  "scripts/electron-stub.mjs"() {
    "use strict";
    safeStorage = {
      isEncryptionAvailable: () => false,
      encryptString: (s) => Buffer.from(s, "utf8"),
      decryptString: (b) => b.toString("utf8")
    };
    app = {
      getPath: (nome) => nome === "userData" && process.env.DG_USERDATA ? process.env.DG_USERDATA : nome === "temp" ? __require("node:os").tmpdir() : process.cwd(),
      getName: () => "dg-editor-smoke",
      isPackaged: false
    };
    ipcMain = { handle: () => {
    }, on: () => {
    } };
    BrowserWindow = class {
    };
    shell = { openPath: async () => "", openExternal: async () => {
    } };
    dialog = {};
    session = { defaultSession: { webRequest: { onBeforeSendHeaders: () => {
    } } } };
    nativeTheme = { shouldUseDarkColors: false };
    Tray = class {
    };
    Menu = { buildFromTemplate: () => ({}) };
    Notification = class {
    };
    clipboard = { writeText: () => {
    }, readText: () => "" };
    electron_stub_default = { safeStorage, app, ipcMain, BrowserWindow, shell, dialog, session, nativeTheme, Tray, Menu, Notification, clipboard };
  }
});

// src/main/paths.ts
import { resolve, join, isAbsolute, relative, normalize } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";
function resolverRaizDGEditor() {
  const dgRoot = process.env.DG_ROOT;
  if (dgRoot && isAbsolute(dgRoot)) {
    return resolve(dgRoot);
  }
  if (!process.defaultApp && typeof process.resourcesPath === "string" && process.resourcesPath) {
    return getUserDataPath();
  }
  if (process.platform === "win32") {
    if (existsSync(RAIZ_WINDOWS_CANONICA))
      return resolve(RAIZ_WINDOWS_CANONICA);
    if (existsSync("D:\\CURSOR\\DG Editor"))
      return resolve("D:\\CURSOR\\DG Editor");
  }
  const homePath = join(homedir(), "DG Editor");
  if (existsSync(homePath)) {
    return resolve(homePath);
  }
  return resolve(process.cwd());
}
function resolveFromRaiz(...caminhos) {
  return resolve(resolverRaizDGEditor(), ...caminhos);
}
function getLogsDir() {
  return resolveFromRaiz(".dg-editor", "logs");
}
function getUserDataPath() {
  try {
    const { app: app2 } = (init_electron_stub(), __toCommonJS(electron_stub_exports));
    if (app2 && typeof app2.getPath === "function") {
      const p = app2.getPath("userData");
      if (p)
        return p;
    }
  } catch {
  }
  const envDir = process.env.DG_USERDATA;
  if (envDir)
    return envDir;
  return join(homedir(), ".dg-editor", "userdata");
}
function userDataDir() {
  return getUserDataPath();
}
function logDir() {
  const dir = getLogsDir();
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true });
  return dir;
}
function caminhoDentroDaRaiz(raiz, alvo) {
  const abs = isAbsolute(alvo) ? normalize(resolve(alvo)) : normalize(resolve(raiz, alvo));
  const rel = relative(raiz, abs).replace(/\\/g, "/");
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("caminho fora da raiz do projeto: " + alvo);
  }
  return { abs, rel };
}
var init_paths = __esm({
  "src/main/paths.ts"() {
    "use strict";
    init_raiz_canonica();
    init_raiz_canonica();
  }
});

// src/main/midia/vozes.ts
var SCRIPT_SONDAR;
var init_vozes = __esm({
  "src/main/midia/vozes.ts"() {
    "use strict";
    SCRIPT_SONDAR = String.raw`import json
mods = {}
for nome in ("kokoro_onnx", "supertonic", "piper", "edge_tts"):
    try:
        m = __import__(nome)
        mods[nome] = getattr(m, "__version__", "ok")
    except Exception as e:
        mods[nome] = None
print(json.dumps(mods))
`;
  }
});

// src/main/midia/cloudflare.ts
var cloudflare_exports = {};
__export(cloudflare_exports, {
  cfConfigurado: () => cfConfigurado,
  gerarImagemCF: () => gerarImagemCF
});
import { writeFileSync } from "node:fs";
function credenciais() {
  const token = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
  const conta = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  return token && conta ? { token, conta } : null;
}
function cfConfigurado() {
  return !!credenciais();
}
async function gerarImagemCF(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt" };
  const cred = credenciais();
  if (!cred) {
    return {
      ok: false,
      erro: "CLOUDFLARE_API_TOKEN/ACCOUNT_ID n\xE3o configurados. Crie gr\xE1tis no dash.cloudflare.com (Workers AI \u2192 Edit)."
    };
  }
  const modelo = (opts.modelo || MODELO_PADRAO).trim();
  const url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cred.conta) + "/ai/run/" + modelo.split("/").map(encodeURIComponent).join("/");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + cred.token, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 2e3), steps: opts.passos || 4 }),
      signal: AbortSignal.timeout(18e4)
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok)
      return { ok: false, erro: "Cloudflare HTTP " + res.status + ": " + txt.slice(0, 300) };
    let dados = null;
    try {
      dados = JSON.parse(txt);
    } catch {
    }
    const b64 = dados?.result?.image;
    if (!b64) {
      if (txt.length > 1e3 && !txt.trimStart().startsWith("{")) {
        const buf2 = Buffer.from(txt, "binary");
        const destino2 = destinoArquivo(raiz, nomeArquivo("cf-imagem", ".jpg"), opts.saida);
        writeFileSync(destino2, buf2);
        return {
          ok: true,
          caminho: destino2,
          caminhoRel: caminhoRelativo(raiz, destino2),
          bytes: buf2.length,
          mime: "image/jpeg",
          previewBase64: previewDe(destino2),
          aviso: "Imagem via Cloudflare Workers AI (free tier).",
          detalhes: { motor: "cloudflare-workers-ai", modelo }
        };
      }
      return { ok: false, erro: "Cloudflare respondeu sem imagem: " + txt.slice(0, 300) };
    }
    const buf = Buffer.from(b64, "base64");
    if (!buf.length)
      return { ok: false, erro: "Cloudflare retornou imagem vazia" };
    const destino = destinoArquivo(raiz, nomeArquivo("cf-imagem", ".jpg"), opts.saida);
    writeFileSync(destino, buf);
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime: "image/jpeg",
      previewBase64: previewDe(destino),
      aviso: "Imagem via Cloudflare Workers AI (free tier ~10k neur\xF4nios/dia).",
      detalhes: { motor: "cloudflare-workers-ai", modelo }
    };
  } catch (e) {
    return { ok: false, erro: "Cloudflare falhou: " + (e instanceof Error ? e.message : String(e)) };
  }
}
var MODELO_PADRAO;
var init_cloudflare = __esm({
  "src/main/midia/cloudflare.ts"() {
    "use strict";
    init_core();
    MODELO_PADRAO = "@cf/black-forest-labs/flux-1-schnell";
  }
});

// src/main/midia/core.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname, extname, join as join2, relative as relative2, resolve as resolve2 } from "node:path";
import { tmpdir } from "node:os";
import { homedir as homedir2 } from "node:os";
function pastaFerramentasUsuario() {
  const custom = process.env.DG_FERRAMENTAS_DIR;
  if (custom && custom.trim())
    return custom.trim();
  const base = process.env.LOCALAPPDATA ? join2(process.env.LOCALAPPDATA, "dg-editor") : join2(homedir2(), ".dg-editor");
  return join2(base, "ferramentas");
}
function pythonBin() {
  const custom = process.env.DG_PYTHON;
  if (custom && custom.trim())
    return custom.trim();
  const rp = process.resourcesPath;
  const candidatos = [
    join2(pastaFerramentasUsuario(), "python", "python.exe"),
    ...typeof rp === "string" && rp ? [join2(rp, "python", "python.exe")] : [],
    join2(process.cwd(), "resources", "python", "python.exe"),
    join2(__dirname, "..", "..", "resources", "python", "python.exe")
  ];
  for (const p of candidatos)
    if (existsSync2(p))
      return p;
  return "python";
}
function clampNum(valor, min, max, padrao) {
  const n = typeof valor === "number" && Number.isFinite(valor) ? valor : padrao;
  return Math.min(max, Math.max(min, n));
}
function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function slug(texto, max = 48) {
  const base = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "midia").slice(0, max).replace(/-+$/g, "") || "midia";
}
function nomeArquivo(prefixo, ext, quando = /* @__PURE__ */ new Date()) {
  const p = slug(prefixo, 40);
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = quando.getFullYear() + pad(quando.getMonth() + 1) + pad(quando.getDate()) + "-" + pad(quando.getHours()) + pad(quando.getMinutes()) + pad(quando.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6);
  const sufixo = !ext ? "" : ext.startsWith(".") ? ext : "." + ext;
  return p + "-" + stamp + "-" + rand + sufixo;
}
function pastaMidia(raiz) {
  const p = join2(resolve2(raiz), ".dg-editor", "midia");
  mkdirSync2(p, { recursive: true });
  return p;
}
function destinoArquivo(raiz, nome, saida) {
  const base = typeof saida === "string" ? saida.trim() : "";
  let alvo;
  if (!base)
    alvo = join2(pastaMidia(raiz), nome);
  else {
    const abs = resolve2(raiz, base);
    alvo = extname(abs) ? abs : join2(abs, nome);
  }
  const dentro = caminhoDentroDaRaiz(raiz, alvo);
  mkdirSync2(dirname(dentro.abs), { recursive: true });
  return dentro.abs;
}
function validarEntrada(caminho, tipos) {
  if (typeof caminho !== "string" || !caminho.trim())
    return "informe o caminho do arquivo";
  if (!existsSync2(caminho))
    return "arquivo n\xE3o encontrado: " + caminho;
  let st;
  try {
    st = statSync(caminho);
  } catch {
    return "arquivo inacess\xEDvel: " + caminho;
  }
  if (!st.isFile())
    return "o caminho n\xE3o \xE9 um arquivo: " + caminho;
  const ext = extname(caminho).toLowerCase();
  const ok = tipos === "imagem" && EXTS_IMAGEM.has(ext) || tipos === "video" && EXTS_VIDEO.has(ext) || tipos === "audio" && EXTS_AUDIO.has(ext) || tipos === "midia" && (EXTS_IMAGEM.has(ext) || EXTS_VIDEO.has(ext) || EXTS_AUDIO.has(ext));
  return ok ? null : "formato n\xE3o suportado (" + ext + ") para " + tipos;
}
function mimePorExt(ext) {
  const e = ext.toLowerCase();
  if (e === ".png")
    return "image/png";
  if (e === ".webp")
    return "image/webp";
  if (e === ".gif")
    return "image/gif";
  if (e === ".bmp")
    return "image/bmp";
  if (e === ".svg")
    return "image/svg+xml";
  if (e === ".mp4" || e === ".m4v")
    return "video/mp4";
  if (e === ".webm")
    return "video/webm";
  if (e === ".mov")
    return "video/quicktime";
  if (e === ".mp3")
    return "audio/mpeg";
  if (e === ".wav")
    return "audio/wav";
  if (e === ".m4a")
    return "audio/mp4";
  if (e === ".ogg")
    return "audio/ogg";
  return "image/jpeg";
}
function previewDe(caminho) {
  try {
    const st = statSync(caminho);
    if (!st.isFile() || st.size > LIMITE_PREVIEW)
      return void 0;
    return "data:" + mimePorExt(extname(caminho)) + ";base64," + readFileSync(caminho).toString("base64");
  } catch {
    return void 0;
  }
}
function caminhoRelativo(raiz, abs) {
  return relative2(resolve2(raiz), abs).replace(/\\/g, "/");
}
function rodar(binario, args, timeoutMs = 12e4, env = process.env) {
  return new Promise((finalizar) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(binario, args, { windowsHide: true, env });
    } catch (e) {
      finalizar({ ok: false, stdout, stderr, erro: e instanceof Error ? e.message : String(e) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
      finalizar({ ok: false, codigo: -1, stdout, stderr, erro: "timeout ap\xF3s " + Math.round(timeoutMs / 1e3) + "s" });
    }, timeoutMs);
    child.stdout?.on("data", (c) => {
      stdout += c.toString("utf8");
      if (stdout.length > 4e6)
        stdout = stdout.slice(-4e6);
    });
    child.stderr?.on("data", (c) => {
      stderr += c.toString("utf8");
      if (stderr.length > 4e6)
        stderr = stderr.slice(-4e6);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finalizar({ ok: false, stdout, stderr, erro: e.message });
    });
    child.on("close", (codigo) => {
      clearTimeout(timer);
      finalizar({ ok: codigo === 0, codigo: codigo ?? void 0, stdout, stderr });
    });
  });
}
async function baixarBinario(url, timeoutMs = 12e4) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "DG-Editor/0.2 (estudio-midia)", Accept: "image/*,text/plain,application/json,*/*" }
    });
    const mime = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 402 || res.status === 429) {
        const lim = extrairLimitePollinations(txt);
        return { ok: false, erro: lim.mensagem, codigo: "FREE_LIMIT", retrySegundos: lim.retrySegundos, status: res.status };
      }
      return { ok: false, erro: "HTTP " + res.status + " " + txt.slice(0, 200), status: res.status };
    }
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length === 0)
      return { ok: false, erro: "resposta vazia" };
    if (buffer.length > LIMITE_DOWNLOAD)
      return { ok: false, erro: "resposta grande demais (> " + Math.round(LIMITE_DOWNLOAD / 1024 / 1024) + " MB)" };
    return { ok: true, buffer, mime };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: /timeout|abort/i.test(msg) ? "tempo esgotado ao baixar" : msg };
  }
}
function extrairLimitePollinations(corpo) {
  try {
    const j = JSON.parse(corpo);
    const msg = String(j?.error?.message || j?.message || "");
    const m = /retry after\s+(\d+)\s*s/i.exec(msg);
    return { retrySegundos: m ? Number(m[1]) : void 0, mensagem: msg || "limite gratuito atingido" };
  } catch {
    return { mensagem: (corpo || "").slice(0, 200) || "limite gratuito atingido" };
  }
}
function urlPollinations(o) {
  const largura = Math.round(clampNum(o.largura, 64, 1536, 1024));
  const altura = Math.round(clampNum(o.altura, 64, 1536, 1024));
  const params = new URLSearchParams();
  params.set("width", String(largura));
  params.set("height", String(altura));
  params.set("nologo", "true");
  params.set("referrer", "dg-editor");
  if (typeof o.seed === "number" && Number.isFinite(o.seed))
    params.set("seed", String(Math.floor(o.seed)));
  if (o.modelo && o.modelo.trim())
    params.set("model", o.modelo.trim());
  return "https://image.pollinations.ai/prompt/" + encodeURIComponent(o.prompt.trim().slice(0, 1200)) + "?" + params.toString();
}
async function gerarImagem(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt" };
  if (prompt.length > 1200)
    return { ok: false, erro: "prompt muito longo (m\xE1x. 1200 caracteres)" };
  const url = urlPollinations(opts);
  const base = destinoArquivo(raiz, nomeArquivo(prompt, ".jpg"), opts.saida);
  let erro = "";
  let retrySegundos;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await baixarBinario(url, 18e4);
    if (r.ok && r.buffer) {
      const mime = r.mime || "image/jpeg";
      if (!/^image\//.test(mime))
        return { ok: false, erro: "resposta inesperada: " + mime };
      const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg";
      const destino = base.replace(/\.jpg$/i, ext);
      writeFileSync2(destino, r.buffer);
      return {
        ok: true,
        caminho: destino,
        caminhoRel: caminhoRelativo(raiz, destino),
        bytes: r.buffer.length,
        mime,
        previewBase64: previewDe(destino),
        aviso: "Gr\xE1tis via Pollinations (1 imagem a cada 45s por IP)."
      };
    }
    retrySegundos = r.retrySegundos;
    if (r.codigo === "FREE_LIMIT" && tentativa === 0 && opts.esperarLimite !== false && (retrySegundos || 0) <= 90) {
      await dormir((retrySegundos || 45) * 1e3);
      continue;
    }
    erro = r.erro || "falha ao gerar imagem";
    break;
  }
  return {
    ok: false,
    erro,
    codigo: "FREE_LIMIT",
    retrySegundos,
    aviso: retrySegundos ? "Aguarde " + retrySegundos + "s ou use o ComfyUI local (ilimitado)." : void 0
  };
}
async function transcreverCF(raiz, entrada, idioma, saida) {
  try {
    const { cfConfigurado: cfConfigurado2 } = await Promise.resolve().then(() => (init_cloudflare(), cloudflare_exports));
    if (!cfConfigurado2())
      return null;
    const abs = resolve2(raiz, entrada);
    if (!existsSync2(abs))
      return null;
    const buf = readFileSync(abs);
    const ext = extname(abs).toLowerCase() || ".mp3";
    const mime = ext === ".wav" ? "audio/wav" : ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";
    const fd = new FormData();
    fd.append("audio", new Blob([buf], { type: mime }), basename(abs));
    if (idioma !== "auto")
      fd.append("language", idioma);
    const token = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
    const conta = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
    const url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(conta) + "/ai/run/@cf/openai/whisper";
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd,
      signal: AbortSignal.timeout(3e5)
    });
    if (!res.ok)
      return null;
    const txt = await res.text();
    let dados = null;
    try {
      dados = JSON.parse(txt);
    } catch {
    }
    const texto = dados?.result?.text || dados?.result?.vtt || dados?.text || dados?.transcription || dados?.vtt || (dados && typeof dados === "object" ? void 0 : txt.trim());
    if (!texto)
      return null;
    const destino = destinoArquivo(raiz, nomeArquivo("transcricao-cf", ".txt"), saida);
    writeFileSync2(destino, String(texto), "utf8");
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: statSync(destino).size,
      mime: "text/plain",
      texto: String(texto).slice(0, 8e3),
      detalhes: { motor: "cloudflare-whisper", idioma },
      aviso: "Transcri\xE7\xE3o via Cloudflare Workers AI Whisper (free tier) \u2014 fallback do faster-whisper local."
    };
  } catch {
    return null;
  }
}
async function transcrever(raiz, opts) {
  const invalido = validarEntrada(opts.entrada, "midia");
  if (invalido)
    return { ok: false, erro: invalido };
  const modelo = ["tiny", "base", "small", "medium"].includes(String(opts.modelo)) ? String(opts.modelo) : "base";
  const idioma = opts.idioma && /^[a-z]{2,5}$/i.test(opts.idioma) ? opts.idioma : "auto";
  const destino = destinoArquivo(raiz, nomeArquivo("transcricao", ".srt"), opts.saida);
  const script = join2(tmpdir(), "dg-transcrever-v1.py");
  writeFileSync2(script, SCRIPT_WHISPER, "utf8");
  const r = await rodar(pythonBin(), [script, opts.entrada, destino, modelo, idioma], 18e5);
  if (!r.ok || !existsSync2(destino)) {
    const cf = await transcreverCF(raiz, opts.entrada, idioma, opts.saida);
    if (cf)
      return cf;
    return {
      ok: false,
      erro: "transcri\xE7\xE3o falhou (instale faster-whisper: pip install faster-whisper): " + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(" ")).slice(0, 400)
    };
  }
  let info = {};
  const linhas = r.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (linhas.length) {
    try {
      info = JSON.parse(linhas[linhas.length - 1]);
    } catch {
    }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: "text/plain",
    texto: (info.texto || "").slice(0, 8e3),
    duracaoSeg: typeof info.duracao === "number" ? +info.duracao.toFixed(2) : void 0,
    detalhes: { modelo, idioma: info.idioma || idioma },
    aviso: "Transcri\xE7\xE3o local gratuita (faster-whisper, CPU)."
  };
}
var LIMITE_PREVIEW, LIMITE_DOWNLOAD, EXTS_IMAGEM, EXTS_VIDEO, EXTS_AUDIO, SCRIPT_TTS, SCRIPT_WHISPER;
var init_core = __esm({
  "src/main/midia/core.ts"() {
    "use strict";
    init_paths();
    init_vozes();
    LIMITE_PREVIEW = 4 * 1024 * 1024;
    LIMITE_DOWNLOAD = 25 * 1024 * 1024;
    EXTS_IMAGEM = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
    EXTS_VIDEO = /* @__PURE__ */ new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
    EXTS_AUDIO = /* @__PURE__ */ new Set([".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"]);
    SCRIPT_TTS = String.raw`import json, os, sys, wave
engine = sys.argv[1]
cfg = json.loads(sys.argv[2])
out = sys.argv[3]
texto = cfg.get("texto", "")
estilo = cfg.get("estilo", "")
vel = float(cfg.get("velocidade", 1.0) or 1.0)
import numpy as np

def salvar(wav, sr):
    arr = np.asarray(wav, dtype=np.float32).reshape(-1)
    pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())
    return len(arr) / float(sr)

if engine == "kokoro":
    from kokoro_onnx import Kokoro
    k = Kokoro(cfg["modelo"], cfg["vozes"])
    audio, sr = k.create(texto, voice=estilo, speed=vel, lang="pt-br", sentence_pause=0.35, clause_pause=0.12)
    dur = salvar(audio, sr)
elif engine == "supertonic":
    os.environ.setdefault("SUPERTONIC_CACHE_DIR", cfg["cache"])
    from supertonic import TTS
    tts = TTS(auto_download=False)
    wav, _ = tts.synthesize(texto, voice_style=tts.get_voice_style(estilo), speed=vel, lang="pt")
    dur = salvar(wav, 44100)
elif engine == "piper":
    from piper import PiperVoice
    from piper.config import SynthesisConfig
    voz = PiperVoice.load(cfg["modelo"])
    syn = SynthesisConfig(length_scale=1.0 / max(0.6, min(1.6, vel)))
    with wave.open(out, "wb") as w:
        voz.synthesize_wav(texto, w, syn_config=syn)
    with wave.open(out, "rb") as w:
        dur = w.getnframes() / float(w.getframerate())
else:
    raise SystemExit("engine desconhecida: " + engine)
print(json.dumps({"ok": True, "dur": round(dur, 3)}))
`;
    SCRIPT_WHISPER = String.raw`import sys, json, os
from faster_whisper import WhisperModel

audio = sys.argv[1]
saida = sys.argv[2]
modelo = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "base"
idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] and sys.argv[4] != "auto" else None

def ts(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)

model = WhisperModel(modelo, device="cpu", compute_type="int8")
segmentos, info = model.transcribe(audio, language=idioma, vad_filter=True, beam_size=1)
linhas = []
textos = []
i = 1
for seg in segmentos:
    txt = (seg.text or "").strip()
    if not txt:
        continue
    textos.append(txt)
    linhas.append("%d\n%s --> %s\n%s\n" % (i, ts(seg.start), ts(seg.end), txt))
    i += 1
with open(saida, "w", encoding="utf-8") as f:
    f.write("\n".join(linhas))
print(json.dumps({
    "ok": True,
    "srt": saida,
    "texto": " ".join(textos),
    "idioma": getattr(info, "language", idioma or ""),
    "duracao": getattr(info, "duration", 0),
}))
`;
  }
});

// src/main/midia/hf-inferencia.ts
var hf_inferencia_exports = {};
__export(hf_inferencia_exports, {
  gerarImagemHF: () => gerarImagemHF,
  hfConfigurado: () => hfConfigurado
});
import { writeFileSync as writeFileSync3 } from "node:fs";
function chaveHF() {
  return (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "").trim() || null;
}
function hfConfigurado() {
  return !!chaveHF();
}
async function gerarImagemHF(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt" };
  const chave = chaveHF();
  if (!chave) {
    return {
      ok: false,
      erro: "HF_TOKEN n\xE3o configurada. Crie gr\xE1tis em huggingface.co/settings/tokens e salve em Contas \u2192 Provedores."
    };
  }
  const modelo = (opts.modelo || MODELO_PADRAO2).trim();
  const url = "https://router.huggingface.co/hf-inference/models/" + encodeURIComponent(modelo);
  const corpo = JSON.stringify({ inputs: prompt.slice(0, 1e3), parameters: { num_inference_steps: 4 } });
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
        body: corpo,
        signal: AbortSignal.timeout(18e4)
      });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && ct.startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length)
          return { ok: false, erro: "HF retornou imagem vazia" };
        const ext = ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ".jpg";
        const destino = destinoArquivo(raiz, nomeArquivo("hf-imagem", ext), opts.saida);
        writeFileSync3(destino, buf);
        return {
          ok: true,
          caminho: destino,
          caminhoRel: caminhoRelativo(raiz, destino),
          bytes: buf.length,
          mime: ct,
          previewBase64: previewDe(destino),
          aviso: "Imagem via HuggingFace Inference (free tier; requer HF_TOKEN).",
          detalhes: { motor: "huggingface", modelo }
        };
      }
      const txt = await res.text().catch(() => "");
      ultimoErro = "HTTP " + res.status + ": " + txt.slice(0, 200);
      if (res.status === 403) {
        ultimoErro += ' \u2014 token sem permiss\xE3o de Inference Providers; edite em huggingface.co/settings/tokens e marque "Inference Providers".';
        break;
      }
      if (res.status === 503 && /loading|starting/i.test(txt)) {
        await new Promise((r) => setTimeout(r, 1e4));
        continue;
      }
      break;
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  return { ok: false, erro: "HuggingFace falhou: " + ultimoErro };
}
var MODELO_PADRAO2;
var init_hf_inferencia = __esm({
  "src/main/midia/hf-inferencia.ts"() {
    "use strict";
    init_core();
    MODELO_PADRAO2 = "black-forest-labs/FLUX.1-schnell";
  }
});

// src/main/dglog.ts
import { appendFileSync, mkdirSync as mkdirSync3 } from "fs";
import { join as join3 } from "path";
function formatLinha(entry) {
  return JSON.stringify(entry, null, 0);
}
function dglog(msg, ctx, level = "info") {
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    msg,
    ...ctx ? { ctx } : {}
  };
  try {
    mkdirSync3(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, formatLinha(entry) + "\n", "utf-8");
  } catch {
  }
}
var LOG_DIR, LOG_FILE;
var init_dglog = __esm({
  "src/main/dglog.ts"() {
    "use strict";
    init_paths();
    LOG_DIR = logDir();
    LOG_FILE = join3(LOG_DIR, "dg-log.jsonl");
  }
});

// src/main/brain/providers-registry.ts
function desc(id, label, formato, baseUrl, opts) {
  const ref = opts.apiKeyRef ?? id;
  const envAuto = {
    openrouter: "OPENROUTER_API_KEY",
    gemini: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    together: "TOGETHER_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    mistral: "MISTRAL_API_KEY",
    deepinfra: "DEEPINFRA_API_KEY",
    novita: "NOVITA_API_KEY",
    hyperbolic: "HYPERBOLIC_API_KEY",
    sambanova: "SAMBANOVA_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    xai: "XAI_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    chutes: "CHUTES_API_KEY",
    arli: "ARLI_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    zai: "ZAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY"
  };
  return {
    id,
    label,
    formato,
    baseUrl,
    apiKeyRef: ref,
    apiKeyEnv: opts.apiKeyEnv || envAuto[ref],
    timeoutMs: opts.timeoutMs ?? 12e4,
    numPredict: opts.numPredict ?? 4096,
    tier: opts.tier,
    cotaDiaria: opts.cotaDiaria,
    cotaTokensDia: opts.cotaTokensDia,
    rpm: opts.rpm,
    fusoReset: opts.fusoReset,
    ordem: opts.ordem,
    modelos: opts.modelos,
    preco: opts.preco,
    ativo: opts.ativo ?? true
  };
}
function listarProviders() {
  return [...registro];
}
function obterProvider(id) {
  return registro.find((p) => p.id === id);
}
var OPENROUTER, CATALOGO_PROVIDERS, registro;
var init_providers_registry = __esm({
  "src/main/brain/providers-registry.ts"() {
    "use strict";
    OPENROUTER = "https://openrouter.ai/api/v1";
    CATALOGO_PROVIDERS = [
      // ---------------- TIER 1 — gratuitos prioritários ----------------
      desc(
        "openrouter-inkling",
        "OpenRouter \u2014 Free Tier Auto-Router (free)",
        "openai",
        OPENROUTER,
        {
          apiKeyRef: "openrouter",
          apiKeyEnv: "OPENROUTER_API_KEY",
          tier: 1,
          cotaDiaria: 50,
          rpm: 20,
          ordem: 5,
          modelos: [
            { id: "openrouter/free", contexto: 128e3, capacidades: ["chat", "codigo", "analise"] }
          ],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      ),
      desc(
        "openrouter-glm",
        "OpenRouter \u2014 Z.AI GLM 4.5 Air (free)",
        "openai",
        OPENROUTER,
        {
          apiKeyRef: "openrouter",
          apiKeyEnv: "OPENROUTER_API_KEY",
          tier: 1,
          cotaDiaria: 30,
          ordem: 6,
          modelos: [{ id: "z-ai/glm-4.5-air:free", capacidades: ["chat", "codigo", "analise"] }],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      ),
      desc(
        "openrouter-north",
        "OpenRouter \u2014 Cohere North Mini Code (free)",
        "openai",
        OPENROUTER,
        {
          apiKeyRef: "openrouter",
          apiKeyEnv: "OPENROUTER_API_KEY",
          tier: 1,
          cotaDiaria: 50,
          ordem: 7,
          modelos: [{ id: "cohere/north-mini-code:free", contexto: 256e3, capacidades: ["codigo", "analise"] }],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      ),
      desc(
        "openrouter-kimi",
        "OpenRouter \u2014 Moonshot Kimi K2.6 (free)",
        "openai",
        OPENROUTER,
        {
          apiKeyRef: "openrouter",
          apiKeyEnv: "OPENROUTER_API_KEY",
          tier: 1,
          cotaDiaria: 30,
          ordem: 8,
          modelos: [{ id: "moonshotai/kimi-k2.6:free", capacidades: ["chat", "codigo", "analise", "raciocinio"] }],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      ),
      desc(
        "cloudflare-workers-ai",
        "Cloudflare Workers AI (free tier)",
        "openai",
        "https://api.cloudflare.com/client/v4/accounts/" + (process.env.CLOUDFLARE_ACCOUNT_ID || "ACCOUNT_ID") + "/ai/v1",
        {
          apiKeyRef: "cloudflare",
          apiKeyEnv: "CLOUDFLARE_API_TOKEN",
          tier: 1,
          cotaDiaria: 500,
          ordem: 9,
          modelos: [
            { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", contexto: 24e3, capacidades: ["chat", "codigo", "analise"] },
            { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", contexto: 32e3, capacidades: ["chat", "codigo", "analise"] },
            { id: "@cf/qwen/qwq-32b", contexto: 32e3, capacidades: ["chat", "codigo", "analise", "raciocinio"] }
          ],
          preco: { entradaPor1M: 0, saidaPor1M: 0 },
          ativo: !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID)
        }
      ),
      desc(
        "gemini-flash-lite",
        "Google Gemini Flash-Lite (OpenAI shim)",
        "openai",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        {
          apiKeyRef: "gemini",
          apiKeyEnv: "GEMINI_API_KEY",
          tier: 1,
          cotaDiaria: 500,
          fusoReset: "America/Los_Angeles",
          ordem: 10,
          modelos: [
            { id: "gemini-3.5-flash-lite", capacidades: ["chat", "codigo", "analise"] },
            { id: "gemini-3.1-flash-lite", capacidades: ["chat", "codigo", "analise"] }
          ],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      ),
      desc(
        "zai-direto",
        "Z.AI direto (GLM flash)",
        "openai",
        "https://api.z.ai/api/paas/v4",
        {
          apiKeyRef: "zai",
          tier: 1,
          cotaDiaria: 100,
          ordem: 11,
          modelos: [
            { id: "glm-4.7-flash", capacidades: ["chat", "codigo", "analise"] },
            { id: "glm-4.5-flash", capacidades: ["chat", "codigo", "analise"] }
          ],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      ),
      desc(
        "groq",
        "Groq (OpenAI-compatible)",
        "openai",
        "https://api.groq.com/openai/v1",
        {
          apiKeyRef: "groq",
          apiKeyEnv: "GROQ_API_KEY",
          tier: 1,
          cotaDiaria: 1e3,
          cotaTokensDia: 2e5,
          rpm: 30,
          ordem: 12,
          modelos: [
            { id: "openai/gpt-oss-120b", capacidades: ["chat", "codigo", "analise", "raciocinio"] },
            { id: "openai/gpt-oss-20b", capacidades: ["chat", "codigo", "analise"] },
            { id: "qwen/qwen3.8-27b", capacidades: ["chat", "codigo", "analise"] }
          ]
        }
      ),
      // ---------------- TIER 1 — regionais/exóticos ----------------
      desc("together", "Together AI", "openai", "https://api.together.xyz/v1", {
        apiKeyRef: "together",
        tier: 1,
        cotaDiaria: 40,
        ordem: 13,
        modelos: [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("fireworks", "Fireworks AI", "openai", "https://api.fireworks.ai/inference/v1", {
        apiKeyRef: "fireworks",
        tier: 1,
        cotaDiaria: 40,
        ordem: 14,
        modelos: [{ id: "accounts/fireworks/models/llama-v3p3-70b-instruct", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("mistral", "Mistral AI", "openai", "https://api.mistral.ai/v1", {
        apiKeyRef: "mistral",
        tier: 1,
        cotaDiaria: 40,
        ordem: 15,
        modelos: [{ id: "mistral-small-latest", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("deepinfra", "DeepInfra", "openai", "https://api.deepinfra.com/v1/openai", {
        apiKeyRef: "deepinfra",
        tier: 1,
        cotaDiaria: 40,
        ordem: 16,
        modelos: [{ id: "meta-llama/Llama-3.3-70B-Instruct", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("novita", "Novita AI", "openai", "https://api.novita.ai/v3/openai", {
        apiKeyRef: "novita",
        tier: 1,
        cotaDiaria: 40,
        ordem: 17,
        modelos: [{ id: "meta-llama/llama-3.3-70b-instruct", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("hyperbolic", "Hyperbolic", "openai", "https://api.hyperbolic.xyz/v1", {
        apiKeyRef: "hyperbolic",
        tier: 1,
        cotaDiaria: 40,
        ordem: 18,
        modelos: [{ id: "meta-llama/Llama-3.3-70B-Instruct", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("sambanova", "SambaNova", "openai", "https://api.sambanova.ai/v1", {
        apiKeyRef: "sambanova",
        tier: 1,
        cotaDiaria: 40,
        ordem: 19,
        modelos: [{ id: "Meta-Llama-3.3-70B-Instruct", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("cerebras", "Cerebras", "openai", "https://api.cerebras.ai/v1", {
        apiKeyRef: "cerebras",
        tier: 1,
        cotaDiaria: 40,
        ordem: 20,
        modelos: [{ id: "llama3.3-70b", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("nvidia-nim", "NVIDIA NIM", "openai", "https://integrate.api.nvidia.com/v1", {
        apiKeyRef: "nvidia",
        tier: 1,
        cotaDiaria: 40,
        ordem: 21,
        modelos: [{ id: "meta/llama-3.3-70b-instruct", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("perplexity", "Perplexity", "openai", "https://api.perplexity.ai", {
        apiKeyRef: "perplexity",
        tier: 1,
        cotaDiaria: 40,
        ordem: 22,
        modelos: [{ id: "sonar", capacidades: ["chat", "analise"] }]
      }),
      desc("xai", "x.AI", "openai", "https://api.x.ai/v1", {
        apiKeyRef: "xai",
        tier: 1,
        cotaDiaria: 40,
        ordem: 23,
        modelos: [{ id: "grok-3-mini", capacidades: ["chat", "codigo", "analise", "raciocinio"] }]
      }),
      desc("moonshot-direto", "Moonshot direto", "openai", "https://api.moonshot.ai/v1", {
        apiKeyRef: "moonshot",
        tier: 1,
        cotaDiaria: 40,
        ordem: 24,
        modelos: [{ id: "kimi-k2-0711-preview", capacidades: ["chat", "codigo", "analise", "raciocinio"] }]
      }),
      desc("chutes", "Chutes.ai", "openai", "https://llm.chutes.ai/v1", {
        apiKeyRef: "chutes",
        tier: 1,
        cotaDiaria: 40,
        ordem: 25,
        modelos: [{ id: "deepseek-ai/DeepSeek-V3", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("arli", "ArliAI", "openai", "https://api.arliai.com/v1", {
        apiKeyRef: "arli",
        tier: 1,
        cotaDiaria: 40,
        ordem: 26,
        modelos: [{ id: "llama-3.3-70b", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("litellm", "LiteLLM (gateway local opcional)", "openai", "http://127.0.0.1:4000/v1", {
        apiKeyRef: void 0,
        tier: 1,
        cotaDiaria: 0,
        ordem: 27,
        ativo: false,
        modelos: [{ id: "gpt-3.5-turbo", capacidades: ["chat", "codigo"] }]
      }),
      // ---------------- TIER 2 — qualidade paga (depois dos free; ordem >= 200) ----------------
      desc("openai", "OpenAI", "openai", "https://api.openai.com/v1", {
        apiKeyRef: "openai",
        apiKeyEnv: "OPENAI_API_KEY",
        tier: 2,
        ordem: 200,
        preco: { entradaPor1M: 0.1, saidaPor1M: 0.5 },
        // openai gpt-6-luna — fonte: https://platform.openai.com/docs/pricing — consulta 2026-11-10
        modelos: [{ id: "gpt-6-luna", capacidades: ["chat", "codigo", "analise", "raciocinio"] }]
      }),
      desc("deepseek", "DeepSeek", "openai", "https://api.deepseek.com/v1", {
        apiKeyRef: "deepseek",
        tier: 2,
        ordem: 201,
        preco: { entradaPor1M: 0.15, saidaPor1M: 0.6 },
        // DeepSeek deepseek-flash cache miss — fonte: https://api-docs.deepseek.com/quick_start/pricing/ — consulta 2026-11-10 (valores off-peak; cache miss é o caso conservador)
        modelos: [{ id: "deepseek-chat", capacidades: ["chat", "codigo", "analise", "raciocinio"] }]
      }),
      desc("gemini-pago", "Google Gemini (pago)", "openai", "https://generativelanguage.googleapis.com/v1beta/openai", {
        apiKeyRef: "gemini",
        apiKeyEnv: "GEMINI_API_KEY",
        tier: 2,
        ordem: 202,
        preco: { entradaPor1M: 0.75, saidaPor1M: 3.75 },
        // Google Gemini 3.8-flash — fonte: https://aistudio.google.com/docs/pricing — consulta 2026-11-10 (pago até 31/12/2026; depois $1.50/$7.50)
        modelos: [{ id: "gemini-3.8-flash", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("zai-pago", "Z.AI (pago)", "openai", "https://api.z.ai/api/paas/v4", {
        apiKeyRef: "zai",
        tier: 2,
        ordem: 203,
        preco: { entradaPor1M: 1.4, saidaPor1M: 4.4 },
        // Z.AI GLM-5.3 — fonte: https://docs.z.ai/guides/overview/pricing — consulta 2026-11-10
        modelos: [{ id: "glm-5.3", capacidades: ["chat", "codigo", "analise"] }]
      }),
      desc("anthropic", "Anthropic Claude", "anthropic", "https://api.anthropic.com", {
        apiKeyRef: "anthropic",
        apiKeyEnv: "ANTHROPIC_API_KEY",
        tier: 2,
        ordem: 204,
        timeoutMs: 3e5,
        numPredict: 8192,
        preco: { entradaPor1M: 3, saidaPor1M: 15 },
        // Claude Sonnet — faixa conservadora; ver platform.claude.com/pricing
        modelos: [
          { id: "claude-sonnet-4-5", contexto: 2e5, capacidades: ["chat", "codigo", "analise", "raciocinio"] },
          { id: "claude-haiku-4-5", contexto: 2e5, capacidades: ["chat", "codigo", "analise"] },
          { id: "claude-opus-4-1", contexto: 2e5, capacidades: ["chat", "codigo", "analise", "raciocinio"] }
        ]
      }),
      // ---------------- LOCAL por ultimo (so se online/CLI falharem) ----------------
      desc(
        "ollama-local",
        "Ollama local",
        "ollama",
        "http://127.0.0.1:11434",
        {
          apiKeyRef: void 0,
          tier: 3,
          ordem: 99,
          modelos: [
            { id: "qwen2.5-coder:7b", contexto: 8192, capacidades: ["chat", "codigo", "analise"] },
            { id: "qwen2.5-coder:3b", contexto: 8192, capacidades: ["chat", "codigo", "analise"] },
            { id: "qwen2.5-coder:1.5b", contexto: 8192, capacidades: ["chat", "codigo", "analise"] },
            { id: "llama3.2", contexto: 4096, capacidades: ["chat", "analise"] }
          ],
          preco: { entradaPor1M: 0, saidaPor1M: 0 }
        }
      )
    ];
    registro = [...CATALOGO_PROVIDERS];
  }
});

// src/main/brain/provider-env-map.ts
function chaveOpenRouterPareceValida(chave) {
  if (!chave || typeof chave !== "string")
    return false;
  const t = chave.trim();
  if (t.length < 40)
    return false;
  return /^sk-or-v1-[A-Za-z0-9_\-]+$/.test(t);
}
function envParaProvider(idOuRef) {
  const nomes = ENV_POR_REF[idOuRef] || [idOuRef.toUpperCase().replace(/-/g, "_") + "_API_KEY"];
  const isOr = idOuRef === "openrouter" || idOuRef.startsWith("openrouter");
  for (const n of nomes) {
    const v = process.env[n];
    if (typeof v !== "string" || !v.trim())
      continue;
    const t = v.trim();
    if (isOr || n.startsWith("OPENROUTER")) {
      if (!chaveOpenRouterPareceValida(t))
        continue;
    } else if (t.length < 8) {
      continue;
    }
    return t;
  }
  return null;
}
var ENV_POR_REF;
var init_provider_env_map = __esm({
  "src/main/brain/provider-env-map.ts"() {
    "use strict";
    ENV_POR_REF = {
      openrouter: ["OPENROUTER_API_KEY", "OPENROUTER_KEY"],
      gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      groq: ["GROQ_API_KEY"],
      together: ["TOGETHER_API_KEY", "TOGETHERAI_API_KEY"],
      fireworks: ["FIREWORKS_API_KEY", "FIREWORKS_AI_API_KEY"],
      mistral: ["MISTRAL_API_KEY"],
      deepinfra: ["DEEPINFRA_API_KEY"],
      novita: ["NOVITA_API_KEY"],
      hyperbolic: ["HYPERBOLIC_API_KEY"],
      sambanova: ["SAMBANOVA_API_KEY"],
      cerebras: ["CEREBRAS_API_KEY"],
      nvidia: ["NVIDIA_API_KEY", "NGC_API_KEY"],
      perplexity: ["PERPLEXITY_API_KEY"],
      xai: ["XAI_API_KEY", "GROK_API_KEY"],
      moonshot: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
      chutes: ["CHUTES_API_KEY"],
      arli: ["ARLI_API_KEY", "ARLIAI_API_KEY"],
      openai: ["OPENAI_API_KEY"],
      deepseek: ["DEEPSEEK_API_KEY"],
      zai: ["ZAI_API_KEY", "Z_AI_API_KEY"]
    };
  }
});

// src/main/brain/segredos-providers.ts
var segredos_providers_exports = {};
__export(segredos_providers_exports, {
  chaveConfigurada: () => chaveConfigurada,
  lerChave: () => lerChave,
  listarChavesConfiguradas: () => listarChavesConfiguradas,
  removerChave: () => removerChave,
  salvarChave: () => salvarChave
});
import { existsSync as existsSync3, mkdirSync as mkdirSync4, readFileSync as readFileSync2, writeFileSync as writeFileSync4 } from "fs";
import { join as join4 } from "path";
function ehOpenRouterId(id) {
  return id === "openrouter" || id.startsWith("openrouter");
}
function aceitarChave(id, chave) {
  if (!chave)
    return null;
  if (ehOpenRouterId(id) && !chaveOpenRouterPareceValida(chave))
    return null;
  return chave;
}
function arquivoCofre() {
  return join4(userDataDir(), "providers-keys.bin");
}
function mascarar(chave) {
  if (!chave)
    return "\u2014";
  return chave.slice(0, 4) + "****";
}
function dglogSeguro(mensagem, chave) {
  dglog(mensagem + (chave ? " chave=" + mascarar(chave) : ""));
}
function lerArquivoCofre() {
  const ARQUIVO = arquivoCofre();
  if (!existsSync3(ARQUIVO))
    return null;
  try {
    const bruto = readFileSync2(ARQUIVO);
    const texto = safeStorage.decryptString(bruto);
    const j = JSON.parse(texto);
    if (!j || typeof j !== "object")
      return null;
    return { versao: j.versao ?? 1, chaves: typeof j.chaves === "object" && j.chaves ? j.chaves : {} };
  } catch {
    return null;
  }
}
function gravarArquivoCofre(dados) {
  const dir = userDataDir();
  if (!existsSync3(dir))
    mkdirSync4(dir, { recursive: true });
  const texto = JSON.stringify(dados);
  const buf = safeStorage.encryptString(texto);
  writeFileSync4(arquivoCofre(), buf);
}
function chaveNoCofre(id) {
  const cofre = lerArquivoCofre();
  const v = cofre?.chaves && typeof cofre.chaves[id] === "string" ? cofre.chaves[id] : null;
  return v && v.trim().length > 0 ? v.trim() : null;
}
function resolverChave(idOuRef) {
  const direto = aceitarChave(idOuRef, chaveNoCofre(idOuRef));
  if (direto)
    return direto;
  const p = obterProvider(idOuRef);
  const refOr = p?.apiKeyRef || idOuRef;
  if (p?.apiKeyEnv) {
    const env = process.env[p.apiKeyEnv];
    if (typeof env === "string" && env.trim()) {
      const ok = aceitarChave(refOr, env.trim());
      if (ok)
        return ok;
    }
  }
  {
    const viaMap = envParaProvider(idOuRef) || (p?.apiKeyRef ? envParaProvider(p.apiKeyRef) : null);
    if (viaMap)
      return viaMap;
  }
  if (p?.apiKeyRef && p.apiKeyRef !== idOuRef) {
    const viaRef = aceitarChave(p.apiKeyRef, chaveNoCofre(p.apiKeyRef));
    if (viaRef)
      return viaRef;
  }
  for (const outro of listarProviders()) {
    if (outro.id === idOuRef)
      continue;
    const mesmoRef = outro.apiKeyRef === idOuRef || p?.apiKeyRef && outro.apiKeyRef === p.apiKeyRef || outro.id === p?.apiKeyRef;
    if (!mesmoRef)
      continue;
    const c = aceitarChave(outro.apiKeyRef || outro.id, chaveNoCofre(outro.id));
    if (c)
      return c;
    if (outro.apiKeyEnv) {
      const env = process.env[outro.apiKeyEnv];
      if (typeof env === "string" && env.trim()) {
        const ok = aceitarChave(outro.apiKeyRef || outro.id, env.trim());
        if (ok)
          return ok;
      }
    }
    const viaOutro = envParaProvider(outro.apiKeyRef || outro.id);
    if (viaOutro)
      return viaOutro;
  }
  return null;
}
function chaveConfigurada(id) {
  return resolverChave(id) != null;
}
function salvarChave(id, chave) {
  if (!chave || typeof chave !== "string" || !chave.trim()) {
    return { ok: false, erro: "chave vazia" };
  }
  if (ehOpenRouterId(id) && !chaveOpenRouterPareceValida(chave.trim())) {
    return { ok: false, erro: "chave OpenRouter inv\xE1lida (use sk-or-v1-\u2026 completa)" };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    dglogSeguro("[segredos-providers] criptografia indispon\xEDvel", chave);
    return { ok: false, erro: "criptografia indispon\xEDvel \u2014 n\xE3o \xE9 seguro gravar chave em texto plano" };
  }
  try {
    const cofre = lerArquivoCofre() || { versao: VERSAO, chaves: {} };
    cofre.chaves[id] = chave.trim();
    gravarArquivoCofre(cofre);
    dglogSeguro("[segredos-providers] chave salva", chave);
    return { ok: true };
  } catch (e) {
    dglogSeguro("[segredos-providers] falha ao salvar chave", chave);
    return { ok: false, erro: String(e?.message || e) };
  }
}
function lerChave(id) {
  return resolverChave(id);
}
function removerChave(id) {
  try {
    const cofre = lerArquivoCofre();
    if (cofre?.chaves && cofre.chaves[id] !== void 0) {
      delete cofre.chaves[id];
      gravarArquivoCofre(cofre);
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
function listarChavesConfiguradas() {
  const cofre = lerArquivoCofre();
  const ids = /* @__PURE__ */ new Set();
  if (cofre?.chaves) {
    for (const k of Object.keys(cofre.chaves)) {
      if (cofre.chaves[k] && cofre.chaves[k].trim().length > 0)
        ids.add(k);
    }
  }
  for (const p of listarProviders()) {
    if (p.apiKeyEnv) {
      const v = process.env[p.apiKeyEnv];
      if (typeof v === "string" && v.trim().length > 0)
        ids.add(p.id);
    }
  }
  return [...ids];
}
var VERSAO;
var init_segredos_providers = __esm({
  "src/main/brain/segredos-providers.ts"() {
    "use strict";
    init_electron_stub();
    init_dglog();
    init_providers_registry();
    init_paths();
    init_provider_env_map();
    VERSAO = 1;
  }
});

// src/main/midia/hardware.ts
import { cpus, totalmem } from "node:os";
function classificarHardware(i) {
  if (i.gpu && i.gpu.vramGb >= 6 && typeof i.gpu.compute === "number" && i.gpu.compute >= 7)
    return "gpu";
  if (i.threads >= 8 && i.ramGb >= 12)
    return "cpu";
  return "cpu-lite";
}
function ajustesComfy(perfil) {
  if (perfil === "gpu")
    return { largura: 768, altura: 768, passos: 8, quadros: 16, fps: 8, denoise: 0.55 };
  if (perfil === "cpu")
    return { largura: 512, altura: 512, passos: 6, quadros: 8, fps: 8, denoise: 0.55 };
  return { largura: 384, altura: 384, passos: 4, quadros: 8, fps: 8, denoise: 0.5 };
}
function computeProvavel(nome, vramGb) {
  if (/GT 7[0-4]0|GTX (6|7)\d\d|GT 6\d\d|GTX TITAN|Quadro K/i.test(nome))
    return 3.5;
  if (vramGb >= 6)
    return 7;
  return void 0;
}
async function lerGpu() {
  const r = await rodar(
    "nvidia-smi",
    ["--query-gpu=name,memory.total,compute_cap", "--format=csv,noheader,nounits"],
    5e3
  );
  let linha = r.ok ? r.stdout.trim().split(/\r?\n/)[0] : "";
  let compute;
  if (!linha) {
    const r2 = await rodar("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], 5e3);
    linha = r2.ok ? r2.stdout.trim().split(/\r?\n/)[0] : "";
  }
  if (!linha)
    return void 0;
  const partes = linha.split(",").map((p) => p.trim());
  const nome = partes[0] || "GPU NVIDIA";
  const vramMb = Number(partes[1]);
  if (partes[2] && Number.isFinite(Number(partes[2])))
    compute = Number(partes[2]);
  const vramGb = Number.isFinite(vramMb) ? +(vramMb / 1024).toFixed(1) : 0;
  const estimado = compute === void 0;
  if (estimado)
    compute = computeProvavel(nome, vramGb);
  const compativel = vramGb >= 6 && typeof compute === "number" && compute >= 7;
  return {
    nome,
    vramGb,
    compute,
    compativel,
    motivo: compativel ? void 0 : compute === void 0 ? "compute capability desconhecida e VRAM abaixo de 6 GB; usando CPU" : "CUDA " + compute + " antiga para o PyTorch atual; usando CPU"
  };
}
async function detectarHardware(forcar = false) {
  if (cache && !forcar)
    return cache;
  const lista = cpus();
  const threads = lista.length;
  const nucleos = threads;
  const ramGb = +(totalmem() / 1024 ** 3).toFixed(1);
  const gpu = process.platform === "win32" || process.platform === "linux" ? await lerGpu() : void 0;
  const perfil = classificarHardware({ threads, ramGb, gpu });
  cache = {
    perfil,
    platform: process.platform,
    arch: process.arch,
    cpu: lista[0]?.model?.trim() || "CPU",
    nucleos,
    threads,
    ramGb,
    gpu,
    comfy: ajustesComfy(perfil)
  };
  return cache;
}
var cache;
var init_hardware = __esm({
  "src/main/midia/hardware.ts"() {
    "use strict";
    init_core();
    cache = null;
  }
});

// src/main/midia/comfyui.ts
var comfyui_exports = {};
__export(comfyui_exports, {
  comfyInstalado: () => comfyInstalado,
  fonteMeme: () => fonteMeme,
  gerarFotoVideoComfy: () => gerarFotoVideoComfy,
  gerarImagemComfy: () => gerarImagemComfy,
  gerarVideoComfy: () => gerarVideoComfy,
  iniciarComfy: () => iniciarComfy,
  pararComfy: () => pararComfy,
  pastaAppComfy: () => pastaAppComfy,
  pastaComfy: () => pastaComfy,
  pythonComfy: () => pythonComfy,
  statusComfy: () => statusComfy
});
import { spawn as spawn2 } from "node:child_process";
import { copyFileSync, existsSync as existsSync4, mkdirSync as mkdirSync5, openSync, readFileSync as readFileSync4, readdirSync, rmSync as rmSync2, statSync as statSync3, writeFileSync as writeFileSync6 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";
function pastaComfy() {
  const custom = process.env.DG_COMFY_DIR;
  const base = custom && custom.trim() ? custom.trim() : process.env.LOCALAPPDATA ? join5(process.env.LOCALAPPDATA, "dg-editor", "comfyui") : join5(homedir3(), ".dg-editor", "comfyui");
  mkdirSync5(base, { recursive: true });
  return base;
}
function pastaAppComfy() {
  return join5(pastaComfy(), "app");
}
function pythonComfy() {
  const base = join5(pastaComfy(), "venv");
  return process.platform === "win32" ? join5(base, "Scripts", "python.exe") : join5(base, "bin", "python");
}
function comfyInstalado() {
  return existsSync4(join5(pastaAppComfy(), "main.py")) && existsSync4(pythonComfy());
}
function pastaModelos() {
  return join5(pastaAppComfy(), "models");
}
function listarArquivos(pasta, exts) {
  try {
    return readdirSync(pasta).filter((n) => exts.test(n)).sort();
  } catch {
    return [];
  }
}
function escolherCheckpoint() {
  const lista = listarArquivos(join5(pastaModelos(), "checkpoints"), /\.(safetensors|ckpt)$/i);
  if (lista.includes(CKPT_PREFERIDO))
    return CKPT_PREFERIDO;
  return lista[0] || CKPT_PREFERIDO;
}
function escolherMotion() {
  const lista = listarArquivos(join5(pastaModelos(), "animatediff_models"), /\.(safetensors|ckpt|bin)$/i);
  if (lista.includes(MOTION_PREFERIDO))
    return MOTION_PREFERIDO;
  return lista[0] || MOTION_PREFERIDO;
}
function temLcm() {
  return listarArquivos(join5(pastaModelos(), "loras"), /\.(safetensors|pt)$/i).includes(LORA_LCM);
}
function temAnimateDiff() {
  return existsSync4(join5(pastaAppComfy(), "custom_nodes", "ComfyUI-AnimateDiff-Evolved", "__init__.py"));
}
function modelosDisponiveis() {
  return {
    checkpoints: listarArquivos(join5(pastaModelos(), "checkpoints"), /\.(safetensors|ckpt)$/i),
    lcm: temLcm(),
    motion: listarArquivos(join5(pastaModelos(), "animatediff_models"), /\.(safetensors|ckpt|bin)$/i),
    animateDiff: temAnimateDiff()
  };
}
async function jsonHttp(path, opcoes = {}) {
  try {
    const res = await fetch(URL_BASE + path, {
      method: opcoes.method || "GET",
      headers: opcoes.body ? { "Content-Type": "application/json" } : void 0,
      body: opcoes.body,
      signal: AbortSignal.timeout(opcoes.timeoutMs || 5e3)
    });
    const texto = await res.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = texto;
    }
    return { ok: res.ok, status: res.status, dados };
  } catch (e) {
    return { ok: false, status: 0, dados: null, erro: e instanceof Error ? e.message : String(e) };
  }
}
async function statusComfy() {
  const base = {
    ok: false,
    instalado: comfyInstalado(),
    online: false,
    host: HOST,
    porta: PORTA,
    url: URL_BASE,
    modelos: modelosDisponiveis()
  };
  const r = await jsonHttp("/system_stats", { timeoutMs: 2500 });
  if (!r.ok) {
    return {
      ...base,
      erro: base.instalado ? 'ComfyUI instalado, servidor parado \u2014 clique em "Iniciar ComfyUI".' : "ComfyUI n\xE3o instalado."
    };
  }
  const stats = r.dados;
  const q = await jsonHttp("/queue", { timeoutMs: 2500 });
  const fila = q.ok ? {
    executando: Array.isArray(q.dados?.queue_running) ? q.dados.queue_running.length : 0,
    pendentes: Array.isArray(q.dados?.queue_pending) ? q.dados.queue_pending.length : 0
  } : void 0;
  return {
    ...base,
    ok: true,
    online: true,
    versao: stats?.system?.comfyui_version ? "ComfyUI " + stats.system.comfyui_version : "online",
    fila
  };
}
function arquivoPid() {
  return join5(pastaComfy(), "comfyui.pid");
}
function dormir2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function iniciarComfy() {
  const atual = await statusComfy();
  if (atual.online)
    return { ok: true, status: atual };
  if (!atual.instalado) {
    return { ok: false, erro: "ComfyUI n\xE3o instalado em " + pastaComfy() + ". Rode a instala\xE7\xE3o autom\xE1tica." };
  }
  const log = join5(pastaComfy(), "comfyui.log");
  let fd;
  try {
    fd = openSync(log, "a");
    const filho = spawn2(
      pythonComfy(),
      ["main.py", "--cpu", "--listen", HOST, "--port", String(PORTA), "--disable-auto-launch", "--preview-method", "none"],
      {
        cwd: pastaAppComfy(),
        detached: true,
        windowsHide: true,
        stdio: ["ignore", fd, fd],
        env: { ...process.env, PYTHONUNBUFFERED: "1", HF_HUB_DISABLE_TELEMETRY: "1" }
      }
    );
    filho.unref();
    if (filho.pid)
      writeFileSync6(arquivoPid(), String(filho.pid), "utf8");
  } catch (e) {
    return { ok: false, erro: "falha ao iniciar: " + (e instanceof Error ? e.message : String(e)) };
  } finally {
    if (fd !== void 0) {
      try {
        const { closeSync } = await import("node:fs");
        closeSync(fd);
      } catch {
      }
    }
  }
  const limite = Date.now() + 24e4;
  while (Date.now() < limite) {
    await dormir2(2e3);
    const s = await statusComfy();
    if (s.online)
      return { ok: true, status: s };
  }
  let finalLog = "";
  try {
    finalLog = readFileSync4(log, "utf8").split(/\r?\n/).filter(Boolean).slice(-4).join(" ").slice(-400);
  } catch {
  }
  return { ok: false, erro: "ComfyUI n\xE3o respondeu em 4 min. " + (finalLog || "veja comfyui.log") };
}
async function pararComfy() {
  let pid = 0;
  try {
    pid = Number(readFileSync4(arquivoPid(), "utf8").trim());
  } catch {
  }
  if (!pid) {
    const s = await statusComfy();
    if (!s.online)
      return { ok: true };
    return { ok: false, erro: "servidor online, mas o PID n\xE3o foi encontrado (inicie pelo DG Editor)" };
  }
  const r = process.platform === "win32" ? await rodar("taskkill", ["/PID", String(pid), "/T", "/F"], 3e4) : await rodar("kill", ["-TERM", String(pid)], 3e4);
  try {
    rmSync2(arquivoPid(), { force: true });
  } catch {
  }
  if (!r.ok)
    return { ok: false, erro: "falha ao encerrar PID " + pid + ": " + (r.erro || r.stderr).slice(0, 200) };
  return { ok: true };
}
async function garantirOnline() {
  const s = await statusComfy();
  if (s.online)
    return { ok: true };
  const r = await iniciarComfy();
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}
function workflowImagem(p) {
  const checkpoint = escolherCheckpoint();
  const usarLora = temLcm();
  return {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    ...usarLora ? {
      2: {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          clip: ["1", 1],
          lora_name: LORA_LCM,
          strength_model: 1,
          strength_clip: 1
        }
      }
    } : {},
    3: {
      class_type: "CLIPTextEncode",
      inputs: { text: p.prompt, clip: usarLora ? ["2", 1] : ["1", 1] }
    },
    4: {
      class_type: "CLIPTextEncode",
      inputs: { text: p.negativo, clip: usarLora ? ["2", 1] : ["1", 1] }
    },
    5: {
      class_type: "EmptyLatentImage",
      inputs: { width: p.largura, height: p.altura, batch_size: 1 }
    },
    6: {
      class_type: "KSampler",
      inputs: {
        model: usarLora ? ["2", 0] : ["1", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed: p.seed,
        steps: p.passos,
        cfg: p.cfg,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1
      }
    },
    7: { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    8: { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "dg-imagem" } }
  };
}
function workflowVideo(p) {
  return {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: escolherCheckpoint() } },
    2: {
      class_type: "ADE_AnimateDiffLoaderGen1",
      inputs: { model: ["1", 0], model_name: escolherMotion(), beta_schedule: "autoselect" }
    },
    3: { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["1", 1] } },
    4: { class_type: "CLIPTextEncode", inputs: { text: p.negativo, clip: ["1", 1] } },
    5: {
      class_type: "EmptyLatentImage",
      inputs: { width: p.largura, height: p.altura, batch_size: p.quadros }
    },
    6: {
      class_type: "KSampler",
      inputs: {
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed: p.seed,
        steps: p.passos,
        cfg: p.cfg,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1
      }
    },
    7: { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    8: { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "dg-video" } }
  };
}
function workflowFotoVideo(p) {
  return {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: escolherCheckpoint() } },
    2: { class_type: "LoadImage", inputs: { image: p.imagem } },
    3: { class_type: "VAEEncode", inputs: { pixels: ["2", 0], vae: ["1", 2] } },
    4: { class_type: "RepeatLatentBatch", inputs: { samples: ["3", 0], amount: p.quadros } },
    5: {
      class_type: "ADE_AnimateDiffLoaderGen1",
      inputs: { model: ["1", 0], model_name: escolherMotion(), beta_schedule: "autoselect" }
    },
    6: { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["1", 1] } },
    7: { class_type: "CLIPTextEncode", inputs: { text: p.negativo, clip: ["1", 1] } },
    8: {
      class_type: "KSampler",
      inputs: {
        model: ["5", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["4", 0],
        seed: p.seed,
        steps: p.passos,
        cfg: p.cfg,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: p.denoise
      }
    },
    9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["1", 2] } },
    10: { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "dg-fotovideo" } }
  };
}
function erroDoPrompt(dados, status) {
  if (dados && typeof dados === "object") {
    const o = dados;
    if (o.error?.message)
      return o.error.message + (o.error.details ? " \u2014 " + o.error.details : "");
    if (o.node_errors) {
      for (const [no, info] of Object.entries(o.node_errors)) {
        const msg = info?.errors?.[0]?.message;
        if (msg)
          return "n\xF3 " + no + ": " + msg;
      }
    }
  }
  return "HTTP " + status;
}
async function enfileirar(workflow) {
  const r = await jsonHttp("/prompt", {
    method: "POST",
    body: JSON.stringify({ prompt: workflow, client_id: "dg-editor" }),
    timeoutMs: 2e4
  });
  if (!r.ok)
    return { ok: false, erro: erroDoPrompt(r.dados, r.status) };
  const id = r.dados?.prompt_id;
  return id ? { ok: true, id } : { ok: false, erro: "ComfyUI n\xE3o retornou prompt_id" };
}
async function aguardarSaida(id, timeoutMs) {
  const limite = Date.now() + timeoutMs;
  let semFila = 0;
  while (Date.now() < limite) {
    await dormir2(1500);
    const h = await jsonHttp("/history/" + encodeURIComponent(id), { timeoutMs: 8e3 });
    if (h.ok && h.dados && typeof h.dados === "object") {
      const entrada = h.dados[id];
      if (entrada) {
        if (entrada.status?.status_str === "error") {
          return { ok: false, erro: "ComfyUI reportou erro na execu\xE7\xE3o" };
        }
        const imagens = [];
        for (const no of Object.values(entrada.outputs || {})) {
          for (const img of no.images || [])
            imagens.push(img);
        }
        if (imagens.length) {
          imagens.sort((a, b) => a.filename.localeCompare(b.filename));
          return { ok: true, imagens };
        }
        return { ok: false, erro: "workflow concluiu sem imagens (falta SaveImage?)" };
      }
    }
    const q = await jsonHttp("/queue", { timeoutMs: 4e3 });
    if (q.ok) {
      const o = q.dados;
      const naFila = [...o.queue_running || [], ...o.queue_pending || []].some(
        (item) => JSON.stringify(item).includes(id)
      );
      semFila = naFila ? 0 : semFila + 1;
      if (semFila >= 8)
        return { ok: false, erro: "prompt saiu da fila sem resultado (veja o log do ComfyUI)" };
    }
  }
  return { ok: false, erro: "tempo esgotado aguardando o ComfyUI" };
}
async function baixarImagem(img, destino) {
  const qs = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
  const res = await fetch(URL_BASE + "/view?" + qs.toString(), { signal: AbortSignal.timeout(12e4) });
  if (!res.ok)
    throw new Error("HTTP " + res.status + " ao baixar " + img.filename);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length)
    throw new Error("arquivo vazio: " + img.filename);
  writeFileSync6(destino, buf);
}
function limitar(v, min, max, padrao, passo = 1) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : padrao;
  const passoOk = Math.max(passo, Math.round(n / passo) * passo);
  return Math.min(max, Math.max(min, passoOk));
}
function fonteMeme() {
  const candidatas = process.platform === "win32" ? ["C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/arialbd.ttf"] : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Impact.ttf"];
  return candidatas.find((f) => existsSync4(f));
}
function filtroMarcaDagua(altura) {
  if (!existsSync4(FONTE_MARCA))
    return void 0;
  const fonte = FONTE_MARCA.replace(/\\/g, "/").replace(/:/g, "\\:");
  const corpo = Math.max(14, Math.round(altura * 0.035));
  return "drawtext=fontfile='" + fonte + "':text='gerado por IA':expansion=none:fontcolor=white@0.8:fontsize=" + corpo + ":box=1:boxcolor=black@0.35:boxborderw=6:x=w-tw-12:y=h-th-12";
}
async function gerarImagemComfy(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt da imagem" };
  if (!comfyInstalado()) {
    const r = await gerarImagem(raiz, {
      prompt,
      largura: opts.largura,
      altura: opts.altura,
      seed: opts.seed,
      saida: opts.saida
    });
    if (r.ok) {
      r.aviso = (r.aviso ? r.aviso + " " : "") + "ComfyUI n\xE3o instalado \u2014 use midia_gerenciar_midia instalar comfyui para gera\xE7\xE3o local ilimitada.";
      r.detalhes = { ...r.detalhes || {}, motor: "pollinations-fallback" };
    }
    return r;
  }
  const on = await garantirOnline();
  if (!on.ok)
    return { ok: false, erro: on.erro || "ComfyUI offline" };
  if (!modelosDisponiveis().checkpoints.length) {
    return { ok: false, erro: "Nenhum checkpoint em models/checkpoints \u2014 baixe o modelo SD 1.5." };
  }
  const hw = await detectarHardware();
  const largura = limitar(opts.largura, 256, 1024, hw.comfy.largura, 64);
  const altura = limitar(opts.altura, 256, 1024, hw.comfy.altura, 64);
  const lcm = temLcm();
  const passos = limitar(opts.passos, 1, 40, lcm ? hw.comfy.passos : Math.max(12, hw.comfy.passos * 2));
  const cfg = lcm ? 1.5 : 7;
  const seed = typeof opts.seed === "number" && Number.isFinite(opts.seed) ? Math.floor(opts.seed) : Math.floor(Math.random() * 2 ** 31);
  const destino = destinoArquivo(raiz, nomeArquivo("comfy-imagem", ".png"), opts.saida);
  const t0 = Date.now();
  const enq = await enfileirar(
    workflowImagem({
      prompt,
      negativo: opts.negocio || "baixa qualidade, borrado, distorcido, marca d'\xE1gua, texto",
      largura,
      altura,
      passos,
      cfg,
      seed
    })
  );
  if (!enq.ok)
    return { ok: false, erro: "ComfyUI recusou o workflow: " + (enq.erro || "?") };
  const fim = await aguardarSaida(enq.id, 15 * 6e4);
  if (!fim.ok || !fim.imagens?.length) {
    return { ok: false, erro: "Gera\xE7\xE3o no ComfyUI falhou: " + (fim.erro || "sem sa\xEDda") };
  }
  const tmp = join5(pastaMidia(raiz), ".comfy-" + Date.now());
  mkdirSync5(tmp, { recursive: true });
  try {
    const bruto = join5(tmp, "saida.png");
    await baixarImagem(fim.imagens[0], bruto);
    copyFileSync(bruto, destino);
  } catch (e) {
    return { ok: false, erro: "falha ao baixar a imagem: " + (e instanceof Error ? e.message : String(e)) };
  } finally {
    rmSync2(tmp, { recursive: true, force: true });
  }
  const bytes = statSync3(destino).size;
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime: "image/png",
    previewBase64: previewDe(destino),
    detalhes: { motor: "comfyui", modelo: escolherCheckpoint(), largura, altura, passos, seed, segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1) },
    aviso: "Imagem gerada localmente no ComfyUI (CPU, ilimitada): " + largura + "x" + altura + ", " + passos + " passos."
  };
}
async function gerarVideoComfy(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt do v\xEDdeo" };
  if (!temAnimateDiff()) {
    return {
      ok: false,
      erro: "Custom node ComfyUI-AnimateDiff-Evolved ausente em custom_nodes \u2014 rode a instala\xE7\xE3o de v\xEDdeo."
    };
  }
  if (!modelosDisponiveis().motion.length) {
    return { ok: false, erro: "Motion module ausente em models/animatediff_models \u2014 baixe o mm_sd_v15_v2." };
  }
  const on = await garantirOnline();
  if (!on.ok)
    return { ok: false, erro: on.erro || "ComfyUI offline" };
  if (!modelosDisponiveis().checkpoints.length) {
    return { ok: false, erro: "Nenhum checkpoint em models/checkpoints \u2014 baixe o modelo SD 1.5." };
  }
  const hw = await detectarHardware();
  const largura = limitar(opts.largura, 256, 768, Math.min(768, hw.comfy.largura), 64);
  const altura = limitar(opts.altura, 256, 768, Math.min(768, hw.comfy.altura), 64);
  const quadros = limitar(opts.quadros, 8, 32, hw.comfy.quadros);
  const fps = limitar(opts.fps, 4, 16, hw.comfy.fps);
  const passos = limitar(opts.passos, 2, 20, hw.comfy.passos);
  const seed = typeof opts.seed === "number" && Number.isFinite(opts.seed) ? Math.floor(opts.seed) : Math.floor(Math.random() * 2 ** 31);
  const destino = destinoArquivo(raiz, nomeArquivo("comfy-video", ".mp4"), opts.saida);
  const t0 = Date.now();
  const enq = await enfileirar(
    workflowVideo({
      prompt,
      negativo: opts.negocio || "baixa qualidade, borrado, distorcido, marca d'\xE1gua",
      largura,
      altura,
      quadros,
      passos,
      cfg: 7,
      seed
    })
  );
  if (!enq.ok)
    return { ok: false, erro: "ComfyUI recusou o workflow de v\xEDdeo: " + (enq.erro || "?") };
  const fim = await aguardarSaida(enq.id, 90 * 6e4);
  const imagens = fim.imagens || [];
  if (!fim.ok || imagens.length < 2) {
    return { ok: false, erro: "Gera\xE7\xE3o de v\xEDdeo no ComfyUI falhou: " + (fim.erro || "quadros insuficientes") };
  }
  const tmp = join5(pastaMidia(raiz), ".comfy-video-" + Date.now());
  mkdirSync5(tmp, { recursive: true });
  try {
    for (let i = 0; i < imagens.length; i++) {
      await baixarImagem(imagens[i], join5(tmp, String(i).padStart(5, "0") + ".png"));
    }
    const r = await rodar(
      process.env.DG_FFMPEG || "ffmpeg",
      [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        join5(tmp, "%05d.png"),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        destino
      ],
      6e5
    );
    if (!r.ok || !existsSync4(destino)) {
      return { ok: false, erro: "ffmpeg falhou ao montar o MP4: " + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(" ")).slice(0, 300) };
    }
  } catch (e) {
    return { ok: false, erro: "falha ao montar o v\xEDdeo: " + (e instanceof Error ? e.message : String(e)) };
  } finally {
    rmSync2(tmp, { recursive: true, force: true });
  }
  const duracao = +(imagens.length / fps).toFixed(2);
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync3(destino).size,
    mime: "video/mp4",
    previewBase64: previewDe(destino),
    duracaoSeg: duracao,
    detalhes: {
      motor: "comfyui",
      modelo: escolherCheckpoint(),
      largura,
      altura,
      quadros: imagens.length,
      fps,
      passos,
      seed,
      segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1)
    },
    aviso: "V\xEDdeo gerado localmente no ComfyUI (CPU): " + largura + "x" + altura + ", " + imagens.length + " quadros a " + fps + " fps (" + duracao + "s). Processamento na CPU \xE9 lento; reduza quadros/resolu\xE7\xE3o para acelerar."
  };
}
async function gerarFotoVideoComfy(raiz, opts) {
  if (opts.consentimento !== true) {
    return {
      ok: false,
      erro: "Confirme que voc\xEA tem direito de usar esta imagem (foto pr\xF3pria ou pessoa autorizada). O DG Editor n\xE3o gera v\xEDdeos de pessoas reais sem consentimento."
    };
  }
  const entrada = String(opts.entrada || "").trim();
  if (!entrada)
    return { ok: false, erro: "informe a foto de entrada" };
  let abs;
  try {
    abs = caminhoDentroDaRaiz(raiz, entrada).abs;
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  if (!existsSync4(abs))
    return { ok: false, erro: "foto n\xE3o encontrada: " + entrada };
  if (!/\.(png|jpe?g|webp)$/i.test(abs))
    return { ok: false, erro: "use uma foto PNG, JPG ou WEBP" };
  if (!temAnimateDiff()) {
    return { ok: false, erro: "Custom node ComfyUI-AnimateDiff-Evolved ausente \u2014 rode a instala\xE7\xE3o de v\xEDdeo." };
  }
  if (!modelosDisponiveis().motion.length) {
    return { ok: false, erro: "Motion module ausente em models/animatediff_models." };
  }
  const on = await garantirOnline();
  if (!on.ok)
    return { ok: false, erro: on.erro || "ComfyUI offline" };
  if (!modelosDisponiveis().checkpoints.length) {
    return { ok: false, erro: "Nenhum checkpoint em models/checkpoints \u2014 baixe o modelo SD 1.5." };
  }
  const hw = await detectarHardware();
  const largura = limitar(opts.largura, 256, 768, Math.min(768, hw.comfy.largura), 64);
  const altura = limitar(opts.altura, 256, 768, Math.min(768, hw.comfy.altura), 64);
  const quadros = limitar(opts.quadros, 8, 32, hw.comfy.quadros);
  const fps = limitar(opts.fps, 4, 16, hw.comfy.fps);
  const passos = limitar(opts.passos, 2, 20, hw.comfy.passos);
  const movimento = Math.min(0.8, Math.max(0.3, typeof opts.movimento === "number" ? opts.movimento : hw.comfy.denoise));
  const seed = typeof opts.seed === "number" && Number.isFinite(opts.seed) ? Math.floor(opts.seed) : Math.floor(Math.random() * 2 ** 31);
  const entradaComfy = join5(pastaAppComfy(), "input");
  mkdirSync5(entradaComfy, { recursive: true });
  const nomeEntrada = "dg-foto-" + Date.now() + ".png";
  const arquivoComfy = join5(entradaComfy, nomeEntrada);
  const destino = destinoArquivo(raiz, nomeArquivo("comfy-fotovideo", ".mp4"), opts.saida);
  const t0 = Date.now();
  try {
    const prep = await rodar(
      process.env.DG_FFMPEG || "ffmpeg",
      [
        "-y",
        "-i",
        abs,
        "-vf",
        "scale=" + largura + ":" + altura + ":force_original_aspect_ratio=decrease,pad=" + largura + ":" + altura + ":(ow-iw)/2:(oh-ih)/2",
        "-frames:v",
        "1",
        arquivoComfy
      ],
      12e4
    );
    if (!prep.ok || !existsSync4(arquivoComfy)) {
      return { ok: false, erro: "ffmpeg falhou ao preparar a foto: " + (prep.erro || prep.stderr).slice(0, 300) };
    }
    const enq = await enfileirar(
      workflowFotoVideo({
        imagem: nomeEntrada,
        prompt: String(opts.prompt || "").trim() || "movimento suave e natural, cinematogr\xE1fico, alta qualidade",
        negativo: "rosto deformado, derretido, distorcido, baixa qualidade, marca d'\xE1gua",
        quadros,
        passos,
        cfg: 7,
        seed,
        denoise: movimento
      })
    );
    if (!enq.ok)
      return { ok: false, erro: "ComfyUI recusou o workflow de foto\u2192v\xEDdeo: " + (enq.erro || "?") };
    const fim = await aguardarSaida(enq.id, 90 * 6e4);
    const imagens = fim.imagens || [];
    if (!fim.ok || imagens.length < 2) {
      return { ok: false, erro: "Foto\u2192v\xEDdeo falhou no ComfyUI: " + (fim.erro || "quadros insuficientes") };
    }
    const tmp = join5(pastaMidia(raiz), ".comfy-foto-" + Date.now());
    mkdirSync5(tmp, { recursive: true });
    try {
      for (let i = 0; i < imagens.length; i++) {
        await baixarImagem(imagens[i], join5(tmp, String(i).padStart(5, "0") + ".png"));
      }
      const marca = filtroMarcaDagua(altura);
      const args = ["-y", "-framerate", String(fps), "-i", join5(tmp, "%05d.png")];
      if (marca)
        args.push("-vf", marca);
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-metadata",
        "comment=V\xEDdeo sint\xE9tico gerado localmente por IA (DG Editor + ComfyUI)",
        destino
      );
      const r = await rodar(process.env.DG_FFMPEG || "ffmpeg", args, 6e5);
      if (!r.ok || !existsSync4(destino)) {
        return { ok: false, erro: "ffmpeg falhou ao montar o MP4: " + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(" ")).slice(0, 300) };
      }
    } finally {
      rmSync2(tmp, { recursive: true, force: true });
    }
  } finally {
    rmSync2(arquivoComfy, { force: true });
  }
  const duracao = +(quadros / fps).toFixed(2);
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync3(destino).size,
    mime: "video/mp4",
    previewBase64: previewDe(destino),
    duracaoSeg: duracao,
    detalhes: {
      motor: "comfyui-img2video",
      sintetico: true,
      modelo: escolherCheckpoint(),
      largura,
      altura,
      quadros,
      fps,
      passos,
      movimento,
      seed,
      marcaDagua: true,
      segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1)
    },
    aviso: "V\xEDdeo sint\xE9tico gerado de uma foto (IA local): " + largura + "x" + altura + ", " + quadros + " quadros a " + fps + ' fps. Inclui a marca vis\xEDvel "gerado por IA". Uso pessoal/par\xF3dia com consentimento; n\xE3o \xE9 um deepfake fotorrealista.'
  };
}
var HOST, PORTA, URL_BASE, CKPT_PREFERIDO, LORA_LCM, MOTION_PREFERIDO, FONTE_MARCA;
var init_comfyui = __esm({
  "src/main/midia/comfyui.ts"() {
    "use strict";
    init_core();
    init_paths();
    init_hardware();
    HOST = "127.0.0.1";
    PORTA = 8188;
    URL_BASE = "http://" + HOST + ":" + PORTA;
    CKPT_PREFERIDO = "dreamshaper_8.safetensors";
    LORA_LCM = "lcm-lora-sdv1-5.safetensors";
    MOTION_PREFERIDO = "mm_sd_v15_v2.ckpt";
    FONTE_MARCA = process.platform === "win32" ? "C:/Windows/Fonts/arialbd.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  }
});

// src/main/midia/horde.ts
var horde_exports = {};
__export(horde_exports, {
  gerarImagemHorde: () => gerarImagemHorde
});
import { writeFileSync as writeFileSync7 } from "node:fs";
function chaveHorde() {
  return (process.env.AI_HORDE_API_KEY || process.env.HORDE_API_KEY || CHAVE_ANONIMA).trim();
}
function headers() {
  return {
    apikey: chaveHorde(),
    "Client-Agent": "dg-editor:0.6.5:contato@localhost",
    "Content-Type": "application/json"
  };
}
async function api(path, opcoes = {}) {
  const res = await fetch(BASE + path, {
    method: opcoes.method || "GET",
    headers: headers(),
    body: opcoes.body ? JSON.stringify(opcoes.body) : void 0,
    signal: AbortSignal.timeout(opcoes.timeoutMs || 3e4)
  });
  const texto = await res.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { ok: res.ok, status: res.status, dados };
}
function dormir3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function gerarImagemHorde(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt" };
  const largura = Math.min(640, Math.max(64, Math.round(opts.largura || 512)));
  const altura = Math.min(640, Math.max(64, Math.round(opts.altura || 512)));
  const sub = await api("/v2/generate/async", {
    method: "POST",
    timeoutMs: 3e4,
    body: {
      prompt: prompt.slice(0, 1e3),
      params: {
        width: largura,
        height: altura,
        steps: 25,
        cfg_scale: 7,
        sampler_name: "k_euler",
        n: 1,
        ...typeof opts.seed === "number" && Number.isFinite(opts.seed) ? { seed: String(Math.floor(opts.seed)) } : {}
      },
      nsfw: false,
      censor_nsfw: true,
      models: []
    }
  });
  if (!sub.ok) {
    const msg = sub.dados?.message;
    return { ok: false, erro: "AI Horde recusou o pedido (HTTP " + sub.status + "): " + (msg || "sem detalhe") };
  }
  const id = sub.dados?.id;
  if (!id)
    return { ok: false, erro: "AI Horde n\xE3o retornou id do job" };
  const limite = Date.now() + TIMEOUT_MS;
  while (Date.now() < limite) {
    await dormir3(5e3);
    const chk = await api("/v2/generate/check/" + encodeURIComponent(id), { timeoutMs: 2e4 });
    const c = chk.dados;
    if (c?.faulted)
      return { ok: false, erro: "job do AI Horde falhou no worker", codigo: "HORDE_FAULT" };
    if (!c?.done)
      continue;
    const st = await api("/v2/generate/status/" + encodeURIComponent(id), { timeoutMs: 6e4 });
    const gen = st.dados?.generations?.[0];
    const img = gen?.img;
    if (!img)
      return { ok: false, erro: "AI Horde concluiu sem imagem", codigo: "HORDE_VAZIO" };
    let buf;
    if (/^https?:\/\//.test(img)) {
      const dl = await fetch(img, { signal: AbortSignal.timeout(12e4) });
      if (!dl.ok)
        return { ok: false, erro: "falha ao baixar imagem do Horde: HTTP " + dl.status };
      buf = Buffer.from(await dl.arrayBuffer());
    } else {
      buf = Buffer.from(img, "base64");
    }
    if (!buf.length)
      return { ok: false, erro: "imagem do AI Horde veio vazia" };
    const ehWebp = /\.webp(\?|$)/i.test(img) || !/^https?:/.test(img) && false;
    const ext = ehWebp ? ".webp" : ".png";
    const mime = ehWebp ? "image/webp" : "image/png";
    const destino = destinoArquivo(raiz, nomeArquivo("horde-imagem", ext), opts.saida);
    writeFileSync7(destino, buf);
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime,
      previewBase64: previewDe(destino),
      aviso: "Gr\xE1tis via AI Horde (fila comunit\xE1ria; ~1min, at\xE9 ~640px).",
      detalhes: { motor: "ai-horde", modelo: "stable-diffusion", seed: gen?.seed }
    };
  }
  return { ok: false, erro: "tempo esgotado aguardando a fila do AI Horde (>8min)", codigo: "HORDE_TIMEOUT" };
}
var BASE, CHAVE_ANONIMA, TIMEOUT_MS;
var init_horde = __esm({
  "src/main/midia/horde.ts"() {
    "use strict";
    init_core();
    BASE = "https://aihorde.net/api";
    CHAVE_ANONIMA = "0000000000";
    TIMEOUT_MS = 8 * 6e4;
  }
});

// src/main/midia/guarda-custo.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync8 } from "node:fs";
import { join as join6 } from "node:path";
function arquivoLedger(raiz) {
  return join6(raiz, ".dg-editor", "uso-custo.json");
}
function lerLedger(raiz) {
  try {
    const f = arquivoLedger(raiz);
    if (!existsSync5(f))
      return { registros: [] };
    const j = JSON.parse(readFileSync5(f, "utf8"));
    return { registros: Array.isArray(j.registros) ? j.registros : [] };
  } catch {
    return { registros: [] };
  }
}
function registrarUso(raiz, motor, ok, extra) {
  try {
    const l = lerLedger(raiz);
    l.registros.push({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      motor,
      ok,
      custoUsd: extra?.custoUsd,
      detalhe: extra?.detalhe?.slice(0, 200)
    });
    if (l.registros.length > 2e3)
      l.registros = l.registros.slice(-2e3);
    const dir = join6(raiz, ".dg-editor");
    if (!existsSync5(dir))
      mkdirSync6(dir, { recursive: true });
    writeFileSync8(arquivoLedger(raiz), JSON.stringify(l, null, 2), "utf8");
  } catch {
  }
}
function ehMotorPago(motor) {
  return motor in CUSTO_ESTIMADO;
}
function limiteCustoDia(raiz) {
  const env = Number(process.env.DG_CUSTO_LIMITE_DIA_USD);
  if (Number.isFinite(env) && env > 0)
    return env;
  try {
    const f = join6(raiz, ".dg-editor", "custo-limite.json");
    if (existsSync5(f)) {
      const j = JSON.parse(readFileSync5(f, "utf8"));
      const v = Number(j.limiteDiaUsd);
      if (Number.isFinite(v) && v > 0)
        return v;
    }
  } catch {
  }
  return 0;
}
function custoEstimado(motor) {
  return CUSTO_ESTIMADO[motor] ?? 0;
}
function custoDiaUsd(raiz) {
  const hoje = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  let total = 0;
  for (const r of lerLedger(raiz).registros) {
    if (!r.ts.startsWith(hoje))
      continue;
    const c = r.custoUsd ?? (ehMotorPago(r.motor) ? custoEstimado(r.motor) : 0);
    total += c;
  }
  return total;
}
function bloqueioCusto(raiz, motor) {
  if (!ehMotorPago(motor))
    return null;
  const limite = limiteCustoDia(raiz);
  if (limite <= 0)
    return null;
  const gasto = custoDiaUsd(raiz);
  if (gasto < limite)
    return null;
  return `Teto de custo di\xE1rio atingido: ~US$${gasto.toFixed(2)} >= US$${limite.toFixed(2)} (motor ${motor}). Ajuste DG_CUSTO_LIMITE_DIA_USD ou .dg-editor/custo-limite.json, ou use um motor gratuito da cascata.`;
}
var CUSTO_ESTIMADO;
var init_guarda_custo = __esm({
  "src/main/midia/guarda-custo.ts"() {
    "use strict";
    CUSTO_ESTIMADO = {
      "openai-image": 0.05,
      "openai-tts": 0.02,
      veo: 0.4,
      getimg: 0.05,
      segmind: 0.02
    };
  }
});

// src/main/midia/openai-midia.ts
var openai_midia_exports = {};
__export(openai_midia_exports, {
  gerarImagemOpenAI: () => gerarImagemOpenAI,
  sintetizarVozOpenAI: () => sintetizarVozOpenAI,
  vozesOpenAI: () => vozesOpenAI
});
import { writeFileSync as writeFileSync9 } from "node:fs";
function chaveOpenAI() {
  if (process.env.OPENAI_API_KEY)
    return process.env.OPENAI_API_KEY;
  try {
    const { lerChave: lerChave2 } = (init_segredos_providers(), __toCommonJS(segredos_providers_exports));
    return lerChave2("openai");
  } catch {
    return null;
  }
}
async function gerarImagemOpenAI(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt da imagem" };
  const chave = chaveOpenAI();
  if (!chave)
    return { ok: false, erro: ERRO_SEM_CHAVE };
  const bloqueio = bloqueioCusto(raiz, "openai-image");
  if (bloqueio)
    return { ok: false, erro: bloqueio };
  const t0 = Date.now();
  const tamanho = ["1024x1024", "1536x1024", "1024x1536"].includes(String(opts.tamanho)) ? String(opts.tamanho) : "1024x1024";
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + chave },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: tamanho, n: 1 }),
      signal: AbortSignal.timeout(3e5)
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      const erro = "OpenAI image HTTP " + r.status + ": " + corpo.slice(0, 300);
      registrarUso(raiz, "openai-image", false, { detalhe: erro });
      return { ok: false, erro };
    }
    const j = await r.json();
    const item = j.data?.[0];
    let dados;
    if (item?.b64_json)
      dados = Buffer.from(item.b64_json, "base64");
    else if (item?.url) {
      const dl = await fetch(item.url, { signal: AbortSignal.timeout(12e4) });
      if (!dl.ok)
        return { ok: false, erro: "falha ao baixar a imagem (HTTP " + dl.status + ")" };
      dados = Buffer.from(await dl.arrayBuffer());
    } else {
      return { ok: false, erro: "OpenAI n\xE3o retornou imagem." };
    }
    const destino = destinoArquivo(raiz, nomeArquivo(prompt, ".png"), opts.saida);
    writeFileSync9(destino, dados);
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: dados.length,
      mime: "image/png",
      previewBase64: previewDe(destino),
      detalhes: { motor: "openai-image", modelo: "gpt-image-1", tamanho, segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1) },
      aviso: "Imagem gerada via OpenAI gpt-image-1 (pago, alta qualidade). Custo registrado em .dg-editor/uso-custo.json."
    };
  } catch (e) {
    registrarUso(raiz, "openai-image", false, { detalhe: "rede" });
    return { ok: false, erro: "falha ao chamar a OpenAI: " + (e instanceof Error ? e.message : String(e)) };
  }
}
async function sintetizarVozOpenAI(raiz, opts) {
  const texto = String(opts.texto || "").trim();
  if (!texto)
    return { ok: false, erro: "informe o texto a narrar" };
  if (texto.length > 4096)
    return { ok: false, erro: "texto muito longo (m\xE1x. 4096 caracteres)" };
  const chave = chaveOpenAI();
  if (!chave)
    return { ok: false, erro: ERRO_SEM_CHAVE };
  const bloqueio = bloqueioCusto(raiz, "openai-tts");
  if (bloqueio)
    return { ok: false, erro: bloqueio };
  const voz = VOZES_OPENAI.includes(String(opts.voz)) ? String(opts.voz) : "nova";
  const formato = String(opts.formato || "mp3") === "wav" ? "wav" : "mp3";
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + chave },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: voz, input: texto, response_format: formato }),
      signal: AbortSignal.timeout(12e4)
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      const erro = "OpenAI TTS HTTP " + r.status + ": " + corpo.slice(0, 300);
      registrarUso(raiz, "openai-tts", false, { detalhe: erro });
      return { ok: false, erro };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const destino = destinoArquivo(raiz, nomeArquivo("tts-" + voz, "." + formato), opts.saida);
    writeFileSync9(destino, buf);
    registrarUso(raiz, "openai-tts", true, { detalhe: voz + "/" + formato });
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime: formato === "wav" ? "audio/wav" : "audio/mpeg",
      detalhes: { motor: "openai-tts", modelo: "gpt-4o-mini-tts", voz, formato, segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1) },
      aviso: "Narra\xE7\xE3o gerada via OpenAI TTS (voz " + voz + "). Custo registrado em .dg-editor/uso-custo.json."
    };
  } catch (e) {
    registrarUso(raiz, "openai-tts", false, { detalhe: "rede" });
    return { ok: false, erro: "falha ao chamar a OpenAI TTS: " + (e instanceof Error ? e.message : String(e)) };
  }
}
function vozesOpenAI() {
  return [...VOZES_OPENAI];
}
var ERRO_SEM_CHAVE, VOZES_OPENAI;
var init_openai_midia = __esm({
  "src/main/midia/openai-midia.ts"() {
    "use strict";
    init_core();
    init_guarda_custo();
    ERRO_SEM_CHAVE = "OPENAI_API_KEY n\xE3o configurada. Cadastre em Contas \u2192 Provedores (openai).";
    VOZES_OPENAI = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  }
});

// src/main/midia/json2video.ts
var json2video_exports = {};
__export(json2video_exports, {
  gerarVideoJson2Video: () => gerarVideoJson2Video,
  json2videoConfigurado: () => json2videoConfigurado,
  montarMovieJson: () => montarMovieJson
});
import { writeFileSync as writeFileSync11 } from "node:fs";
function chaveJson2Video() {
  return (process.env.JSON2VIDEO_API_KEY || "").trim() || null;
}
function json2videoConfigurado() {
  return !!chaveJson2Video();
}
function erroChave2() {
  return {
    ok: false,
    erro: "JSON2VIDEO_API_KEY n\xE3o configurada. Cadastre gr\xE1tis em json2video.com/dashboard/apikeys (600s de v\xEDdeo/m\xEAs gr\xE1tis)."
  };
}
async function api2(path, opcoes = {}) {
  const res = await fetch(BASE3 + path, {
    method: opcoes.method || "GET",
    headers: {
      "x-api-key": chaveJson2Video() || "",
      "Content-Type": "application/json"
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : void 0,
    signal: AbortSignal.timeout(opcoes.timeoutMs || 3e4)
  });
  const texto = await res.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { ok: res.ok, status: res.status, dados };
}
function dormir4(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function montarMovieJson(cenas, resolucao) {
  const scenes = cenas.map((c) => {
    const dur = Math.min(60, Math.max(1, Math.round(c.duracaoSeg || 5)));
    const elements = [];
    if (c.imagemUrl && /^https?:\/\//.test(c.imagemUrl)) {
      elements.push({ type: "image", src: c.imagemUrl, duration: dur });
    }
    if (c.texto && c.texto.trim()) {
      elements.push({ type: "text", text: c.texto.trim().slice(0, 500), duration: dur });
    }
    if (c.narracao && c.narracao.trim()) {
      elements.push({
        type: "voice",
        text: c.narracao.trim().slice(0, 2e3),
        ...c.voz ? { voice: c.voz } : {}
      });
    }
    return { duration: dur, elements };
  });
  return { resolution: resolucao, scenes };
}
async function gerarVideoJson2Video(raiz, opts) {
  const chave = chaveJson2Video();
  if (!chave)
    return erroChave2();
  if (!Array.isArray(opts.cenas) || !opts.cenas.length) {
    return { ok: false, erro: "informe ao menos uma cena" };
  }
  if (opts.cenas.length > 20)
    return { ok: false, erro: "m\xE1ximo de 20 cenas por v\xEDdeo" };
  const resolucao = ["small", "medium", "hd", "full-hd"].includes(String(opts.resolucao)) ? String(opts.resolucao) : "hd";
  const movie = montarMovieJson(opts.cenas, resolucao);
  if (movie.scenes.some((s) => !s.elements.length)) {
    return { ok: false, erro: "toda cena precisa de imagemUrl, texto ou narracao" };
  }
  const t0 = Date.now();
  const sub = await api2("/movies", { method: "POST", timeoutMs: 6e4, body: movie });
  const projeto = sub.dados?.project || sub.dados?.movie?.project;
  if (!sub.ok || !projeto) {
    return { ok: false, erro: "JSON2Video recusou: HTTP " + sub.status + " " + JSON.stringify(sub.dados).slice(0, 250) };
  }
  const limite = Date.now() + TIMEOUT_RENDER_MS;
  let urlFinal = "";
  while (Date.now() < limite) {
    await dormir4(5e3);
    const st = await api2("/movies?project=" + encodeURIComponent(projeto), { timeoutMs: 3e4 });
    const m = st.dados?.movie;
    if (m?.status === "done" && m.url) {
      urlFinal = m.url;
      break;
    }
    if (m?.status === "error" || m?.status === "timeout") {
      return { ok: false, erro: "JSON2Video falhou: " + (m.message || m.status) };
    }
  }
  if (!urlFinal)
    return { ok: false, erro: "tempo esgotado aguardando o render do JSON2Video (>10min)", codigo: "J2V_TIMEOUT" };
  const res = await fetch(urlFinal, { signal: AbortSignal.timeout(18e4) });
  if (!res.ok)
    return { ok: false, erro: "download do v\xEDdeo HTTP " + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length)
    return { ok: false, erro: "v\xEDdeo vazio" };
  const destino = destinoArquivo(raiz, nomeArquivo(opts.titulo || "video-json2video", ".mp4"), opts.saida);
  writeFileSync11(destino, buf);
  registrarUso(raiz, "json2video", true, { detalhe: projeto });
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: buf.length,
    mime: mimePorExt(".mp4"),
    aviso: "V\xEDdeo montado via JSON2Video (600s gr\xE1tis/m\xEAs). Baixado \u2014 a URL da CDN expira em 7 dias.",
    detalhes: { motor: "json2video", projeto, segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1) }
  };
}
var BASE3, TIMEOUT_RENDER_MS;
var init_json2video = __esm({
  "src/main/midia/json2video.ts"() {
    "use strict";
    init_core();
    init_guarda_custo();
    BASE3 = "https://api.json2video.com/v2";
    TIMEOUT_RENDER_MS = 10 * 6e4;
  }
});

// src/main/midia/gemini-video.ts
var gemini_video_exports = {};
__export(gemini_video_exports, {
  gerarVideoGemini: () => gerarVideoGemini
});
import { writeFileSync as writeFileSync12 } from "node:fs";
function chaveGemini2() {
  if (process.env.GEMINI_API_KEY)
    return process.env.GEMINI_API_KEY;
  try {
    const { lerChave: lerChave2 } = (init_segredos_providers(), __toCommonJS(segredos_providers_exports));
    return lerChave2("gemini");
  } catch {
    return null;
  }
}
async function gerarVideoGemini(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt do v\xEDdeo" };
  const chave = chaveGemini2();
  if (!chave) {
    return { ok: false, erro: "GEMINI_API_KEY n\xE3o configurada. Cadastre em Contas \u2192 Provedores (gemini)." };
  }
  const bloqueio = bloqueioCusto(raiz, "veo");
  if (bloqueio)
    return { ok: false, erro: bloqueio };
  const t0 = Date.now();
  const aspecto = opts.aspectRatio === "9:16" ? "9:16" : "16:9";
  const duracao = Math.min(8, Math.max(4, Math.floor(opts.duracaoSeg || 8)));
  let opNome = "";
  try {
    const r = await fetch(
      BASE4 + "/models/" + MODELO_VEO + ":predictLongRunning?key=" + encodeURIComponent(chave),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio: aspecto, durationSeconds: duracao }
        }),
        signal: AbortSignal.timeout(6e4)
      }
    );
    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      const erro = "Veo HTTP " + r.status + ": " + corpo.slice(0, 300);
      registrarUso(raiz, "veo", false, { detalhe: erro });
      return { ok: false, erro };
    }
    const j = await r.json();
    opNome = j.name || "";
    if (!opNome)
      return { ok: false, erro: "Veo n\xE3o retornou opera\xE7\xE3o." };
  } catch (e) {
    return { ok: false, erro: "falha ao submeter v\xEDdeo ao Veo: " + (e instanceof Error ? e.message : String(e)) };
  }
  const limite = Date.now() + 8 * 6e4;
  let videoUri = "";
  let mimeVideo = "video/mp4";
  while (Date.now() < limite) {
    await dormir5(1e4);
    try {
      const r = await fetch(BASE4 + "/" + opNome + "?key=" + encodeURIComponent(chave), {
        signal: AbortSignal.timeout(3e4)
      });
      if (!r.ok)
        continue;
      const j = await r.json();
      if (j.error?.message)
        return { ok: false, erro: "Veo falhou: " + j.error.message.slice(0, 300) };
      if (!j.done)
        continue;
      const samples = j.response?.generateVideoResponse?.generatedSamples || [];
      const v = samples.find((s) => s.video?.uri);
      if (!v?.video?.uri)
        return { ok: false, erro: "Veo concluiu sem v\xEDdeo na resposta." };
      videoUri = v.video.uri;
      mimeVideo = v.video.mimeType || "video/mp4";
      break;
    } catch {
    }
  }
  if (!videoUri)
    return { ok: false, erro: "Veo excedeu 8 min gerando o v\xEDdeo. Tente um prompt mais simples." };
  try {
    const dl = await fetch(videoUri + (videoUri.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(chave), {
      signal: AbortSignal.timeout(3e5)
    });
    if (!dl.ok)
      return { ok: false, erro: "falha ao baixar o v\xEDdeo gerado (HTTP " + dl.status + ")" };
    const buf = Buffer.from(await dl.arrayBuffer());
    const destino = destinoArquivo(raiz, nomeArquivo(prompt, ".mp4"), opts.saida);
    writeFileSync12(destino, buf);
    registrarUso(raiz, "veo", true, { detalhe: aspecto + "/" + duracao + "s" });
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime: mimeVideo,
      detalhes: {
        motor: "veo",
        modelo: MODELO_VEO,
        aspecto,
        duracaoSeg: duracao,
        segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1)
      },
      aviso: "V\xEDdeo gerado pelo Veo (Google) \u2014 leva alguns minutos e consome cota paga da chave Gemini. Custo registrado em .dg-editor/uso-custo.json."
    };
  } catch (e) {
    return { ok: false, erro: "falha ao salvar o v\xEDdeo: " + (e instanceof Error ? e.message : String(e)) };
  }
}
var MODELO_VEO, BASE4, dormir5;
var init_gemini_video = __esm({
  "src/main/midia/gemini-video.ts"() {
    "use strict";
    init_core();
    init_guarda_custo();
    MODELO_VEO = "veo-3.1-generate-preview";
    BASE4 = "https://generativelanguage.googleapis.com/v1beta";
    dormir5 = (ms) => new Promise((r) => setTimeout(r, ms));
  }
});

// scripts/smoke-midia.ts
init_hf_inferencia();

// src/main/midia/cascata.ts
init_core();

// src/main/midia/gemini-imagem.ts
import { readFileSync as readFileSync3, statSync as statSync2, writeFileSync as writeFileSync5 } from "node:fs";
init_core();
var MODELO_IMAGEM = "gemini-2.5-flash-image";
var URL_GERAR = "https://generativelanguage.googleapis.com/v1beta/models/" + MODELO_IMAGEM + ":generateContent";
function chaveGemini() {
  if (process.env.GEMINI_API_KEY)
    return process.env.GEMINI_API_KEY;
  try {
    const { lerChave: lerChave2 } = (init_segredos_providers(), __toCommonJS(segredos_providers_exports));
    return lerChave2("gemini");
  } catch {
    return null;
  }
}
function geminiImagemConfigurado() {
  return !!chaveGemini();
}
var cotaImagemBloqueadaAte = 0;
function geminiImagemCotaEsgotada() {
  return Date.now() < cotaImagemBloqueadaAte;
}
function registrarErroCota(status, corpo) {
  const t = corpo.toLowerCase();
  if (status === 429 || /quota|free tier|rate limit|exceeded/i.test(t)) {
    cotaImagemBloqueadaAte = Date.now() + 60 * 6e4;
  }
}
async function chamarGeminiImagem(chave, parts) {
  const res = await fetch(URL_GERAR + "?key=" + encodeURIComponent(chave), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"] }
    }),
    signal: AbortSignal.timeout(18e4)
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    registrarErroCota(res.status, corpo);
    return { ok: false, erro: "Gemini image HTTP " + res.status + ": " + corpo.slice(0, 300) };
  }
  const j = await res.json().catch(() => null);
  const img = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    return { ok: false, erro: "Gemini n\xE3o retornou imagem (verifique o prompt ou a cota da chave)." };
  }
  return {
    ok: true,
    mime: img.inlineData.mimeType || "image/png",
    dados: Buffer.from(img.inlineData.data, "base64")
  };
}
function salvarRespostaImagem(raiz, prompt, r, opts, t0, motor) {
  const ext = r.mime.includes("jpeg") || r.mime.includes("jpg") ? ".jpg" : r.mime.includes("webp") ? ".webp" : ".png";
  const destino = destinoArquivo(raiz, nomeArquivo(prompt, ext), opts.saida);
  writeFileSync5(destino, r.dados);
  const bytes = statSync2(destino).size;
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime: r.mime,
    previewBase64: previewDe(destino),
    detalhes: {
      motor,
      modelo: MODELO_IMAGEM,
      segundosProcessando: +((Date.now() - t0) / 1e3).toFixed(1)
    },
    aviso: "Imagem gerada pelo Gemini (nano banana) \u2014 r\xE1pida e gratuita dentro da cota da chave."
  };
}
function chaveOuErro() {
  const chave = chaveGemini();
  if (!chave) {
    return {
      erro: {
        ok: false,
        erro: "GEMINI_API_KEY n\xE3o configurada. Cadastre em Contas \u2192 Provedores (gemini) ou use midia_imagem_gerar."
      }
    };
  }
  return { chave };
}
async function gerarImagemGemini(raiz, opts) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt)
    return { ok: false, erro: "informe o prompt da imagem" };
  const c = chaveOuErro();
  if ("erro" in c)
    return c.erro;
  const t0 = Date.now();
  let r;
  try {
    r = await chamarGeminiImagem(c.chave, [{ text: prompt }]);
  } catch (e) {
    return { ok: false, erro: "falha de rede ao chamar o Gemini: " + (e instanceof Error ? e.message : String(e)) };
  }
  if (!r.ok)
    return { ok: false, erro: r.erro };
  return salvarRespostaImagem(raiz, prompt, r, opts, t0, "gemini-image");
}

// src/main/midia/cascata.ts
init_comfyui();
async function gerarImagemAuto(raiz, opts) {
  const tentativas = [];
  const registrar = (motor, r, t0) => {
    const t = { motor, ok: r.ok, segundos: +((Date.now() - t0) / 1e3).toFixed(1) };
    if (!r.ok && r.erro)
      t.erro = r.erro.slice(0, 160);
    tentativas.push(t);
    return t;
  };
  const comCascata = (r) => ({
    ...r,
    detalhes: { ...r.detalhes || {}, cascata: tentativas }
  });
  if (geminiImagemConfigurado() && !geminiImagemCotaEsgotada()) {
    const t0 = Date.now();
    try {
      const r = await gerarImagemGemini(raiz, { prompt: opts.prompt, saida: opts.saida });
      if (registrar("gemini-image", r, t0).ok)
        return comCascata(r);
    } catch (e) {
      tentativas.push({ motor: "gemini-image", ok: false, erro: String(e).slice(0, 160), segundos: +((Date.now() - t0) / 1e3).toFixed(1) });
    }
  } else {
    tentativas.push({
      motor: "gemini-image",
      ok: false,
      erro: geminiImagemConfigurado() ? "cota free esgotada (retry em at\xE9 1h)" : "sem GEMINI_API_KEY"
    });
  }
  {
    const t0 = Date.now();
    const r = await gerarImagem(raiz, {
      prompt: opts.prompt,
      largura: opts.largura,
      altura: opts.altura,
      seed: opts.seed,
      saida: opts.saida,
      esperarLimite: false
    });
    if (registrar("pollinations", r, t0).ok) {
      r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata gr\xE1tis-primeiro: Gemini indispon\xEDvel \u2192 Pollinations.";
      return comCascata(r);
    }
  }
  {
    const t0 = Date.now();
    try {
      const { gerarImagemHorde: gerarImagemHorde2 } = await Promise.resolve().then(() => (init_horde(), horde_exports));
      const r = await gerarImagemHorde2(raiz, {
        prompt: opts.prompt,
        largura: opts.largura,
        altura: opts.altura,
        seed: opts.seed,
        saida: opts.saida
      });
      if (registrar("ai-horde", r, t0).ok) {
        r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata gr\xE1tis-primeiro: Pollinations indispon\xEDvel \u2192 AI Horde.";
        return comCascata(r);
      }
    } catch (e) {
      tentativas.push({ motor: "ai-horde", ok: false, erro: String(e).slice(0, 160), segundos: +((Date.now() - t0) / 1e3).toFixed(1) });
    }
  }
  {
    try {
      const { gerarImagemHF: gerarImagemHF2, hfConfigurado: hfConfigurado2 } = await Promise.resolve().then(() => (init_hf_inferencia(), hf_inferencia_exports));
      if (hfConfigurado2()) {
        const t0 = Date.now();
        const r = await gerarImagemHF2(raiz, { prompt: opts.prompt, saida: opts.saida });
        if (registrar("huggingface", r, t0).ok) {
          r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata gr\xE1tis-primeiro: Horde indispon\xEDvel \u2192 HuggingFace free tier.";
          return comCascata(r);
        }
      } else {
        tentativas.push({ motor: "huggingface", ok: false, erro: "sem HF_TOKEN" });
      }
    } catch (e) {
      tentativas.push({ motor: "huggingface", ok: false, erro: String(e).slice(0, 160) });
    }
  }
  {
    try {
      const { gerarImagemCF: gerarImagemCF2, cfConfigurado: cfConfigurado2 } = await Promise.resolve().then(() => (init_cloudflare(), cloudflare_exports));
      if (cfConfigurado2()) {
        const t0 = Date.now();
        const r = await gerarImagemCF2(raiz, { prompt: opts.prompt, saida: opts.saida });
        if (registrar("cloudflare-workers-ai", r, t0).ok) {
          r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata gr\xE1tis-primeiro: HF indispon\xEDvel \u2192 Cloudflare Workers AI.";
          return comCascata(r);
        }
      } else {
        tentativas.push({ motor: "cloudflare-workers-ai", ok: false, erro: "sem CLOUDFLARE_API_TOKEN/ACCOUNT_ID" });
      }
    } catch (e) {
      tentativas.push({ motor: "cloudflare-workers-ai", ok: false, erro: String(e).slice(0, 160) });
    }
  }
  if (comfyInstalado()) {
    const t0 = Date.now();
    try {
      const r = await gerarImagemComfy(raiz, {
        prompt: opts.prompt,
        largura: opts.largura,
        altura: opts.altura,
        passos: opts.passos,
        seed: opts.seed,
        saida: opts.saida
      });
      if (registrar("comfyui-local", r, t0).ok) {
        r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata gr\xE1tis-primeiro: engines cloud indispon\xEDveis \u2192 ComfyUI local.";
        return comCascata(r);
      }
    } catch (e) {
      tentativas.push({ motor: "comfyui-local", ok: false, erro: String(e).slice(0, 160), segundos: +((Date.now() - t0) / 1e3).toFixed(1) });
    }
  } else {
    tentativas.push({ motor: "comfyui-local", ok: false, erro: "ComfyUI n\xE3o instalado" });
  }
  if (opts.incluirPago) {
    try {
      const { gerarImagemOpenAI: gerarImagemOpenAI2 } = await Promise.resolve().then(() => (init_openai_midia(), openai_midia_exports));
      const t0 = Date.now();
      const r = await gerarImagemOpenAI2(raiz, { prompt: opts.prompt, saida: opts.saida });
      registrar("openai-gpt-image", r, t0);
      if (r.ok) {
        r.aviso = (r.aviso ? r.aviso + " " : "") + "Todos os motores gr\xE1tis falharam \u2192 OpenAI pago usado (custo aplicado).";
        return comCascata(r);
      }
    } catch {
    }
  }
  const ultimo = [...tentativas].reverse().find((t) => t.erro)?.erro;
  return {
    ok: false,
    erro: "Nenhum motor de imagem conseguiu gerar. \xDAltimo erro: " + (ultimo || "desconhecido"),
    codigo: "SEM_MOTOR",
    detalhes: { cascata: tentativas },
    aviso: opts.incluirPago ? "Todos os motores falharam, incluindo OpenAI." : "Motores gr\xE1tis falharam. Para usar o pago (gpt-image), chame midia_imagem_openai ou passe incluir_pago=true."
  };
}

// src/main/midia/estoque.ts
init_core();
import { writeFileSync as writeFileSync10 } from "node:fs";
import { extname as extname2 } from "node:path";
var BASE2 = "https://pixabay.com/api";
function chavePixabay() {
  return (process.env.PIXABAY_API_KEY || "").trim() || null;
}
async function getJson(url, timeoutMs = 3e4) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const texto = await res.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { ok: res.ok, status: res.status, dados };
}
function erroChave() {
  return {
    ok: false,
    erro: "PIXABAY_API_KEY n\xE3o configurada. Cadastre gr\xE1tis em pixabay.com/api/docs e salve em Contas \u2192 Provedores ou vari\xE1vel de ambiente."
  };
}
async function buscarMidia(raiz, opts) {
  const chave = chavePixabay();
  if (!chave)
    return erroChave();
  const consulta = String(opts.consulta || "").trim();
  if (!consulta)
    return { ok: false, erro: "informe a consulta de busca" };
  const pagina = Math.max(1, Math.round(opts.pagina || 1));
  const porPagina = Math.min(200, Math.max(3, Math.round(opts.porPagina || 12)));
  const endpoint = opts.tipo === "video" ? BASE2 + "/videos/" : BASE2 + "/";
  const qs = new URLSearchParams({
    key: chave,
    q: consulta.slice(0, 100),
    per_page: String(porPagina),
    page: String(pagina),
    safesearch: "true"
  });
  const r = await getJson(endpoint + "?" + qs.toString());
  if (!r.ok)
    return { ok: false, erro: "Pixabay HTTP " + r.status + ": " + JSON.stringify(r.dados).slice(0, 200) };
  const dados = r.dados;
  const hits = Array.isArray(dados?.hits) ? dados.hits : [];
  const itens = hits.slice(0, porPagina).map((h) => {
    if (opts.tipo === "video") {
      const v = h;
      return {
        id: v.id,
        tags: v.tags,
        usuario: v.user,
        duracaoSeg: v.duration,
        pageURL: v.pageURL,
        melhor: v.videos?.large?.url || v.videos?.medium?.url || "",
        resolucao: (v.videos?.large?.width || 0) + "x" + (v.videos?.large?.height || 0)
      };
    }
    const i = h;
    return {
      id: i.id,
      tags: i.tags,
      usuario: i.user,
      pageURL: i.pageURL,
      downloadURL: i.webformatURL,
      resolucao: i.imageWidth + "x" + i.imageHeight
    };
  });
  return {
    ok: true,
    texto: JSON.stringify({ total: dados?.totalHits ?? hits.length, pagina, itens }, null, 2),
    detalhes: { motor: "pixabay", tipo: opts.tipo, total: dados?.totalHits }
  };
}
async function baixarMidia(raiz, opts) {
  const chave = chavePixabay();
  if (!chave)
    return erroChave();
  const url = String(opts.url || "").trim();
  if (!/^https:\/\/(cdn\.)?pixabay\.com\//.test(url) && !/pixabay\.com/.test(url)) {
    return { ok: false, erro: "URL n\xE3o \xE9 do Pixabay: " + url.slice(0, 120) };
  }
  const tipo = opts.tipo === "video" ? "video" : opts.tipo === "imagem" ? "imagem" : "auto";
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12e4),
    headers: { "User-Agent": "DG-Editor/0.6.5" }
  });
  if (!res.ok)
    return { ok: false, erro: "download Pixabay HTTP " + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length)
    return { ok: false, erro: "arquivo vazio" };
  const ext = extname2(new URL(url).pathname).toLowerCase() || (tipo === "video" ? ".mp4" : ".jpg");
  const nome = nomeArquivo(opts.consulta || "pixabay-" + (tipo === "video" ? "video" : "imagem"), ext);
  const destino = destinoArquivo(raiz, nome, opts.saida);
  writeFileSync10(destino, buf);
  const ehVideo = ext === ".mp4" || ext === ".webm" || tipo === "video";
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: buf.length,
    mime: mimePorExt(ext) || (ehVideo ? "video/mp4" : "image/jpeg"),
    previewBase64: ehVideo ? void 0 : previewDe(destino),
    aviso: "M\xEDdia stock gratuita via Pixabay (conte\xFAdo royalty-free)."
  };
}

// scripts/smoke-midia.ts
init_json2video();

// src/main/midia/video-auto.ts
async function gerarVideoAuto(raiz, opts) {
  const tentativas = [];
  const registrar = (motor, r, t0) => {
    const t = { motor, ok: r.ok, segundos: +((Date.now() - t0) / 1e3).toFixed(1) };
    if (!r.ok && r.erro)
      t.erro = r.erro.slice(0, 160);
    tentativas.push(t);
    return t;
  };
  const comCascata = (r) => ({
    ...r,
    detalhes: { ...r.detalhes || {}, cascata: tentativas }
  });
  if (!String(opts.prompt || "").trim() && !opts.cenas?.length) {
    return { ok: false, erro: "informe prompt (texto-para-v\xEDdeo) ou cenas (imagem/texto/narra\xE7\xE3o)" };
  }
  if (opts.cenas?.length) {
    try {
      const { gerarVideoJson2Video: gerarVideoJson2Video2, json2videoConfigurado: json2videoConfigurado2 } = await Promise.resolve().then(() => (init_json2video(), json2video_exports));
      if (json2videoConfigurado2()) {
        const t0 = Date.now();
        const r = await gerarVideoJson2Video2(raiz, {
          cenas: opts.cenas,
          saida: opts.saida
        });
        if (registrar("json2video", r, t0).ok) {
          r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata v\xEDdeo gr\xE1tis-primeiro: JSON2Video (cota mensal).";
          return comCascata(r);
        }
      } else {
        tentativas.push({ motor: "json2video", ok: false, erro: "sem JSON2VIDEO_API_KEY" });
      }
    } catch (e) {
      tentativas.push({ motor: "json2video", ok: false, erro: String(e).slice(0, 160) });
    }
  }
  const prompt = String(opts.prompt || "").trim();
  if (prompt) {
    try {
      const { gerarVideoComfy: gerarVideoComfy2, comfyInstalado: comfyInstalado2 } = await Promise.resolve().then(() => (init_comfyui(), comfyui_exports));
      if (comfyInstalado2()) {
        const t0 = Date.now();
        const r = await gerarVideoComfy2(raiz, {
          prompt,
          largura: opts.largura,
          altura: opts.altura,
          saida: opts.saida
        });
        if (registrar("comfyui-video", r, t0).ok) {
          r.aviso = (r.aviso ? r.aviso + " " : "") + "Cascata v\xEDdeo gr\xE1tis-primeiro: ComfyUI local.";
          return comCascata(r);
        }
      } else {
        tentativas.push({ motor: "comfyui-video", ok: false, erro: "ComfyUI n\xE3o instalado" });
      }
    } catch (e) {
      tentativas.push({ motor: "comfyui-video", ok: false, erro: String(e).slice(0, 160) });
    }
  }
  if (opts.incluirPago && prompt) {
    try {
      const { gerarVideoGemini: gerarVideoGemini2 } = await Promise.resolve().then(() => (init_gemini_video(), gemini_video_exports));
      const t0 = Date.now();
      const r = await gerarVideoGemini2(raiz, { prompt, saida: opts.saida });
      registrar("veo", r, t0);
      if (r.ok) {
        r.aviso = (r.aviso ? r.aviso + " " : "") + "Motores gr\xE1tis falharam \u2192 Veo pago usado (custo aplicado).";
        return comCascata(r);
      }
    } catch {
    }
  }
  const ultimo = [...tentativas].reverse().find((t) => t.erro)?.erro;
  return {
    ok: false,
    erro: "Nenhum motor de v\xEDdeo conseguiu gerar. \xDAltimo erro: " + (ultimo || "desconhecido"),
    codigo: "SEM_MOTOR_VIDEO",
    detalhes: { cascata: tentativas },
    aviso: opts.incluirPago ? "Todos os motores falharam, incluindo Veo." : "Motores gr\xE1tis falharam. Para v\xEDdeo IA realista pago, chame midia_video_gemini ou passe incluir_pago=true."
  };
}

// scripts/smoke-midia.ts
init_core();
import { existsSync as existsSync6, mkdirSync as mkdirSync7, writeFileSync as writeFileSync13 } from "node:fs";
import { join as join7 } from "node:path";
globalThis.__dirname = process.cwd();
var RAIZ = join7(process.cwd(), ".dg-editor", "smoke");
mkdirSync7(RAIZ, { recursive: true });
function resumo(nome, r) {
  const t = (r.texto || "").slice(0, 220).replace(/\s+/g, " ");
  console.log(`[${nome}] ok=${r.ok} ${r.erro ? "ERRO=" + r.erro.slice(0, 200) : ""} ${t}`);
  return r;
}
async function main() {
  const alvo = process.argv[2] || "todos";
  if (alvo === "todos" || alvo === "hf") {
    if (!hfConfigurado())
      console.log("[hf] HF_TOKEN ausente \u2014 pulando");
    else
      resumo("hf", await gerarImagemHF(RAIZ, { prompt: "a red apple on white table, product photo" }));
  }
  if (alvo === "cascata") {
    const r = await gerarImagemAuto(RAIZ, { prompt: "a red apple on white table, product photo" });
    resumo("cascata", r);
    const casc = r.detalhes?.cascata;
    for (const t of casc || [])
      console.log(`   ${t.motor}: ok=${t.ok} ${t.segundos ?? ""}s ${t.erro || ""}`);
  }
  if (alvo === "todos" || alvo === "pixabay") {
    const busca = resumo("pixabay-busca", await buscarMidia(RAIZ, { tipo: "imagem", consulta: "red apple", porPagina: 3 }));
    if (busca.ok) {
      try {
        const itens = JSON.parse(busca.texto || "{}").itens;
        const url = itens?.[0]?.downloadURL;
        if (url)
          resumo("pixabay-download", await baixarMidia(RAIZ, { url, tipo: "imagem", consulta: "red apple" }));
      } catch (e) {
        console.log("[pixabay-download] parse falhou", String(e));
      }
    }
  }
  if (alvo === "todos" || alvo === "j2v") {
    if (!json2videoConfigurado())
      console.log("[j2v] JSON2VIDEO_API_KEY ausente \u2014 pulando");
    else {
      resumo("j2v", await gerarVideoJson2Video(RAIZ, {
        resolucao: "small",
        cenas: [{ duracao: 4, imagemUrl: "https://picsum.photos/640/360", texto: "smoke test" }]
      }));
    }
  }
  if (alvo === "todos" || alvo === "videoauto") {
    if (!json2videoConfigurado())
      console.log("[videoauto] sem JSON2VIDEO_API_KEY \u2014 pulando");
    else {
      resumo("videoauto", await gerarVideoAuto(RAIZ, {
        cenas: [{ duracao: 4, imagemUrl: "https://picsum.photos/640/360", texto: "smoke auto" }]
      }));
    }
  }
  if (alvo === "todos" || alvo === "whisper") {
    const wav = join7(RAIZ, "tom-teste.wav");
    if (!existsSync6(wav)) {
      const n = 16e3 * 2;
      const buf = Buffer.alloc(44 + n * 2);
      buf.write("RIFF", 0);
      buf.writeUInt32LE(36 + n * 2, 4);
      buf.write("WAVE", 8);
      buf.write("fmt ", 12);
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(16e3, 24);
      buf.writeUInt32LE(32e3, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write("data", 36);
      buf.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++)
        buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16e3) * 12e3), 44 + i * 2);
      writeFileSync13(wav, buf);
    }
    resumo("whisper", await transcrever(RAIZ, { entrada: wav, idioma: "pt" }));
  }
}
main().catch((e) => {
  console.error("SMOKE_FALHOU", e);
  process.exit(1);
});
