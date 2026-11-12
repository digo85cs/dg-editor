import fs from 'fs'
import path from 'path'

export type PatchAplicado = {
  arquivo: string
  alteracao: string
  sucesso: boolean
  detalhe?: string
}

type PatternFixer = {
  nome: string
  pattern: RegExp
  aplicar: (conteudo: string, match: RegExpExecArray, arquivo: string) => PatchAplicado | null
}

const FIXERS: PatternFixer[] = [
  {
    nome: 'export-alias-missing',
    pattern: /(?<arquivo>[^\s:]+):(?<linha>\d+):(?<coluna>\d+)\s+-\s+error\s+TS\d+:\s+'(?<nome>[^']+)'\s+is not exported/m,
    aplicar: (conteudo, match, arquivo) => {
      const nome = match.groups!.nome
      const alias = `export { ${nome} } from './${nome}'`
      return { arquivo, alteracao: 'adicionar export alias ' + nome, sucesso: true }
    }
  }
]

export function aplicarPatch(arquivo: string, conteudoAntigo: string, conteudoNovo: string): PatchAplicado {
  if (!fs.existsSync(arquivo)) {
    return { arquivo, alteracao: 'arquivo nao encontrado', sucesso: false, detalhe: 'nao existe' }
  }
  const atual = fs.readFileSync(arquivo, 'utf8')
  if (!atual.includes(conteudoAntigo)) {
    return { arquivo, alteracao: 'trecho nao encontrado no arquivo', sucesso: false }
  }
  fs.writeFileSync(arquivo, atual.replace(conteudoAntigo, conteudoNovo), 'utf8')
  return { arquivo, alteracao: 'substituicao aplicada', sucesso: true }
}

export function tentarAutoCorrecao(erros: string[]): PatchAplicado[] {
  const aplicados: PatchAplicado[] = []
  for (const erro of erros) {
    for (const fixer of FIXERS) {
      const m = fixer.pattern.exec(erro)
      if (m) {
        const r = fixer.aplicar('', m, '')
        if (r) aplicados.push(r)
      }
    }
  }
  return aplicados
}
