/**
 * Download e extração das ferramentas portáteis.
 *
 * - retomada via Range quando o servidor aceita;
 * - extração com o bsdtar do próprio Windows (zip e tar.gz);
 * - instalação atômica: extrai em pasta temporária e troca no final.
 */
import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync
} from 'node:fs'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

export type ProgressoDownload = (p: { recebido: number; total: number; etapa: string }) => void

const MB = 1024 * 1024

export function espacoLivreMB(pasta: string): number | null {
  try {
    const alvo = existsSync(pasta) ? pasta : resolve(pasta, '..')
    const s = statfsSync(alvo)
    return Math.floor((s.bavail * s.bsize) / MB)
  } catch {
    return null
  }
}

function tamanho(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

export function tarDoSistema(): string {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  const p = join(root, 'System32', 'tar.exe')
  return existsSync(p) ? p : 'tar'
}

function rodarExtracao(arquivo: string, destino: string): Promise<{ ok: boolean; erro?: string }> {
  mkdirSync(destino, { recursive: true })
  return new Promise((finalizar) => {
    const child = spawn(tarDoSistema(), ['-xf', arquivo, '-C', destino], {
      windowsHide: true,
      env: { ...process.env, COPYFILE_DISABLE: '1' }
    })
    let erro = ''
    child.stderr?.on('data', (c: Buffer) => {
      erro += c.toString('utf8')
      if (erro.length > 8000) erro = erro.slice(-8000)
    })
    child.on('error', (e) => finalizar({ ok: false, erro: e.message }))
    child.on('close', (codigo) =>
      finalizar({ ok: codigo === 0, erro: codigo === 0 ? undefined : erro.split(/\r?\n/).slice(-3).join(' ').slice(0, 500) })
    )
  })
}

export async function baixarArquivo(
  url: string,
  destino: string,
  onProgresso?: ProgressoDownload,
  timeoutMs = 3 * 3600_000
): Promise<{ ok: boolean; bytes: number; erro?: string; status?: number }> {
  mkdirSync(join(destino, '..'), { recursive: true })
  const parcial = destino + '.part'
  let inicio = tamanho(parcial)
  if (inicio > 0 && existsSync(destino)) {
    rmSync(parcial, { force: true })
    inicio = 0
  }
  const headers: Record<string, string> = { 'User-Agent': 'DG-Editor (provisionamento)' }
  if (inicio > 0) headers.Range = 'bytes=' + inicio + '-'
  let res: Response
  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    return { ok: false, bytes: inicio, erro: e instanceof Error ? e.message : String(e) }
  }
  if (!res.ok && res.status !== 206) return { ok: false, bytes: inicio, erro: 'HTTP ' + res.status, status: res.status }
  if (!res.body) return { ok: false, bytes: inicio, erro: 'resposta sem corpo' }
  const total = Number(res.headers.get('content-length') || 0) + (res.status === 206 ? inicio : 0)
  let recebido = res.status === 206 ? inicio : 0
  let ultimoAviso = 0
  try {
    const fonte = Readable.fromWeb(res.body as never)
    fonte.on('data', (c: Buffer) => {
      recebido += c.length
      const agora = Date.now()
      if (onProgresso && agora - ultimoAviso > 400) {
        ultimoAviso = agora
        onProgresso({ recebido, total: total || recebido, etapa: 'baixando' })
      }
    })
    await pipeline(fonte, createWriteStream(parcial, { flags: res.status === 206 ? 'a' : 'w' }))
    if (existsSync(destino)) rmSync(destino, { force: true })
    renameSync(parcial, destino)
    onProgresso?.({ recebido, total: total || recebido, etapa: 'baixado' })
    return { ok: true, bytes: recebido }
  } catch (e) {
    return { ok: false, bytes: recebido, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Extrai zip/tar.gz em uma pasta temporária e devolve a raiz extraída. */
export async function extrairArquivo(arquivo: string, rotulo: string): Promise<{ ok: boolean; pasta?: string; erro?: string }> {
  const base = join(tmpdir(), 'dg-ferramentas-' + rotulo + '-' + Date.now().toString(36))
  const r = await rodarExtracao(arquivo, base)
  if (!r.ok) {
    rmSync(base, { recursive: true, force: true })
    return { ok: false, erro: r.erro || 'falha ao extrair' }
  }
  return { ok: true, pasta: base }
}

function encontrarArquivo(raiz: string, nome: string, profundidade = 3): string | null {
  if (profundidade < 0) return null
  let itens: string[]
  try {
    itens = readdirSync(raiz)
  } catch {
    return null
  }
  const direto = itens.find((i) => i.toLowerCase() === nome.toLowerCase())
  if (direto) return join(raiz, direto)
  for (const i of itens) {
    const p = join(raiz, i)
    try {
      if (statSync(p).isDirectory()) {
        const achado = encontrarArquivo(p, nome, profundidade - 1)
        if (achado) return achado
      }
    } catch {
      /* ignora */
    }
  }
  return null
}

/**
 * Troca a pasta de destino pela extraída. Se a pasta estiver em uso
 * (antivírus/processo), mantém a versão anterior e informa o erro.
 */
export function instalarPasta(origem: string, destino: string): { ok: boolean; erro?: string } {
  const pai = join(destino, '..')
  mkdirSync(pai, { recursive: true })
  let backup = ''
  try {
    if (existsSync(destino)) {
      backup = destino + '.old-' + Date.now().toString(36)
      renameSync(destino, backup)
    }
    renameSync(origem, destino)
    if (backup) rmSync(backup, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    // Restaura a versão anterior se a troca falhou no meio.
    try {
      if (!existsSync(destino) && backup && existsSync(backup)) renameSync(backup, destino)
    } catch {
      /* mantém como está */
    }
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Copia binários achados na extração para a pasta final (plana). */
export function copiarBinarios(pastaExtraida: string, destino: string, nomes: string[]): { ok: boolean; faltando: string[] } {
  mkdirSync(destino, { recursive: true })
  const faltando: string[] = []
  for (const nome of nomes) {
    const achado = encontrarArquivo(pastaExtraida, nome)
    if (!achado) {
      faltando.push(nome)
      continue
    }
    copyFileSync(achado, join(destino, nome))
  }
  return { ok: faltando.length === 0, faltando }
}

/** Pasta única dentro da extração (ex.: raiz "python" do python-build-standalone). */
export function raizUnica(pastaExtraida: string): string | null {
  try {
    const itens = readdirSync(pastaExtraida)
    if (itens.length === 1) {
      const p = join(pastaExtraida, itens[0])
      if (statSync(p).isDirectory()) return p
    }
  } catch {
    /* */
  }
  return null
}
