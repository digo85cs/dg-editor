/**
 * Banco de memes local — templates do Imgflip (API gratuita, sem chave) e
 * geração de meme com legendas via ffmpeg drawtext.
 *
 * Os templates ficam fora do repositório (%LOCALAPPDATA%/dg-editor/memes) e são
 * baixados sob demanda; o manifesto é sincronizado com um clique.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { caminhoRelativo, destinoArquivo, nomeArquivo, previewDe, rodar, slug, type RespostaMidia } from './core'
import { fonteMeme } from './comfyui'

const URL_MANIFESTO = 'https://api.imgflip.com/get_memes'
const IDADE_MAX_DIAS = 30

export type TemplateMeme = {
  id: string
  nome: string
  url: string
  largura: number
  altura: number
  caixas: number
}

type Manifesto = {
  atualizadoEm: string
  fonte: string
  templates: TemplateMeme[]
}

export function pastaMemes(): string {
  const base = process.env.DG_MEMES_DIR || (process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'dg-editor', 'memes')
    : join(homedir(), '.dg-editor', 'memes'))
  const p = join(base)
  mkdirSync(p, { recursive: true })
  return p
}

function pastaTemplates(): string {
  const p = join(pastaMemes(), 'templates')
  mkdirSync(p, { recursive: true })
  return p
}

function arquivoManifesto(): string {
  return join(pastaMemes(), 'manifest.json')
}

export function lerManifesto(): Manifesto | null {
  try {
    const bruto = JSON.parse(readFileSync(arquivoManifesto(), 'utf8')) as Manifesto
    if (!bruto || !Array.isArray(bruto.templates) || !bruto.templates.length) return null
    return bruto
  } catch {
    return null
  }
}

export async function sincronizarMemes(opts: { forcar?: boolean } = {}): Promise<{
  ok: boolean
  erro?: string
  total?: number
  atualizadoEm?: string
  novos?: number
  removidos?: number
  pasta?: string
}> {
  const atual = lerManifesto()
  if (atual && !opts.forcar) {
    const idadeDias = (Date.now() - Date.parse(atual.atualizadoEm)) / 86_400_000
    if (Number.isFinite(idadeDias) && idadeDias < IDADE_MAX_DIAS) {
      return { ok: true, total: atual.templates.length, atualizadoEm: atual.atualizadoEm, pasta: pastaMemes() }
    }
  }
  let dados: unknown
  try {
    const res = await fetch(URL_MANIFESTO, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: 'application/json' }
    })
    if (!res.ok) return { ok: false, erro: 'Imgflip respondeu HTTP ' + res.status }
    dados = await res.json()
  } catch (e) {
    return {
      ok: false,
      erro:
        'sem conexão com o Imgflip (' + (e instanceof Error ? e.message : String(e)) + '). ' +
        (atual ? 'Usando o manifesto anterior.' : 'Sincronize quando estiver online.')
    }
  }
  const bruto = dados as { success?: boolean; data?: { memes?: unknown[] } }
  if (!bruto?.success || !Array.isArray(bruto.data?.memes)) {
    return { ok: false, erro: 'resposta inesperada do Imgflip' }
  }
  const vistos = new Set<string>()
  const templates: TemplateMeme[] = []
  for (const item of bruto.data.memes) {
    const m = item as Record<string, unknown>
    const id = String(m.id || '').trim()
    const url = String(m.url || '').trim()
    if (!id || !/^https?:\/\//i.test(url) || vistos.has(id)) continue
    vistos.add(id)
    const largura = Number(m.width) || 0
    const altura = Number(m.height) || 0
    if (largura < 32 || altura < 32) continue
    templates.push({
      id,
      nome: String(m.name || 'Meme ' + id).trim().slice(0, 120),
      url,
      largura,
      altura,
      caixas: Math.max(1, Math.min(4, Number(m.box_count) || 2))
    })
  }
  if (templates.length < 10) return { ok: false, erro: 'poucos templates válidos recebidos (' + templates.length + ')' }
  const antes = new Set((atual?.templates || []).map((t) => t.id))
  const novos = templates.filter((t) => !antes.has(t.id)).length
  const removidos = (atual?.templates || []).filter((t) => !vistos.has(t.id)).length
  const manifesto: Manifesto = { atualizadoEm: new Date().toISOString(), fonte: 'imgflip.com', templates }
  writeFileSync(arquivoManifesto(), JSON.stringify(manifesto, null, 2), 'utf8')
  return {
    ok: true,
    total: templates.length,
    atualizadoEm: manifesto.atualizadoEm,
    novos,
    removidos,
    pasta: pastaMemes()
  }
}

export function listarMemes(filtro?: string): {
  ok: boolean
  erro?: string
  total: number
  atualizadoEm?: string
  templates: (TemplateMeme & { baixado: boolean })[]
} {
  const m = lerManifesto()
  if (!m) {
    return {
      ok: false,
      erro: 'banco de memes ainda não sincronizado (use "Sincronizar memes")',
      total: 0,
      templates: []
    }
  }
  const termo = String(filtro || '').trim().toLowerCase()
  const lista = m.templates
    .filter((t) => !termo || t.nome.toLowerCase().includes(termo))
    .map((t) => ({ ...t, baixado: existeTemplate(t.id) }))
  return { ok: true, total: lista.length, atualizadoEm: m.atualizadoEm, templates: lista }
}

function caminhoTemplate(id: string): string | undefined {
  const pasta = pastaTemplates()
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const p = join(pasta, id + ext)
    if (existsSync(p)) return p
  }
  return undefined
}

function existeTemplate(id: string): boolean {
  return !!caminhoTemplate(id)
}

async function baixarTemplate(t: TemplateMeme): Promise<{ ok: boolean; caminho?: string; erro?: string }> {
  const existente = caminhoTemplate(t.id)
  if (existente) return { ok: true, caminho: existente }
  try {
    const res = await fetch(t.url, { signal: AbortSignal.timeout(45_000) })
    if (!res.ok) return { ok: false, erro: 'HTTP ' + res.status }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1024) return { ok: false, erro: 'imagem vazia' }
    const ext = extname(new URL(t.url).pathname).toLowerCase() || '.jpg'
    const destino = join(pastaTemplates(), t.id + (ext === '.jpeg' ? '.jpg' : ext))
    writeFileSync(destino, buf)
    return { ok: true, caminho: destino }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Fonte disponível no SO; sem fonte o meme não é gerado (evita legenda invisível). */
function fonteDisponivel(): string | undefined {
  return fonteMeme()
}

export function quebrarLegenda(texto: string, maxChars: number): string[] {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!limpo) return []
  const linhas: string[] = []
  let atual = ''
  for (const palavra of limpo.split(' ')) {
    const tentativa = atual ? atual + ' ' + palavra : palavra
    if (tentativa.length <= maxChars || !atual) {
      atual = tentativa
      continue
    }
    linhas.push(atual)
    atual = palavra
  }
  if (atual) linhas.push(atual)
  return linhas
}

function escaparCaminhoFiltro(caminho: string): string {
  return caminho.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export async function gerarMeme(
  raiz: string,
  opts: { template: string | number; topo?: string; baixo?: string; saida?: string }
): Promise<RespostaMidia> {
  const m = lerManifesto()
  if (!m) return { ok: false, erro: 'sincronize o banco de memes antes de gerar' }
  const id = String(opts.template ?? '').trim()
  const t = m.templates.find((x) => x.id === id) || m.templates.find((x) => x.nome.toLowerCase() === id.toLowerCase())
  if (!t) return { ok: false, erro: 'template não encontrado: ' + id }
  const topo = String(opts.topo || '').trim()
  const baixo = String(opts.baixo || '').trim()
  if (!topo && !baixo) return { ok: false, erro: 'escreva o texto de cima e/ou de baixo' }
  const fonte = fonteDisponivel()
  if (!fonte) return { ok: false, erro: 'nenhuma fonte Impact/Arial Bold encontrada no sistema' }
  const baixado = await baixarTemplate(t)
  if (!baixado.ok || !baixado.caminho) return { ok: false, erro: 'falha ao baixar template: ' + (baixado.erro || '?') }

  // Escolhe o maior corpo de fonte em que as duas legendas caibam em ~6 linhas.
  let corpo = Math.max(22, Math.round(Math.min(t.largura / 8, t.altura / 6)))
  let linhasCima: string[] = []
  let linhasBaixo: string[] = []
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const maxChars = Math.max(8, Math.floor((t.largura * 0.92) / (corpo * 0.55)))
    linhasCima = quebrarLegenda(topo.toUpperCase(), maxChars)
    linhasBaixo = quebrarLegenda(baixo.toUpperCase(), maxChars)
    if (linhasCima.length + linhasBaixo.length <= 6) break
    corpo = Math.round(corpo * 0.9)
  }

  const tmp = join(tmpdir(), 'dg-meme-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
  mkdirSync(tmp, { recursive: true })
  const destino = destinoArquivo(raiz, nomeArquivo('meme-' + slug(t.nome, 24), '.png'), opts.saida)
  const margem = Math.round(corpo * 0.35)
  const filtros: string[] = []
  const fonteEsc = escaparCaminhoFiltro(fonte)
  try {
    let indice = 0
    const criarFiltro = (linha: string, y: string) => {
      const arq = join(tmp, 'l' + indice++ + '.txt')
      writeFileSync(arq, linha, 'utf8')
      return (
        "drawtext=fontfile='" + fonteEsc + "':textfile='" + escaparCaminhoFiltro(arq) + "'" +
        ':expansion=none:fontcolor=white:fontsize=' + corpo + ':borderw=' + Math.max(4, Math.round(corpo * 0.08)) +
        ':bordercolor=black:x=(w-text_w)/2:y=' + y
      )
    }
    // Cima: empilha de cima para baixo.
    linhasCima.forEach((linha, i) => {
      filtros.push(criarFiltro(linha, String(margem + i * Math.round(corpo * 1.08))))
    })
    // Baixo: empilha de baixo para cima.
    const totalBaixo = linhasBaixo.length
    linhasBaixo.forEach((linha, i) => {
      const y = t.altura - margem - (totalBaixo - i) * Math.round(corpo * 1.08)
      filtros.push(criarFiltro(linha, String(Math.max(margem, y))))
    })
    const r = await rodar(
      process.env.DG_FFMPEG || 'ffmpeg',
      ['-y', '-i', baixado.caminho, '-vf', filtros.join(','), '-frames:v', '1', destino],
      120_000
    )
    if (!r.ok || !existsSync(destino)) {
      return {
        ok: false,
        erro: 'ffmpeg falhou ao gerar o meme: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'image/png',
    previewBase64: previewDe(destino),
    detalhes: {
      template: t.nome,
      templateId: t.id,
      largura: t.largura,
      altura: t.altura,
      fonte: corpo,
      linhas: linhasCima.length + linhasBaixo.length
    },
    aviso: 'Meme gerado localmente com template do Imgflip (banco gratuito).'
  }
}

export function statusMemes(): {
  ok: boolean
  total: number
  baixados: number
  atualizadoEm?: string
  idadeDias?: number
  desatualizado: boolean
  pasta: string
  erro?: string
} {
  const m = lerManifesto()
  const pasta = pastaMemes()
  if (!m) {
    return { ok: false, total: 0, baixados: 0, desatualizado: true, pasta, erro: 'banco não sincronizado' }
  }
  const baixados = m.templates.filter((t) => existeTemplate(t.id)).length
  const idadeDias = (Date.now() - Date.parse(m.atualizadoEm)) / 86_400_000
  const idadeOk = Number.isFinite(idadeDias) ? +idadeDias.toFixed(1) : undefined
  return {
    ok: true,
    total: m.templates.length,
    baixados,
    atualizadoEm: m.atualizadoEm,
    idadeDias: idadeOk,
    desatualizado: idadeOk === undefined || idadeOk >= IDADE_MAX_DIAS,
    pasta
  }
}
