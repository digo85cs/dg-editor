/**
 * Contexto automático (sem @): abas abertas, git status/diff, diagnósticos.
 */
import { existsSync, readFileSync } from 'fs'
import { relative } from 'path'
import { gitStatus, gitDiff } from '../git'
import { blocoDiagnosticosParaPrompt } from './diagnosticos'

export type AbaCtx = {
  path: string
  conteudo?: string
  ativa?: boolean
}

export type ContextoImplicitoOpts = {
  raiz: string
  abas?: AbaCtx[]
  incluirGit?: boolean
  incluirDiagnosticos?: boolean
  maxBytes?: number
}

export async function montarContextoImplicito(opts: ContextoImplicitoOpts): Promise<string> {
  const partes: string[] = []
  const max = opts.maxBytes ?? 40_000

  if (opts.abas?.length) {
    const linhas: string[] = ['### Abas abertas']
    for (const a of opts.abas.slice(0, 12)) {
      const rel = relative(opts.raiz, a.path).replace(/\\/g, '/') || a.path
      linhas.push((a.ativa ? '* ' : '- ') + rel)
      if (a.ativa && a.conteudo) {
        linhas.push('```\n' + a.conteudo.slice(0, 6000) + '\n```')
      } else if (!a.ativa && a.conteudo) {
        linhas.push('```\n' + a.conteudo.slice(0, 1500) + '\n```')
      } else if (existsSync(a.path)) {
        try {
          const body = readFileSync(a.path, 'utf8').slice(0, a.ativa ? 4000 : 800)
          linhas.push('```\n' + body + '\n```')
        } catch {
          /* */
        }
      }
    }
    partes.push(linhas.join('\n'))
  }

  if (opts.incluirGit !== false) {
    try {
      const st = await gitStatus(opts.raiz)
      if (st.ok && st.itens?.length) {
        const linhas = ['### Git status', ...st.itens.slice(0, 40).map((i) => i.status + ' ' + i.path)]
        // diff do primeiro modificado
        const mod = st.itens.find((i) => i.status === 'M' || i.status === 'A')
        if (mod) {
          const d = await gitDiff(opts.raiz, mod.path)
          if (d.ok && d.diff) {
            linhas.push('### Git diff (' + mod.path + ')', '```diff\n' + d.diff.slice(0, 8000) + '\n```')
          }
        }
        partes.push(linhas.join('\n'))
      }
    } catch {
      /* */
    }
  }

  if (opts.incluirDiagnosticos !== false) {
    const diag = blocoDiagnosticosParaPrompt(3)
    if (diag) partes.push(diag)
  }

  let out = partes.join('\n\n')
  if (out.length > max) out = out.slice(0, max) + '\n\n[contexto implícito truncado]'
  return out
}
