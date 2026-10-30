/**
 * Monta bloco @projeto: estrutura rasa + índice + vault (se aberto) + busca semântica leve.
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join, relative, basename } from 'path'
import { getRaizVault, listarResumos } from '../vault/indice'
import { buscaArquivos } from '../busca'

const IGNORE = /(^|[\\/])(node_modules|\.git|out|dist|\.dg-editor\\bin)([\\/]|$)/

function listarRaso(raiz: string, max = 60): string[] {
  const out: string[] = []
  try {
    for (const name of readdirSync(raiz)) {
      if (name === 'node_modules' || name === '.git' || name === 'out') continue
      const full = join(raiz, name)
      if (IGNORE.test(full)) continue
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      out.push((st.isDirectory() ? 'd ' : 'f ') + name)
      if (out.length >= max) break
    }
  } catch {
    /* */
  }
  return out
}

function amostraCodigo(raiz: string, limite = 8): string[] {
  const hits = buscaArquivos(raiz, '', 40)
  const arquivos = (hits.itens || [])
    .map((h) => h.caminho)
    .filter((p) => /\.(ts|js|tsx|jsx|py|md)$/i.test(p))
    .slice(0, limite)
  const blocos: string[] = []
  for (const p of arquivos) {
    try {
      if (!existsSync(p)) continue
      const rel = relative(raiz, p).replace(/\\/g, '/')
      const txt = readFileSync(p, 'utf8').slice(0, 1200)
      blocos.push('### ' + rel + '\n```\n' + txt + '\n```')
    } catch {
      /* */
    }
  }
  return blocos
}

export async function montarContextoProjeto(raiz: string, consulta?: string): Promise<string> {
  const partes: string[] = ['### @projeto']
  partes.push('Raiz: ' + raiz)
  partes.push('Estrutura (rasa):\n' + listarRaso(raiz).join('\n'))

  if (consulta && consulta.trim()) {
    const hits = buscaArquivos(raiz, consulta.trim(), 15)
    if (hits.itens?.length) {
      partes.push(
        'Arquivos relevantes à consulta:\n' +
          hits.itens.map((h) => '- ' + h.rel).join('\n')
      )
    }
    try {
      const { buscarSemelhantes } = await import('../memory/embeddings')
      const sem = await buscarSemelhantes(raiz, consulta.trim(), 5, 0.35)
      if (sem.length) {
        partes.push(
          'Memória semântica (embeddings):\n' +
            sem.map((e) => '- [' + e.role + '] ' + e.texto.slice(0, 280)).join('\n')
        )
      }
    } catch {
      /* embeddings opcionais se Ollama/nomic ausente */
    }
  }

  const vault = getRaizVault()
  if (vault) {
    const notas = listarResumos().slice(0, 40)
    partes.push(
      'Vault Markdown (' +
        vault +
        '): ' +
        notas.length +
        ' notas\n' +
        notas.map((n) => '- [[' + basename(n.rel, '.md') + ']] ' + n.titulo + (n.tags.length ? ' #' + n.tags.join(' #') : '')).join('\n')
    )
  }

  const amostra = amostraCodigo(raiz, 6)
  if (amostra.length) partes.push('Amostra de código:\n' + amostra.join('\n\n'))

  let out = partes.join('\n\n')
  const max = 80_000
  if (out.length > max) out = out.slice(0, max) + '\n\n[@projeto truncado]'
  return out
}

/** Extrai menção @projeto e devolve consulta residual. */
export function detectarMençãoProjeto(pergunta: string): { tem: boolean; consulta: string } {
  const t = String(pergunta || '')
  const tem = /@projeto\b/i.test(t)
  const consulta = t.replace(/@projeto\b/gi, ' ').trim()
  return { tem, consulta: consulta || t }
}
