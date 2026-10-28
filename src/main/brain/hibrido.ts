/**
 * Agente Híbrido Core — Fase 1 (predição/análise) + Fase 2 (geração/execução).
 * Não inventa estado: só lê disco, git e cache de análise.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'
import { dglog } from '../dglog'
import { getCachedAnalysis } from '../analyzer'
import { executarAgente, type RespostaAgente } from './agent'
import { garantirAgentesPadrao } from './agentes'

export type NivelRisco = 'baixo' | 'medio' | 'alto' | 'critico'
export type RotaSegura =
  | 'somente_leitura'
  | 'edicao_localizada'
  | 'tool_mcp'
  | 'terminal_com_confirmacao'
  | 'recusar'

export interface SnapshotWorkspace {
  raiz: string
  cwd: string
  branch: string
  commit: string
  treeSujo: boolean
  pastaAberta: string | null
  oQueE: string | null
  stack: string | null
  topNivel: string[]
  temPackageJson: boolean
  scriptsNpm: string[]
  agentesDisco: string[]
  timestamp: string
}

export interface PredicaoImpacto {
  risco: NivelRisco
  probabilidadeQuebra: number
  motivos: string[]
  rota: RotaSegura
  requerConfirmacao: boolean
  comandosSensiveis: string[]
}

export interface BriefingHibrido {
  snapshot: SnapshotWorkspace
  predicao: PredicaoImpacto
  briefingTexto: string
}

const CMD_CRITICO =
  /\b(rm\s+-rf|Remove-Item\s+-Recurse|git\s+push\s+--force|git\s+reset\s+--hard|drop\s+database|format\s+|del\s+\/s|npm\s+publish|npx\s+.*--force)\b/i
const CMD_RISCO =
  /\b(npm\s+i(nstall)?|npm\s+uninstall|pnpm\s+i|yarn\s+add|pip\s+install|git\s+commit|git\s+merge|git\s+rebase|migrate|docker\s+compose\s+down)\b/i
const PEDIDO_DESTRUTIVO =
  /\b(apagar|deletar|remover\s+tudo|formatar|destruir|wipe|force\s+push|reset\s+hard)\b/i
const PEDIDO_EDICAO =
  /\b(criar|alterar|editar|refator|implement|corrig|fix|adicionar|escrever)\b/i
const PEDIDO_LEITURA =
  /\b(ler|mostrar|listar|onde|explicar|o\s+que\s+é|analisar|inspecionar|status)\b/i

function gitMeta(raiz: string): { branch: string; commit: string; treeSujo: boolean } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: raiz, encoding: 'utf-8' }).trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: raiz, encoding: 'utf-8' }).trim()
    const st = execSync('git status --porcelain', { cwd: raiz, encoding: 'utf-8' }).trim()
    return { commit, branch, treeSujo: st.length > 0 }
  } catch {
    return { commit: 'n/a', branch: 'n/a', treeSujo: false }
  }
}

function listarTop(raiz: string): string[] {
  try {
    return readdirSync(raiz)
      .filter((n) => !n.startsWith('.') || n === '.dg-editor' || n === '.dgrules')
      .filter((n) => {
        try {
          return statSync(join(raiz, n)).isDirectory() || /\.(json|md|ts|js)$/i.test(n)
        } catch {
          return false
        }
      })
      .slice(0, 24)
  } catch {
    return []
  }
}

function scriptsDoPackage(raiz: string): string[] {
  const pj = join(raiz, 'package.json')
  if (!existsSync(pj)) return []
  try {
    const j = JSON.parse(readFileSync(pj, 'utf-8')) as { scripts?: Record<string, string> }
    return Object.keys(j.scripts || {})
  } catch {
    return []
  }
}

function agentesIds(raiz: string): string[] {
  const dir = join(raiz, '.dg-editor', 'agentes')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
}

/** FASE 1 — snapshot factual do workspace (sem LLM). */
export function analisarWorkspace(raiz: string, pastaAberta?: string | null): SnapshotWorkspace {
  const abs = raiz || process.cwd()
  const git = gitMeta(abs)
  const analysis = getCachedAnalysis(abs)
  return {
    raiz: abs,
    cwd: process.cwd(),
    branch: git.branch,
    commit: git.commit,
    treeSujo: git.treeSujo,
    pastaAberta: pastaAberta || analysis?.root || null,
    oQueE: analysis?.oQueE || null,
    stack: analysis?.stack || null,
    topNivel: listarTop(abs),
    temPackageJson: existsSync(join(abs, 'package.json')),
    scriptsNpm: scriptsDoPackage(abs),
    agentesDisco: agentesIds(abs),
    timestamp: new Date().toISOString()
  }
}

/** FASE 1 — predição heurística de impacto (anti-alucinação: só padrões). */
export function predizerImpacto(pedido: string, snap: SnapshotWorkspace): PredicaoImpacto {
  const motivos: string[] = []
  let score = 0.08
  const comandosSensiveis: string[] = []

  if (CMD_CRITICO.test(pedido) || PEDIDO_DESTRUTIVO.test(pedido)) {
    score = Math.max(score, 0.92)
    motivos.push('pedido/comando potencialmente destrutivo')
    comandosSensiveis.push('destrutivo')
  } else if (CMD_RISCO.test(pedido)) {
    score = Math.max(score, 0.55)
    motivos.push('altera dependencias ou historico git')
    comandosSensiveis.push('mutacao')
  }

  if (PEDIDO_EDICAO.test(pedido)) {
    score = Math.max(score, 0.28)
    motivos.push('implica edicao de arquivos')
  }
  if (PEDIDO_LEITURA.test(pedido) && !PEDIDO_EDICAO.test(pedido)) {
    score = Math.min(score, 0.15)
    motivos.push('parece somente leitura')
  }
  if (snap.treeSujo) {
    score = Math.min(1, score + 0.08)
    motivos.push('working tree sujo — risco de misturar mudancas')
  }
  if (!snap.temPackageJson && /\bnpm\b/i.test(pedido)) {
    score = Math.min(1, score + 0.2)
    motivos.push('npm pedido sem package.json na raiz analisada')
  }
  if (!motivos.length) motivos.push('impacto residual baixo / pedido generico')

  let risco: NivelRisco = 'baixo'
  if (score >= 0.85) risco = 'critico'
  else if (score >= 0.55) risco = 'alto'
  else if (score >= 0.28) risco = 'medio'

  let rota: RotaSegura = 'somente_leitura'
  if (risco === 'critico') rota = 'recusar'
  else if (comandosSensiveis.includes('mutacao') || risco === 'alto') rota = 'terminal_com_confirmacao'
  else if (PEDIDO_EDICAO.test(pedido)) rota = 'edicao_localizada'
  else if (/\b(mcp|tool|terminal|instalar|rodar|executar)\b/i.test(pedido)) rota = 'tool_mcp'

  return {
    risco,
    probabilidadeQuebra: Math.round(score * 100) / 100,
    motivos,
    rota,
    requerConfirmacao: rota === 'terminal_com_confirmacao' || rota === 'recusar',
    comandosSensiveis
  }
}

export function montarBriefing(snap: SnapshotWorkspace, pred: PredicaoImpacto, pedido: string): string {
  const linhas = [
    '### FASE 1 — ANALISE E PREDICAO (Agente Hibrido Core)',
    'Raiz: ' + snap.raiz,
    'CWD processo: ' + snap.cwd,
    'Git: ' + snap.branch + '@' + snap.commit + (snap.treeSujo ? ' (tree sujo)' : ' (limpo)'),
    'Pasta/sistema: ' + (snap.pastaAberta || 'nenhum cache de analise'),
    'O que e: ' + (snap.oQueE || 'nao verificado — leia arquivos antes de afirmar'),
    'Stack (cache): ' + (snap.stack || 'nao verificado'),
    'Topo: ' + (snap.topNivel.join(', ') || '(vazio)'),
    'Scripts npm: ' + (snap.scriptsNpm.slice(0, 12).join(', ') || 'n/a'),
    'Agentes: ' + snap.agentesDisco.join(', '),
    '',
    'Predicao: risco=' +
      pred.risco +
      ' P(quebra)~' +
      pred.probabilidadeQuebra +
      ' rota=' +
      pred.rota +
      (pred.requerConfirmacao ? ' CONFIRMACAO_NECESSARIA' : ''),
    'Motivos: ' + pred.motivos.join('; '),
    '',
    '### FASE 2 — REGRAS DE GERACAO',
    '- Nao invente APIs, libs ou estado de arquivo nao lido (use tools MCP).',
    '- Codigo limpo, tipado quando couber, sem placeholders.',
    '- "Servidor" significa SEMPRE a pasta aberta do projeto (root atual).',
    '  Nao existe servidor remoto salvo se o usuario nomear um host.',
    '  "Programas instalados" na pasta significa: dependencias do',
    '  package.json, node_modules, ferramentas do devDependencies, runtime',
    '  Node/Python local, modelos Ollama instalados.',
    '- CONFIRMACAO — NUNCA pedir para leitura. Executar direto e mostrar o',
    '  resultado:',
    '    listar arquivos (ls, dir, Get-ChildItem),',
    '    listar pacotes/programas (dpkg -l, rpm -qa, npm ls, pip list),',
    '    consultar versao (--version, node -v, git --version),',
    '    grep/search, cat, head, tail,',
    '    git status, git log, git diff,',
    '    ps, Get-Process, systemctl status,',
    '    ollama list, ollama ps,',
    '    curl GET (leitura).',
    '- CONFIRMACAO — PEDIR SOMENTE para escrita/destrutivo:',
    '    npm install, pip install, apt install, choco install,',
    '    rm, del, rmdir,',
    '    git push --force, git reset --hard,',
    '    systemctl stop/restart/disable,',
    '    reboot, shutdown,',
    '    alteracao de firewall,',
    '    escrita em /etc ou variavel de ambiente persistente.',
    '  Ao pedir: explicar o risco em UMA frase e aguardar "sim".',
    '- NUNCA anunciar uma acao e nao executar. Se decidiu agir, execute no',
    '  MESMO turno e mostre o resultado real (comando executado + saida).',
    '- Frases como "Sim, posso acessar e listar..." sem execucao subsequente',
    '  sao PROIBIDAS. Ou executa, ou explica por que nao consegue.',
    '- NUNCA incluir o nome do modelo ("ollama:...", "llama...", "qwen...")',
    '  no corpo da resposta. Isso e metadado interno de log.',
    '- Respostas em pt-BR, diretas, sem preambulo longo.',
    '',
    'Pedido do usuario: ' + pedido.trim()
  ]
  return linhas.join('\n')
}

export function prepararBriefing(
  raiz: string,
  pedido: string,
  pastaAberta?: string | null
): BriefingHibrido {
  const snapshot = analisarWorkspace(raiz, pastaAberta)
  const predicao = predizerImpacto(pedido, snapshot)
  return {
    snapshot,
    predicao,
    briefingTexto: montarBriefing(snapshot, predicao, pedido)
  }
}

/**
 * Pipeline completo: Fase 1 (local) → Fase 2 via executarAgente (hibrido-core).
 * Se rota=recusar e sem force, devolve texto pedindo confirmacao sem chamar LLM/tools.
 */
export async function executarHibrido(
  raiz: string,
  pedido: string,
  opcoes?: { pastaAberta?: string | null; force?: boolean; modeloForcado?: string }
): Promise<RespostaAgente & { briefing: BriefingHibrido }> {
  garantirAgentesPadrao(raiz)
  const briefing = prepararBriefing(raiz, pedido, opcoes?.pastaAberta)
  dglog(
    '[hibrido] risco=' +
      briefing.predicao.risco +
      ' rota=' +
      briefing.predicao.rota +
      ' P=' +
      briefing.predicao.probabilidadeQuebra
  )

  if (briefing.predicao.rota === 'recusar' && !opcoes?.force) {
    return {
      ok: true,
      texto:
        '**Confirmacao necessaria (Fase 1)**\n\n' +
        'Risco **' +
        briefing.predicao.risco +
        '** (P≈' +
        briefing.predicao.probabilidadeQuebra +
        '). ' +
        briefing.predicao.motivos.join('; ') +
        '.\n\nReenvie com confirmacao explicita (ex.: "confirmo, pode executar") se quiser seguir.',
      modelo: 'hibrido-gate',
      passos: [],
      briefing
    }
  }

  const pergunta =
    briefing.briefingTexto +
    (opcoes?.force ? '\n\n[CONFIRMADO PELO USUARIO — prosseguir com cuidado]' : '')

  const resp = await executarAgente(raiz, pergunta, {
    agente: 'hibrido-core',
    modeloForcado: opcoes?.modeloForcado,
    tarefa: 'codigo'
  })
  return { ...resp, briefing }
}

/** Contexto curto para injetar no chat:send (Fase 1 sem tools). */
export function contextoChatHibrido(raiz: string, pedido: string): string {
  return prepararBriefing(raiz, pedido).briefingTexto
}
