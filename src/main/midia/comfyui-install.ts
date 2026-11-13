/**
 * Instalador portátil do ComfyUI (fora do repositório, sob %LOCALAPPDATA%).
 *
 * Idempotente: cada etapa verifica o que já existe e só faz o que falta.
 * CPU por padrão; CUDA só quando a GPU é compatível (compute >= 7 e 6 GB+).
 */
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { rodar } from './core'
import { pastaAppComfy, pastaComfy, pythonComfy } from './comfyui'
import { detectarHardware } from './hardware'

const REPO_COMFY = 'https://github.com/comfyanonymous/ComfyUI.git'
const REPO_ANIMATEDIFF = 'https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git'

const MODELOS = {
  imagem: [
    {
      nome: 'DreamShaper 8 (SD 1.5)',
      url: 'https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaper_8_pruned.safetensors',
      destino: ['models', 'checkpoints', 'dreamshaper_8.safetensors'],
      tamanho: 2_132_625_894
    },
    {
      nome: 'LCM-LoRA SD 1.5',
      url: 'https://huggingface.co/latent-consistency/lcm-lora-sdv1-5/resolve/main/pytorch_lora_weights.safetensors',
      destino: ['models', 'loras', 'lcm-lora-sdv1-5.safetensors'],
      tamanho: 134_621_556
    }
  ],
  video: [
    {
      nome: 'AnimateDiff SD 1.5 v2',
      url: 'https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt',
      destino: ['models', 'animatediff_models', 'mm_sd_v15_v2.ckpt'],
      tamanho: 1_817_888_431
    }
  ]
}

export type EtapaInstalacao = { nome: string; ok: boolean; detalhe: string; pulada?: boolean }

export type ResultadoInstalacao = {
  ok: boolean
  erro?: string
  etapas: EtapaInstalacao[]
  pasta: string
  log: string
}

export function arquivoLogInstall(): string {
  return join(pastaComfy(), 'install.log')
}

function logar(msg: string, ouvir?: (linha: string) => void) {
  const linha = '[' + new Date().toISOString() + '] ' + msg
  try {
    const arq = arquivoLogInstall()
    if (existsSync(arq) && statSync(arq).size > 1024 * 1024) {
      const recorte = readFileSync(arq, 'utf8').split(/\r?\n/).slice(-800).join('\n')
      writeFileSync(arq, recorte + '\n', 'utf8')
    }
    appendFileSync(arq, linha + '\n', 'utf8')
  } catch {
    /* log é melhor esforço */
  }
  if (ouvir) ouvir(linha)
}

export function lerLogInstall(linhas = 40): string {
  try {
    if (!existsSync(arquivoLogInstall())) return ''
    return readFileSync(arquivoLogInstall(), 'utf8').split(/\r?\n/).slice(-linhas).join('\n')
  } catch {
    return ''
  }
}

async function acharPython(): Promise<{ bin: string; prefixo: string[]; versao: string } | undefined> {
  const candidatos: { bin: string; prefixo: string[] }[] = [
    { bin: 'python', prefixo: [] },
    { bin: 'py', prefixo: ['-3'] },
    { bin: 'python3', prefixo: [] }
  ]
  for (const c of candidatos) {
    const r = await rodar(c.bin, [...c.prefixo, '--version'], 10_000)
    const saida = (r.stdout || r.stderr).trim()
    if (r.ok && /Python 3\.(1[0-9]|[89])/i.test(saida)) return { ...c, versao: saida }
  }
  return undefined
}

async function acharGit(): Promise<string | undefined> {
  const r = await rodar('git', ['--version'], 10_000)
  return r.ok ? r.stdout.trim() : undefined
}

export async function verificarPreRequisitos(): Promise<{
  ok: boolean
  python?: { bin: string; versao: string }
  git?: string
  erros: string[]
  hardware: string
}> {
  const erros: string[] = []
  const [python, git] = await Promise.all([acharPython(), acharGit()])
  if (!python) erros.push('Python 3.10+ não encontrado no PATH (instale de python.org, marcando "Add to PATH").')
  if (!git) erros.push('git não encontrado no PATH (instale Git for Windows).')
  const hw = await detectarHardware()
  return {
    ok: erros.length === 0,
    python: python ? { bin: python.bin, versao: python.versao } : undefined,
    git,
    erros,
    hardware: hw.perfil + (hw.gpu ? ' (' + hw.gpu.nome + (hw.gpu.compativel ? ', CUDA ok' : ', CUDA antiga → CPU') + ')' : ', CPU')
  }
}

function tamanhoArquivo(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

async function baixarComRetomada(url: string, destino: string, esperado: number, ouvir?: (l: string) => void): Promise<void> {
  mkdirSync(dirname(destino), { recursive: true })
  const atual = tamanhoArquivo(destino)
  if (atual > 0 && esperado > 0 && atual >= esperado * 0.98) {
    logar('já existe: ' + destino + ' (' + Math.round(atual / 1024 / 1024) + ' MB)', ouvir)
    return
  }
  const parcial = destino + '.part'
  const inicio = Math.max(tamanhoArquivo(parcial), 0)
  if (inicio === 0 && existsSync(destino)) rmSync(destino, { force: true })
  const headers: Record<string, string> = {}
  if (inicio > 0) headers.range = 'bytes=' + inicio + '-'
  const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(6 * 3600_000) })
  if (!res.ok && res.status !== 206) throw new Error('HTTP ' + res.status + ' ao baixar ' + url)
  if (!res.body) throw new Error('resposta sem corpo ao baixar ' + url)
  await pipeline(
    Readable.fromWeb(res.body as never),
    createWriteStream(parcial, { flags: inicio > 0 && res.status === 206 ? 'a' : 'w' })
  )
  renameSync(parcial, destino)
  logar('baixado: ' + destino + ' (' + Math.round(tamanhoArquivo(destino) / 1024 / 1024) + ' MB)', ouvir)
}

/** Instala/atualiza o ComfyUI de forma idempotente. */
export async function instalarComfy(opts: {
  modelos?: 'nenhum' | 'imagem' | 'completo'
  video?: boolean
  cuda?: boolean
  onProgress?: (linha: string) => void
} = {}): Promise<ResultadoInstalacao> {
  const ouvir = opts.onProgress
  const etapas: EtapaInstalacao[] = []
  const registrar = (nome: string, ok: boolean, detalhe: string, pulada = false) => {
    etapas.push({ nome, ok, detalhe, pulada })
    logar((pulada ? 'pulado ' : ok ? 'ok ' : 'FALHOU ') + nome + ': ' + detalhe, ouvir)
  }
  const falhar = (erro: string): ResultadoInstalacao => ({
    ok: false,
    erro,
    etapas,
    pasta: pastaComfy(),
    log: lerLogInstall(60)
  })

  const pre = await verificarPreRequisitos()
  if (!pre.ok) return falhar(pre.erros.join(' '))
  registrar('pré-requisitos', true, pre.hardware)
  const python = (await acharPython())!
  const app = pastaAppComfy()

  // 1. repositório
  if (existsSync(join(app, '.git')) || existsSync(join(app, 'main.py'))) {
    if (existsSync(join(app, '.git'))) {
      const r = await rodar('git', ['-C', app, 'pull', '--ff-only'], 300_000)
      registrar('ComfyUI', true, r.ok ? 'atualizado' : 'mantido (git pull falhou: ' + r.stderr.slice(-160) + ')', !r.ok)
    } else {
      registrar('ComfyUI', true, 'código presente (sem git)', true)
    }
  } else {
    mkdirSync(pastaComfy(), { recursive: true })
    logar('clonando ComfyUI em ' + app, ouvir)
    const r = await rodar('git', ['clone', '--depth', '1', REPO_COMFY, app], 900_000)
    if (!r.ok) return falhar('git clone do ComfyUI falhou: ' + r.stderr.slice(-300))
    registrar('ComfyUI', true, 'clonado')
  }

  // 2. venv
  const py = pythonComfy()
  if (!existsSync(py)) {
    const r = await rodar(python.bin, [...python.prefixo, '-m', 'venv', join(pastaComfy(), 'venv')], 300_000)
    if (!r.ok) return falhar('falha ao criar venv: ' + (r.stderr || r.stdout).slice(-300))
    registrar('venv', true, 'criado em ' + join(pastaComfy(), 'venv'))
  } else {
    registrar('venv', true, 'já existe', true)
  }

  // 3. pip + torch
  const pip = (...args: string[]) => rodar(py, ['-m', 'pip', ...args, '--disable-pip-version-check', '--no-input'], 3_600_000)
  await pip('install', '--upgrade', 'pip', 'setuptools', 'wheel')
  const temTorch = await rodar(py, ['-c', 'import torch; print(torch.__version__)'], 60_000)
  if (temTorch.ok) {
    registrar('torch', true, 'já instalado: ' + temTorch.stdout.trim(), true)
  } else {
    const cuda = opts.cuda === true
    const indice = cuda ? 'https://download.pytorch.org/whl/cu124' : 'https://download.pytorch.org/whl/cpu'
    logar('instalando PyTorch ' + (cuda ? 'CUDA 12.4' : 'CPU') + ' (pode levar vários minutos)', ouvir)
    const r = await pip('install', 'torch', 'torchvision', 'torchaudio', '--index-url', indice)
    if (!r.ok) return falhar('falha ao instalar PyTorch: ' + r.stderr.slice(-400))
    registrar('torch', true, cuda ? 'CUDA 12.4' : 'CPU')
  }

  // 4. dependências
  const req = join(app, 'requirements.txt')
  if (existsSync(req)) {
    logar('instalando requirements do ComfyUI', ouvir)
    const r = await pip('install', '-r', req)
    if (!r.ok) return falhar('falha nos requirements: ' + r.stderr.slice(-400))
    registrar('requirements', true, 'ok')
  }

  // 5. modelos
  const quais = opts.modelos || 'nenhum'
  const lista = [
    ...(quais === 'nenhum' ? [] : MODELOS.imagem),
    ...(quais === 'completo' || opts.video ? MODELOS.video : [])
  ]
  for (const m of lista) {
    const destino = join(app, ...m.destino)
    try {
      await baixarComRetomada(m.url, destino, m.tamanho, ouvir)
      registrar('modelo', true, m.nome)
    } catch (e) {
      registrar('modelo', false, m.nome + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  if (!lista.length) registrar('modelos', true, 'nenhum solicitado', true)

  // 6. nó AnimateDiff (vídeo)
  const node = join(app, 'custom_nodes', 'ComfyUI-AnimateDiff-Evolved')
  if (opts.video || quais === 'completo') {
    if (!existsSync(join(node, '.git'))) {
      const r = await rodar('git', ['clone', '--depth', '1', REPO_ANIMATEDIFF, node], 600_000)
      if (!r.ok) registrar('AnimateDiff-Evolved', false, r.stderr.slice(-300))
      else registrar('AnimateDiff-Evolved', true, 'clonado')
    } else {
      const r = await rodar('git', ['-C', node, 'pull', '--ff-only'], 300_000)
      registrar('AnimateDiff-Evolved', true, r.ok ? 'atualizado' : 'mantido', !r.ok)
    }
    const reqNode = join(node, 'requirements.txt')
    if (existsSync(reqNode)) {
      const r = await pip('install', '-r', reqNode)
      registrar('requisitos do AnimateDiff', r.ok, r.ok ? 'ok' : r.stderr.slice(-300))
    }
  }

  const criticas = etapas.filter((e) => !e.ok && !e.pulada)
  return {
    ok: criticas.length === 0,
    erro: criticas.length ? criticas.map((e) => e.nome + ': ' + e.detalhe).join(' | ') : undefined,
    etapas,
    pasta: pastaComfy(),
    log: lerLogInstall(60)
  }
}

export function statusInstalacao(): {
  instalado: boolean
  pasta: string
  python?: string
  modelos: { checkpoints: number; loras: number; animatediff: number }
  log: string
} {
  const app = pastaAppComfy()
  const conta = (pasta: string) => {
    try {
      return readdirSync(pasta).filter((n) => /\.(safetensors|ckpt|pt)$/i.test(n)).length
    } catch {
      return 0
    }
  }
  return {
    instalado: existsSync(join(app, 'main.py')) && existsSync(pythonComfy()),
    pasta: pastaComfy(),
    python: existsSync(pythonComfy()) ? pythonComfy() : undefined,
    modelos: {
      checkpoints: conta(join(app, 'models', 'checkpoints')),
      loras: conta(join(app, 'models', 'loras')),
      animatediff: conta(join(app, 'models', 'animatediff_models'))
    },
    log: lerLogInstall(20)
  }
}

/** Espaço livre no disco onde o ComfyUI é instalado (GB). */
export function espacoLivreGb(): number {
  try {
    const st = statfsSync(pastaComfy())
    return +((st.bavail * st.bsize) / 1024 ** 3).toFixed(1)
  } catch {
    return -1
  }
}
