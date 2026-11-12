/**
 * Catalogo gratuito de contextos por linguagem/ferramenta.
 * Injeta so o que for relevante aos arquivos/pedido — sem instalar runtimes.
 */
import { basename, extname } from 'path'
import { execFileSync } from 'child_process'

export type CtxLang = {
  id: string
  nome: string
  exts: string[]
  keywords: string[]
  dicas: string
}

/** Melhores contextos free e curtos para o Agent. */
export const CATALOGO_LINGUAGENS: CtxLang[] = [
  { id: 'typescript', nome: 'TypeScript/JavaScript', exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], keywords: ['typescript', 'javascript', 'node', 'npm', 'react'], dicas: 'Prefira TypeScript estrito, ESM quando o projeto usar, async/await, sem any desnecessario. Testes com vitest/jest se existirem.' },
  { id: 'python', nome: 'Python', exts: ['.py', '.pyw', '.ipynb'], keywords: ['python', 'pip', 'django', 'flask', 'fastapi'], dicas: 'Python 3, type hints, venv/poetry se houver. Evite globais; use pathlib.' },
  { id: 'php', nome: 'PHP', exts: ['.php', '.phtml'], keywords: ['php', 'laravel', 'composer'], dicas: 'PHP 8+, tipagem, PSR-12. Preferir prepared statements; sem misturar HTML solto se o projeto tiver template.' },
  { id: 'go', nome: 'Go', exts: ['.go'], keywords: ['golang', 'go mod'], dicas: 'go fmt, erros explicitos, context.Context em IO. Modulos go.mod.' },
  { id: 'rust', nome: 'Rust', exts: ['.rs'], keywords: ['rust', 'cargo'], dicas: 'cargo check/test, Result/Option, sem unwrap em producao.' },
  { id: 'java', nome: 'Java/Kotlin', exts: ['.java', '.kt', '.kts'], keywords: ['java', 'kotlin', 'maven', 'gradle'], dicas: 'Pacotes claros, null-safety (Kotlin), build Maven/Gradle do projeto.' },
  { id: 'csharp', nome: 'C#/.NET', exts: ['.cs', '.csproj', '.fs'], keywords: ['csharp', 'dotnet', 'aspnet'], dicas: 'SDK-style csproj, async, nullable reference types se habilitado.' },
  { id: 'cpp', nome: 'C/C++', exts: ['.c', '.h', '.cpp', '.hpp', '.cc'], keywords: ['c++', 'cmake'], dicas: 'CMake/MSVC/clang conforme o projeto; RAII; cuidado com UB.' },
  { id: 'ruby', nome: 'Ruby', exts: ['.rb', '.erb'], keywords: ['ruby', 'rails', 'bundler'], dicas: 'Bundler, estilo Rubocop se houver, Rails conventions se aplicavel.' },
  { id: 'swift', nome: 'Swift', exts: ['.swift'], keywords: ['swift', 'swiftui', 'xcode'], dicas: 'Swift concurrency, Struct vs Class conforme padrao do app.' },
  { id: 'dart', nome: 'Dart/Flutter', exts: ['.dart'], keywords: ['dart', 'flutter'], dicas: 'flutter analyze/test; widgets imutaveis; const constructors.' },
  { id: 'sql', nome: 'SQL', exts: ['.sql'], keywords: ['sql', 'postgres', 'mysql', 'sqlite'], dicas: 'Dialeto do projeto; migrations; evitar SELECT *; parametros bind.' },
  { id: 'shell', nome: 'Shell/PowerShell', exts: ['.sh', '.bash', '.ps1', '.cmd', '.bat'], keywords: ['powershell', 'bash', 'shell'], dicas: 'No Windows preferir PowerShell seguro; set -euo pipefail em bash; sem rm -rf cego.' },
  { id: 'htmlcss', nome: 'HTML/CSS', exts: ['.html', '.htm', '.css', '.scss', '.sass'], keywords: ['html', 'css', 'tailwind'], dicas: 'Semantico, acessivel, mobile-first; respeitar design system do projeto.' },
  { id: 'vue', nome: 'Vue/Svelte', exts: ['.vue', '.svelte'], keywords: ['vue', 'svelte', 'nuxt'], dicas: 'Composition API / runes conforme versao; SFC limpo.' },
  { id: 'lua', nome: 'Lua', exts: ['.lua'], keywords: ['lua', 'neovim'], dicas: 'Lua 5.x/JIT conforme runtime; local por padrao.' },
  { id: 'r', nome: 'R', exts: ['.r', '.R', '.rmd'], keywords: ['rstudio', 'tidyverse'], dicas: 'tidyverse se o projeto usar; reproducibilidade com renv.' },
  { id: 'elixir', nome: 'Elixir/Erlang', exts: ['.ex', '.exs', '.erl'], keywords: ['elixir', 'phoenix', 'otp'], dicas: 'OTP, mix test, imutabilidade.' },
  { id: 'scala', nome: 'Scala', exts: ['.scala', '.sc'], keywords: ['scala', 'sbt'], dicas: 'sbt, FP pragmatico, evitar side-effects ocultos.' },
  { id: 'markdown', nome: 'Markdown/Docs', exts: ['.md', '.mdx', '.rst'], keywords: ['markdown', 'docs'], dicas: 'Titulos claros, exemplos executaveis, pt-BR se o projeto for BR.' },
  { id: 'jsonyaml', nome: 'JSON/YAML/TOML', exts: ['.json', '.yaml', '.yml', '.toml'], keywords: ['yaml', 'toml', 'config'], dicas: 'Validar schema se houver; nao quebrar chaves existentes.' },
  { id: 'docker', nome: 'Docker/DevOps', exts: ['.dockerfile', '.containerfile'], keywords: ['docker', 'kubernetes', 'compose'], dicas: 'Imagens oficiais slim; multi-stage; secrets fora da imagem.' },
  { id: 'git', nome: 'Git', exts: [], keywords: ['git', 'commit', 'branch', 'pr', 'merge'], dicas: 'Commits focados; nao force push em main; mensagens em pt-BR se o repo usar.' },
]

const FERRAMENTAS_PROBE: Array<{ id: string; cmd: string; args: string[] }> = [
  { id: 'node', cmd: 'node', args: ['-v'] },
  { id: 'npm', cmd: 'npm', args: ['-v'] },
  { id: 'python', cmd: 'python', args: ['--version'] },
  { id: 'php', cmd: 'php', args: ['-v'] },
  { id: 'go', cmd: 'go', args: ['version'] },
  { id: 'rustc', cmd: 'rustc', args: ['--version'] },
  { id: 'dotnet', cmd: 'dotnet', args: ['--version'] },
  { id: 'git', cmd: 'git', args: ['--version'] },
  { id: 'docker', cmd: 'docker', args: ['--version'] },
  { id: 'java', cmd: 'java', args: ['-version'] },
]

let cacheFerramentas: { em: number; lista: string[] } | null = null

export function detectarFerramentasInstaladas(): string[] {
  const agora = Date.now()
  if (cacheFerramentas && agora - cacheFerramentas.em < 60_000) return cacheFerramentas.lista
  const achados: string[] = []
  for (const f of FERRAMENTAS_PROBE) {
    try {
      execFileSync(f.cmd, f.args, { stdio: 'ignore', timeout: 1500, windowsHide: true })
      achados.push(f.id)
    } catch { /* ausente */ }
  }
  cacheFerramentas = { em: agora, lista: achados }
  return achados
}

export function selecionarLinguagens(arquivos: string[], texto: string): CtxLang[] {
  const pedido = (texto || '').toLowerCase()
  const exts = new Set(
    (arquivos || []).map((a) => {
      const base = basename(a).toLowerCase()
      if (base === 'dockerfile' || base.startsWith('dockerfile.')) return '.dockerfile'
      return extname(a).toLowerCase()
    }).filter(Boolean)
  )
  const out: CtxLang[] = []
  for (const lang of CATALOGO_LINGUAGENS) {
    const porExt = lang.exts.some((e) => exts.has(e))
    const porKw = lang.keywords.some((k) => pedido.includes(k))
    if (porExt || porKw) out.push(lang)
  }
  return out.slice(0, 6)
}

/** Bloco curto para injetar no prompt do Agent/chat. */
export function contextoLinguagensFree(arquivos: string[], texto: string, maxChars = 1200): string {
  const langs = selecionarLinguagens(arquivos, texto)
  const tools = detectarFerramentasInstaladas()
  let out = ''
  if (tools.length) {
    out += '\nFERRAMENTAS LOCAIS DETECTADAS (gratis/no PATH): ' + tools.join(', ') + '\n'
  }
  if (!langs.length) {
    if (!out) return ''
    return out.slice(0, maxChars)
  }
  out += '\nCONTEXTOS DE LINGUAGEM (free, so o relevante):\n'
  for (const l of langs) {
    out += '- ' + l.nome + ': ' + l.dicas + '\n'
  }
  return out.slice(0, maxChars)
}