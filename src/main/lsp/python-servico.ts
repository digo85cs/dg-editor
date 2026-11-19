/**
 * Diagnosticos Python para o contexto do agente:
 *  1. pyflakes (nomes indefinidos, imports nao usados, etc.) — auto-instala
 *     via pip no python gerenciado do app na primeira vez que precisar.
 *  2. py_compile (erro de sintaxe) — fallback sempre disponivel.
 * Sem servidor LSP persistente; roda sob demanda nos .py alterados no git.
 */
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'

const MAX_ARQUIVOS = 8
const TIMEOUT_MS = 20_000

function rodar(bin: string, args: string[], timeout = TIMEOUT_MS): Promise<{ code: number | null; saida: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, windowsHide: true, maxBuffer: 512 * 1024 }, (erro, stdout, stderr) => {
      const code = typeof erro?.code === 'number' ? erro.code : erro ? 1 : 0
      resolve({ code, saida: String(stderr || stdout || '').trim() })
    })
  })
}

let pyflakesInstalado: Promise<boolean> | null = null

/** Garante pyflakes no python gerenciado; uma tentativa por sessao. */
function garantirPyflakes(bin: string): Promise<boolean> {
  if (!pyflakesInstalado) {
    pyflakesInstalado = (async () => {
      const chk = await rodar(bin, ['-c', 'import pyflakes'], 10_000)
      if (chk.code === 0) return true
      dglog('[lsp-python] instalando pyflakes no python gerenciado…')
      const inst = await rodar(bin, ['-m', 'pip', 'install', '-q', 'pyflakes'], 120_000)
      if (inst.code !== 0) {
        dglog('[lsp-python] pip install pyflakes falhou: ' + inst.saida.slice(0, 200))
        return false
      }
      const recheck = await rodar(bin, ['-c', 'import pyflakes'], 10_000)
      return recheck.code === 0
    })().catch(() => false)
  }
  return pyflakesInstalado
}

async function pyflakesDisponivel(bin: string): Promise<boolean> {
  return garantirPyflakes(bin)
}

/** pyflakes em lote: `python -m pyflakes arq1 arq2 …` → saida unica. */
async function rodarPyflakes(bin: string, abs: string[]): Promise<string | null> {
  const r = await rodar(bin, ['-m', 'pyflakes', ...abs])
  return r.saida || null
}

async function rodarPycompile(bin: string, abs: string): Promise<string | null> {
  const r = await rodar(bin, ['-m', 'py_compile', abs])
  return r.saida || null
}

/**
 * Retorna bloco de diagnosticos ou null. So roda quando ha .py alterado
 * no working tree — custo baixo, sem servidor persistente.
 */
export async function pyResumoDiagnosticos(raiz: string): Promise<string | null> {
  try {
    const { gitStatus } = await import('../git')
    const st = await gitStatus(raiz)
    if (!st.ok || !st.itens?.length) return null
    const pyFiles = st.itens
      .map((i) => String(i.path || ''))
      .filter((p) => p.endsWith('.py') && !p.includes('node_modules') && !p.includes('.dg-editor'))
      .slice(0, MAX_ARQUIVOS)
    if (!pyFiles.length) return null

    const { pythonBin } = await import('../midia/core')
    const py = pythonBin()
    if (!existsSync(py)) return null

    const absFiles = pyFiles
      .map((rel) => join(raiz, rel))
      .filter((abs) => existsSync(abs))
    if (!absFiles.length) return null

    const erros: string[] = []
    const usarPyflakes = await pyflakesDisponivel(py)

    if (usarPyflakes) {
      // pyflakes aceita multiplos arquivos; saida vem "arq:linha: msg".
      const saida = await rodarPyflakes(py, absFiles)
      if (saida) {
        // agrupa por arquivo: pyflakes imprime o caminho absoluto recebido
        const norm = (s: string) => s.replace(/\//g, '\\').toLowerCase()
        const absNorm = absFiles.map((a) => norm(a))
        const porArq = new Map<string, string[]>()
        for (const linha of saida.split(/\r?\n/)) {
          const m = linha.match(/:(\d+):\d*:\s*(.+)$/)
          if (!m) continue
          const idx = absNorm.findIndex((a) => norm(linha).startsWith(a))
          if (idx < 0) continue
          const arr = porArq.get(pyFiles[idx]) || []
          arr.push('  linha ' + m[1] + ': ' + m[2])
          porArq.set(pyFiles[idx], arr)
        }
        for (const [arq, ls] of porArq) {
          erros.push('### ' + arq + ' (pyflakes)\n```\n' + ls.slice(0, 20).join('\n') + '\n```')
        }
      }
    }

    // py_compile sempre: cobre erro de sintaxe que pyflakes nao pega
    // (pyflakes nem importa o modulo — SyntaxError passa batido).
    for (let i = 0; i < absFiles.length; i++) {
      const abs = absFiles[i]
      const saida = await rodarPycompile(py, abs)
      if (saida && /SyntaxError|IndentationError|TabError/.test(saida)) {
        erros.push('### ' + pyFiles[i] + ' (py_compile)\n```\n' + saida.slice(0, 1200) + '\n```')
      }
    }

    if (!erros.length) return null
    const titulo = usarPyflakes
      ? '### Diagnosticos Python (pyflakes + py_compile)'
      : '### Diagnosticos Python (py_compile — instale pyflakes para mais cobertura)'
    return titulo + '\n' + erros.join('\n\n')
  } catch (e) {
    dglog('[lsp-python] ' + String(e))
    return null
  }
}
