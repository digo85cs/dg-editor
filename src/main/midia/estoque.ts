/**
 * Banco de mídia stock via Pixabay — fotos e vídeos gratuitos.
 * Requer PIXABAY_API_KEY (gratuita em pixabay.com/api/docs; 100 req/min).
 * Downloads vão para .dg-editor/midia do projeto.
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  previewDe,
  type RespostaMidia
} from './core'
import { extname } from 'node:path'

const BASE = 'https://pixabay.com/api'

function chavePixabay(): string | null {
  return (process.env.PIXABAY_API_KEY || '').trim() || null
}

export function pixabayConfigurado(): boolean {
  return !!chavePixabay()
}

type HitImagem = {
  id: number
  pageURL: string
  previewURL: string
  webformatURL: string
  largeImageURL: string
  tags: string
  user: string
  imageWidth: number
  imageHeight: number
}

type HitVideo = {
  id: number
  pageURL: string
  tags: string
  user: string
  duration: number
  videos: Record<string, { url: string; width: number; height: number }>
}

async function getJson(url: string, timeoutMs = 30_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  const texto = await res.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  return { ok: res.ok, status: res.status, dados }
}

function erroChave(): RespostaMidia {
  return {
    ok: false,
    erro: 'PIXABAY_API_KEY não configurada. Cadastre grátis em pixabay.com/api/docs e salve em Contas → Provedores ou variável de ambiente.'
  }
}

/** Busca imagens ou vídeos no Pixabay e devolve a lista resumida (sem baixar). */
export async function buscarMidia(
  raiz: string,
  opts: { tipo: 'imagem' | 'video'; consulta: string; pagina?: number; porPagina?: number }
): Promise<RespostaMidia> {
  void raiz
  const chave = chavePixabay()
  if (!chave) return erroChave()
  const consulta = String(opts.consulta || '').trim()
  if (!consulta) return { ok: false, erro: 'informe a consulta de busca' }
  const pagina = Math.max(1, Math.round(opts.pagina || 1))
  const porPagina = Math.min(200, Math.max(3, Math.round(opts.porPagina || 12)))
  const endpoint = opts.tipo === 'video' ? BASE + '/videos/' : BASE + '/'
  const qs = new URLSearchParams({
    key: chave,
    q: consulta.slice(0, 100),
    per_page: String(porPagina),
    page: String(pagina),
    safesearch: 'true'
  })
  const r = await getJson(endpoint + '?' + qs.toString())
  if (!r.ok) return { ok: false, erro: 'Pixabay HTTP ' + r.status + ': ' + JSON.stringify(r.dados).slice(0, 200) }
  const dados = r.dados as { totalHits?: number; hits?: unknown[] }
  const hits = Array.isArray(dados?.hits) ? dados.hits : []
  const itens = hits.slice(0, porPagina).map((h) => {
    if (opts.tipo === 'video') {
      const v = h as HitVideo
      return {
        id: v.id,
        tags: v.tags,
        usuario: v.user,
        duracaoSeg: v.duration,
        pageURL: v.pageURL,
        melhor: v.videos?.large?.url || v.videos?.medium?.url || '',
        resolucao: (v.videos?.large?.width || 0) + 'x' + (v.videos?.large?.height || 0)
      }
    }
    const i = h as HitImagem
    return {
      id: i.id,
      tags: i.tags,
      usuario: i.user,
      pageURL: i.pageURL,
      downloadURL: i.webformatURL,
      resolucao: i.imageWidth + 'x' + i.imageHeight
    }
  })
  return {
    ok: true,
    texto: JSON.stringify({ total: dados?.totalHits ?? hits.length, pagina, itens }, null, 2),
    detalhes: { motor: 'pixabay', tipo: opts.tipo, total: dados?.totalHits }
  }
}

/** Baixa uma mídia do Pixabay pela URL retornada na busca (webformatURL ou videos.*.url). */
export async function baixarMidia(
  raiz: string,
  opts: { url: string; tipo?: 'imagem' | 'video' | 'auto'; consulta?: string; saida?: string }
): Promise<RespostaMidia> {
  void raiz
  const chave = chavePixabay()
  if (!chave) return erroChave()
  const url = String(opts.url || '').trim()
  if (!/^https:\/\/(cdn\.)?pixabay\.com\//.test(url) && !/pixabay\.com/.test(url)) {
    return { ok: false, erro: 'URL não é do Pixabay: ' + url.slice(0, 120) }
  }
  const tipo = opts.tipo === 'video' ? 'video' : opts.tipo === 'imagem' ? 'imagem' : 'auto'
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'DG-Editor/0.6.5' }
  })
  if (!res.ok) return { ok: false, erro: 'download Pixabay HTTP ' + res.status }
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) return { ok: false, erro: 'arquivo vazio' }
  const ext = extname(new URL(url).pathname).toLowerCase() || (tipo === 'video' ? '.mp4' : '.jpg')
  const nome = nomeArquivo(opts.consulta || 'pixabay-' + (tipo === 'video' ? 'video' : 'imagem'), ext)
  const destino = destinoArquivo(raiz, nome, opts.saida)
  writeFileSync(destino, buf)
  const ehVideo = ext === '.mp4' || ext === '.webm' || tipo === 'video'
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: buf.length,
    mime: mimePorExt(ext) || (ehVideo ? 'video/mp4' : 'image/jpeg'),
    previewBase64: ehVideo ? undefined : previewDe(destino),
    aviso: 'Mídia stock gratuita via Pixabay (conteúdo royalty-free).'
  }
}
