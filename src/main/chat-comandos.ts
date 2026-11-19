/**
 * Comandos de chat estilo aider (/mapa, /diff, /commit, /limpar, /modelo, /regras).
 * Executados no main antes do fluxo normal de chat — resposta volta como
 * mensagem assistant comum (provider 'comando').
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gitStatus, gitDiff, gitCommit } from './git'
import { mapaRepositorio } from './agent/repo-mapa'
import { readRules, readComplementaryRules } from './dgrules'
import { lerCatalogoMcp } from './mcp/mercado'

const COMANDOS = new Set(['mapa', 'diff', 'commit', 'limpar', 'modelo', 'regras', 'ajuda', 'spec', 'specs', 'devin', 'devin-status', 'devin-listar', 'devin-sync', 'worktree', 'mcps', 'credenciais', 'agendar', 'agendados', 'paralelo', 'paralelo-merge', 'imagem', 'video', 'audio', 'wiki', 'autocommit'])

/** Retorno estendido: comandos de midia pedem geracao direta pela cascata. */
export interface ResultadoComando {
  content: string
  midia?: { tipo: 'imagem' | 'video' | 'audio'; prompt: string }
}

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

async function cmdDevin(arg: string): Promise<string> {
  try {
    const { devinStatus, devinCriarSessao } = await import('./devin-api')
    if (!arg) {
      const st = await devinStatus()
      return st.ok
        ? 'Devin API autenticada (org: ' + (st.org || '?') + '). Uso: `/devin <tarefa>` para delegar uma sessão cloud.'
        : 'Devin API indisponível: ' + (st.erro || 'configure DEVIN_API_KEY')
    }
    const r = await devinCriarSessao(arg)
    if (!r.ok) return 'Falha ao criar sessão Devin: ' + (r.erro || 'erro')
    return 'Sessão Devin criada: ' + (r.url || r.sessionId) + '\nAcompanhe em app.devin.ai — o trabalho roda na nuvem.'
  } catch (e) {
    return 'Devin API erro: ' + String(e)
  }
}

async function cmdDevinStatus(arg: string): Promise<string> {
  const id = arg.trim()
  if (!id) return 'Uso: `/devin-status <sessionId>`'
  try {
    const { devinStatusSessao } = await import('./devin-api')
    const r = await devinStatusSessao(id)
    if (!r.ok) return 'Falha ao consultar sessão: ' + (r.erro || 'erro')
    const msgs = Array.isArray(r.mensagens) ? r.mensagens : []
    const ultimas = msgs.slice(-3).map((m) => {
      const o = m as Record<string, unknown>
      const txt = String(o.text ?? o.message ?? o.content ?? '').slice(0, 200)
      return '• ' + String(o.role ?? o.type ?? '?') + ': ' + txt
    })
    return 'Sessão ' + id + ' — status: ' + (r.status || '?') +
      (ultimas.length ? '\nÚltimas mensagens:\n' + ultimas.join('\n') : '\n(sem mensagens)')
  } catch (e) {
    return 'Devin API erro: ' + String(e)
  }
}

async function cmdWorktree(arg: string, raiz: string): Promise<string> {
  try {
    const { criarWorktreeCheckpoint, removerWorktreeCheckpoint, listarWorktrees } = await import('./git-worktree')
    const sub = arg.trim().split(/\s+/)[0] || 'listar'
    if (sub === 'criar' || sub === 'add') {
      const nome = arg.trim().split(/\s+/)[1] || 'agente-' + Date.now().toString(36)
      const r = await criarWorktreeCheckpoint(raiz, nome)
      return r.ok ? 'Worktree criado: ' + r.caminho + '\nBranch: ' + r.branch : 'Falha: ' + r.erro
    }
    if (sub === 'remover' || sub === 'rm') {
      const nome = arg.trim().split(/\s+/)[1]
      if (!nome) return 'Uso: `/worktree remover <nome>`'
      const r = await removerWorktreeCheckpoint(raiz, nome)
      return r.ok ? 'Worktree removido: ' + nome : 'Falha: ' + r.erro
    }
    const lista = await listarWorktrees(raiz)
    if (!lista.length) return 'Nenhum worktree de checkpoint. Crie com `/worktree criar <nome>`.'
    return 'Worktrees de checkpoint:\n' + lista.map((w) => '• ' + w.nome + ' → ' + w.caminho + ' (' + w.branch + ')').join('\n')
  } catch (e) {
    return 'Worktree erro: ' + String(e)
  }
}

function cmdMcps(raiz: string, arg: string): string {
  try {
    const catalogo = lerCatalogoMcp()
    const cfgPath = join(raiz, '.dg-editor', 'mcp-externos.json')
    const lerCfg = (): { servidores?: unknown[] } => {
      try { return JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { return { servidores: [] } }
    }
    const cfg = lerCfg()
    const servidores = Array.isArray(cfg.servidores) ? cfg.servidores : []
    const nomesAtivos = new Set(
      servidores.map((s) => String((s as Record<string, unknown>).nome || '')).filter(Boolean)
    )

    const instalando = arg.trim().toLowerCase()
    if (instalando && instalando !== 'listar') {
      const item = catalogo.find((s) => s.id === instalando)
      if (!item) return 'MCP desconhecido: ' + instalando + '. Use `/mcps` para listar.'
      if (nomesAtivos.has(item.id)) return item.id + ' já está ativo em mcp-externos.json.'
      const c = item.config as { command?: string; args?: string[]; env?: Record<string, string> }
      servidores.push({
        nome: item.id,
        comando: c.command,
        args: c.args || [],
        env: c.env || {},
        habilitado: true
      })
      mkdirSync(join(raiz, '.dg-editor'), { recursive: true })
      writeFileSync(cfgPath, JSON.stringify({ servidores }, null, 2) + '\n', 'utf8')
      return 'MCP "' + item.id + '" instalado em .dg-editor/mcp-externos.json.\nComando: ' + item.comando + '\nReinicie o app ou recarregue para carregar as tools.'
    }

    const linhas = catalogo.map((s) => {
      const marca = nomesAtivos.has(s.id) ? '[ativo]' : '[     ]'
      return marca + ' ' + s.id + ' — ' + s.nome + '\n       ' + s.descricao + '\n       install: /mcps ' + s.id
    })
    return 'Marketplace MCP — instale com `/mcps <id>`:\n\n' + linhas.join('\n\n')
  } catch (e) {
    return 'Marketplace erro: ' + String(e)
  }
}

async function cmdCredenciais(arg: string): Promise<string> {
  try {
    const { listarChavesConfiguradas, salvarChave, removerChave } = await import('./brain/segredos-providers')
    const partes = arg.trim().split(/\s+/)
    const sub = (partes[0] || '').toLowerCase()
    if (sub === 'remover' || sub === 'rm') {
      const id = partes[1]
      if (!id) return 'Uso: `/credenciais remover <id>`'
      const r = removerChave(id)
      return r.ok ? 'Credencial "' + id + '" removida.' : 'Falha ao remover.'
    }
    if (sub && partes.length >= 3) {
      const id = sub
      const valor = partes.slice(2).join(' ')
      const r = salvarChave(id, valor)
      return r.ok ? 'Credencial "' + id + '" salva no vault.' : 'Falha: ' + (r.erro || 'erro')
    }
    const lista = listarChavesConfiguradas().sort()
    return lista.length
      ? 'Credenciais configuradas (vault):\n' + lista.map((c) => '• ' + c).join('\n') +
        '\n\nDefinir: `/credenciais <id> <valor>` · Remover: `/credenciais remover <id>`\n' +
        'IDs úteis: `devin` (DEVIN_API_KEY), `devin-org` (DEVIN_ORG_ID), `openrouter`, `github`, etc.'
      : 'Nenhuma credencial no vault.\nDefinir: `/credenciais <id> <valor>` — ex.: `/credenciais devin cog_...`'
  } catch (e) {
    return 'Credenciais erro: ' + String(e)
  }
}

async function cmdAgendar(arg: string, raiz: string): Promise<string> {
  try {
    const ag = await import('./agendador')
    const partes = arg.trim().split(/\s+/)
    const sub = (partes[0] || '').toLowerCase()
    if (sub === 'remover' || sub === 'rm') {
      const id = partes[1]
      if (!id) return 'Uso: `/agendar remover <id>`'
      return ag.removerJob(id) ? 'Job ' + id + ' removido.' : 'Job não encontrado.'
    }
    if (sub === 'off' || sub === 'on' || sub === 'toggle') {
      const id = partes[1]
      if (!id) return 'Uso: `/agendar ' + sub + ' <id>`'
      const j = ag.alternarJob(id)
      return j ? 'Job ' + j.id + ' agora ' + (j.ativo ? 'ATIVO' : 'pausado') + '.' : 'Job não encontrado.'
    }
    // formato: /agendar <minutos> <prompt...>
    const min = Number(partes[0])
    const prompt = partes.slice(1).join(' ').trim()
    if (!Number.isFinite(min) || min < 5 || !prompt) {
      const jobs = ag.listarJobs()
      const linhas = jobs.map((j) =>
        (j.ativo ? '[on] ' : '[off] ') + j.id + ' — a cada ' + j.cadaMin + 'min — ' + j.prompt.slice(0, 70)
      )
      return 'Uso: `/agendar <minutos> <prompt>` (mín. 5)\n' +
        'Controle: `/agendar off|on|remover <id>`\n\n' +
        (linhas.length ? 'Jobs:\n' + linhas.join('\n') : 'Nenhum job agendado.')
    }
    const j = ag.adicionarJob({ prompt, cadaMin: min, raiz })
    return 'Job agendado: ' + j.id + ' — a cada ' + j.cadaMin + 'min.\nPrompt: ' + j.prompt.slice(0, 100)
  } catch (e) {
    return 'Agendador erro: ' + String(e)
  }
}

async function cmdDevinListar(): Promise<string> {
  try {
    const { devinListarSessoes } = await import('./devin-api')
    const r = await devinListarSessoes(15)
    if (!r.ok) return 'Falha ao listar sessões: ' + (r.erro || 'erro')
    const lista = r.sessoes || []
    if (!lista.length) return 'Nenhuma sessão Devin encontrada.'
    const linhas = lista.map((s) => {
      const o = s as Record<string, unknown>
      const id = String(o.session_id || o.id || '?')
      const status = String(o.status || o.state || '?')
      const titulo = String(o.title || o.prompt || '').slice(0, 60)
      return '• ' + id + ' [' + status + '] ' + titulo
    })
    return 'Sessões Devin (use `/devin-status <id>` para detalhes):\n' + linhas.join('\n')
  } catch (e) {
    return 'Devin API erro: ' + String(e)
  }
}

async function cmdParalelo(arg: string, raiz: string): Promise<string> {
  try {
    const partes = arg.trim().split(/\s+/).filter(Boolean)
    const nome = partes[0] || 'paralelo-' + Date.now().toString(36)
    const tarefa = partes.slice(1).join(' ').trim()
    const { criarWorktreeCheckpoint } = await import('./git-worktree')
    const wt = await criarWorktreeCheckpoint(raiz, nome)
    if (!wt.ok || !wt.caminho) return 'Falha ao criar worktree: ' + (wt.erro || 'erro')
    if (!tarefa) {
      return 'Worktree criado para agente paralelo:\n' + wt.caminho + '\nBranch: ' + wt.branch +
        '\n\nUso: `/paralelo ' + nome + ' <tarefa>` para rodar o agente isolado, ou abra a pasta no chat.'
    }
    const { executarAgente } = await import('./brain/agent')
    const r = await executarAgente(wt.caminho, tarefa, {})
    const resumo = String(r.texto || '').slice(0, 1500) || '(sem texto)'
    return 'Agente paralelo concluído no worktree:\n' + wt.caminho + '\nBranch: ' + wt.branch +
      '\n\nResultado:\n' + resumo +
      '\n\nPara incorporar: `git merge ' + wt.branch + '` ou `/worktree remover ' + nome + ' após revisar.'
  } catch (e) {
    return 'Paralelo erro: ' + String(e)
  }
}

async function cmdParaleloMerge(arg: string, raiz: string): Promise<string> {
  const partes = arg.trim().split(/\s+/).filter(Boolean)
  const nome = partes[0]
  const revisar = partes.includes('--revisar') || partes.includes('-n')
  if (!nome) return 'Uso: `/paralelo-merge <nome> [--revisar]` — mergeia a branch dg/wt-<nome> na atual. `--revisar` só mostra o diff.'
  try {
    const { mergeWorktreeCheckpoint, removerWorktreeCheckpoint, diffWorktreeCheckpoint } = await import('./git-worktree')
    if (revisar) {
      const d = await diffWorktreeCheckpoint(raiz, nome)
      if (!d.ok) return 'Revisão falhou: ' + (d.erro || 'erro')
      return 'Diff de "' + nome + '" (dg/wt-' + nome + ' → atual):\n\n' +
        (d.commits ? 'Commits:\n' + d.commits + '\n\n' : '') +
        'Arquivos:\n' + d.diff +
        '\n\nPara mergear: `/paralelo-merge ' + nome + '`'
    }
    const r = await mergeWorktreeCheckpoint(raiz, nome)
    if (!r.ok) return 'Merge falhou: ' + (r.erro || 'erro') + '\nResolva conflitos e tente de novo, ou `/worktree remover ' + nome + '` para descartar.'
    const rm = await removerWorktreeCheckpoint(raiz, nome)
    return 'Merge de "' + nome + '" concluído na branch atual.' +
      (rm.ok ? ' Worktree removido.' : ' (worktree mantido: ' + (rm.erro || '') + ')') +
      '\nRevisão: `/diff` ou `git log -1`.'
  } catch (e) {
    return 'Paralelo-merge erro: ' + String(e)
  }
}

async function cmdDevinSync(): Promise<string> {
  try {
    const { devinListarSessoes } = await import('./devin-api')
    const r = await devinListarSessoes(20)
    if (!r.ok) return 'Falha: ' + (r.erro || 'erro')
    const lista = r.sessoes || []
    if (!lista.length) return 'Nenhuma sessão Devin.'
    const linhas = lista.map((s) => {
      const o = s as Record<string, unknown>
      const id = String(o.session_id || o.id || '?')
      const status = String(o.status || o.state || '?')
      const prs = Array.isArray(o.pull_requests) ? (o.pull_requests as unknown[]).length : 0
      const prTxt = prs ? ' [' + prs + ' PR' + (prs > 1 ? 's' : '') + ']' : ''
      const titulo = String(o.title || '').slice(0, 55)
      return '• ' + id + ' [' + status + ']' + prTxt + ' ' + titulo +
        '\n  status: `/devin-status ' + id + '`'
    })
    return 'Sessões Devin — prontos para merge quando status=finished/blocked:\n\n' + linhas.join('\n')
  } catch (e) {
    return 'Devin sync erro: ' + String(e)
  }
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

/** /imagem|/video|/audio <prompt> — geracao direta pela cascata, sem agente. */
function cmdMidia(cmd: string, arg: string): ResultadoComando {
  if (!arg) return { content: 'Uso: /' + cmd + ' <descricao do que gerar>' }
  const tipo = cmd === 'video' ? 'video' : cmd === 'audio' ? 'audio' : 'imagem'
  return {
    content: 'Gerando ' + tipo + ' pela cascata (gratis primeiro)…',
    midia: { tipo, prompt: arg }
  }
}

/** /wiki — gera .dg-editor/wiki.md com mapa do repo para agentes e humanos. */
function cmdWiki(raiz: string): string {
  try {
    const mapa = mapaRepositorio(raiz, [])
    const dir = join(raiz, '.dg-editor')
    mkdirSync(dir, { recursive: true })
    const arq = join(dir, 'wiki.md')
    const agora = new Date().toISOString()
    const conteudo =
      '# Wiki do projeto\n\n> Gerado por `/wiki` em ' + agora + '.\n\n' +
      '## Mapa de simbolos\n\n```\n' + (mapa ? mapa.slice(0, 14000) : '(sem codigo)') + '\n```\n\n' +
      '## Como usar\n\n- `/mapa` — mapa resumido no chat\n' +
      '- `/spec <titulo>` — criar spec antes de tarefa grande\n' +
      '- Agentes leem este arquivo via contexto implicito quando presente.\n'
    writeFileSync(arq, conteudo, 'utf8')
    return 'Wiki gerada: ' + arq + '\n\n' + (mapa ? mapa.split('\n').length + ' linhas de mapa.' : 'Sem codigo para mapear.')
  } catch (e) {
    return 'Wiki erro: ' + String(e)
  }
}

/** /autocommit on|off|status — commit automatico das alteracoes do agente. */
function cmdAutocommit(arg: string, raiz: string): string {
  const arq = join(raiz, '.dg-editor', 'autocommit.json')
  const ler = (): boolean => {
    try { return JSON.parse(readFileSync(arq, 'utf8')).ativo === true } catch { return false }
  }
  const sub = arg.trim().toLowerCase()
  if (sub === 'on' || sub === 'off') {
    mkdirSync(join(raiz, '.dg-editor'), { recursive: true })
    writeFileSync(arq, JSON.stringify({ ativo: sub === 'on' }, null, 2) + '\n', 'utf8')
    return 'Autocommit ' + (sub === 'on' ? 'ATIVADO' : 'desativado') +
      '. Quando ligado, alteracoes aplicadas pelo agente viram commit automatico.'
  }
  return 'Autocommit esta ' + (ler() ? 'ATIVADO' : 'desativado') +
    '. Uso: `/autocommit on|off`.'
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
): Promise<ResultadoComando | null> {
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
    case 'devin':
      return { content: await cmdDevin(parsed.arg) }
    case 'devin-status':
      return { content: await cmdDevinStatus(parsed.arg) }
    case 'devin-listar':
      return { content: await cmdDevinListar() }
    case 'credenciais':
      return { content: await cmdCredenciais(parsed.arg) }
    case 'agendar':
      return { content: await cmdAgendar(parsed.arg, raiz) }
    case 'agendados':
      return { content: await cmdAgendar('listar', raiz) }
    case 'paralelo':
      return { content: await cmdParalelo(parsed.arg, raiz) }
    case 'paralelo-merge':
      return { content: await cmdParaleloMerge(parsed.arg, raiz) }
    case 'devin-sync':
      return { content: await cmdDevinSync() }
    case 'worktree':
      return { content: await cmdWorktree(parsed.arg, raiz) }
    case 'mcps':
      return { content: cmdMcps(raiz, parsed.arg) }
    case 'imagem':
    case 'video':
    case 'audio':
      return cmdMidia(parsed.cmd, parsed.arg)
    case 'wiki':
      return { content: cmdWiki(raiz) }
    case 'autocommit':
      return { content: cmdAutocommit(parsed.arg, raiz) }
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
          '- `/devin <tarefa>` — delega tarefa para sessão cloud do Devin (requer DEVIN_API_KEY/ORG_ID)\n' +
          '- `/devin-status <id>` — status e últimas mensagens de uma sessão Devin\n' +
          '- `/worktree [criar|remover <nome>]` — checkpoints isolados via git worktree\n' +
          '- `/mcps` — catálogo de MCP servers; `/mcps <id>` instala no projeto\n' +
          '- `/devin-listar` — lista sessões Devin; `/devin-status <id>` detalha\n' +
          '- `/credenciais [id valor|remover id]` — vault de chaves (devin, openrouter...)\n' +
          '- `/agendar <min> <prompt>` — job recorrente; `/agendar` lista; `off/on/remover <id>`\n' +
          '- `/paralelo <nome> [tarefa]` — agente isolado em git worktree\n' +
          '- `/paralelo-merge <nome> [--revisar]` — mergeia o worktree na branch atual (--revisar mostra o diff)\n' +
          '- `/devin-sync` — sessões Devin com status/PRs para merge\n' +
          '- `/imagem|/video|/audio <prompt>` — gera midia direto pela cascata (sem agente)\n' +
          '- `/wiki` — gera .dg-editor/wiki.md com o mapa do repo\n' +
          '- `/autocommit on|off` — commit automatico das alteracoes do agente\n' +
          '- `/ajuda` — esta lista'
      }
    default:
      return null
  }
}
