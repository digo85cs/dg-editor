/**
 * Tools embutidas de fallback: usadas pelo agente SOMENTE quando o servidor
 * MCP nao responde (tools.length === 0). Mesmos nomes canonicos das tools
 * MCP para que permissoes (permitirBash/Leitura/Edicao), deny-list e a
 * classificacao de progresso continuem valendo sem codigo extra.
 * Escopo sempre restrito a raiz do workspace.
 */
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const IGNORAR_DIRS = new Set([
  'node_modules', 'out', '.git', 'dist', 'dist-app', '.dg-editor',
  // Perfil Electron/userData — nunca e conteudo de projeto
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'blob_storage', 'Local Storage', 'Session Storage', 'Shared Dictionary',
  'WebStorage', 'IndexedDB', 'leveldb', 'Network', 'Partitions', 'Dictionaries',
  'Crashpad', 'ShaderCache', 'GrShaderCache', 'component_crx_cache',
  'dg-mcp', 'dg-modes', 'dg-perm', 'dg-skills', 'dgnav'
])
const EXT_TEXTO = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt',
  '.css', '.html', '.py', '.php', '.rb', '.go', '.rs', '.java', '.cs',
  '.yml', '.yaml', '.toml', '.xml', '.svg', '.sh', '.ps1', '.bat', '.cmd'
])

export interface ToolInline {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export function ferramentasInlineDefs(): ToolInline[] {
  return [
    {
      name: 'projeto_arvore',
      description: 'Arvore de arquivos do projeto (ignora node_modules, .git, out, dist).',
      inputSchema: {
        type: 'object',
        properties: {
          maxProfundidade: { type: 'number' },
          filtro: { type: 'string' }
        }
      }
    },
    {
      name: 'codigo_ler',
      description: 'Le um arquivo do projeto pelo caminho relativo (ex: src/main/index.ts).',
      inputSchema: {
        type: 'object',
        properties: { nome: { type: 'string', description: 'Caminho relativo a raiz' } },
        required: ['nome']
      }
    },
    {
      name: 'codigo_buscar',
      description: 'Busca texto/regex nos arquivos do projeto. Retorna arquivo:linha:trecho.',
      inputSchema: {
        type: 'object',
        properties: {
          termo: { type: 'string', description: 'Texto ou regex a buscar' },
          caminho: { type: 'string', description: 'Subpasta opcional' }
        },
        required: ['termo']
      }
    },
    {
      name: 'terminal_exec',
      description: 'Executa um comando no terminal do workspace (cwd=raiz). Comandos destrutivos exigem confirmado=true.',
      inputSchema: {
        type: 'object',
        properties: {
          comando: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          confirmado: { type: 'boolean' }
        },
        required: ['comando']
      }
    }
  ]
}

function dentroDaRaiz(raiz: string, alvo: string): string | null {
  const abs = path.resolve(raiz, alvo)
  const raizAbs = path.resolve(raiz)
  if (abs !== raizAbs && !abs.startsWith(raizAbs + path.sep)) return null
  return abs
}

function* walk(dir: string, profundidade: number, nivel = 0): Generator<{ abs: string; rel: string; dir: boolean }> {
  if (nivel > profundidade) return
  let ents: fs.Dirent[]
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    if (IGNORAR_DIRS.has(e.name)) continue
    const abs = path.join(dir, e.name)
    yield { abs, rel: path.relative(path.resolve(dir, '..'), abs), dir: e.isDirectory() }
    if (e.isDirectory()) yield* walk(abs, profundidade, nivel + 1)
  }
}

function ok(texto: string): { ok: boolean; texto: string } {
  return { ok: true, texto: JSON.stringify({ ok: true, texto }) }
}

function falha(erro: string): { ok: boolean; texto: string } {
  return { ok: false, texto: JSON.stringify({ ok: false, erro }) }
}

/** Executa uma tool inline. Retorna { ok, texto } no mesmo formato de chamarTool. */
export async function executarToolInline(
  raiz: string,
  nome: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; texto: string }> {
  const r = path.resolve(String(raiz || ''))
  try {
    switch (nome) {
      case 'projeto_arvore': {
        const maxProf = Math.min(6, Math.max(1, Number(args.maxProfundidade) || 3))
        const filtro = String(args.filtro || '').toLowerCase()
        const linhas: string[] = []
        for (const e of walk(r, maxProf)) {
          const base = path.basename(e.abs).toLowerCase()
          if (filtro && !base.includes(filtro) && !e.dir) continue
          linhas.push('  '.repeat(Math.min(12, e.rel.split(path.sep).length - 1)) + (e.dir ? '/' : '') + path.basename(e.abs))
          if (linhas.length > 4000) break
        }
        return ok(linhas.join('\n') || '(vazio)')
      }

      case 'codigo_ler': {
        const alvo = String(args.nome || args.caminho || args.arquivo || '')
        const abs = dentroDaRaiz(r, alvo)
        if (!abs) return falha('caminho fora do workspace: ' + alvo)
        if (!fs.existsSync(abs)) return falha('arquivo nao encontrado: ' + alvo)
        const st = fs.statSync(abs)
        if (st.isDirectory()) {
          const itens = fs.readdirSync(abs).slice(0, 200).join('\n')
          return ok('Diretorio ' + alvo + ':\n' + itens)
        }
        const bruto = fs.readFileSync(abs, 'utf8')
        const linhas = bruto.split('\n')
        const cap = 2000
        const corpo = linhas.slice(0, cap).map((l, i) => String(i + 1).padStart(5) + ' ' + l).join('\n')
        return ok(corpo + (linhas.length > cap ? '\n... (' + (linhas.length - cap) + ' linhas omitidas)' : ''))
      }

      case 'codigo_buscar': {
        const termo = String(args.termo || '')
        if (!termo) return falha('termo obrigatorio')
        const sub = String(args.caminho || '')
        const base = sub ? dentroDaRaiz(r, sub) : r
        if (!base || !fs.existsSync(base)) return falha('pasta nao encontrada: ' + sub)
        let re: RegExp
        try {
          re = new RegExp(termo, 'i')
        } catch {
          re = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        }
        const hits: string[] = []
        const stack = [base]
        while (stack.length && hits.length < 60) {
          const dir = stack.pop() as string
          let ents: fs.Dirent[]
          try {
            ents = fs.readdirSync(dir, { withFileTypes: true })
          } catch {
            continue
          }
          for (const e of ents) {
            if (hits.length >= 60) break
            if (IGNORAR_DIRS.has(e.name)) continue
            const abs = path.join(dir, e.name)
            if (e.isDirectory()) {
              stack.push(abs)
              continue
            }
            if (!EXT_TEXTO.has(path.extname(e.name).toLowerCase())) continue
            let txt = ''
            try {
              txt = fs.readFileSync(abs, 'utf8')
            } catch {
              continue
            }
            const ls = txt.split('\n')
            for (let i = 0; i < ls.length && hits.length < 60; i++) {
              if (re.test(ls[i])) {
                hits.push(path.relative(r, abs) + ':' + (i + 1) + ': ' + ls[i].trim().slice(0, 200))
              }
            }
          }
        }
        return ok(hits.join('\n') || 'NENHUM resultado para: ' + termo)
      }

      case 'terminal_exec': {
        const cmd = String(args.comando || '').trim()
        const argv = Array.isArray(args.args) ? (args.args as unknown[]).map(String) : []
        if (!cmd) return falha('comando vazio')
        const linha = (cmd + ' ' + argv.join(' ')).toLowerCase()
        const destrutivo =
          /\b(rm|del|rmdir|unlink|format|shutdown|reboot)\b/.test(linha) ||
          /\b(install|uninstall|remove)\b/.test(linha) ||
          /push\s+--force|--force\s+push|reset\s+--hard|clean\s+-fdx/.test(linha)
        if (destrutivo && args.confirmado !== true) {
          return falha('comando destrutivo — peça confirmação ao usuário e chame de novo com confirmado=true')
        }
        if (!/^[a-zA-Z0-9._+\-]+$/.test(cmd)) return falha('comando invalido')
        try {
          const { stdout, stderr } = await execFileAsync(cmd, argv, {
            cwd: r,
            timeout: 30000,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            shell: false,
            encoding: 'utf8'
          })
          const texto = (String(stdout || '') + (stderr ? '\n' + String(stderr) : '')).slice(0, 12000)
          return ok(texto || '(sem saida)')
        } catch (e) {
          const err = e as { message?: string; stdout?: string; stderr?: string }
          return {
            ok: false,
            texto: JSON.stringify({
              ok: false,
              erro: String(err.stderr || err.message || e).slice(0, 800),
              stdout: String(err.stdout || '').slice(0, 4000)
            })
          }
        }
      }

      default:
        return falha('tool inline desconhecida: ' + nome + ' (MCP indisponivel — so leitura/exec basicos)')
    }
  } catch (e) {
    return falha(String((e as Error)?.message || e).slice(0, 400))
  }
}
