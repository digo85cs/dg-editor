/**
 * Gravador de tela estilo OBS (versão mínima): recebe os chunks WebM do
 * renderer, grava dentro do projeto e converte para MP4 com ffmpeg.
 * Sem importações do Electron — testável no Node.
 */
import { promises as fsp, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { caminhoDentroDaRaiz } from '../paths'
import { binarioResolvido, rodar } from '../midia/core'

export type GravacaoResumo = {
  nome: string
  caminho: string
  caminhoRel: string
  bytes: number
  mtimeMs: number
}

export function pastaGravacoes(raiz: string): string {
  return join(resolve(raiz), '.dg-editor', 'gravacoes')
}

export function nomeGravacaoSeguro(nome: unknown): string | null {
  if (typeof nome !== 'string') return null
  const base = nome.trim().replace(/\.(webm|mp4)$/i, '')
  if (!base || /[/\\<>:"|?*\u0000-\u001f]/.test(base) || base === '.' || base === '..') return null
  return base.slice(0, 80)
}

function carimbo(quando = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    quando.getFullYear() +
    p(quando.getMonth() + 1) +
    p(quando.getDate()) +
    '-' +
    p(quando.getHours()) +
    p(quando.getMinutes()) +
    p(quando.getSeconds())
  )
}

export function caminhoGravacao(raiz: string, nome?: string): string {
  const seguro = nomeGravacaoSeguro(nome)
  const base = seguro || 'gravacao-' + carimbo()
  const alvo = join(pastaGravacoes(raiz), base + '.webm')
  return caminhoDentroDaRaiz(raiz, alvo).abs
}

type Sessao = { caminho: string; bytes: number; finalizada: boolean }

const sessoes = new Map<string, Sessao>()
let contador = 0

export function iniciarGravacao(raiz: string, nome?: string): { id: string; caminho: string; caminhoRel: string } {
  const caminho = caminhoGravacao(raiz, nome)
  mkdirSync(dirname(caminho), { recursive: true })
  const id = 'g' + process.pid + '-' + Date.now().toString(36) + '-' + ++contador
  sessoes.set(id, { caminho, bytes: 0, finalizada: false })
  return { id, caminho, caminhoRel: relative(resolve(raiz), caminho).replace(/\\/g, '/') }
}

export async function anexarChunk(id: string, dados: Uint8Array): Promise<{ ok: true; bytes: number } | { ok: false; erro: string }> {
  const s = sessoes.get(id)
  if (!s) return { ok: false, erro: 'sessão de gravação desconhecida' }
  if (s.finalizada) return { ok: false, erro: 'gravação já finalizada' }
  if (!dados || dados.byteLength === 0) return { ok: true, bytes: s.bytes }
  await fsp.appendFile(s.caminho, Buffer.from(dados))
  s.bytes += dados.byteLength
  return { ok: true, bytes: s.bytes }
}

export async function finalizarGravacao(id: string): Promise<{ ok: true; caminho: string; bytes: number } | { ok: false; erro: string }> {
  const s = sessoes.get(id)
  if (!s) return { ok: false, erro: 'sessão de gravação desconhecida' }
  s.finalizada = true
  sessoes.delete(id)
  if (!existsSync(s.caminho) || s.bytes === 0) {
    try {
      await fsp.rm(s.caminho, { force: true })
    } catch {
      /* */
    }
    return { ok: false, erro: 'nenhum dado foi gravado' }
  }
  return { ok: true, caminho: s.caminho, bytes: s.bytes }
}

export async function cancelarGravacao(id: string): Promise<void> {
  const s = sessoes.get(id)
  if (!s) return
  sessoes.delete(id)
  try {
    await fsp.rm(s.caminho, { force: true })
  } catch {
    /* */
  }
}

export function listarGravacoes(raiz: string): GravacaoResumo[] {
  const pasta = pastaGravacoes(raiz)
  if (!existsSync(pasta)) return []
  const out: GravacaoResumo[] = []
  for (const nome of readdirSync(pasta)) {
    const abs = join(pasta, nome)
    try {
      const st = statSync(abs)
      if (!st.isFile() || !/\.(webm|mp4)$/i.test(nome)) continue
      out.push({
        nome,
        caminho: abs,
        caminhoRel: relative(resolve(raiz), abs).replace(/\\/g, '/'),
        bytes: st.size,
        mtimeMs: st.mtimeMs
      })
    } catch {
      /* ignora arquivo inacessível */
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs || a.nome.localeCompare(b.nome))
}

export async function converterParaMp4(
  raiz: string,
  opts: { entrada: string; crf?: number; escala?: number }
): Promise<{ ok: true; caminho: string; caminhoRel: string; bytes: number } | { ok: false; erro: string }> {
  if (!existsSync(opts.entrada)) return { ok: false, erro: 'gravação não encontrada' }
  let dentro: { abs: string; rel: string }
  try {
    dentro = caminhoDentroDaRaiz(raiz, opts.entrada)
  } catch {
    return { ok: false, erro: 'gravação fora do projeto' }
  }
  const ext = extname(dentro.abs)
  const alvo = dentro.abs.slice(0, -ext.length) + '.mp4'
  const crf = Math.round(Math.min(32, Math.max(16, Number(opts.crf) || 23)))
  const escala = Number(opts.escala)
  const args = ['-y', '-i', dentro.abs, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p']
  if (Number.isFinite(escala) && escala >= 0.2 && escala <= 4 && Math.abs(escala - 1) > 0.01) {
    args.push('-vf', 'scale=trunc(iw*' + escala + '/2)*2:trunc(ih*' + escala + '/2)*2:flags=lanczos')
  }
  args.push('-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', alvo)
  const r = await rodar(binarioResolvido('ffmpeg'), args, 1_800_000)
  if (!r.ok || !existsSync(alvo)) {
    return {
      ok: false,
      erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
    }
  }
  return {
    ok: true,
    caminho: alvo,
    caminhoRel: relative(resolve(raiz), alvo).replace(/\\/g, '/'),
    bytes: statSync(alvo).size
  }
}
