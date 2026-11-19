/**
 * Diagnosticos Python leves: compila arquivos .py alterados no git
 * (py_compile) e resume erros de sintaxe para o contexto do agente.
 * Sem LSP completo — cobre o caso mais comum (erro de sintaxe) sem deps.
 */
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'

const MAX_ARQUIVOS = 8
const TIMEOUT_MS = 15_000

function rodarPycompile(bin: string, abs: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-m', 'py_compile', abs],
      { timeout: TIMEOUT_MS, windowsHide: true },
      (erro) => {
        if (!erro) return resolve(null)
        const stderr = String((erro as { stderr?: string }).stderr || erro.message || '')
        resolve(stderr.trim() || null)
      }
    )
  })
}

/**
 * Retorna bloco de diagnosticos ou null. So roda quando ha .py alterado
 * no working tree — custo ~15ms por arquivo, sem servidor persistente.
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

    const erros: string[] = []
    for (const rel of pyFiles) {
      const abs = join(raiz, rel)
      if (!existsSync(abs)) continue
      const saida = await rodarPycompile(py, abs)
      if (saida) erros.push('### ' + rel + '\n```\n' + saida.slice(0, 1200) + '\n```')
    }
    if (!erros.length) return null
    return '### Diagnosticos Python (py_compile)\n' + erros.join('\n\n')
  } catch (e) {
    dglog('[lsp-python] ' + String(e))
    return null
  }
}
