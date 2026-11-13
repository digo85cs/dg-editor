/**
 * Diagnóstico de portabilidade: garante que o DG Editor instalado em outro PC
 * tenha as ferramentas embutidas (ffmpeg, Python, terminal) e informa o que é
 * opcional (Ollama, SDK Android, ComfyUI) sem impedir o uso.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { statusApps } from './apps'
import { listarModelosOllama } from './brain/ollama'
import { pastasEmbutidas, statusMidia } from './midia/core'

export type ItemPortabilidade = {
  id: string
  titulo: string
  ok: boolean
  obrigatorio: boolean
  detalhe: string
  dica?: string
}

export type DiagnosticoPortabilidade = {
  ok: boolean
  itens: ItemPortabilidade[]
  resumo: { total: number; ok: number; falhasObrigatorias: string[]; avisos: string[] }
  embutido: boolean
}

function pastaFerramentas(): string | null {
  const dirs = pastasEmbutidas()
  return dirs.find((d) => existsSync(join(d, 'ffmpeg.exe'))) || null
}

async function testarEscrita(): Promise<{ ok: boolean; detalhe: string }> {
  const base = mkdtempSync(join(tmpdir(), 'dg-escrita-'))
  try {
    const p = join(base, 'teste.txt')
    writeFileSync(p, 'ok', 'utf8')
    return { ok: existsSync(p), detalhe: 'pasta temporária gravável' }
  } catch (e) {
    return { ok: false, detalhe: e instanceof Error ? e.message : 'falha ao gravar' }
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
}

async function testarNodePty(): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const pty = await import('node-pty')
    const ok = typeof pty.spawn === 'function'
    return { ok, detalhe: ok ? 'módulo nativo carregado (terminal integrado)' : 'node-pty sem spawn' }
  } catch (e) {
    return { ok: false, detalhe: 'node-pty indisponível: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function diagnosticoPortabilidade(): Promise<DiagnosticoPortabilidade> {
  const itens: ItemPortabilidade[] = []
  const add = (i: ItemPortabilidade) => itens.push(i)

  const win = process.platform === 'win32'
  add({
    id: 'sistema',
    titulo: 'Windows x64',
    ok: win && process.arch === 'x64',
    obrigatorio: true,
    detalhe: process.platform + ' ' + process.arch + ' · Node ' + process.versions.node,
    dica: 'O instalador suporta Windows 10/11 x64.'
  })

  const midia = await statusMidia()
  const f = midia.ferramentas
  const pasta = pastaFerramentas()
  add({
    id: 'ffmpeg',
    titulo: 'ffmpeg',
    ok: f.ffmpeg.ok,
    obrigatorio: true,
    detalhe: (f.ffmpeg.versao || f.ffmpeg.erro || 'não encontrado') + ' · ' + (f.ffmpeg.origem || '?'),
    dica:
      f.ffmpeg.origem === 'embutida' || f.ffmpeg.origem === 'atualizada'
        ? undefined
        : 'O app baixa automaticamente; para embutir no instalador rode "npm run ferramentas".'
  })
  add({
    id: 'ffprobe',
    titulo: 'ffprobe',
    ok: f.ffprobe.ok,
    obrigatorio: true,
    detalhe: (f.ffprobe.versao || f.ffprobe.erro || 'não encontrado') + ' · ' + (f.ffprobe.origem || '?')
  })
  add({
    id: 'python',
    titulo: 'Python (vozes e transcrição)',
    ok: f.python.ok,
    obrigatorio: false,
    detalhe: (f.python.versao || f.python.erro || 'não encontrado') + ' · ' + (f.python.origem || '?'),
    dica:
      f.python.origem === 'embutida' || f.python.origem === 'atualizada'
        ? undefined
        : 'O app baixa o Python portátil automaticamente quando há rede.'
  })
  add({
    id: 'edge-tts',
    titulo: 'Narração edge-tts',
    ok: f.edgeTts.ok,
    obrigatorio: false,
    detalhe: f.edgeTts.versao || f.edgeTts.erro || 'não encontrado',
    dica: 'Precisa de internet; vozes locais funcionam offline.'
  })
  add({
    id: 'whisper',
    titulo: 'Transcrição (faster-whisper)',
    ok: f.fasterWhisper.ok,
    obrigatorio: false,
    detalhe: f.fasterWhisper.versao || f.fasterWhisper.erro || 'não instalado',
    dica: 'Roda em CPU; modelos são baixados no primeiro uso.'
  })

  const pty = await testarNodePty()
  add({ id: 'terminal', titulo: 'Terminal integrado', ok: pty.ok, obrigatorio: true, detalhe: pty.detalhe })

  const escrita = await testarEscrita()
  add({ id: 'escrita', titulo: 'Gravação local', ok: escrita.ok, obrigatorio: true, detalhe: escrita.detalhe })

  let modelos: string[] | null = null
  try {
    modelos = await listarModelosOllama()
  } catch {
    modelos = null
  }
  const qwen = (modelos || []).filter((m) => /qwen/i.test(m))
  add({
    id: 'ollama',
    titulo: 'Ollama + modelos locais',
    ok: Boolean(modelos && modelos.length),
    obrigatorio: false,
    detalhe: modelos === null ? 'Ollama não respondeu em 127.0.0.1:11434' : modelos.length + ' modelo(s) · ' + qwen.slice(0, 3).join(', '),
    dica: 'Instale o Ollama e rode "ollama pull qwen2.5-coder:3b" (grátis).'
  })

  const apps = statusApps()
  add({
    id: 'android',
    titulo: 'Toolchain Android (APK)',
    ok: apps.sdk.ok,
    obrigatorio: false,
    detalhe: apps.sdk.ok ? 'SDK + Java prontos' : 'não instalado',
    dica: 'Use "Instalar SDK Android" no painel Apps (download único).'
  })

  const obrigatoriosFalhando = itens.filter((i) => i.obrigatorio && !i.ok).map((i) => i.titulo)
  const avisos = itens.filter((i) => !i.obrigatorio && !i.ok).map((i) => i.titulo)
  return {
    ok: obrigatoriosFalhando.length === 0,
    itens,
    resumo: {
      total: itens.length,
      ok: itens.filter((i) => i.ok).length,
      falhasObrigatorias: obrigatoriosFalhando,
      avisos
    },
    embutido: Boolean(pasta)
  }
}
