/**
 * Estado real dos conectores que o editor, o painel e o MCP compartilham.
 */
import { execFileSync } from 'child_process'
import { request } from 'http'
import { cursorCliAprovadoNaSessao, resolverBinarioCursorAgent } from './brain/providers'
import { statusCodexEmCache } from './brain/codex-cli'

export type ConectorInfo = {
  id: string
  nome: string
  tipo: 'ia' | 'cli' | 'mcp' | 'editor'
  ativo: boolean
  detalhe: string
  usa: string
}

function binarioNoPath(nome: string): string | null {
  try {
    const outs = execFileSync('where.exe', [nome], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000
    })
      .trim()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    return outs[0] || null
  } catch {
    return null
  }
}

function ollamaNoAr(): Promise<{ ok: boolean; modelos: number }> {
  return new Promise((resolve) => {
    const req = request(
      { hostname: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET', timeout: 1500 },
      (res) => {
        let raw = ''
        res.on('data', (c) => {
          raw += c
        })
        res.on('end', () => {
          try {
            const j = JSON.parse(raw) as { models?: unknown[] }
            resolve({ ok: res.statusCode === 200, modelos: Array.isArray(j.models) ? j.models.length : 0 })
          } catch {
            resolve({ ok: false, modelos: 0 })
          }
        })
      }
    )
    req.on('error', () => resolve({ ok: false, modelos: 0 }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, modelos: 0 })
    })
    req.end()
  })
}

export async function listarConectores(): Promise<ConectorInfo[]> {
  const ollama = await ollamaNoAr()
  const cursorBin = resolverBinarioCursorAgent() || binarioNoPath('cursor-agent')
  const cursorOk = cursorCliAprovadoNaSessao()
  const codexBin = binarioNoPath('codex')
  const codexCache = statusCodexEmCache()
  const codexAtivo = !!codexBin || codexCache?.available === true

  return [
    {
      id: 'editor',
      nome: 'Editor',
      tipo: 'editor',
      ativo: true,
      detalhe: 'Quebra de linha automatica. Ctrl+S ou Salvar grava o arquivo aberto.',
      usa: 'arquivo:salvar'
    },
    {
      id: 'ollama',
      nome: 'Ollama',
      tipo: 'ia',
      ativo: ollama.ok,
      detalhe: ollama.ok ? 'no ar, ' + ollama.modelos + ' modelo(s)' : 'parado ou ausente em 127.0.0.1:11434',
      usa: 'ollama_ask'
    },
    {
      id: 'dg-mcp',
      nome: 'MCP do DG Editor',
      tipo: 'mcp',
      ativo: true,
      detalhe: 'Arquivos, skills, agentes e conectores no mesmo servidor.',
      usa: 'skill_listar, agente_listar, conector_listar'
    },
    {
      id: 'cursor',
      nome: 'Cursor',
      tipo: 'cli',
      ativo: !!cursorBin,
      detalhe: cursorBin
        ? (cursorOk ? 'cursor-agent pronto nesta sessao' : 'binario encontrado; sessao ainda nao aprovada')
        : 'cursor-agent nao encontrado',
      usa: 'cursor-cli'
    },
    {
      id: 'codex',
      nome: 'Codex',
      tipo: 'cli',
      ativo: codexAtivo,
      detalhe: codexBin
        ? 'binario codex no PATH'
        : (codexCache?.installed ? 'cache marca instalado' : 'codex nao encontrado no PATH'),
      usa: 'codex-cli'
    },
    ...listarFerramentasPath()
  ]
}

/** CLIs grátis usados por mídia/docs — só PATH, sem instalar nada. */
function listarFerramentasPath(): ConectorInfo[] {
  const probes: Array<{ id: string; nome: string; bins: string[]; usa: string }> = [
    { id: 'ffmpeg', nome: 'FFmpeg', bins: ['ffmpeg'], usa: 'video/audio local' },
    { id: 'pandoc', nome: 'Pandoc', bins: ['pandoc'], usa: 'docs markdown→pdf/docx' },
    { id: 'tesseract', nome: 'Tesseract OCR', bins: ['tesseract'], usa: 'OCR de imagens' },
    { id: 'git', nome: 'Git', bins: ['git'], usa: 'repositórios' },
    { id: 'python', nome: 'Python', bins: ['python', 'python3', 'py'], usa: 'scripts locais' },
    { id: 'node', nome: 'Node.js', bins: ['node'], usa: 'runtime JS' },
    { id: 'comfyui', nome: 'ComfyUI', bins: ['comfyui'], usa: 'imagens/vídeo local' }
  ]
  return probes.map((p) => {
    let pathBin: string | null = null
    for (const b of p.bins) {
      pathBin = binarioNoPath(b)
      if (pathBin) break
    }
    return {
      id: p.id,
      nome: p.nome,
      tipo: 'cli' as const,
      ativo: !!pathBin,
      detalhe: pathBin ? 'no PATH: ' + pathBin : 'não encontrado no PATH (opcional)',
      usa: p.usa
    }
  })
}
