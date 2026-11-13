/**
 * ComfyUI local (CPU) — geração ilimitada de imagem e vídeo, gratuita.
 *
 * Roda fora do repositório em %LOCALAPPDATA%/dg-editor/comfyui (DG_COMFY_DIR).
 * O DG Editor inicia/para o servidor e envia workflows pela API HTTP (porta 8188).
 * Imagem: SD 1.5 + LoRA LCM (poucos passos). Vídeo: AnimateDiff (SD 1.5).
 * Tudo processado na CPU; não usa CUDA nem serviços pagos.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  pastaMidia,
  previewDe,
  rodar,
  type RespostaMidia
} from './core'
import { caminhoDentroDaRaiz } from '../paths'
import { detectarHardware } from './hardware'

const HOST = '127.0.0.1'
const PORTA = 8188
const URL_BASE = 'http://' + HOST + ':' + PORTA

const CKPT_PREFERIDO = 'dreamshaper_8.safetensors'
const LORA_LCM = 'lcm-lora-sdv1-5.safetensors'
const MOTION_PREFERIDO = 'mm_sd_v15_v2.ckpt'

export type StatusComfy = {
  ok: boolean
  instalado: boolean
  online: boolean
  host: string
  porta: number
  url: string
  versao?: string
  erro?: string
  fila?: { executando: number; pendentes: number }
  modelos?: {
    checkpoints: string[]
    lcm: boolean
    motion: string[]
    animateDiff: boolean
  }
}

export function pastaComfy(): string {
  const custom = process.env.DG_COMFY_DIR
  const base =
    custom && custom.trim()
      ? custom.trim()
      : process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'dg-editor', 'comfyui')
        : join(homedir(), '.dg-editor', 'comfyui')
  mkdirSync(base, { recursive: true })
  return base
}

export function pastaAppComfy(): string {
  return join(pastaComfy(), 'app')
}

export function pythonComfy(): string {
  const base = join(pastaComfy(), 'venv')
  return process.platform === 'win32' ? join(base, 'Scripts', 'python.exe') : join(base, 'bin', 'python')
}

export function comfyInstalado(): boolean {
  return existsSync(join(pastaAppComfy(), 'main.py')) && existsSync(pythonComfy())
}

function pastaModelos(): string {
  return join(pastaAppComfy(), 'models')
}

function listarArquivos(pasta: string, exts: RegExp): string[] {
  try {
    return readdirSync(pasta).filter((n) => exts.test(n)).sort()
  } catch {
    return []
  }
}

function escolherCheckpoint(): string {
  const lista = listarArquivos(join(pastaModelos(), 'checkpoints'), /\.(safetensors|ckpt)$/i)
  if (lista.includes(CKPT_PREFERIDO)) return CKPT_PREFERIDO
  return lista[0] || CKPT_PREFERIDO
}

function escolherMotion(): string {
  const lista = listarArquivos(join(pastaModelos(), 'animatediff_models'), /\.(safetensors|ckpt|bin)$/i)
  if (lista.includes(MOTION_PREFERIDO)) return MOTION_PREFERIDO
  return lista[0] || MOTION_PREFERIDO
}

function temLcm(): boolean {
  return listarArquivos(join(pastaModelos(), 'loras'), /\.(safetensors|pt)$/i).includes(LORA_LCM)
}

function temAnimateDiff(): boolean {
  return existsSync(join(pastaAppComfy(), 'custom_nodes', 'ComfyUI-AnimateDiff-Evolved', '__init__.py'))
}

function modelosDisponiveis() {
  return {
    checkpoints: listarArquivos(join(pastaModelos(), 'checkpoints'), /\.(safetensors|ckpt)$/i),
    lcm: temLcm(),
    motion: listarArquivos(join(pastaModelos(), 'animatediff_models'), /\.(safetensors|ckpt|bin)$/i),
    animateDiff: temAnimateDiff()
  }
}

// ------------------------------------------------------------------- HTTP

async function jsonHttp(path: string, opcoes: { method?: string; body?: string; timeoutMs?: number } = {}) {
  try {
    const res = await fetch(URL_BASE + path, {
      method: opcoes.method || 'GET',
      headers: opcoes.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opcoes.body,
      signal: AbortSignal.timeout(opcoes.timeoutMs || 5000)
    })
    const texto = await res.text()
    let dados: unknown = null
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = texto
    }
    return { ok: res.ok, status: res.status, dados }
  } catch (e) {
    return { ok: false, status: 0, dados: null, erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function statusComfy(): Promise<StatusComfy> {
  const base: StatusComfy = {
    ok: false,
    instalado: comfyInstalado(),
    online: false,
    host: HOST,
    porta: PORTA,
    url: URL_BASE,
    modelos: modelosDisponiveis()
  }
  const r = await jsonHttp('/system_stats', { timeoutMs: 2500 })
  if (!r.ok) {
    return {
      ...base,
      erro: base.instalado
        ? 'ComfyUI instalado, servidor parado — clique em "Iniciar ComfyUI".'
        : 'ComfyUI não instalado.'
    }
  }
  const stats = r.dados as { system?: { comfyui_version?: string } } | null
  const q = await jsonHttp('/queue', { timeoutMs: 2500 })
  const fila = q.ok
    ? {
        executando: Array.isArray((q.dados as { queue_running?: unknown[] })?.queue_running)
          ? ((q.dados as { queue_running: unknown[] }).queue_running.length)
          : 0,
        pendentes: Array.isArray((q.dados as { queue_pending?: unknown[] })?.queue_pending)
          ? ((q.dados as { queue_pending: unknown[] }).queue_pending.length)
          : 0
      }
    : undefined
  return {
    ...base,
    ok: true,
    online: true,
    versao: stats?.system?.comfyui_version ? 'ComfyUI ' + stats.system.comfyui_version : 'online',
    fila
  }
}

function arquivoPid(): string {
  return join(pastaComfy(), 'comfyui.pid')
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Sobe o ComfyUI em CPU e espera ficar online (até 4 min). */
export async function iniciarComfy(): Promise<{ ok: boolean; erro?: string; status?: StatusComfy }> {
  const atual = await statusComfy()
  if (atual.online) return { ok: true, status: atual }
  if (!atual.instalado) {
    return { ok: false, erro: 'ComfyUI não instalado em ' + pastaComfy() + '. Rode a instalação automática.' }
  }
  const log = join(pastaComfy(), 'comfyui.log')
  let fd: number | undefined
  try {
    fd = openSync(log, 'a')
    const filho = spawn(
      pythonComfy(),
      ['main.py', '--cpu', '--listen', HOST, '--port', String(PORTA), '--disable-auto-launch', '--preview-method', 'none'],
      {
        cwd: pastaAppComfy(),
        detached: true,
        windowsHide: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_TELEMETRY: '1' }
      }
    )
    filho.unref()
    if (filho.pid) writeFileSync(arquivoPid(), String(filho.pid), 'utf8')
  } catch (e) {
    return { ok: false, erro: 'falha ao iniciar: ' + (e instanceof Error ? e.message : String(e)) }
  } finally {
    if (fd !== undefined) {
      try {
        const { closeSync } = await import('node:fs')
        closeSync(fd)
      } catch {
        /* */
      }
    }
  }
  const limite = Date.now() + 240_000
  while (Date.now() < limite) {
    await dormir(2000)
    const s = await statusComfy()
    if (s.online) return { ok: true, status: s }
  }
  let finalLog = ''
  try {
    finalLog = readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean).slice(-4).join(' ').slice(-400)
  } catch {
    /* */
  }
  return { ok: false, erro: 'ComfyUI não respondeu em 4 min. ' + (finalLog || 'veja comfyui.log') }
}

export async function pararComfy(): Promise<{ ok: boolean; erro?: string }> {
  let pid = 0
  try {
    pid = Number(readFileSync(arquivoPid(), 'utf8').trim())
  } catch {
    /* */
  }
  if (!pid) {
    const s = await statusComfy()
    if (!s.online) return { ok: true }
    return { ok: false, erro: 'servidor online, mas o PID não foi encontrado (inicie pelo DG Editor)' }
  }
  const r =
    process.platform === 'win32'
      ? await rodar('taskkill', ['/PID', String(pid), '/T', '/F'], 30_000)
      : await rodar('kill', ['-TERM', String(pid)], 30_000)
  try {
    rmSync(arquivoPid(), { force: true })
  } catch {
    /* */
  }
  if (!r.ok) return { ok: false, erro: 'falha ao encerrar PID ' + pid + ': ' + (r.erro || r.stderr).slice(0, 200) }
  return { ok: true }
}

async function garantirOnline(): Promise<{ ok: boolean; erro?: string }> {
  const s = await statusComfy()
  if (s.online) return { ok: true }
  const r = await iniciarComfy()
  return r.ok ? { ok: true } : { ok: false, erro: r.erro }
}

// -------------------------------------------------------------- workflows

function workflowImagem(p: {
  prompt: string
  negativo: string
  largura: number
  altura: number
  passos: number
  cfg: number
  seed: number
}): Record<string, unknown> {
  const checkpoint = escolherCheckpoint()
  const usarLora = temLcm()
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
    ...(usarLora
      ? {
          2: {
            class_type: 'LoraLoader',
            inputs: {
              model: ['1', 0],
              clip: ['1', 1],
              lora_name: LORA_LCM,
              strength_model: 1,
              strength_clip: 1
            }
          }
        }
      : {}),
    3: {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: usarLora ? ['2', 1] : ['1', 1] }
    },
    4: {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negativo, clip: usarLora ? ['2', 1] : ['1', 1] }
    },
    5: {
      class_type: 'EmptyLatentImage',
      inputs: { width: p.largura, height: p.altura, batch_size: 1 }
    },
    6: {
      class_type: 'KSampler',
      inputs: {
        model: usarLora ? ['2', 0] : ['1', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
        seed: p.seed,
        steps: p.passos,
        cfg: p.cfg,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1
      }
    },
    7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    8: { class_type: 'SaveImage', inputs: { images: ['7', 0], filename_prefix: 'dg-imagem' } }
  }
}

function workflowVideo(p: {
  prompt: string
  negativo: string
  largura: number
  altura: number
  quadros: number
  passos: number
  cfg: number
  seed: number
}): Record<string, unknown> {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: escolherCheckpoint() } },
    2: {
      class_type: 'ADE_AnimateDiffLoaderGen1',
      inputs: { model: ['1', 0], model_name: escolherMotion(), beta_schedule: 'autoselect' }
    },
    3: { class_type: 'CLIPTextEncode', inputs: { text: p.prompt, clip: ['1', 1] } },
    4: { class_type: 'CLIPTextEncode', inputs: { text: p.negativo, clip: ['1', 1] } },
    5: {
      class_type: 'EmptyLatentImage',
      inputs: { width: p.largura, height: p.altura, batch_size: p.quadros }
    },
    6: {
      class_type: 'KSampler',
      inputs: {
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
        seed: p.seed,
        steps: p.passos,
        cfg: p.cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1
      }
    },
    7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    8: { class_type: 'SaveImage', inputs: { images: ['7', 0], filename_prefix: 'dg-video' } }
  }
}

function workflowFotoVideo(p: {
  imagem: string
  prompt: string
  negativo: string
  quadros: number
  passos: number
  cfg: number
  seed: number
  denoise: number
}): Record<string, unknown> {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: escolherCheckpoint() } },
    2: { class_type: 'LoadImage', inputs: { image: p.imagem } },
    3: { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
    4: { class_type: 'RepeatLatentBatch', inputs: { samples: ['3', 0], amount: p.quadros } },
    5: {
      class_type: 'ADE_AnimateDiffLoaderGen1',
      inputs: { model: ['1', 0], model_name: escolherMotion(), beta_schedule: 'autoselect' }
    },
    6: { class_type: 'CLIPTextEncode', inputs: { text: p.prompt, clip: ['1', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: p.negativo, clip: ['1', 1] } },
    8: {
      class_type: 'KSampler',
      inputs: {
        model: ['5', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['4', 0],
        seed: p.seed,
        steps: p.passos,
        cfg: p.cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: p.denoise
      }
    },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
    10: { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'dg-fotovideo' } }
  }
}

function erroDoPrompt(dados: unknown, status: number): string {  if (dados && typeof dados === 'object') {
    const o = dados as { error?: { message?: string; details?: string }; node_errors?: Record<string, { errors?: { message?: string }[] }> }
    if (o.error?.message) return o.error.message + (o.error.details ? ' — ' + o.error.details : '')
    if (o.node_errors) {
      for (const [no, info] of Object.entries(o.node_errors)) {
        const msg = info?.errors?.[0]?.message
        if (msg) return 'nó ' + no + ': ' + msg
      }
    }
  }
  return 'HTTP ' + status
}

async function enfileirar(workflow: Record<string, unknown>): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const r = await jsonHttp('/prompt', {
    method: 'POST',
    body: JSON.stringify({ prompt: workflow, client_id: 'dg-editor' }),
    timeoutMs: 20_000
  })
  if (!r.ok) return { ok: false, erro: erroDoPrompt(r.dados, r.status) }
  const id = (r.dados as { prompt_id?: string } | null)?.prompt_id
  return id ? { ok: true, id } : { ok: false, erro: 'ComfyUI não retornou prompt_id' }
}

type ImagemSaida = { filename: string; subfolder: string; type: string }

async function aguardarSaida(
  id: string,
  timeoutMs: number
): Promise<{ ok: boolean; imagens?: ImagemSaida[]; erro?: string }> {
  const limite = Date.now() + timeoutMs
  let semFila = 0
  while (Date.now() < limite) {
    await dormir(1500)
    const h = await jsonHttp('/history/' + encodeURIComponent(id), { timeoutMs: 8000 })
    if (h.ok && h.dados && typeof h.dados === 'object') {
      const entrada = (h.dados as Record<string, { outputs?: Record<string, { images?: ImagemSaida[] }>; status?: { status_str?: string; messages?: unknown[] } }>)[id]
      if (entrada) {
        if (entrada.status?.status_str === 'error') {
          return { ok: false, erro: 'ComfyUI reportou erro na execução' }
        }
        const imagens: ImagemSaida[] = []
        for (const no of Object.values(entrada.outputs || {})) {
          for (const img of no.images || []) imagens.push(img)
        }
        if (imagens.length) {
          imagens.sort((a, b) => a.filename.localeCompare(b.filename))
          return { ok: true, imagens }
        }
        return { ok: false, erro: 'workflow concluiu sem imagens (falta SaveImage?)' }
      }
    }
    const q = await jsonHttp('/queue', { timeoutMs: 4000 })
    if (q.ok) {
      const o = q.dados as { queue_running?: unknown[]; queue_pending?: unknown[] }
      const naFila = [...(o.queue_running || []), ...(o.queue_pending || [])].some((item) =>
        JSON.stringify(item).includes(id)
      )
      semFila = naFila ? 0 : semFila + 1
      if (semFila >= 8) return { ok: false, erro: 'prompt saiu da fila sem resultado (veja o log do ComfyUI)' }
    }
  }
  return { ok: false, erro: 'tempo esgotado aguardando o ComfyUI' }
}

async function baixarImagem(img: ImagemSaida, destino: string): Promise<void> {
  const qs = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' })
  const res = await fetch(URL_BASE + '/view?' + qs.toString(), { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ao baixar ' + img.filename)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) throw new Error('arquivo vazio: ' + img.filename)
  writeFileSync(destino, buf)
}

function limitar(v: unknown, min: number, max: number, padrao: number, passo = 1): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : padrao
  const passoOk = Math.max(passo, Math.round(n / passo) * passo)
  return Math.min(max, Math.max(min, passoOk))
}

/** Fonte com Impact disponível no SO (drawtext). */
export function fonteMeme(): string | undefined {
  const candidatas =
    process.platform === 'win32'
      ? ['C:/Windows/Fonts/impact.ttf', 'C:/Windows/Fonts/arialbd.ttf']
      : ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Impact.ttf']
  return candidatas.find((f) => existsSync(f))
}

const FONTE_MARCA =
  process.platform === 'win32' ? 'C:/Windows/Fonts/arialbd.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

/** Marca visível de conteúdo sintético (obrigatória em foto→vídeo). */
function filtroMarcaDagua(altura: number): string | undefined {
  if (!existsSync(FONTE_MARCA)) return undefined
  const fonte = FONTE_MARCA.replace(/\\/g, '/').replace(/:/g, '\\:')
  const corpo = Math.max(14, Math.round(altura * 0.035))
  return (
    "drawtext=fontfile='" + fonte + "':text='gerado por IA':expansion=none:fontcolor=white@0.8:" +
    'fontsize=' + corpo + ':box=1:boxcolor=black@0.35:boxborderw=6:x=w-tw-12:y=h-th-12'
  )
}

// ------------------------------------------------------------- gerações

export async function gerarImagemComfy(
  raiz: string,
  opts: {
    prompt: string
    negocio?: string
    largura?: number
    altura?: number
    passos?: number
    seed?: number
    saida?: string
  }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt da imagem' }
  const on = await garantirOnline()
  if (!on.ok) return { ok: false, erro: on.erro || 'ComfyUI offline' }
  if (!modelosDisponiveis().checkpoints.length) {
    return { ok: false, erro: 'Nenhum checkpoint em models/checkpoints — baixe o modelo SD 1.5.' }
  }
  const hw = await detectarHardware()
  const largura = limitar(opts.largura, 256, 1024, hw.comfy.largura, 64)
  const altura = limitar(opts.altura, 256, 1024, hw.comfy.altura, 64)
  const lcm = temLcm()
  const passos = limitar(opts.passos, 1, 40, lcm ? hw.comfy.passos : Math.max(12, hw.comfy.passos * 2))
  const cfg = lcm ? 1.5 : 7
  const seed =
    typeof opts.seed === 'number' && Number.isFinite(opts.seed)
      ? Math.floor(opts.seed)
      : Math.floor(Math.random() * 2 ** 31)
  const destino = destinoArquivo(raiz, nomeArquivo('comfy-imagem', '.png'), opts.saida)
  const t0 = Date.now()
  const enq = await enfileirar(
    workflowImagem({
      prompt,
      negativo: opts.negocio || 'baixa qualidade, borrado, distorcido, marca d\'água, texto',
      largura,
      altura,
      passos,
      cfg,
      seed
    })
  )
  if (!enq.ok) return { ok: false, erro: 'ComfyUI recusou o workflow: ' + (enq.erro || '?') }
  const fim = await aguardarSaida(enq.id as string, 15 * 60_000)
  if (!fim.ok || !fim.imagens?.length) {
    return { ok: false, erro: 'Geração no ComfyUI falhou: ' + (fim.erro || 'sem saída') }
  }
  const tmp = join(pastaMidia(raiz), '.comfy-' + Date.now())
  mkdirSync(tmp, { recursive: true })
  try {
    const bruto = join(tmp, 'saida.png')
    await baixarImagem(fim.imagens[0], bruto)
    copyFileSync(bruto, destino)
  } catch (e) {
    return { ok: false, erro: 'falha ao baixar a imagem: ' + (e instanceof Error ? e.message : String(e)) }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  const bytes = statSync(destino).size
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime: 'image/png',
    previewBase64: previewDe(destino),
    detalhes: { motor: 'comfyui', modelo: escolherCheckpoint(), largura, altura, passos, seed, segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1) },
    aviso: 'Imagem gerada localmente no ComfyUI (CPU, ilimitada): ' + largura + 'x' + altura + ', ' + passos + ' passos.'
  }
}

export async function gerarVideoComfy(
  raiz: string,
  opts: {
    prompt: string
    negocio?: string
    largura?: number
    altura?: number
    quadros?: number
    fps?: number
    passos?: number
    seed?: number
    saida?: string
  }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt do vídeo' }
  if (!temAnimateDiff()) {
    return {
      ok: false,
      erro: 'Custom node ComfyUI-AnimateDiff-Evolved ausente em custom_nodes — rode a instalação de vídeo.'
    }
  }
  if (!modelosDisponiveis().motion.length) {
    return { ok: false, erro: 'Motion module ausente em models/animatediff_models — baixe o mm_sd_v15_v2.' }
  }
  const on = await garantirOnline()
  if (!on.ok) return { ok: false, erro: on.erro || 'ComfyUI offline' }
  if (!modelosDisponiveis().checkpoints.length) {
    return { ok: false, erro: 'Nenhum checkpoint em models/checkpoints — baixe o modelo SD 1.5.' }
  }
  const hw = await detectarHardware()
  const largura = limitar(opts.largura, 256, 768, Math.min(768, hw.comfy.largura), 64)
  const altura = limitar(opts.altura, 256, 768, Math.min(768, hw.comfy.altura), 64)
  const quadros = limitar(opts.quadros, 8, 32, hw.comfy.quadros)
  const fps = limitar(opts.fps, 4, 16, hw.comfy.fps)
  const passos = limitar(opts.passos, 2, 20, hw.comfy.passos)
  const seed =
    typeof opts.seed === 'number' && Number.isFinite(opts.seed)
      ? Math.floor(opts.seed)
      : Math.floor(Math.random() * 2 ** 31)
  const destino = destinoArquivo(raiz, nomeArquivo('comfy-video', '.mp4'), opts.saida)
  const t0 = Date.now()
  const enq = await enfileirar(
    workflowVideo({
      prompt,
      negativo: opts.negocio || 'baixa qualidade, borrado, distorcido, marca d\'água',
      largura,
      altura,
      quadros,
      passos,
      cfg: 7,
      seed
    })
  )
  if (!enq.ok) return { ok: false, erro: 'ComfyUI recusou o workflow de vídeo: ' + (enq.erro || '?') }
  // CPU: 16 quadros em 512 tende a levar vários minutos.
  const fim = await aguardarSaida(enq.id as string, 90 * 60_000)
  const imagens = fim.imagens || []
  if (!fim.ok || imagens.length < 2) {
    return { ok: false, erro: 'Geração de vídeo no ComfyUI falhou: ' + (fim.erro || 'quadros insuficientes') }
  }
  const tmp = join(pastaMidia(raiz), '.comfy-video-' + Date.now())
  mkdirSync(tmp, { recursive: true })
  try {
    for (let i = 0; i < imagens.length; i++) {
      await baixarImagem(imagens[i], join(tmp, String(i).padStart(5, '0') + '.png'))
    }
    const r = await rodar(
      process.env.DG_FFMPEG || 'ffmpeg',
      [
        '-y',
        '-framerate', String(fps),
        '-i', join(tmp, '%05d.png'),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        destino
      ],
      600_000
    )
    if (!r.ok || !existsSync(destino)) {
      return { ok: false, erro: 'ffmpeg falhou ao montar o MP4: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
    }
  } catch (e) {
    return { ok: false, erro: 'falha ao montar o vídeo: ' + (e instanceof Error ? e.message : String(e)) }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  const duracao = +(imagens.length / fps).toFixed(2)
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'video/mp4',
    previewBase64: previewDe(destino),
    duracaoSeg: duracao,
    detalhes: {
      motor: 'comfyui',
      modelo: escolherCheckpoint(),
      largura,
      altura,
      quadros: imagens.length,
      fps,
      passos,
      seed,
      segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1)
    },
    aviso:
      'Vídeo gerado localmente no ComfyUI (CPU): ' + largura + 'x' + altura + ', ' +
      imagens.length + ' quadros a ' + fps + ' fps (' + duracao + 's). Processamento na CPU é lento; reduza quadros/resolução para acelerar.'
  }
}

/**
 * Foto → vídeo sintético (AnimateDiff img2img).
 *
 * Exige consentimento explícito: use apenas imagens suas ou com autorização.
 * O MP4 sai com a marca visível "gerado por IA" e metadados de conteúdo sintético.
 * Resultado é estilizado (SD 1.5), não um deepfake fotorrealista.
 */
export async function gerarFotoVideoComfy(
  raiz: string,
  opts: {
    entrada: string
    prompt?: string
    movimento?: number
    largura?: number
    altura?: number
    quadros?: number
    fps?: number
    passos?: number
    seed?: number
    consentimento?: boolean
    saida?: string
  }
): Promise<RespostaMidia> {
  if (opts.consentimento !== true) {
    return {
      ok: false,
      erro:
        'Confirme que você tem direito de usar esta imagem (foto própria ou pessoa autorizada). ' +
        'O DG Editor não gera vídeos de pessoas reais sem consentimento.'
    }
  }
  const entrada = String(opts.entrada || '').trim()
  if (!entrada) return { ok: false, erro: 'informe a foto de entrada' }
  let abs: string
  try {
    abs = caminhoDentroDaRaiz(raiz, entrada).abs
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  if (!existsSync(abs)) return { ok: false, erro: 'foto não encontrada: ' + entrada }
  if (!/\.(png|jpe?g|webp)$/i.test(abs)) return { ok: false, erro: 'use uma foto PNG, JPG ou WEBP' }
  if (!temAnimateDiff()) {
    return { ok: false, erro: 'Custom node ComfyUI-AnimateDiff-Evolved ausente — rode a instalação de vídeo.' }
  }
  if (!modelosDisponiveis().motion.length) {
    return { ok: false, erro: 'Motion module ausente em models/animatediff_models.' }
  }
  const on = await garantirOnline()
  if (!on.ok) return { ok: false, erro: on.erro || 'ComfyUI offline' }
  if (!modelosDisponiveis().checkpoints.length) {
    return { ok: false, erro: 'Nenhum checkpoint em models/checkpoints — baixe o modelo SD 1.5.' }
  }
  const hw = await detectarHardware()
  const largura = limitar(opts.largura, 256, 768, Math.min(768, hw.comfy.largura), 64)
  const altura = limitar(opts.altura, 256, 768, Math.min(768, hw.comfy.altura), 64)
  const quadros = limitar(opts.quadros, 8, 32, hw.comfy.quadros)
  const fps = limitar(opts.fps, 4, 16, hw.comfy.fps)
  const passos = limitar(opts.passos, 2, 20, hw.comfy.passos)
  const movimento = Math.min(0.8, Math.max(0.3, typeof opts.movimento === 'number' ? opts.movimento : hw.comfy.denoise))
  const seed =
    typeof opts.seed === 'number' && Number.isFinite(opts.seed)
      ? Math.floor(opts.seed)
      : Math.floor(Math.random() * 2 ** 31)
  const entradaComfy = join(pastaAppComfy(), 'input')
  mkdirSync(entradaComfy, { recursive: true })
  const nomeEntrada = 'dg-foto-' + Date.now() + '.png'
  const arquivoComfy = join(entradaComfy, nomeEntrada)
  const destino = destinoArquivo(raiz, nomeArquivo('comfy-fotovideo', '.mp4'), opts.saida)
  const t0 = Date.now()
  try {
    // Normaliza tamanho e formato para controlar o custo na CPU.
    const prep = await rodar(
      process.env.DG_FFMPEG || 'ffmpeg',
      [
        '-y', '-i', abs,
        '-vf', 'scale=' + largura + ':' + altura + ':force_original_aspect_ratio=decrease,' +
          'pad=' + largura + ':' + altura + ':(ow-iw)/2:(oh-ih)/2',
        '-frames:v', '1', arquivoComfy
      ],
      120_000
    )
    if (!prep.ok || !existsSync(arquivoComfy)) {
      return { ok: false, erro: 'ffmpeg falhou ao preparar a foto: ' + (prep.erro || prep.stderr).slice(0, 300) }
    }
    const enq = await enfileirar(
      workflowFotoVideo({
        imagem: nomeEntrada,
        prompt: String(opts.prompt || '').trim() || 'movimento suave e natural, cinematográfico, alta qualidade',
        negativo: 'rosto deformado, derretido, distorcido, baixa qualidade, marca d\'água',
        quadros,
        passos,
        cfg: 7,
        seed,
        denoise: movimento
      })
    )
    if (!enq.ok) return { ok: false, erro: 'ComfyUI recusou o workflow de foto→vídeo: ' + (enq.erro || '?') }
    const fim = await aguardarSaida(enq.id as string, 90 * 60_000)
    const imagens = fim.imagens || []
    if (!fim.ok || imagens.length < 2) {
      return { ok: false, erro: 'Foto→vídeo falhou no ComfyUI: ' + (fim.erro || 'quadros insuficientes') }
    }
    const tmp = join(pastaMidia(raiz), '.comfy-foto-' + Date.now())
    mkdirSync(tmp, { recursive: true })
    try {
      for (let i = 0; i < imagens.length; i++) {
        await baixarImagem(imagens[i], join(tmp, String(i).padStart(5, '0') + '.png'))
      }
      const marca = filtroMarcaDagua(altura)
      const args = ['-y', '-framerate', String(fps), '-i', join(tmp, '%05d.png')]
      if (marca) args.push('-vf', marca)
      args.push(
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-metadata', 'comment=Vídeo sintético gerado localmente por IA (DG Editor + ComfyUI)',
        destino
      )
      const r = await rodar(process.env.DG_FFMPEG || 'ffmpeg', args, 600_000)
      if (!r.ok || !existsSync(destino)) {
        return { ok: false, erro: 'ffmpeg falhou ao montar o MP4: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  } finally {
    rmSync(arquivoComfy, { force: true })
  }
  const duracao = +(quadros / fps).toFixed(2)
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'video/mp4',
    previewBase64: previewDe(destino),
    duracaoSeg: duracao,
    detalhes: {
      motor: 'comfyui-img2video',
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
      segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1)
    },
    aviso:
      'Vídeo sintético gerado de uma foto (IA local): ' + largura + 'x' + altura + ', ' +
      quadros + ' quadros a ' + fps + ' fps. Inclui a marca visível "gerado por IA". ' +
      'Uso pessoal/paródia com consentimento; não é um deepfake fotorrealista.'
  }
}
