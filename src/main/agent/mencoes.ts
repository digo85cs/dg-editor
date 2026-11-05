/**
 * Resolve @projeto @arquivo:path @nota:Nome @selecao no pedido do usuário.
 */
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { caminhoSeguro } from '../ipc-seguro'
import { montarContextoProjeto } from './contexto-projeto'
import { resolverWikiLink, getRaizVault } from '../vault/indice'

export type MencoesOpts = {
  raiz: string
  pergunta: string
  selecao?: string
  arquivoAtivo?: string
  pastas?: string[]
}

export async function expandirMencoes(opts: MencoesOpts): Promise<{
  perguntaLimpa: string
  contextoExtra: string
  mencoes: string[]
}> {
  let texto = String(opts.pergunta || '')
  const blocos: string[] = []
  const mencoes: string[] = []

  if (/@projeto\b/i.test(texto)) {
    mencoes.push('@projeto')
    const consulta = texto.replace(/@projeto\b/gi, ' ').trim()
    blocos.push(await montarContextoProjeto(opts.raiz, consulta))
    texto = texto.replace(/@projeto\b/gi, '').trim()
  }

  if (/@sele[cç][aã]o\b/i.test(texto) || /@selecao\b/i.test(texto)) {
    mencoes.push('@selecao')
    const sel = opts.selecao || ''
    blocos.push(
      '### @selecao\n' +
        (sel
          ? 'Arquivo: ' + (opts.arquivoAtivo || '(desconhecido)') + '\n```\n' + sel.slice(0, 8000) + '\n```'
          : '(nenhuma selecao no editor)')
    )
    texto = texto.replace(/@sele[cç][aã]o\b/gi, '').replace(/@selecao\b/gi, '').trim()
  }

  const reArq = /@arquivo:([^\s]+)/gi
  let m: RegExpExecArray | null
  const usados = new Set<string>()
  while ((m = reArq.exec(String(opts.pergunta || '')))) {
    const raw = m[1].replace(/^[`"']|[`"']$/g, '')
    if (usados.has(raw)) continue
    usados.add(raw)
    mencoes.push('@arquivo:' + raw)
    const abs = resolve(
      raw.startsWith('/') || /^[A-Za-z]:/.test(raw) ? raw : join(opts.raiz, raw)
    )
    const segura = opts.pastas ? caminhoSeguro(abs, opts.pastas) : null
    if (segura && !segura.ok) {
      blocos.push('### @arquivo:' + raw + '\n(caminho fora das pastas abertas)')
      continue
    }
    try {
      const caminho = segura?.ok ? segura.abs : abs
      if (existsSync(caminho)) {
        const body = readFileSync(caminho, 'utf8').slice(0, 12000)
        blocos.push('### @arquivo:' + raw + '\n```\n' + body + '\n```')
      } else {
        blocos.push('### @arquivo:' + raw + '\n(arquivo nao encontrado)')
      }
    } catch {
      blocos.push('### @arquivo:' + raw + '\n(erro ao ler)')
    }
  }
  texto = texto.replace(/@arquivo:[^\s]+/gi, '').trim()

  const reNota = /@nota:([^\s]+)/gi
  while ((m = reNota.exec(String(opts.pergunta || '')))) {
    const nome = m[1].replace(/^[`"']|[`"']$/g, '')
    mencoes.push('@nota:' + nome)
    if (!getRaizVault()) {
      blocos.push('### @nota:' + nome + '\n(vault fechado)')
      continue
    }
    const path = resolverWikiLink(nome, opts.arquivoAtivo)
    if (!path || !existsSync(path)) {
      blocos.push('### @nota:' + nome + '\n(nota nao encontrada)')
      continue
    }
    try {
      const body = readFileSync(path, 'utf8').slice(0, 12000)
      blocos.push('### @nota:' + nome + '\n```markdown\n' + body + '\n```')
    } catch {
      blocos.push('### @nota:' + nome + '\n(erro ao ler)')
    }
  }
  texto = texto.replace(/@nota:[^\s]+/gi, '').trim()

  return {
    perguntaLimpa: texto || String(opts.pergunta || ''),
    contextoExtra: blocos.join('\n\n'),
    mencoes
  }
}
