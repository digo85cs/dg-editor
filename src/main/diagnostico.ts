import { existsSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { appDataDir, dossieDir } from './paths'
import { guardianSnapshot } from './guardian'
import { rulesExist } from './dgrules'
import { loadCache } from './cache'
import { ollamaAlive } from './ollama-keeper'
import { getBrain } from './brain/module'
import type { DiagnosticoModulo, DiagnosticoResultado } from '@shared/types'

type Item = { id: string; nome: string; fn: () => Promise<string> }

async function medir(id: string, nome: string, fn: () => Promise<string>): Promise<DiagnosticoModulo> {
  const t0 = Date.now()
  try {
    const detalhe = await fn()
    return { id, nome, ok: true, detalhe, ms: Date.now() - t0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { id, nome, ok: false, detalhe: msg, ms: Date.now() - t0 }
  }
}

export async function diagnosticoCompleto(root: string | null): Promise<DiagnosticoResultado> {
  const itens: Item[] = [
    {
      id: 'ollama', nome: 'Ollama (servico)',
      fn: async () => {
        const vivo = await ollamaAlive()
        if (!vivo) throw new Error('servico nao responde em /api/tags')
        return 'servico no ar'
      }
    },
    {
      id: 'brain', nome: 'Brain / modelos',
      fn: async () => {
        const st = await getBrain().getOllamaStatus()
        if (!st.reachable) throw new Error('provider indisponivel')
    const nomes = st.models.slice(0, 4).map((m: any) => (typeof m === 'string' ? m : m.name || '?')).join(', ')
        return st.models.length + ' modelo(s): ' + nomes
      }
    },
    {
      id: 'appdata', nome: 'Caminhos APPDATA',
      fn: async () => {
        const dir = appDataDir()
        if (!existsSync(dir)) throw new Error('diretorio nao existe')
        const probe = join(dir, '.diag-probe-' + Date.now())
        writeFileSync(probe, 'ok', 'utf8')
        const lido = readFileSync(probe, 'utf8')
        unlinkSync(probe)
        if (lido !== 'ok') throw new Error('escrita/leitura divergente')
        return 'escrita+leitura OK'
      }
    },
    {
      id: 'dossie', nome: 'Dossie',
      fn: async () => {
        const p = join(dossieDir(), 'dossie.txt')
        if (!existsSync(p)) return 'sem dossie ainda (nasce na 1a sessao)'
        const st = statSync(p)
        const min = Math.round((Date.now() - st.mtimeMs) / 60000)
        return st.size + ' bytes, escrita ha ' + min + ' min'
      }
    },
    {
      id: 'continuidade', nome: 'Continuidade',
      fn: async () => {
        const p = join(dossieDir(), 'continuidade.md')
        if (!existsSync(p)) return 'sem continuidade ainda (nasce na 1a sessao)'
        const st = statSync(p)
        const min = Math.round((Date.now() - st.mtimeMs) / 60000)
        return st.size + ' bytes, gerada ha ' + min + ' min'
      }
    },
    {
      id: 'regras', nome: 'Regras .dgrules',
      fn: async () => {
        if (!root) return 'n/a (sem projeto aberto)'
        if (!rulesExist(root)) return 'n/a (.dgrules ainda nao criado)'
        const st = statSync(join(root, '.dgrules'))
        return '.dgrules presente (' + st.size + ' bytes)'
      }
    },
    {
      id: 'cache', nome: 'Cache de analise',
      fn: async () => {
        if (!root) return 'n/a (sem projeto aberto)'
        const c = loadCache(root)
        if (!c) return 'sem cache (primeira analise)'
        return 'cache valido'
      }
    },
    {
      id: 'guardian', nome: 'Guardiao de recursos',
      fn: async () => {
        const s = guardianSnapshot()
        const mb = Math.round(s.freeMemory / 1048576)
        if (!s.ramOk) throw new Error('RAM ' + mb + ' MB abaixo do minimo')
        return 'RAM ' + mb + ' MB (' + s.freePct + '%), CPU ' + s.cpuPercent + '%'
      }
    },
    {
      id: 'tools-falhas',
      nome: 'Falhas recentes de tools',
      fn: async () => {
        const { listarFalhasTool } = await import('./tools-telemetry')
        const lista = listarFalhasTool(8)
        if (!lista.length) return 'nenhuma falha registrada'
        return (
          lista.length +
          ' recente(s): ' +
          lista
            .slice(0, 3)
            .map((f) => f.nome + ' — ' + f.resumo.slice(0, 60))
            .join(' | ')
        )
      }
    }
  ]

  const modulos: DiagnosticoModulo[] = []
  for (const it of itens) {
    modulos.push(await medir(it.id, it.nome, it.fn))
  }
  const ok = modulos.filter((m) => m.ok).length
  return { modulos, ok, total: modulos.length, at: Date.now() }
}
