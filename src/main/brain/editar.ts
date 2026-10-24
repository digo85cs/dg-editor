/**
 * Edicao segura por ancora unica + typecheck opcional com rollback.
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export interface ResultadoEdicao {
  ok: boolean
  mensagem: string
  ocorrencias?: number
  typecheck?: { ok: boolean; saida: string }
}

function contarOcorrencias(texto: string, ancora: string): number {
  if (!ancora) return 0
  let n = 0
  let i = 0
  while (true) {
    const p = texto.indexOf(ancora, i)
    if (p < 0) break
    n++
    i = p + ancora.length
  }
  return n
}

export function editarPorAncora(
  raiz: string,
  arquivo: string,
  ancora: string,
  novo: string,
  verificar = true
): ResultadoEdicao {
  const abs = path.isAbsolute(arquivo) ? arquivo : path.join(raiz, arquivo)
  const rel = path.relative(raiz, abs).replace(/\\/g, '/')
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, mensagem: 'arquivo fora da raiz do projeto' }
  }
  if (!fs.existsSync(abs)) {
    return { ok: false, mensagem: 'arquivo nao encontrado: ' + rel }
  }

  const original = fs.readFileSync(abs, 'utf8')
  const n = contarOcorrencias(original, ancora)
  if (n === 0) return { ok: false, mensagem: 'ancora nao encontrada', ocorrencias: 0 }
  if (n > 1) return { ok: false, mensagem: 'ancora ambigua (' + n + ' ocorrencias)', ocorrencias: n }

  const editado = original.replace(ancora, novo)
  fs.writeFileSync(abs, editado, 'utf8')

  if (!verificar) {
    return { ok: true, mensagem: 'editado ' + rel + ' (sem typecheck)', ocorrencias: 1 }
  }

  try {
    execFileSync('npx', ['tsc', '--noEmit'], {
      cwd: raiz,
      encoding: 'utf8',
      timeout: 120000,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return {
      ok: true,
      mensagem: 'editado ' + rel + ' + typecheck ok',
      ocorrencias: 1,
      typecheck: { ok: true, saida: '' }
    }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    const saida = String(err.stdout || '') + String(err.stderr || err.message || e)
    fs.writeFileSync(abs, original, 'utf8')
    return {
      ok: false,
      mensagem: 'typecheck falhou; arquivo revertido',
      ocorrencias: 1,
      typecheck: { ok: false, saida: saida.slice(0, 4000) }
    }
  }
}
