/**
 * Indice de simbolos do DG Editor.
 * Parsing via TypeScript Compiler API — consciencia de codigo local.
 */
import ts from 'typescript'
import fs from 'fs'
import path from 'path'

export type TipoSimbolo = 'funcao' | 'classe' | 'interface' | 'type' | 'const'

export interface Simbolo {
  nome: string
  tipo: TipoSimbolo
  arquivo: string
  linha: number
  coluna: number
  assinatura: string
  linhaInicio: number
  linhaFim: number
  exportado: boolean
}

export interface Referencia {
  de: string
  para: string
  arquivo: string
  linha: number
  tipo: 'import' | 'chamada'
}

export interface IndiceCodigo {
  versao: number
  geradoEm: string
  raiz: string
  simbolos: Simbolo[]
  referencias: Referencia[]
}

const SINONIMOS: Record<string, string[]> = {
  escolher: ['buscar', 'selecionar', 'pick', 'choose', 'select'],
  ler: ['abrir', 'get', 'read', 'load', 'carregar'],
  escrever: ['gravar', 'salvar', 'write', 'save', 'set'],
  criar: ['gerar', 'make', 'create', 'new'],
  apagar: ['remover', 'delete', 'remove', 'excluir']
}

const IGNORAR_DIRS = new Set([
  'node_modules', 'out', 'dist', '.git', '.dg-editor', 'coverage', 'bin'
])

function listarTs(raiz: string): string[] {
  const saida: string[] = []
  function walk(dir: string) {
    let ents: fs.Dirent[]
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (IGNORAR_DIRS.has(e.name)) continue
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) walk(abs)
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) saida.push(abs)
    }
  }
  walk(path.join(raiz, 'src'))
  return saida
}

function posLinha(sf: ts.SourceFile, pos: number): { linha: number; coluna: number } {
  const p = sf.getLineAndCharacterOfPosition(pos)
  return { linha: p.line + 1, coluna: p.character + 1 }
}

function temExport(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

function assinaturaFuncao(node: ts.FunctionLikeDeclaration, sf: ts.SourceFile, nome: string): string {
  const params = node.parameters.map((p) => p.getText(sf)).join(', ')
  const ret = node.type ? ': ' + node.type.getText(sf) : ''
  const asyncKw = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''
  return `${asyncKw}${nome}(${params})${ret}`
}

function extrairSimbolos(sf: ts.SourceFile, rel: string): Simbolo[] {
  const simbolos: Simbolo[] = []

  function add(
    nome: string,
    tipo: TipoSimbolo,
    node: ts.Node,
    assinatura: string,
    exportado: boolean
  ) {
    const start = posLinha(sf, node.getStart(sf))
    const end = posLinha(sf, node.getEnd())
    simbolos.push({
      nome,
      tipo,
      arquivo: rel,
      linha: start.linha,
      coluna: start.coluna,
      assinatura,
      linhaInicio: start.linha,
      linhaFim: end.linha,
      exportado
    })
  }

  function visitar(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const nome = node.name.text
      add(nome, 'funcao', node, assinaturaFuncao(node, sf, nome), temExport(node))
    } else if (ts.isClassDeclaration(node) && node.name) {
      const nome = node.name.text
      add(nome, 'classe', node, `class ${nome}`, temExport(node))
      for (const m of node.members) {
        if ((ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) && (m.name || ts.isConstructorDeclaration(m))) {
          const mNome = ts.isConstructorDeclaration(m) ? 'constructor' : (m.name as ts.Identifier).text
          add(`${nome}.${mNome}`, 'funcao', m, assinaturaFuncao(m as ts.FunctionLikeDeclaration, sf, mNome), temExport(node))
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      const nome = node.name.text
      add(nome, 'interface', node, `interface ${nome}`, temExport(node))
    } else if (ts.isTypeAliasDeclaration(node)) {
      const nome = node.name.text
      const corpo = node.type.getText(sf)
      add(nome, 'type', node, `type ${nome} = ${corpo.slice(0, 120)}`, temExport(node))
    } else if (ts.isVariableStatement(node)) {
      const exportado = temExport(node)
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const nome = decl.name.text
        if (!exportado && !/^[A-Z_][A-Z0-9_]*$/.test(nome)) continue
        const tipoTxt = decl.type ? decl.type.getText(sf) : ''
        const init = decl.initializer
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          add(nome, 'funcao', decl, assinaturaFuncao(init, sf, nome), exportado)
        } else if (exportado) {
          add(nome, 'const', decl, `const ${nome}${tipoTxt ? ': ' + tipoTxt : ''}`, true)
        }
      }
    }
    ts.forEachChild(node, visitar)
  }

  visitar(sf)
  return simbolos
}

function extrairReferencias(sf: ts.SourceFile, rel: string, nomesConhecidos: Set<string>): Referencia[] {
  const refs: Referencia[] = []
  let escopoAtual = '(modulo)'

  function visitar(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const prev = escopoAtual
      escopoAtual = node.name.text
      ts.forEachChild(node, visitar)
      escopoAtual = prev
      return
    }
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const prev = escopoAtual
      escopoAtual = node.name.text
      ts.forEachChild(node, visitar)
      escopoAtual = prev
      return
    }

    if (ts.isImportDeclaration(node) && node.importClause) {
      const named = node.importClause.namedBindings
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const nome = el.name.text
          const { linha } = posLinha(sf, el.getStart(sf))
          refs.push({ de: rel, para: nome, arquivo: rel, linha, tipo: 'import' })
        }
      }
      if (node.importClause.name) {
        const nome = node.importClause.name.text
        const { linha } = posLinha(sf, node.importClause.name.getStart(sf))
        refs.push({ de: rel, para: nome, arquivo: rel, linha, tipo: 'import' })
      }
    }

    if (ts.isCallExpression(node)) {
      let nomeChamado = ''
      if (ts.isIdentifier(node.expression)) nomeChamado = node.expression.text
      else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
        nomeChamado = node.expression.name.text
      }
      if (nomeChamado && nomesConhecidos.has(nomeChamado)) {
        const { linha } = posLinha(sf, node.getStart(sf))
        refs.push({ de: escopoAtual, para: nomeChamado, arquivo: rel, linha, tipo: 'chamada' })
      }
    }

    ts.forEachChild(node, visitar)
  }

  visitar(sf)
  return refs
}

export function caminhoIndice(raiz: string): string {
  return path.join(raiz, '.dg-editor', 'indice-codigo.json')
}

export function gerarIndice(raiz: string): IndiceCodigo {
  const arquivos = listarTs(raiz)
  const opcoes: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: false,
    skipLibCheck: true,
    allowJs: false
  }
  const host = ts.createCompilerHost(opcoes)
  const program = ts.createProgram(arquivos, opcoes, host)

  const simbolos: Simbolo[] = []
  for (const abs of arquivos) {
    const sf = program.getSourceFile(abs)
    if (!sf) continue
    const rel = path.relative(raiz, abs).replace(/\\/g, '/')
    simbolos.push(...extrairSimbolos(sf, rel))
  }

  const nomes = new Set(simbolos.map((s) => s.nome.includes('.') ? s.nome.split('.').pop()! : s.nome))
  const referencias: Referencia[] = []
  for (const abs of arquivos) {
    const sf = program.getSourceFile(abs)
    if (!sf) continue
    const rel = path.relative(raiz, abs).replace(/\\/g, '/')
    referencias.push(...extrairReferencias(sf, rel, nomes))
  }

  return {
    versao: 1,
    geradoEm: new Date().toISOString(),
    raiz,
    simbolos,
    referencias
  }
}

export function salvarIndice(raiz: string, idx: IndiceCodigo): string {
  const p = caminhoIndice(raiz)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), 'utf8')
  fs.renameSync(tmp, p)
  return p
}

export function carregarIndiceCodigo(raiz: string): IndiceCodigo | null {
  const p = caminhoIndice(raiz)
  try {
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8')) as IndiceCodigo
  } catch {
    return null
  }
}

function expandirTermo(termo: string): string[] {
  const t = termo.toLowerCase()
  const set = new Set<string>([t])
  for (const [canon, alts] of Object.entries(SINONIMOS)) {
    if (canon === t || alts.includes(t) || t.includes(canon)) {
      set.add(canon)
      for (const a of alts) set.add(a)
    }
    for (const a of alts) {
      if (t.includes(a)) {
        set.add(canon)
        set.add(a)
      }
    }
  }
  return [...set]
}

export function buscarSimbolos(
  raiz: string,
  termo: string,
  tipo?: 'funcao' | 'classe' | 'tipo' | 'todos'
): Array<{ nome: string; tipo: string; arquivo: string; linha: number; assinatura: string }> {
  let idx = carregarIndiceCodigo(raiz)
  if (!idx) {
    idx = gerarIndice(raiz)
    salvarIndice(raiz, idx)
  }
  const variantes = expandirTermo(termo)
  const mapaTipo: Record<string, TipoSimbolo[]> = {
    funcao: ['funcao'],
    classe: ['classe'],
    tipo: ['interface', 'type'],
    todos: ['funcao', 'classe', 'interface', 'type', 'const']
  }
  const tiposOk = new Set(mapaTipo[tipo || 'todos'] || mapaTipo.todos)

  return idx.simbolos
    .filter((s) => tiposOk.has(s.tipo))
    .filter((s) => {
      const n = s.nome.toLowerCase()
      return variantes.some((v) => n.includes(v) || n.includes(termo.toLowerCase()))
    })
    .map((s) => ({
      nome: s.nome,
      tipo: s.tipo,
      arquivo: s.arquivo,
      linha: s.linha,
      assinatura: s.assinatura
    }))
}

export function lerSimbolo(
  raiz: string,
  nome: string
): {
  arquivo: string
  linhaInicio: number
  linhaFim: number
  corpo: string
  chamadoPor: string[]
} | null {
  let idx = carregarIndiceCodigo(raiz)
  if (!idx) {
    idx = gerarIndice(raiz)
    salvarIndice(raiz, idx)
  }
  const hit = idx.simbolos.find((s) => s.nome === nome)
    || idx.simbolos.find((s) => s.nome.endsWith('.' + nome))
    || idx.simbolos.find((s) => s.nome.toLowerCase() === nome.toLowerCase())
  if (!hit) return null

  const abs = path.join(raiz, hit.arquivo)
  const linhas = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
  const corpo = linhas.slice(hit.linhaInicio - 1, hit.linhaFim).join('\n')
  const chamadoPor = idx.referencias
    .filter((r) => r.tipo === 'chamada' && (r.para === nome || r.para === hit.nome || hit.nome.endsWith('.' + r.para)))
    .map((r) => `${r.de} @ ${r.arquivo}:${r.linha}`)

  return {
    arquivo: hit.arquivo,
    linhaInicio: hit.linhaInicio,
    linhaFim: hit.linhaFim,
    corpo,
    chamadoPor: [...new Set(chamadoPor)]
  }
}
