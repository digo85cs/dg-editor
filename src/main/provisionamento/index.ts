/**
 * Provisionamento automático das ferramentas portáteis.
 *
 * Em um PC novo, o DG Editor baixa por conta própria:
 * - ffmpeg/ffprobe mais recente compatível com a plataforma (build BtbN);
 * - Python portátil 3.12 (python-build-standalone) quando faltar;
 * - pacotes gratuitos de voz/transcrição via pip --upgrade.
 *
 * Regras:
 * - só instala o que o manifesto declara compatível com a versão do app e o PC;
 * - guarda tudo em %LOCALAPPDATA%\dg-editor\ferramentas (gravável sem admin);
 * - o que já está embutido no instalador continua funcionando como fallback;
 * - sem rede, não falha: mantém o que existe e reporta o motivo.
 *
 * Sem importações do Electron: roda no processo principal e no MCP.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chavePlataformaBin, pastaFerramentasUsuario, pastasEmbutidas, pythonBin } from '../midia/core'
import {
  avaliarPlataforma,
  carregarManifesto,
  chavePlataforma,
  compararVersao,
  componenteCompativel,
  dataDoBuild,
  escolherAsset,
  precisaAtualizarBuild,
  type AssetRemoto
} from './compat'
import { baixarArquivo, copiarBinarios, espacoLivreMB, extrairArquivo, instalarPasta, raizUnica } from './download'

export type IdProvisionamento = 'ffmpeg' | 'python' | 'pacotes'

export type EventoProgresso = {
  id: IdProvisionamento
  etapa: 'consulta' | 'baixando' | 'extraindo' | 'instalando' | 'verificando' | 'ok' | 'erro' | 'ignorado'
  mensagem: string
  recebido?: number
  total?: number
}

export type ItemProvisionamento = {
  id: IdProvisionamento
  nome: string
  ok: boolean
  estado: 'pronto' | 'faltando' | 'erro' | 'incompativel' | 'opcional'
  detalhe: string
  versao?: string
  origem?: string
  pasta?: string
}

export type StatusProvisionamento = {
  ok: boolean
  plataforma: string
  rotulo: string
  suportado: boolean
  motivo?: string
  itens: ItemProvisionamento[]
  pasta: string
  espacoLivreMB: number | null
  ultimaVerificacao?: string
  ultimoErro?: { em: string; detalhe: string }
  emAndamento: boolean
}

export type ResultadoComponente = { id: IdProvisionamento; ok: boolean; detalhe: string; pulado?: boolean }

type EstadoComponente = {
  versao?: string
  asset?: string
  build?: string
  instaladoEm?: string
  pacotes?: Record<string, string>
}

type EstadoProvisionamento = {
  schema: number
  ultimaVerificacao?: string
  ultimoErro?: { em: string; detalhe: string }
  componentes?: Partial<Record<IdProvisionamento, EstadoComponente>>
}

export type PreferenciasProvisionamento = {
  auto: boolean
  atualizar: boolean
  ultimaVerificacao?: string
}

const ESPACO_MINIMO_FFMPEG_MB = 900
const ESPACO_MINIMO_PYTHON_MB = 1600
const BACKOFF_MS = 6 * 3600_000
const INTERVALO_MS = 24 * 3600_000

let emAndamento: Promise<{ ok: boolean; resultados: ResultadoComponente[] }> | null = null

function pastaBase(): string {
  const p = pastaFerramentasUsuario()
  mkdirSync(p, { recursive: true })
  return p
}

function arquivoEstado(): string {
  return join(pastaBase(), 'estado.json')
}

function arquivoPreferencias(): string {
  return join(pastaBase(), 'preferencias.json')
}

function lerJson<T>(caminho: string): T | null {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')) as T
  } catch {
    return null
  }
}

function gravarJson(caminho: string, dados: unknown): void {
  const tmp = caminho + '.tmp'
  writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8')
  try {
    if (existsSync(caminho)) rmSync(caminho, { force: true })
    renameSync(tmp, caminho)
  } catch {
    writeFileSync(caminho, JSON.stringify(dados, null, 2), 'utf8')
    rmSync(tmp, { force: true })
  }
}

export function lerEstado(): EstadoProvisionamento {
  const e = lerJson<EstadoProvisionamento>(arquivoEstado())
  return e && typeof e === 'object' ? { ...e, schema: 1 } : { schema: 1 }
}

function salvarEstado(patch: Partial<EstadoProvisionamento>): void {
  const atual = lerEstado()
  gravarJson(arquivoEstado(), { ...atual, ...patch, schema: 1 })
}

export function lerPreferenciasProvisionamento(): PreferenciasProvisionamento {
  const p = lerJson<Partial<PreferenciasProvisionamento>>(arquivoPreferencias())
  return {
    auto: p?.auto !== false,
    atualizar: p?.atualizar !== false,
    ultimaVerificacao: typeof p?.ultimaVerificacao === 'string' ? p.ultimaVerificacao : undefined
  }
}

export function salvarPreferenciasProvisionamento(p: Partial<PreferenciasProvisionamento>): PreferenciasProvisionamento {
  const atual = { ...lerPreferenciasProvisionamento(), ...p }
  gravarJson(arquivoPreferencias(), atual)
  return atual
}

/** Versão do DG Editor lendo o package.json (funciona também fora do Electron). */
export function versaoApp(): string {
  const candidatos = [
    join(process.cwd(), 'package.json'),
    join(__dirname, '..', '..', '..', 'package.json'),
    join(__dirname, '..', '..', '..', '..', 'package.json')
  ]
  for (const p of candidatos) {
    const j = lerJson<{ name?: string; version?: string }>(p)
    if (j?.version && (j.name === 'dg-editor' || p === candidatos[0])) return j.version
  }
  return '0.0.0'
}

function rodarCmd(bin: string, args: string[], timeoutMs = 60_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((finalizar) => {
    let stdout = ''
    let stderr = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, args, { windowsHide: true, env: { ...process.env, PIP_NO_INPUT: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' } })
    } catch (e) {
      finalizar({ ok: false, stdout, stderr: e instanceof Error ? e.message : String(e) })
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* */
      }
      finalizar({ ok: false, stdout, stderr: stderr + '\ntimeout' })
    }, timeoutMs)
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf8')
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000)
    })
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
      if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      finalizar({ ok: false, stdout, stderr: e.message })
    })
    child.on('close', (codigo) => {
      clearTimeout(timer)
      finalizar({ ok: codigo === 0, stdout, stderr })
    })
  })
}

function binariosFfmpeg(): { pasta: string; ffmpeg: string; ffprobe: string } {
  const pasta = join(pastaBase(), 'bin', chavePlataformaBin())
  const ext = process.platform === 'win32' ? '.exe' : ''
  return { pasta, ffmpeg: join(pasta, 'ffmpeg' + ext), ffprobe: join(pasta, 'ffprobe' + ext) }
}

function pastaPython(): string {
  return join(pastaBase(), 'python')
}

/** Pasta de onde o app carrega o ffmpeg embutido no instalador (se houver). */
function pastaFfmpegEmbutida(): string | null {
  const usuario = join(pastaFerramentasUsuario(), 'bin', chavePlataformaBin())
  for (const dir of pastasEmbutidas()) {
    if (dir === usuario) continue
    if (existsSync(join(dir, 'ffmpeg.exe'))) return dir
  }
  return null
}

type VerificacaoFfmpeg = { ok: boolean; versao?: string; filtrosFaltando: string[]; erro?: string }

async function verificarFfmpeg(bin: string): Promise<VerificacaoFfmpeg> {
  if (!existsSync(bin)) return { ok: false, filtrosFaltando: [], erro: 'não instalado' }
  const versao = await rodarCmd(bin, ['-hide_banner', '-version'], 15_000)
  if (!versao.ok) return { ok: false, filtrosFaltando: [], erro: 'não executa' }
  const filtros = await rodarCmd(bin, ['-hide_banner', '-filters'], 20_000)
  const esperados = carregarManifesto().ffmpeg.filtrosObrigatorios || []
  const saida = filtros.stdout + filtros.stderr
  const faltando = esperados.filter((f) => !saida.includes(' ' + f + ' '))
  return {
    ok: faltando.length === 0,
    versao: (versao.stdout || versao.stderr).split(/\r?\n/)[0]?.trim().slice(0, 120),
    filtrosFaltando: faltando,
    erro: faltando.length ? 'sem filtros: ' + faltando.join(', ') : undefined
  }
}

type VerificacaoPython = { ok: boolean; versao?: string; erro?: string }

async function verificarPython(caminho: string): Promise<VerificacaoPython> {
  if (!existsSync(caminho)) return { ok: false, erro: 'não instalado' }
  const r = await rodarCmd(caminho, ['-c', 'import sys;print(sys.version.split()[0])'], 20_000)
  if (!r.ok) {
    const v = await rodarCmd(caminho, ['--version'], 15_000)
    if (!v.ok) return { ok: false, erro: 'não executa' }
    return { ok: true, versao: (v.stdout || v.stderr).trim() }
  }
  return { ok: true, versao: r.stdout.trim() }
}

async function pacotesInstalados(caminhoPython: string): Promise<Record<string, string> | null> {
  if (!existsSync(caminhoPython)) return null
  const r = await rodarCmd(caminhoPython, ['-m', 'pip', 'list', '--format=json', '--disable-pip-version-check'], 60_000)
  if (!r.ok) return null
  try {
    const lista = JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) as { name: string; version: string }[]
    const mapa: Record<string, string> = {}
    for (const p of lista) mapa[String(p.name).toLowerCase()] = p.version
    return mapa
  } catch {
    return null
  }
}

async function ghRelease(repo: string, tag?: string): Promise<{ assets: AssetRemoto[]; tag?: string } | null> {
  const url = 'https://api.github.com/repos/' + repo + '/releases/' + (tag ? 'tags/' + encodeURIComponent(tag) : 'latest')
  const headers: Record<string, string> = {
    'User-Agent': 'DG-Editor (provisionamento)',
    Accept: 'application/vnd.github+json'
  }
  const token = process.env.DG_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  if (token && token.trim()) headers.Authorization = 'Bearer ' + token.trim()
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) })
    if (!res.ok) return null
    const j = (await res.json()) as { assets?: AssetRemoto[]; tag_name?: string }
    return { assets: Array.isArray(j.assets) ? j.assets : [], tag: j.tag_name }
  } catch {
    return null
  }
}

function chaveAsset(): string {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

// ------------------------------------------------------------------ status

export async function statusProvisionamento(): Promise<StatusProvisionamento> {
  const manifesto = carregarManifesto()
  const plataforma = chavePlataforma(process.platform, process.arch)
  const aval = avaliarPlataforma(manifesto, plataforma)
  const versao = versaoApp()
  const estado = lerEstado()
  const itens: ItemProvisionamento[] = []

  const ff = binariosFfmpeg()
  let vf = await verificarFfmpeg(ff.ffmpeg)
  let pastaOrigem = ff.pasta
  let origemFf = 'atualizada'
  if (!vf.ok) {
    const emb = pastaFfmpegEmbutida()
    if (emb) {
      vf = await verificarFfmpeg(join(emb, 'ffmpeg.exe'))
      pastaOrigem = emb
      origemFf = 'embutida'
    } else {
      origemFf = 'sistema'
    }
  }
  const metaFf = lerJson<{ build?: string; asset?: string }>(join(pastaOrigem, '.dg-build.json'))
  const ffprobeOk = existsSync(join(pastaOrigem, 'ffprobe.exe'))
  itens.push({
    id: 'ffmpeg',
    nome: 'ffmpeg/ffprobe',
    ok: vf.ok && ffprobeOk,
    estado: !aval.ok ? 'incompativel' : vf.ok && ffprobeOk ? 'pronto' : vf.ok ? 'erro' : 'faltando',
    detalhe: vf.ok
      ? vf.versao || 'pronto'
      : vf.erro || (existsSync(ff.ffmpeg) ? 'ffprobe ausente' : 'aguardando download automático'),
    versao: vf.versao,
    origem: origemFf,
    pasta: pastaOrigem
  })
  if (metaFf?.build) itens[0].detalhe += ' · build ' + metaFf.build

  const py = pythonBin()
  const pyUsuario = join(pastaPython(), process.platform === 'win32' ? 'python.exe' : 'bin/python3')
  const vp = await verificarPython(py)
  itens.push({
    id: 'python',
    nome: 'Python portátil',
    ok: vp.ok,
    estado: !aval.ok ? 'incompativel' : vp.ok ? 'pronto' : 'faltando',
    detalhe: vp.ok ? vp.versao || 'pronto' : vp.erro || 'aguardando download automático',
    versao: vp.versao,
    origem: py === pyUsuario ? 'atualizada' : /[\\/]/.test(py) ? 'embutida' : 'sistema',
    pasta: /[\\/]/.test(py) ? dirname(py) : pastaPython()
  })

  const instalados = vp.ok ? await pacotesInstalados(py) : null
  const alvo = manifesto.python.pacotes || []
  const faltando = instalados ? alvo.filter((p) => !instalados[p.toLowerCase()]) : alvo.slice()
  itens.push({
    id: 'pacotes',
    nome: 'Pacotes de voz/transcrição',
    ok: Boolean(instalados) && faltando.length === 0,
    estado: !aval.ok ? 'incompativel' : !vp.ok ? 'faltando' : !instalados ? 'erro' : faltando.length ? 'faltando' : 'pronto',
    detalhe: !vp.ok
      ? 'precisa do Python primeiro'
      : !instalados
        ? 'pip não respondeu'
        : faltando.length
          ? 'faltam: ' + faltando.join(', ')
          : 'todos instalados (' + alvo.length + ')',
    pasta: pastaPython()
  })

  return {
    ok: aval.ok && itens.every((i) => i.estado === 'pronto'),
    plataforma,
    rotulo: aval.rotulo,
    suportado: aval.ok,
    motivo: aval.motivo,
    itens,
    pasta: pastaBase(),
    espacoLivreMB: espacoLivreMB(pastaBase()),
    ultimaVerificacao: estado.ultimaVerificacao,
    ultimoErro: estado.ultimoErro,
    emAndamento: emAndamento !== null
  }
}

// ------------------------------------------------------------ instalações

type Instalacao = {
  ok: boolean
  detalhe: string
  versao?: string
  build?: string
  asset?: string
  pulado?: boolean
  pacotes?: Record<string, string>
}

function progresso(
  onProgresso: ((e: EventoProgresso) => void) | undefined,
  id: IdProvisionamento,
  etapa: EventoProgresso['etapa'],
  mensagem: string,
  extra?: { recebido?: number; total?: number }
): void {
  try {
    onProgresso?.({ id, etapa, mensagem, ...extra })
  } catch {
    /* ouvinte com defeito não interrompe o download */
  }
}

async function instalarFfmpeg(
  op: { forcar: boolean; versaoApp: string; onProgresso?: (e: EventoProgresso) => void }
): Promise<Instalacao> {
  const manifesto = carregarManifesto()
  if (!componenteCompativel(op.versaoApp, manifesto.ffmpeg.minVersaoApp)) {
    return { ok: false, detalhe: 'DG Editor ' + op.versaoApp + ' é anterior ao mínimo ' + manifesto.ffmpeg.minVersaoApp, pulado: true }
  }
  const ff = binariosFfmpeg()
  const atual = await verificarFfmpeg(ff.ffmpeg)
  const meta = lerJson<{ build?: string; asset?: string }>(join(ff.pasta, '.dg-build.json'))
  if (atual.ok && existsSync(ff.ffprobe) && !op.forcar) {
    const livre = espacoLivreMB(pastaBase())
    if (livre !== null && livre < ESPACO_MINIMO_FFMPEG_MB) {
      return { ok: true, detalhe: 'já instalado (' + (atual.versao || 'ok') + '); pouco espaço para atualizar', pulado: true }
    }
  }
  progresso(op.onProgresso, 'ffmpeg', 'consulta', 'consultando o build mais recente no GitHub')
  const release = await ghRelease(manifesto.ffmpeg.repo, manifesto.ffmpeg.tag)
  const arquitetura = chaveAsset()
  const regex = manifesto.ffmpeg.assetRegex[arquitetura]
  const asset = release ? escolherAsset(release.assets, regex, arquitetura) : null
  const remotoBuild = asset ? dataDoBuild(asset.updated_at) : ''

  const efetivoOk = atual.ok && existsSync(ff.ffprobe)
  if (!efetivoOk && !op.forcar) {
    // Instalador já traz um build: só baixa outro se o upstream for mais novo.
    const emb = pastaFfmpegEmbutida()
    if (emb) {
      const vemb = await verificarFfmpeg(join(emb, 'ffmpeg.exe'))
      if (vemb.ok && existsSync(join(emb, 'ffprobe.exe'))) {
        const metaEmb = lerJson<{ build?: string }>(join(emb, '.dg-build.json'))
        if (!remotoBuild || !precisaAtualizarBuild(metaEmb?.build, remotoBuild)) {
          return {
            ok: true,
            detalhe: 'versão embutida já é a mais recente' + (metaEmb?.build ? ' (' + metaEmb.build + ')' : ''),
            versao: vemb.versao,
            pulado: true
          }
        }
      }
    }
  }
  if (efetivoOk && !op.forcar && !precisaAtualizarBuild(meta?.build, remotoBuild)) {
    return { ok: true, detalhe: 'já está no build mais recente' + (meta?.build ? ' (' + meta.build + ')' : ''), versao: atual.versao, pulado: true }
  }

  const url = asset?.browser_download_url || manifesto.ffmpeg.urlFallback[arquitetura]
  if (!url) return { ok: false, detalhe: 'sem build para ' + arquitetura }

  const livre = espacoLivreMB(pastaBase())
  if (livre !== null && livre < ESPACO_MINIMO_FFMPEG_MB) {
    return { ok: false, detalhe: 'espaço insuficiente: ' + livre + ' MB livres (mínimo ' + ESPACO_MINIMO_FFMPEG_MB + ' MB)' }
  }

  const cache = join(pastaBase(), 'cache')
  mkdirSync(cache, { recursive: true })
  const arquivo = join(cache, asset?.name || ('ffmpeg-' + arquitetura + '.zip'))
  progresso(op.onProgresso, 'ffmpeg', 'baixando', 'baixando ' + (asset?.name || 'ffmpeg'))
  const dl = await baixarArquivo(url, arquivo, (p) =>
    progresso(op.onProgresso, 'ffmpeg', 'baixando', 'baixando ffmpeg', { recebido: p.recebido, total: p.total })
  )
  if (!dl.ok) return { ok: false, detalhe: 'download falhou: ' + (dl.erro || 'erro') }

  progresso(op.onProgresso, 'ffmpeg', 'extraindo', 'extraindo pacote')
  const extracao = await extrairArquivo(arquivo, 'ffmpeg')
  if (!extracao.ok || !extracao.pasta) return { ok: false, detalhe: 'extração falhou: ' + (extracao.erro || 'erro') }

  progresso(op.onProgresso, 'ffmpeg', 'instalando', 'instalando em ' + ff.pasta)
  const destinoTemp = ff.pasta + '.novo-' + Date.now().toString(36)
  const copia = copiarBinarios(extracao.pasta, destinoTemp, ['ffmpeg.exe', 'ffprobe.exe'])
  rmSync(extracao.pasta, { recursive: true, force: true })
  if (!copia.ok) {
    rmSync(destinoTemp, { recursive: true, force: true })
    return { ok: false, detalhe: 'pacote sem: ' + copia.faltando.join(', ') }
  }

  progresso(op.onProgresso, 'ffmpeg', 'verificando', 'verificando os binários baixados')
  const novo = await verificarFfmpeg(join(destinoTemp, 'ffmpeg.exe'))
  if (!novo.ok) {
    rmSync(destinoTemp, { recursive: true, force: true })
    return { ok: false, detalhe: 'build novo reprovado na verificação: ' + (novo.erro || '?') }
  }
  const troca = instalarPasta(destinoTemp, ff.pasta)
  if (!troca.ok) {
    rmSync(destinoTemp, { recursive: true, force: true })
    return { ok: false, detalhe: 'não foi possível instalar (arquivo em uso?): ' + (troca.erro || '') }
  }
  gravarJson(join(ff.pasta, '.dg-build.json'), {
    fonte: 'provisionamento',
    repo: manifesto.ffmpeg.repo,
    tag: release?.tag || manifesto.ffmpeg.tag,
    asset: asset?.name,
    build: remotoBuild || new Date().toISOString().slice(0, 10),
    url,
    instaladoEm: new Date().toISOString()
  })
  try {
    rmSync(arquivo, { force: true })
  } catch {
    /* cache pode ficar */
  }
  progresso(op.onProgresso, 'ffmpeg', 'ok', novo.versao || 'ffmpeg atualizado')
  return { ok: true, detalhe: novo.versao || 'atualizado', versao: novo.versao, build: remotoBuild, asset: asset?.name }
}

async function instalarPython(op: { forcar: boolean; versaoApp: string; onProgresso?: (e: EventoProgresso) => void }): Promise<Instalacao> {
  const manifesto = carregarManifesto()
  if (!componenteCompativel(op.versaoApp, manifesto.python.minVersaoApp)) {
    return { ok: false, detalhe: 'DG Editor ' + op.versaoApp + ' é anterior ao mínimo ' + manifesto.python.minVersaoApp, pulado: true }
  }
  const destino = pastaPython()
  const exe = join(destino, process.platform === 'win32' ? 'python.exe' : 'bin/python3')
  const atual = await verificarPython(exe)
  if (atual.ok && !op.forcar) {
    return { ok: true, detalhe: 'já instalado (' + (atual.versao || '?') + ')', versao: atual.versao, pulado: true }
  }
  if (atual.ok && op.forcar) {
    return { ok: true, detalhe: 'em uso; reinstalação automática ignorada para não quebrar processos', versao: atual.versao, pulado: true }
  }

  const livre = espacoLivreMB(pastaBase())
  if (livre !== null && livre < ESPACO_MINIMO_PYTHON_MB) {
    return { ok: false, detalhe: 'espaço insuficiente: ' + livre + ' MB livres (mínimo ' + ESPACO_MINIMO_PYTHON_MB + ' MB)' }
  }

  progresso(op.onProgresso, 'python', 'consulta', 'consultando o Python portátil mais recente')
  const release = await ghRelease(manifesto.python.repo)
  if (!release) return { ok: false, detalhe: 'sem acesso ao GitHub para baixar o Python' }
  const arquitetura = chaveAsset()
  const regex = manifesto.python.assetRegex[arquitetura]
  const asset = escolherAsset(release.assets, regex, arquitetura)
  if (!asset) return { ok: false, detalhe: 'release ' + (release.tag || '?') + ' sem build ' + arquitetura }

  const cache = join(pastaBase(), 'cache')
  mkdirSync(cache, { recursive: true })
  const arquivo = join(cache, asset.name)
  progresso(op.onProgresso, 'python', 'baixando', 'baixando ' + asset.name)
  const dl = await baixarArquivo(asset.browser_download_url, arquivo, (p) =>
    progresso(op.onProgresso, 'python', 'baixando', 'baixando Python', { recebido: p.recebido, total: p.total })
  )
  if (!dl.ok) return { ok: false, detalhe: 'download falhou: ' + (dl.erro || 'erro') }

  progresso(op.onProgresso, 'python', 'extraindo', 'extraindo Python portátil')
  const extracao = await extrairArquivo(arquivo, 'python')
  if (!extracao.ok || !extracao.pasta) return { ok: false, detalhe: 'extração falhou: ' + (extracao.erro || 'erro') }
  const raiz = raizUnica(extracao.pasta) || extracao.pasta

  progresso(op.onProgresso, 'python', 'instalando', 'instalando em ' + destino)
  const troca = instalarPasta(raiz, destino)
  if (!troca.ok) {
    rmSync(extracao.pasta, { recursive: true, force: true })
    return { ok: false, detalhe: 'não foi possível instalar: ' + (troca.erro || '') }
  }
  rmSync(extracao.pasta, { recursive: true, force: true })
  try {
    rmSync(arquivo, { force: true })
  } catch {
    /* cache pode ficar */
  }
  gravarJson(join(destino, '.dg-provisionado.json'), {
    fonte: 'provisionamento',
    repo: manifesto.python.repo,
    tag: release.tag,
    asset: asset.name,
    serie: manifesto.python.serie,
    instaladoEm: new Date().toISOString()
  })

  progresso(op.onProgresso, 'python', 'verificando', 'verificando o Python instalado')
  const check = await verificarPython(exe)
  if (!check.ok) return { ok: false, detalhe: 'instalado, mas não executa: ' + (check.erro || '?') }
  progresso(op.onProgresso, 'python', 'ok', check.versao || 'Python pronto')
  return { ok: true, detalhe: check.versao || 'instalado', versao: check.versao, asset: asset.name, build: dataDoBuild(asset.updated_at) }
}

async function instalarPacotes(op: { onProgresso?: (e: EventoProgresso) => void }): Promise<Instalacao> {
  const manifesto = carregarManifesto()
  const py = pythonBin()
  const vp = await verificarPython(py)
  if (!vp.ok) return { ok: false, detalhe: 'Python indisponível: ' + (vp.erro || '?'), pulado: true }
  const alvo = manifesto.python.pacotes || []
  if (!alvo.length) return { ok: true, detalhe: 'nenhum pacote previsto', pulado: true }

  progresso(op.onProgresso, 'pacotes', 'consulta', 'verificando pacotes instalados')
  const antes = await pacotesInstalados(py)
  const faltando = antes ? alvo.filter((p) => !antes[p.toLowerCase()]) : alvo.slice()
  if (!faltando.length) {
    return { ok: true, detalhe: 'todos os ' + alvo.length + ' pacotes já instalados', pacotes: antes || undefined }
  }

  progresso(op.onProgresso, 'pacotes', 'instalando', 'pip --upgrade: ' + faltando.join(', '))
  const r = await rodarCmd(
    py,
    [
      '-m',
      'pip',
      'install',
      '--upgrade',
      '--disable-pip-version-check',
      '--no-input',
      '--cache-dir',
      join(pastaBase(), 'cache', 'pip'),
      ...faltando
    ],
    45 * 60_000
  )
  if (!r.ok) {
    return {
      ok: false,
      detalhe: 'pip falhou: ' + (r.stderr || r.stdout).split(/\r?\n/).filter(Boolean).slice(-3).join(' ').slice(0, 400)
    }
  }
  const depois = await pacotesInstalados(py)
  const aindaFaltando = depois ? alvo.filter((p) => !depois[p.toLowerCase()]) : []
  progresso(op.onProgresso, 'pacotes', aindaFaltando.length ? 'erro' : 'ok', 'pacotes processados')
  return {
    ok: aindaFaltando.length === 0,
    detalhe: aindaFaltando.length ? 'faltam após o pip: ' + aindaFaltando.join(', ') : 'pacotes atualizados',
    pacotes: depois || undefined
  }
}

// ----------------------------------------------------------- orquestração

function registrarResultado(id: IdProvisionamento, r: Instalacao): void {
  const estado = lerEstado()
  const componentes = { ...(estado.componentes || {}) }
  const anterior = componentes[id] || {}
  componentes[id] = {
    ...anterior,
    versao: r.versao || anterior.versao,
    build: r.build || anterior.build,
    asset: r.asset || anterior.asset,
    instaladoEm: new Date().toISOString(),
    pacotes: r.pacotes || anterior.pacotes
  }
  salvarEstado({
    componentes,
    ultimaVerificacao: new Date().toISOString(),
    ultimoErro: r.ok ? undefined : { em: new Date().toISOString(), detalhe: r.detalhe }
  })
}

export async function provisionar(opts: {
  forcar?: boolean
  componentes?: IdProvisionamento[]
  onProgresso?: (e: EventoProgresso) => void
} = {}): Promise<{ ok: boolean; resultados: ResultadoComponente[] }> {
  if (emAndamento) return emAndamento
  const tarefa = (async () => {
    const manifesto = carregarManifesto()
    const plataforma = chavePlataforma(process.platform, process.arch)
    const aval = avaliarPlataforma(manifesto, plataforma)
    const versao = versaoApp()
    const resultados: ResultadoComponente[] = []
    if (!aval.ok) {
      for (const id of ['ffmpeg', 'python', 'pacotes'] as IdProvisionamento[]) {
        resultados.push({ id, ok: false, detalhe: 'plataforma ' + plataforma + ' não suportada' + (aval.motivo ? ': ' + aval.motivo : '') })
      }
      return { ok: false, resultados }
    }
    if (compararVersao(versao, manifesto.appMinimo) < 0) {
      for (const id of ['ffmpeg', 'python', 'pacotes'] as IdProvisionamento[]) {
        resultados.push({ id, ok: false, detalhe: 'atualize o DG Editor para ' + manifesto.appMinimo + ' ou mais' })
      }
      return { ok: false, resultados }
    }

    const alvos = opts.componentes && opts.componentes.length ? opts.componentes : (['ffmpeg', 'python', 'pacotes'] as IdProvisionamento[])
    const forcar = opts.forcar === true

    for (const id of alvos) {
      try {
        let r: Instalacao
        if (id === 'ffmpeg') r = await instalarFfmpeg({ forcar, versaoApp: versao, onProgresso: opts.onProgresso })
        else if (id === 'python') r = await instalarPython({ forcar, versaoApp: versao, onProgresso: opts.onProgresso })
        else r = await instalarPacotes({ onProgresso: opts.onProgresso })
        registrarResultado(id, r)
        resultados.push({ id, ok: r.ok, detalhe: r.detalhe, pulado: r.pulado })
        if (!r.ok) progresso(opts.onProgresso, id, 'erro', r.detalhe)
      } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e)
        resultados.push({ id, ok: false, detalhe })
        progresso(opts.onProgresso, id, 'erro', detalhe)
        salvarEstado({ ultimoErro: { em: new Date().toISOString(), detalhe } })
      }
    }

    const ok = resultados.every((r) => r.ok)
    salvarEstado({ ultimaVerificacao: new Date().toISOString() })
    return { ok, resultados }
  })()
  emAndamento = tarefa
  try {
    return await tarefa
  } finally {
    emAndamento = null
  }
}

/**
 * Verificação periódica em segundo plano: baixa o que falta e atualiza o
 * ffmpeg quando o upstream publica um build mais novo. Respeita a preferência
 * "auto" e recua por 6h depois de uma falha de rede/disco.
 */
export async function provisionarEmSegundoPlano(opts: { onProgresso?: (e: EventoProgresso) => void } = {}): Promise<{
  ok: boolean
  resultados: ResultadoComponente[]
} | null> {
  const prefs = lerPreferenciasProvisionamento()
  if (!prefs.auto) return null
  const estado = lerEstado()
  if (estado.ultimoErro?.em) {
    const quando = Date.parse(estado.ultimoErro.em)
    if (Number.isFinite(quando) && Date.now() - quando < BACKOFF_MS) return null
  }
  const ultima = prefs.ultimaVerificacao || estado.ultimaVerificacao
  if (ultima) {
    const quando = Date.parse(ultima)
    if (Number.isFinite(quando) && Date.now() - quando < INTERVALO_MS) return null
  }
  const r = await provisionar({ forcar: false, onProgresso: opts.onProgresso })
  salvarPreferenciasProvisionamento({ ultimaVerificacao: new Date().toISOString() })
  return r
}

/** Reexportado para scripts/testes: onde o provisionador guarda tudo. */
export function pastaProvisionamento(): string {
  return pastaBase()
}
