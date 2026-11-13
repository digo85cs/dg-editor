/**
 * Banco de músicas locais (livres) e mixagem com vídeo via ffmpeg.
 * Nada é baixado automaticamente: o usuário coloca áudios em %LOCALAPPDATA%/dg-editor/musicas.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  rodar,
  validarEntrada,
  type RespostaMidia
} from './core'

const EXTENSOES = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'])

export type Musica = {
  nome: string
  caminho: string
  bytes: number
  atualizadoEm: string
}

export function pastaMusicas(): string {
  const base =
    process.env.DG_MUSICAS_DIR ||
    (process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'dg-editor', 'musicas')
      : join(homedir(), '.dg-editor', 'musicas'))
  mkdirSync(base, { recursive: true })
  return base
}

export function listarMusicas(): { ok: boolean; pasta: string; total: number; itens: Musica[] } {
  const pasta = pastaMusicas()
  let itens: Musica[] = []
  try {
    itens = readdirSync(pasta)
      .filter((f) => EXTENSOES.has(extname(f).toLowerCase()))
      .map((f) => {
        const caminho = join(pasta, f)
        const st = statSync(caminho)
        return { nome: f, caminho, bytes: st.size, atualizadoEm: st.mtime.toISOString() }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome))
  } catch {
    itens = []
  }
  return { ok: true, pasta, total: itens.length, itens }
}

async function temAudio(video: string): Promise<boolean> {
  const r = await rodar(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', video],
    30_000
  )
  return r.ok && /audio/i.test(r.stdout)
}

export async function mixarMusica(
  raiz: string,
  opts: { video: string; musica: string; volume?: number; saida?: string }
): Promise<RespostaMidia> {
  const erroVideo = validarEntrada(opts.video, 'video')
  if (erroVideo) return { ok: false, erro: erroVideo }
  const musica = String(opts.musica || '')
  if (!musica || !existsSync(musica)) return { ok: false, erro: 'música não encontrada: ' + musica }
  if (!EXTENSOES.has(extname(musica).toLowerCase())) return { ok: false, erro: 'formato de áudio não suportado' }
  const volume = Math.min(1, Math.max(0, Number(opts.volume ?? 0.18)))
  const destino = destinoArquivo(raiz, nomeArquivo('video-musica', '.mp4'), opts.saida)
  const args = ['-y', '-i', opts.video, '-stream_loop', '-1', '-i', musica]
  if (await temAudio(opts.video)) {
    args.push(
      '-filter_complex',
      '[1:a]volume=' + volume.toFixed(2) + '[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]',
      '-map',
      '0:v:0',
      '-map',
      '[a]'
    )
  } else {
    args.push('-map', '0:v:0', '-map', '1:a:0', '-filter:a', 'volume=' + volume.toFixed(2))
  }
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', destino)
  const r = await rodar('ffmpeg', args, 600_000)
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'ffmpeg falhou: ' + (r.erro || r.stderr).split(/\r?\n/).slice(-2).join(' ').slice(0, 300) }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'video/mp4'
  }
}
