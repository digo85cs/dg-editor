/**
 * Comandos de chat estilo aider (/mapa, /diff, /commit, /limpar, /modelo, /regras).
 * Executados no main antes do fluxo normal de chat — resposta volta como
 * mensagem assistant comum (provider 'comando').
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gitStatus, gitDiff, gitCommit } from './git'
import { mapaRepositorio } from './agent/repo-mapa'
import { readRules, readComplementaryRules } from './dgrules'

const COMANDOS = new Set(['mapa', 'diff', 'commit', 'limpar', 'modelo', 'regras', 'ajuda', 'spec', 'specs'])

function parse(texto: string): { cmd: string; arg: string } | null {
  const m = texto.trim().match(/^\/([a-zA-Z-]+)(?:\s+([\s\S]*))?$/)
  if (!m) return null
  const cmd = m[1].toLowerCase()
  if (!COMANDOS.has(cmd)) return null
  return { cmd, arg: (m[2] || '').trim() }
}

async function cmdDiff(raiz: string): Promise<string> {
  const st = await gitStatus(raiz)
  if (!st.ok || !st.itens?.length) return 'Working tree limpo — nada para diff.'
  const linhas = ['### Git status', ...st.itens.slice(0, 30).map((i) => i.status + ' ' + i.path)]
  let out = linhas.join('\n') + '\n\n'
  let bytes = out.length
  for (const item of st.itens.filter((i) => i.status === 'M' || i.status === 'A').slice(0, 4)) {
    const d = await gitDiff(raiz, item.path)
    if (d.ok && d.diff) {
      const bloco = '### diff ' + item.path + '\n```diff\n' + d.diff.slice(0, 4000) + '\n```\n\n'
      if (bytes + bloco.length > 12000) break
      out += bloco
      bytes += bloco.length
    }
  }
  return out.trim()
}

async function cmdCommit(raiz: string, arg: string): Promise<string> {
  const st = await gitStatus(raiz)
  if (!st.ok) return 'Não foi possível ler o git status: ' + (st.erro || 'erro')
  if (!st.itens?.length) return 'Working tree limpo — nada para commitar.'
  const resumo = st.itens.slice(0, 40).map((i) => i.status + ' ' + i.path).join('\n')
  if (arg) {
    const r = await gitCommit(raiz, arg.slice(0, 500))
    return r.ok
      ? 'Commit criado: `' + (r.hash || '') + '` — ' + arg.slice(0, 80)
      : 'Commit falhou: ' + (r.erro || 'erro')
  }
  try {
    const { askOllama } = await import('./brain/ollama')
    const resp = await askOllama(
      'Escreva uma mensagem de commit conventional commits curta (max 72 chars, pt-BR) para estas alterações. Responda APENAS a mensagem.',
      'Arquivos alterados:\n' + resumo,
      'commit'
    )
    const msg = String(resp?.text || '').trim().split('\n')[0].slice(0, 200)
    if (!msg) return 'Modelo não retornou mensagem. Alterações:\n' + resumo
    return (
      'Sugestão de commit (modelo 1.5b):\n\n`' + msg + '`\n\n' +
      'Para commitar: `/commit ' + msg.replace(/`/g, '') + '`\n\nAlterações:\n' + resumo.slice(0, 1500)
    )
  } catch (e) {
    return 'Modelo indisponível para sugerir mensagem. Alterações:\n' + resumo.slice(0, 1500)
  }
}

async function cmdModelo(raiz: string): Promise<string> {
  try {
    const { lerCatalogo, modeloParaTarefa } = await import('./brain/modelos-catalogo')
    const cat = lerCatalogo(raiz)
    const chat = modeloParaTarefa(raiz, 'chat')
    const codigo = modeloParaTarefa(raiz, 'codigo')
    return [
      'Modelo ativo: `' + (cat.ativo || '?') + '`',
      'Chat: `' + (chat || '?') + '` · Código: `' + (codigo || '?') + '`',
      'Residentes: ' + (cat.modelos || []).filter((m) => m.ativo !== false).map((m) => m.id).join(', ')
    ].join('\n')
  } catch (e) {
    return 'Catálogo indisponível: ' + String(e)
  }
}

const SPEC_TEMPLATE = `# Spec: TITULO

## Objetivo
O que esta feature resolve e para quem.

## Escopo
- Item 1
- Item 2

## Fora de escopo
- Item explicitamente adiado

## Tarefas
- [ ] Tarefa 1
- [ ] Tarefa 2

## Criterios de aceite
- [ ] Como verificar que funciona
`

function slug(txt: string): string {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'spec'
}

function cmdSpec(raiz: string, arg: string): string {
  if (!arg) return 'Uso: /spec <titulo da feature>'
  const dir = join(raiz, '.dg-editor', 'specs')
  mkdirSync(dir, { recursive: true })
  const arq = join(dir, slug(arg) + '.md')
  if (existsSync(arq)) return 'Spec já existe: ' + arq
  writeFileSync(arq, SPEC_TEMPLATE.replace('TITULO', arg), 'utf-8')
  return (
    'Spec criada: ' + arq + '\n\n' +
    'Próximo passo: peça ao agente para "executar a spec ' + arg + '" ' +
    '(modo plan vai ler o arquivo e propor as tarefas).'
  )
}

function cmdSpecs(raiz: string): string {
  const dir = join(raiz, '.dg-editor', 'specs')
  if (!existsSync(dir)) return 'Nenhuma spec ainda. Crie com /spec <titulo>.'
  const itens = readdirSync(dir).filter((n) => n.endsWith('.md'))
  if (!itens.length) return 'Nenhuma spec ainda. Crie com /spec <titulo>.'
  return 'Specs em .dg-editor/specs:\n' + itens.map((n) => '- ' + n).join('\n')
}

function cmdRegras(raiz: string): string {
  const partes: string[] = []
  const rules = readRules(raiz)
  partes.push(rules.trim() ? '.dgrules: presente (' + rules.length + ' chars)' : '.dgrules: ausente')
  const compativeis = readComplementaryRules(raiz)
  if (compativeis) {
    for (const l of compativeis.split('\n\n')) {
      const nome = l.match(/^### (.+)$/m)?.[1]
      if (nome) partes.push(nome + ': presente')
    }
  } else {
    partes.push('AGENTS.md/CLAUDE.md/etc.: nenhum encontrado')
  }
  const extra = join(raiz, '.dg-editor', 'regras')
  partes.push(extra + ': ' + (existsSync(extra) ? 'presente' : 'ausente'))
  return partes.join('\n')
}

async function cmdLimpar(raiz: string): Promise<string> {
  try {
    const { clearChat } = await import('./chatstore')
    clearChat(raiz)
    return 'Chat limpo.'
  } catch (e) {
    return 'Falha ao limpar chat: ' + String(e)
  }
}

/**
 * Executa comando de chat. Retorna null quando o texto não é comando
 * (segue fluxo normal). Retorna { content } para responder como assistant.
 */
export async function executarComandoChat(
  raiz: string,
  texto: string
): Promise<{ content: string } | null> {
  const parsed = parse(texto)
  if (!parsed) return null
  switch (parsed.cmd) {
    case 'mapa': {
      const mapa = mapaRepositorio(raiz, [])
      return { content: mapa ? mapa.slice(0, 12000) : 'Nenhum arquivo de código encontrado para mapear.' }
    }
    case 'diff':
      return { content: await cmdDiff(raiz) }
    case 'commit':
      return { content: await cmdCommit(raiz, parsed.arg) }
    case 'limpar':
      return { content: await cmdLimpar(raiz) }
    case 'modelo':
      return { content: await cmdModelo(raiz) }
    case 'regras':
      return { content: cmdRegras(raiz) }
    case 'spec':
      return { content: cmdSpec(raiz, parsed.arg) }
    case 'specs':
      return { content: cmdSpecs(raiz) }
    case 'ajuda':
      return {
        content:
          'Comandos disponíveis:\n' +
          '- `/mapa` — mapa de símbolos do repositório\n' +
          '- `/diff` — status + diff dos arquivos modificados\n' +
          '- `/commit [msg]` — sugere mensagem (modelo 1.5b) ou commita com msg explícita\n' +
          '- `/limpar` — limpa o histórico do chat\n' +
          '- `/modelo` — modelo ativo e roteamento\n' +
          '- `/regras` — fontes de regras carregadas\n' +
          '- `/spec <titulo>` — cria spec em .dg-editor/specs (spec-driven)\n' +
          '- `/specs` — lista specs do projeto\n' +
          '- `/ajuda` — esta lista'
      }
    default:
      return null
  }
}
