import path from 'path'
import { obterPromptRapido } from './fast-chat'
import { chamarTool, listarTools, garantirMcpNaRaiz, type McpTool } from '../mcp/client'
import { montarContexto, blocoMemoria } from '../memory/hybrid'
import { indexarTurno } from '../memory/embeddings'
import { dglog } from '../dglog'
import { loadChat, appendChat } from '../chatstore'
import { escolherModelo } from './ollama'
import {
  filaPronta,
  disponivel,
  appendFailoverLog,
  garantirCatalogoOpenRouter,
  type Tarefa
} from './registry'
import {
  ErroProvider,
  type ProviderConfig,
  type Message,
  type ToolDef,
  type RespostaProvider
} from './providers'
import { chamarComCascata } from './chamar-com-cascata'
import { streamOllamaChat, streamOpenAIChat } from './stream-chat'
import { garantirSkillsPadrao, skillsAtivasParaTurno } from './skills'
import { garantirAgentesPadrao, lerAgente } from './agentes'
import { normalizarArgs, validarChamadaTool } from './tool-call-validation'

/**
 * Agente do DG Editor: fila hibrida (OpenRouter → Ollama) com failover.
 */

/** 2 passos no fluxo curto; Agent Mode sobe o teto (Cursor Parity). */
const MAX_ITER = 2
const MAX_ITER_CODIGO = 10
const MAX_ITER_INVENTARIO = 6

/** Tools seguras para executar em paralelo no mesmo turno. */
function ehToolLeituraParalela(nome: string): boolean {
  return /^(codigo_ler|projeto_arvore|disco_inspecionar|disco_buscar|codigo_buscar|git_status|git_diff|vault_read|dossie_read|skill_ler|skill_listar|agente_listar|conector_listar|vault_list|navegador_ler|ftp_listar)$/.test(
    String(nome || '')
  )
}

/** Profundidade de executarAgente — bloqueia agente_executar recursivo. */
let profundidadeAgente = 0

export function profundidadeExecucaoAgente(): number {
  return profundidadeAgente
}

export interface PassoAgente {
  tipo: 'tool' | 'texto'
  nome?: string
  args?: Record<string, unknown>
  resultado?: string
  texto?: string
}

export interface TentativaProvider {
  provider: string
  resultado: string
}

/** Categoria para faixa de progresso estilo Cursor Agent. */
export type CategoriaToolAgente = 'edit' | 'search' | 'explore' | 'command' | 'tool'

export function classificarToolAgente(nome: string): CategoriaToolAgente {
  const id = String(nome || '').toLowerCase()
  if (/codigo_editar|vault_write|dossie_write|ftp_deploy/.test(id)) return 'edit'
  if (/codigo_buscar|disco_buscar|busca/.test(id)) return 'search'
  if (
    /codigo_ler|projeto_arvore|disco_inspecionar|git_status|git_diff|vault_read|dossie_read|skill_ler|listar|navegador_ler/.test(
      id
    )
  ) {
    return 'explore'
  }
  if (/terminal_exec|testes_rodar|qualidade_checar|projeto_smoke|navegador_|git_commit|resultado_avaliar/.test(id)) {
    return 'command'
  }
  return 'tool'
}

export type EventoAgente =
  | { tipo: 'status'; texto: string; raiz?: string; modelo?: string; elapsedMs?: number }
  | {
      tipo: 'tool'
      nome: string
      fase: 'inicio' | 'fim'
      detalhe?: string
      categoria?: CategoriaToolAgente
      raiz?: string
    }
  | { tipo: 'texto'; texto: string; raiz?: string }
  | { tipo: 'texto-delta'; texto: string; raiz?: string }
  | { tipo: 'proposta'; id: string; path: string; raiz?: string }
  | {
      tipo: 'stats'
      edits: number
      explored: number
      searches: number
      tools: number
      commands: number
      raiz?: string
    }
  | {
      tipo: 'heartbeat'
      passo: number
      max: number
      modelo: string
      elapsedMs: number
      raiz?: string
    }

export interface RespostaAgente {
  texto: string
  modelo: string
  passos: PassoAgente[]
  tentativas?: TentativaProvider[]
  duracaoMs?: number
  ok?: boolean
  erro?: { codigo: string; mensagem: string; acao?: string; detalhe?: string }
  propostas?: Array<{ id: string; path: string; absPath: string; unifiedDiff: string }>
}

export interface OpcoesExecutarAgente {
  modeloForcado?: string
  agente?: string
  tarefa?: Tarefa
  /** plan = só plano em markdown, sem tools; agent = loop com MCP */
  modo?: 'plan' | 'agent'
  /** Contexto extra (@projeto etc.) injetado no system */
  contextoExtra?: string
  /** Se true (default no painel), writes viram propostas em vez de disco */
  proposeWrites?: boolean
  pastas?: string[]
  onEvent?: (ev: EventoAgente) => void
  signal?: AbortSignal
}

export { escolherModelo, detectarGpu } from './ollama'

const SYSTEM = `Voce e o DG Editor Agent — espelho do Cursor Agent em TODO turno
(inventar, modificar, corrigir, melhorar, editar, analisar, buscar, validar).

Modo Agent automatico: encadeie explorar → editar → validar no mesmo turno, sem pedir confirmacao
a cada passo. So pare para risco alto (deletar em massa, deploy prod, credenciais).

Padrao Cursor (obrigatorio):
1. Entenda o pedido → chame tools → entregue o RESULTADO no mesmo turno.
2. Nao diga "posso", "vou verificar", "deseja que eu" — faca e mostre.
3. Leitura/listagem/status/busca/diagnostico/inventario: execute direto, sem confirmacao.
4. Edicao/correcao/melhoria: leia com tools → edite com tools → mostre o que mudou (diff/trecho).
5. Nunca invente arquivo, linha, caminho ou saida de comando — so o que a tool devolveu.
6. Se o pedido tiver checklist/blocos/N linhas: complete TODOS; falta = NÃO ENCONTRADO.
7. Falso positivo (ex.: Windows Autopilot no lugar do projeto): descarte e continue a busca.
8. Resposta final: curta, em portugues do Brasil, um bloco limpo (estilo Cursor), so o util.
9. Tool falhou: diga o erro e tente alternativa no mesmo turno.
10. NUNCA colocar nome do modelo (ollama:/qwen/…) no corpo da resposta.`

/**
 * Modelos pequenos (3b) as vezes escrevem o tool_call como TEXTO em vez de
 * emitir tool_calls estruturado. Esta funcao detecta esse caso e devolve
 * { nome, args } para execucao manual do loop.
 * Aceita: {"name":"x","arguments":{...}} ou {"name":"x"} isolado no texto.
 */
function extrairToolDoTexto(
  texto: string,
  toolsDisponiveis: McpTool[]
): { nome: string; args: Record<string, unknown> } | null {
  dglog(
    '[extrairToolDoTexto] len=' +
      (texto ? texto.length : 0) +
      ' input=' +
      JSON.stringify(texto ? texto.slice(0, 200) : '')
  )
  if (!texto) return null
  const nomes = new Set(toolsDisponiveis.map((t) => t.name))

  // Remove cercas markdown ```json ... ``` antes de parsear
  let limpo = texto.trim()
  const cerca = limpo.match(/^```(?:json|JSON)?\s*([\s\S]*?)```\s*$/)
  if (cerca) limpo = cerca[1].trim()

  // Varredura com balanceamento de chaves: resiste a objetos aninhados.
  const blocos = extrairBlocosJson(limpo)

  for (const raw of blocos) {
    let obj: unknown
    try { obj = JSON.parse(raw) } catch { continue }
    if (!obj || typeof obj !== 'object') continue

    // formato A: { name, arguments } / { name, parameters }
    const o = obj as Record<string, unknown>
    const nome = typeof o.name === 'string' ? (o.name as string) : ''
    if (nome && nomes.has(nome)) {
      const bruto = (o.arguments ?? o.parameters) as unknown
      const args = bruto && typeof bruto === 'object' && !Array.isArray(bruto)
        ? (bruto as Record<string, unknown>)
        : {}
      return { nome, args }
    }

    // formato B: { "projeto_arvore": {...} }  (nome como chave)
    for (const k of Object.keys(o)) {
      if (nomes.has(k)) {
        const v = o[k]
        const args = v && typeof v === 'object' && !Array.isArray(v)
          ? (v as Record<string, unknown>)
          : {}
        return { nome: k, args }
      }
    }
  }

  // formato C: citacao da tool por nome, sem JSON valido.
  // Ex: 'projeto_arvore({"profundidade": 2})' ou 'tool: projeto_arvore'
  for (const nome of nomes) {
    const idx = limpo.indexOf(nome)
    if (idx < 0) continue
    const resto = limpo.slice(idx + nome.length)
    const paren = resto.match(/^\s*\(/)
    if (!paren) continue
    const abre = idx + nome.length + resto.indexOf('(')
    const argsTxt = extrairPrimeiroBloco(limpo, abre, '(', ')')
    if (argsTxt === null) continue
    try {
      const parsed = JSON.parse(argsTxt)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { nome, args: parsed as Record<string, unknown> }
      }
    } catch { return { nome, args: {} } }
  }

  dglog('[extrairToolDoTexto] nenhum tool_call reconhecido')
  return null
}

/**
 * Localiza blocos JSON validos no texto respeitando aninhamento de chaves.
 * IMPORTANTE: devolve o bloco COM as chaves externas — extrairPrimeiroBloco
 * retorna so o miolo; sem reembrulhar, JSON.parse falha.
 */
function extrairBlocosJson(texto: string): string[] {
  const saida: string[] = []
  let i = 0
  while (i < texto.length) {
    const abre = texto.indexOf('{', i)
    if (abre < 0) break
    const miolo = extrairPrimeiroBloco(texto, abre, '{', '}')
    if (miolo === null) { i = abre + 1; continue }
    saida.push('{' + miolo + '}')
    i = abre + miolo.length + 2
  }
  return saida
}

/** Extrai o conteudo entre o delimitador de abertura e o fechamento correspondente. */
function extrairPrimeiroBloco(
  texto: string,
  posAbre: number,
  abre: string,
  fecha: string
): string | null {
  if (texto[posAbre] !== abre) return null
  let nivel = 0
  let dentroString = false
  let escape = false
  for (let i = posAbre; i < texto.length; i++) {
    const c = texto[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { dentroString = !dentroString; continue }
    if (dentroString) continue
    if (c === abre) nivel++
    else if (c === fecha) {
      nivel--
      if (nivel === 0) return texto.slice(posAbre + 1, i)
    }
  }
  return null
}

function pareceJsonTool(texto: string): boolean {
  const t = (texto || '').trim()
  if (!t) return false
  if (/^```/.test(t)) return true
  return /^\s*\{\s*"name"\s*:/.test(t) || /^\s*\{\s*"\w+"\s*:\s*\{/.test(t)
}

function extrairTextoUtilTool(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  try {
    const j = JSON.parse(t) as { ok?: boolean; texto?: string; stdout?: string; output?: string; erro?: string }
    if (j && typeof j === 'object') {
      const corpo = String(j.texto || j.stdout || j.output || j.erro || '').trim()
      if (corpo) return corpo
    }
  } catch {
    /* nao e json puro */
  }
  // Evita eco tecnico "A tool X retornou"
  if (/A tool ["']/i.test(t) || /retornou \d+ linhas/i.test(t)) {
    const m = t.match(/"texto"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (m) {
      try {
        return JSON.parse('"' + m[1] + '"')
      } catch {
        return m[1].replace(/\\n/g, '\n')
      }
    }
  }
  return t
}

function tokensPedido(pedido: string): string[] {
  return String(pedido || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 4)
}

function textoRelacionadoAoPedido(texto: string, pedido: string): boolean {
  const toks = tokensPedido(pedido)
  if (!toks.length) return true
  const t = String(texto || '').toLowerCase()
  const hits = toks.filter((w) => t.includes(w)).length
  // systeminfo / inventario Windows quando pedido e MySQL/instalar
  if (
    /\b(mysql|mariadb|instalar|install)\b/i.test(pedido) &&
    /\b(hotfix|hypervisor|zerotier|memoria virtual|windows 11|familia 6)\b/i.test(t)
  ) {
    return false
  }
  // Autopilot/Autoplay nunca respondem pedido de projeto (AutoPartz etc.)
  if (
    /(partz|autopartz|auto\s*parts|invent[aá]rio|achar o projeto)/i.test(pedido) &&
    /(autopilot|autoplay|winsxs|\\windows\\)/i.test(t) &&
    !/(composer\.json|routes\.php|oneDrive|auto parts app)/i.test(t)
  ) {
    return false
  }
  return hits >= Math.min(2, toks.length)
}

/** Resposta final estilo Cursor: so o que responde o pedido. */
function sintetizarDeTools(passos: PassoAgente[], pedido: string): string {
  const tools = passos.filter((p) => p.tipo === 'tool' && p.resultado)
  if (tools.length === 0) {
    return 'Nao consegui executar uma acao util para: "' + String(pedido).slice(0, 120) + '". Tente de novo.'
  }
  const uteis: string[] = []
  for (const t of tools) {
    const util = extrairTextoUtilTool(String(t.resultado || '')).trim()
    if (!util) continue
    if (!textoRelacionadoAoPedido(util, pedido)) continue
    uteis.push(util.slice(0, 3500))
  }
  if (!uteis.length) {
    // Pedido tipico de install: nao mentir com systeminfo
    if (/\b(mysql|mariadb)\b/i.test(pedido)) {
      return (
        'Nao consegui instalar ou iniciar MySQL/MariaDB automaticamente neste turno ' +
        '(a verificacao do sistema nao substitui a instalacao). ' +
        'Proximo passo: instalar MariaDB/MySQL no Windows (winget/choco ou instalador oficial) ' +
        'e deixar o servico em execucao; depois peço de novo para eu validar na pasta do projeto.'
      )
    }
    if (/(partz|autopartz|invent[aá]rio|achar o projeto)/i.test(pedido)) {
      return (
        '1. NÃO ENCONTRADO (a busca so trouxe ruido do Windows Autopilot/Autoplay — isso nao e o projeto).\n' +
        '2. NÃO ENCONTRADO\n' +
        '3. NÃO ENCONTRADO\n' +
        '4. NÃO ENCONTRADO\n' +
        '5. NÃO ENCONTRADO\n' +
        'Use disco_buscar com padrao partz|autopartz (raizes: OneDrive/CURSOR, dev, xampp) e complete os blocos.'
      )
    }
    return (
      'As tools rodaram, mas o resultado nao respondeu ao seu pedido: "' +
      String(pedido).slice(0, 160) +
      '". Diga se quer que eu tente de outro jeito na pasta do projeto.'
    )
  }
  return uteis.join('\n\n').trim()
}

function pareceDumpTool(texto: string): boolean {
  const t = String(texto || '')
  return (
    /A tool ["']/i.test(t) ||
    /retornou \d+ linhas/i.test(t) ||
    /Trecho:\s*[\{\[]/i.test(t) ||
    /"ok"\s*:\s*true/.test(t) && /terminal_exec|tool/i.test(t)
  )
}

/** Remove eco de id de modelo no corpo (metadado só em dglog/provider). */
function removerEcoModelo(texto: string, modelo?: string): string {
  let t = String(texto || '')
  if (modelo) {
    const esc = modelo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    t = t.replace(new RegExp('\\b' + esc + '\\b', 'gi'), '')
  }
  // linha propria: "ollama:qwen2.5-coder:3b"
  t = t.replace(/^\s*(?:ollama|openrouter|cursor-cli)\s*:\s*[\w./:+-]+\s*$/gim, '')
  // inline provider:modelo
  t = t.replace(/\b(?:ollama|openrouter|cursor-cli)\s*:\s*[\w./:+-]+/gi, '')
  t = t.replace(/\b(?:modelo|provider)\s*[:=]\s*[\w./:+-]+/gi, '')
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function finalizarAgente(
  raiz: string,
  pergunta: string,
  modelo: string,
  texto: string,
  passos: PassoAgente[]
): Promise<RespostaAgente> {
  let final = texto
  if (
    pareceJsonTool(final) ||
    !final.trim() ||
    pareceDumpTool(final) ||
    !textoRelacionadoAoPedido(final, pergunta)
  ) {
    final = sintetizarDeTools(passos, pergunta)
  }
  final = removerEcoModelo(final, modelo)
  if (pareceDumpTool(final) || pareceJsonTool(final) || !textoRelacionadoAoPedido(final, pergunta)) {
    final = sintetizarDeTools(passos, pergunta)
  }
  try {
    const { resultadoAvaliar, gravarMemoriaProjeto } = await import('../autonomia-tools')
    const resumo = passos
      .filter((p) => p.tipo === 'tool')
      .map((p) => ('nome' in p ? String(p.nome) : ''))
      .filter(Boolean)
      .join(', ')
    const av = resultadoAvaliar(pergunta, final, resumo)
    if (!av.ok && !/revisar|pendente|falhou/i.test(final)) {
      final =
        final +
        '\n\n_Verificação: score ' +
        av.score +
        '/4 — ' +
        String(av.recomendacao || 'revisar') +
        '._'
    }
    gravarMemoriaProjeto(raiz, {})
  } catch {
    /* */
  }
  passos.push({ tipo: 'texto', texto: final })
  appendChat(raiz, { role: 'user', content: pergunta, at: Date.now(), provider: modelo })
  appendChat(raiz, { role: 'assistant', content: final, at: Date.now(), provider: modelo })
  await indexarTurno(raiz, 'user', pergunta)
  await indexarTurno(raiz, 'assistant', final)
  return { texto: final, modelo, passos }
}

async function responderRodada(
  tarefa: Tarefa,
  cfg: ProviderConfig,
  mensagens: Message[],
  toolsAgora: ToolDef[] | undefined,
  emit: (ev: EventoAgente) => void,
  signal?: AbortSignal
): Promise<RespostaProvider> {
  if (signal?.aborted) throw new Error('cancelado')
  const podeStream = !toolsAgora && (cfg.formato === 'ollama' || cfg.formato === 'openai')
  if (podeStream) {
    const system = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n').slice(0, 6000)
    const user = mensagens.filter((m) => m.role !== 'system').map((m) => m.role + ': ' + m.content).join('\n\n').slice(-7000)
    const onDelta = (d: string) => emit({ tipo: 'texto-delta', texto: d })
    try {
      const texto = cfg.formato === 'ollama'
        ? await streamOllamaChat({
            model: cfg.modelo,
            user,
            system,
            numPredict: Math.min(cfg.numPredict || 512, 512),
            timeoutMs: Math.min(cfg.timeoutMs || 60_000, 90_000),
            onDelta
          })
        : await streamOpenAIChat({
            baseUrl: cfg.baseUrl,
            apiKey: String(process.env[cfg.apiKeyEnv || ''] || ''),
            model: cfg.modelo,
            user,
            system,
            numPredict: Math.min(cfg.numPredict || 512, 512),
            timeoutMs: Math.min(cfg.timeoutMs || 60_000, 90_000),
            onDelta
          })
      if (texto.trim()) {
        return { content: texto, tool_calls: [], providerId: cfg.id, modeloUsado: cfg.modelo }
      }
    } catch {
      /* cai no pedido completo via cascata */
    }
  }
  const r = await chamarComCascata(tarefa, mensagens, toolsAgora, signal)
  dglog(
    '[agente] cascata provedor=' + r.providerFinal +
    ' tentativas=' + r.tentativas.join(',')
  )
  return r
}

async function rodarLoopComProvider(
  raiz: string,
  pergunta: string,
  cfg: ProviderConfig,
  tarefa: Tarefa,
  tools: McpTool[],
  systemExtra: string,
  opts?: {
    proposeWrites?: boolean
    pastas?: string[]
    onEvent?: (ev: EventoAgente) => void
    signal?: AbortSignal
    modo?: string
  }
): Promise<RespostaAgente> {
  const mensagens: Message[] = [
    { role: 'system', content: SYSTEM + systemExtra },
    { role: 'user', content: pergunta }
  ]
  const toolDefs: ToolDef[] | undefined = tools.length
    ? tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    : undefined

  const passos: PassoAgente[] = []
  const propostasAcc: NonNullable<RespostaAgente['propostas']> = []
  const assinaturasFeitas = new Set<string>()
  const statsAcc = { edits: 0, explored: 0, searches: 0, tools: 0, commands: 0 }
  let pediuResumo = false
  const labelModelo = cfg.modelo
  const emit = (ev: EventoAgente) => {
    try {
      opts?.onEvent?.(ev)
    } catch {
      /* */
    }
  }

  let maxIter = MAX_ITER
  try {
    const { ehPedidoInventarioDisco } = await import('../disco-inventario')
    if (ehPedidoInventarioDisco(pergunta)) maxIter = MAX_ITER_INVENTARIO
    else if (
      opts?.modo === 'agent' ||
      tarefa === 'codigo' ||
      /\b(implement|implementar|corrig|fix|editar|refator|criar|adicionar|tool|autonom)/i.test(pergunta)
    ) {
      maxIter = MAX_ITER_CODIGO
    }
  } catch {
    /* */
  }

  for (let i = 0; i < maxIter; i++) {
    if (opts?.signal?.aborted) {
      emit({ tipo: 'status', texto: 'cancelado' })
      return {
        texto: 'Execucao cancelada pelo usuario.',
        modelo: labelModelo,
        passos,
        propostas: propostasAcc,
        ok: false
      }
    }
    const passoN = i + 1
    emit({
      tipo: 'status',
      texto: 'Passo ' + passoN + ' de ' + maxIter + ' — chamando ' + labelModelo + '…',
      modelo: labelModelo
    })
    const jaUsouTool = passos.some((p) => p.tipo === 'tool')
    const toolsFeitas = passos.filter((p) => p.tipo === 'tool').length
    const inventarioLongo = maxIter > MAX_ITER
    const ultimaIter = i >= maxIter - 1
    // Parity v2: tools em TODAS as iters exceto a ultima (explore→edit→validate).
    const toolsAgora = ultimaIter ? undefined : toolDefs
    const horaDeResumir =
      jaUsouTool &&
      !pediuResumo &&
      (ultimaIter ||
        (!inventarioLongo && toolsFeitas >= Math.min(4, Math.max(2, maxIter - 1))) ||
        (inventarioLongo && toolsFeitas >= 5))
    if (horaDeResumir) {
      mensagens.push({
        role: 'user',
        content:
          'Pedido do usuario (obrigatorio responder isto): "' +
          pergunta.slice(0, 400) +
          '". Workspace: ' +
          raiz +
          '. Com o resultado das tools, responda em portugues do Brasil, curto e direto AO PEDIDO. ' +
          'Se a tool nao ajudou (ex.: systeminfo/Autopilot quando pediram projeto), diga NÃO ENCONTRADO' +
          (ultimaIter ? '. ' : ' e continue com disco_buscar/codigo_ler se precisar. ') +
          (inventarioLongo
            ? 'Se o pedido tem blocos A/B/C/D ou N linhas, COMPLETE todos — nao pare no Bloco A. '
            : '') +
          'Nao resuma inventarios de Windows. Nao emita JSON.' +
          (ultimaIter
            ? ' Nao chame tools de novo — sintetize a resposta final.'
            : ' Pode chamar mais tools se faltar evidencia.')
      })
      pediuResumo = true
    }

    const tRodada = Date.now()
    const hb = setInterval(() => {
      if (opts?.signal?.aborted) return
      const elapsedMs = Date.now() - tRodada
      emit({
        tipo: 'heartbeat',
        passo: passoN,
        max: maxIter,
        modelo: labelModelo,
        elapsedMs
      })
      emit({
        tipo: 'status',
        texto:
          'Passo ' +
          passoN +
          ' de ' +
          maxIter +
          ' — aguardando modelo (' +
          labelModelo +
          ')…',
        modelo: labelModelo,
        elapsedMs
      })
    }, 2500)
    let r: Awaited<ReturnType<typeof responderRodada>>
    try {
      r = await responderRodada(tarefa, cfg, mensagens, toolsAgora, emit, opts?.signal)
    } finally {
      clearInterval(hb)
    }
    if (r.content) emit({ tipo: 'texto', texto: r.content.slice(0, 2000) })

    let chamadas = r.tool_calls
      .map((c) => {
        const name = typeof c.function?.name === 'string' ? c.function.name.trim() : ''
        return { function: { name, arguments: normalizarArgs(c.function.arguments) } }
      })
      .filter((c) => c.function.name.length > 0 && c.function.name.length <= 128)

    dglog(
      '[agente] iter=' + i + ' provider=' + cfg.id +
      ' | tool_calls=' + chamadas.length +
      ' | content=' + (r.content ? r.content.length + 'c' : 'vazio')
    )

    if (chamadas.length === 0 && r.content && !jaUsouTool) {
      const extraido = extrairToolDoTexto(r.content, tools)
      if (extraido) {
        dglog('[agente] FALLBACK texto->tool: ' + extraido.nome)
        chamadas = [{ function: { name: extraido.nome, arguments: extraido.args } }]
        mensagens.push({
          role: 'assistant',
          content: r.content,
          tool_calls: chamadas.map((c, idx) => ({
            id: 'call_' + idx,
            type: 'function',
            function: {
              name: c.function.name,
              arguments: c.function.arguments
            }
          }))
        })
      }
    }

    if (chamadas.length === 0 && jaUsouTool && pareceJsonTool(r.content || '')) {
      dglog('[agente] modelo repetiu JSON apos tool; sintetizando')
      const fin = await finalizarAgente(raiz, pergunta, labelModelo, '', passos)
      return { ...fin, propostas: propostasAcc }
    }

    if (chamadas.length === 0) {
      dglog('[agente] final apos ' + (i + 1) + ' iteracoes via ' + cfg.id)
      const fin = await finalizarAgente(raiz, pergunta, labelModelo, r.content || '', passos)
      return { ...fin, propostas: propostasAcc }
    }

    if (r.tool_calls.length > 0) {
      mensagens.push({
        role: 'assistant',
        content: r.content || '',
        tool_calls: r.tool_calls.map((c, idx) => ({
          id: 'call_' + idx,
          type: 'function',
          function: {
            name: c.function.name,
            arguments: c.function.arguments
          }
        }))
      })
    }

    const processarChamada = async (ti: number, ch: (typeof chamadas)[0]): Promise<'ok' | 'loop'> => {
      const nomeBruto = ch.function?.name || ''
      const argsBrutos = normalizarArgs(ch.function?.arguments)
      const validado = validarChamadaTool(nomeBruto, argsBrutos, tools)
      if (!validado.ok) {
        const vErr = validado as { ok: false; erro: string; erroApp?: unknown }
        dglog('[agente] tool_call inválida: ' + vErr.erro)
        try {
          const { registrarFalhaTool } = await import('../tools-telemetry')
          registrarFalhaTool(nomeBruto || 'invalida', vErr.erro, raiz)
        } catch {
          /* */
        }
        emit({ tipo: 'tool', nome: nomeBruto || 'invalida', fase: 'fim', detalhe: vErr.erro.slice(0, 180) })
        passos.push({ tipo: 'tool', nome: nomeBruto || 'invalida', args: argsBrutos, resultado: vErr.erro })
        mensagens.push({
          role: 'tool',
          tool_name: nomeBruto || 'invalida',
          tool_call_id: 'call_' + ti,
          name: nomeBruto || 'invalida',
          content: JSON.stringify({ ok: false, erro: vErr.erro, erroApp: vErr.erroApp }).slice(0, 2400)
        })
        return 'ok'
      }
      const { tool, args } = validado
      const nome = tool.name
      if (nome === 'terminal_exec') {
        const linha = (
          String((args as { comando?: string }).comando || '') +
          ' ' +
          (Array.isArray((args as { args?: string[] }).args)
            ? ((args as { args?: string[] }).args || []).join(' ')
            : '')
        ).toLowerCase()
        const pedidoInstal =
          /\b(mysql|mariadb|instalar|install|winget|choco)\b/i.test(pergunta)
        const cmdSistema =
          /\b(systeminfo|get-computerinfo|win32_operatingsystem|hostname|whoami|ipconfig|get-netadapter)\b/i.test(
            linha
          )
        if (pedidoInstal && cmdSistema) {
          const msg =
            'Comando de inventario do Windows ignorado — nao responde ao pedido de instalar/iniciar MySQL/MariaDB.'
          emit({ tipo: 'tool', nome, fase: 'fim', detalhe: msg })
          passos.push({ tipo: 'tool', nome, args, resultado: JSON.stringify({ ok: false, erro: msg }) })
          mensagens.push({
            role: 'tool',
            tool_name: nome,
            tool_call_id: 'call_' + ti,
            name: nome,
            content: JSON.stringify({ ok: false, erro: msg })
          })
          return 'ok'
        }
      }
      const sig = nome + '|' + JSON.stringify(args)
      if (assinaturasFeitas.has(sig)) {
        dglog('[agente] tool repetida ignorada: ' + sig.slice(0, 80))
        return 'loop'
      }
      assinaturasFeitas.add(sig)
      dglog('[agente] tool ' + nome + ' ' + JSON.stringify(args).slice(0, 120))
      const categoria = classificarToolAgente(nome)
      if (categoria === 'edit') statsAcc.edits += 1
      else if (categoria === 'search') statsAcc.searches += 1
      else if (categoria === 'explore') statsAcc.explored += 1
      else if (categoria === 'command') statsAcc.commands += 1
      statsAcc.tools += 1
      emit({ tipo: 'tool', nome, fase: 'inicio', categoria })
      emit({ tipo: 'stats', ...statsAcc })

      let textoRes = ''
      const propostasMod = await import('../agent/propostas')
      const { ehToolEscrita, proporCodigoEditar, proporEscritaCompleta } = propostasMod
      if (opts?.proposeWrites && ehToolEscrita(nome)) {
        const pastas = opts.pastas?.length ? opts.pastas : [raiz]
        if (nome === 'codigo_editar') {
          const p = proporCodigoEditar(raiz, args as { arquivo?: string; ancora?: string; novo?: string }, pastas)
          textoRes = p.texto
          if (p.pendente) {
            propostasAcc.push({
              id: p.pendente.id,
              path: p.pendente.path,
              absPath: p.pendente.absPath,
              unifiedDiff: p.pendente.unifiedDiff
            })
            emit({ tipo: 'proposta', id: p.pendente.id, path: p.pendente.path })
          }
        } else {
          const caminho = String(
            (args as { caminho?: string }).caminho || (args as { path?: string }).path || ''
          )
          const conteudo = String((args as { conteudo?: string }).conteudo ?? '')
          const p = proporEscritaCompleta(raiz, caminho, conteudo, pastas)
          textoRes = p.texto
          if (p.pendente) {
            propostasAcc.push({
              id: p.pendente.id,
              path: p.pendente.path,
              absPath: p.pendente.absPath,
              unifiedDiff: p.pendente.unifiedDiff
            })
            emit({ tipo: 'proposta', id: p.pendente.id, path: p.pendente.path })
          }
        }
      } else {
        if (ehToolEscrita(nome)) {
          try {
            const { criarCheckpoint } = await import('../agent/checkpoint')
            const caminho =
              String(
                (args as { arquivo?: string }).arquivo ||
                  (args as { caminho?: string }).caminho ||
                  (args as { path?: string }).path ||
                  ''
              )
            if (caminho) {
              const abs = caminho.includes('/') || caminho.includes('\\')
                ? caminho
                : raiz + '/' + caminho
              await criarCheckpoint([abs], 'agente:tool:' + nome)
            }
          } catch {
            /* best-effort */
          }
        }
        const res = await chamarTool(nome, args)
        textoRes = res.texto
      }

      try {
        const { filtrarRuidoWindows, pareceRuidoWindows } = await import('../disco-inventario')
        if (pareceRuidoWindows(textoRes) || nome === 'terminal_exec') {
          const limpo = filtrarRuidoWindows(textoRes)
          if (pareceRuidoWindows(textoRes) && (!limpo || limpo.length < 8)) {
            textoRes = JSON.stringify({
              ok: false,
              erro:
                'Resultado era so ruido do Windows (Autopilot/Autoplay/WinSxS). Use disco_buscar. NÃO ENCONTRADO neste comando.',
              brutoDescartado: true
            })
          } else if (limpo && limpo !== textoRes) {
            textoRes = limpo
          }
        }
      } catch {
        /* */
      }

      try {
        const falhou =
          /"ok"\s*:\s*false/.test(textoRes) ||
          /^\s*\{[\s\S]*"erro"\s*:/.test(textoRes.slice(0, 200))
        if (falhou) {
          const { registrarFalhaTool } = await import('../tools-telemetry')
          registrarFalhaTool(nome, textoRes.slice(0, 300), raiz)
        }
      } catch {
        /* */
      }

      emit({ tipo: 'tool', nome, fase: 'fim', detalhe: textoRes.slice(0, 200) })
      passos.push({ tipo: 'tool', nome, args, resultado: textoRes })
      mensagens.push({
        role: 'tool',
        tool_name: nome,
        tool_call_id: 'call_' + ti,
        name: nome,
        content: textoRes.slice(0, 6000)
      })
      return 'ok'
    }

    // Cursor-like: leituras consecutivas no mesmo turno em paralelo; escritas sequenciais.
    let tiCursor = 0
    while (tiCursor < chamadas.length) {
      if (opts?.signal?.aborted) {
        emit({ tipo: 'status', texto: 'cancelado' })
        return {
          texto: 'Execucao cancelada pelo usuario.',
          modelo: labelModelo,
          passos,
          propostas: propostasAcc,
          ok: false
        }
      }
      const nomePeek = chamadas[tiCursor].function?.name || ''
      if (ehToolLeituraParalela(nomePeek)) {
        const inicioBatch = tiCursor
        while (
          tiCursor < chamadas.length &&
          ehToolLeituraParalela(chamadas[tiCursor].function?.name || '')
        ) {
          tiCursor++
        }
        const batchIdx: number[] = []
        for (let t = inicioBatch; t < tiCursor; t++) batchIdx.push(t)
        if (batchIdx.length > 1) {
          emit({
            tipo: 'status',
            texto: 'Lendo ' + batchIdx.length + ' arquivos em paralelo…'
          })
          const resultados = await Promise.all(
            batchIdx.map((t) => processarChamada(t, chamadas[t]))
          )
          if (resultados.includes('loop')) {
            const fin = await finalizarAgente(raiz, pergunta, labelModelo, '', passos)
            return {
              ...fin,
              propostas: propostasAcc,
              ok: false,
              erro: {
                codigo: 'ERR_TOOL_LOOP_CAP',
                mensagem: 'O agente repetiu a mesma ação e foi interrompido.',
                acao: 'Refine o pedido ou tente novamente.'
              } as any
            }
          }
        } else {
          const r1 = await processarChamada(batchIdx[0], chamadas[batchIdx[0]])
          if (r1 === 'loop') {
            const fin = await finalizarAgente(raiz, pergunta, labelModelo, '', passos)
            return {
              ...fin,
              propostas: propostasAcc,
              ok: false,
              erro: {
                codigo: 'ERR_TOOL_LOOP_CAP',
                mensagem: 'O agente repetiu a mesma ação e foi interrompido.',
                acao: 'Refine o pedido ou tente novamente.'
              } as any
            }
          }
        }
      } else {
        const r1 = await processarChamada(tiCursor, chamadas[tiCursor])
        tiCursor++
        if (r1 === 'loop') {
          const fin = await finalizarAgente(raiz, pergunta, labelModelo, '', passos)
          return {
            ...fin,
            propostas: propostasAcc,
            ok: false,
            erro: {
              codigo: 'ERR_TOOL_LOOP_CAP',
              mensagem: 'O agente repetiu a mesma ação e foi interrompido.',
              acao: 'Refine o pedido ou tente novamente.'
            } as any
          }
        }
      }
    }
  }

  dglog('[agente] limite de iteracoes; sintetizando')
  const fin = await finalizarAgente(raiz, pergunta, labelModelo, '', passos)
  return { ...fin, propostas: propostasAcc, ok: false, erro: { codigo: 'ERR_TOOL_LOOP_CAP', mensagem: 'O agente atingiu o limite de etapas.', acao: 'Divida o pedido em partes menores e tente novamente.' } as any }
}

export async function executarAgente(
  raiz: string,
  pergunta: string,
  modeloForcadoOuOpcoes?: string | OpcoesExecutarAgente
): Promise<RespostaAgente> {
  const opcoes: OpcoesExecutarAgente =
    typeof modeloForcadoOuOpcoes === 'string'
      ? { modeloForcado: modeloForcadoOuOpcoes }
      : modeloForcadoOuOpcoes || {}

  // Se o caller passou um signal (ex.: orquestrador com timeout próprio), respeita-o
  // SEM criar timeout interno próprio (evita conflito com o do orquestrador).
  // Caso contrário, cria um AbortController interno com timeout de 30s.
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  if (!opcoes.signal) {
    const controller = new AbortController()
    timeoutId = setTimeout(() => controller.abort(), 30_000)
    opcoes.signal = controller.signal
  }

  if (profundidadeAgente > 0) {
    throw new Error(
      'Recursao bloqueada: agente_executar/executarAgente nao pode ser chamado de dentro de outro executarAgente'
    )
  }

  profundidadeAgente++
  const tInicio = Date.now()
  const tentativasOut: TentativaProvider[] = []

  try {
    const tarefa: Tarefa = opcoes.tarefa || 'codigo'
    const modeloForcado = opcoes.modeloForcado
    garantirSkillsPadrao(raiz)
    garantirAgentesPadrao(raiz)

    const agenteId = opcoes.agente || 'revisor'
    const ag = lerAgente(raiz, agenteId)
    const blocoAgente = ag
      ? '\n\n### AGENTE ATIVO: ' + ag.nome + '\nEspecialidade: ' + ag.especialidade +
        (ag.skills.length ? '\nSkills: ' + ag.skills.join(', ') : '') +
        '\n\n' + ag.system.slice(0, tarefa === 'codigo' ? 1200 : 8000)
      : ''

    const ctx = await montarContexto(raiz, pergunta)
    const memoria = blocoMemoria(ctx)
    let blocoFatos = ''
    try {
      const { textoMemoriasAceitas } = await import('../memorias')
      const fatos = textoMemoriasAceitas(raiz)
      if (fatos) blocoFatos = '\n\n### FATOS ACEITOS\n' + fatos
    } catch { /* opcional */ }
    const skills = skillsAtivasParaTurno(raiz, pergunta, ag?.skills || [])
    const blocoSkills = skills.length
      ? '\n\n### SKILLS ATIVAS\n' + skills.map((s) => '- ' + s.titulo + ': ' + s.instrucao.slice(0, tarefa === 'codigo' ? 500 : 2000)).join('\n')
      : ''
    const modo = opcoes.modo === 'plan' ? 'plan' : 'agent'
    const proposeWrites = opcoes.proposeWrites !== false && modo === 'agent'
    const blocoPlan =
      modo === 'plan'
        ? '\n\n### MODO PLAN\nVoce esta em modo PLAN. NAO chame tools. NAO edite arquivos. ' +
          'Responda APENAS com um plano em markdown: objetivo, passos numerados, ' +
          'arquivos envolvidos, riscos. Aguarde aprovacao humana antes de executar.'
        : ''
    const blocoPropose = proposeWrites
      ? '\n\n### MODO PROPOSTA\nEdicoes (codigo_editar/vault_write/dossie_write) NAO gravam no disco: ' +
        'viram propostas para o usuario aprovar. Voce pode chamar essas tools normalmente; ' +
        'o runtime convertera em diff pendente.'
      : ''
    let blocoMapa = ''
    try {
      const { mapaCompacto } = await import('../mapa-projeto')
      const { regrasParaContexto } = await import('../regras-escopo')
      const citados = pergunta.match(/[\w./\\-]+\.(?:ts|js|php|css|html|py|json|md)/gi) || []
      const mapa = mapaCompacto(raiz, tarefa === 'codigo' ? 2200 : 1400)
      blocoMapa =
        '\n\n### REPOSITORIO ATIVO\n' +
        raiz +
        '\n### MAPA DO PROJETO (so estrutura)\n' +
        mapa +
        regrasParaContexto(raiz, citados, pergunta, tarefa === 'codigo' ? 1600 : 900)
    } catch {
      /* mapa opcional */
    }
    const extraCheio = opcoes.contextoExtra || ''
    const extra = tarefa === 'codigo' ? extraCheio.slice(0, 3500) : extraCheio
    let blocoRegrasGerais = ''
    try {
      const { obterRegrasAtivas } = await import('../regras-gerais')
      const rg = obterRegrasAtivas()
      if (rg) blocoRegrasGerais = '\n\n### REGRAS GERAIS\n' + rg
    } catch {
      /* opcional */
    }
    const ancoraWorkspace =
      '\n\n### WORKSPACE ATIVO (obrigatorio)\n' +
      'Pasta selecionada no Bloco 1: ' +
      raiz +
      '\nTodo codigo, terminal e analise DEVEM usar esta pasta. Nao invente outro projeto. ' +
      'Nao rode systeminfo/Get-ComputerInfo a menos que o usuario peca explicitamente status do PC.\n'

    let blocoInventario = ''
    try {
      const { ehPedidoInventarioDisco, blocoPromptInventario } = await import('../disco-inventario')
      if (ehPedidoInventarioDisco(pergunta)) blocoInventario = blocoPromptInventario()
    } catch {
      /* */
    }

    const systemExtra =
      ancoraWorkspace +
      blocoInventario +
      blocoAgente +
      blocoRegrasGerais +
      (memoria ? '\n\n' + memoria : '') +
      blocoFatos +
      blocoSkills +
      blocoPlan +
      blocoPropose +
      blocoMapa +
      (extra ? '\n\n' + extra : '')

    let tools: McpTool[] = []
    if (modo === 'agent') {
      try {
        process.env.DG_ROOT = path.resolve(raiz)
        await garantirMcpNaRaiz(raiz)
        tools = await listarTools()
        // Anti-recursao: nunca expor agente_executar ao loop interno
        tools = tools.filter((t) => t.name !== 'agente_executar')
        dglog('[agente] ' + tools.length + ' tools disponiveis (sem agente_executar) raiz=' + raiz)
      } catch (e) {
        dglog('[agente] MCP indisponivel: ' + String(e))
      }
    } else {
      dglog('[agente] modo plan — tools desligadas')
    }

    void garantirCatalogoOpenRouter()

    let fila: ProviderConfig[]
    try {
      fila = filaPronta(tarefa, { pedido: pergunta })
    } catch (e) {
      throw e
    }
    if (modeloForcado) {
      const onlineSlug = modeloForcado.includes('/')
      const forcado: ProviderConfig = onlineSlug
        ? {
            id: 'forcado:' + modeloForcado,
            tipo: 'online',
            formato: 'openai',
            modelo: modeloForcado,
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKeyEnv: 'OPENROUTER_API_KEY',
            numPredict: 2048,
            timeoutMs: 300_000
          }
        : {
            id: 'forcado:' + modeloForcado,
            tipo: 'local',
            formato: 'ollama',
            modelo: modeloForcado,
            baseUrl: 'http://127.0.0.1:11434',
            numPredict: 1024,
            timeoutMs: 300_000
          }
      fila = [forcado, ...fila.filter((p) => p.modelo !== modeloForcado)]
    }

    const maxTentativas = fila.length
    let saltos = 0
    const MAX_SALTOS = 5

    for (let pi = 0; pi < maxTentativas; pi++) {
      const cfg = fila[pi]
      const st = disponivel(cfg)
      if (st !== 'ok') {
        const motivo = st
        try {
          process.stderr.write('[dg-fila] pulando ' + cfg.id + '/' + cfg.modelo + ' motivo=' + motivo + '\n')
        } catch { /* */ }
        dglog('[provider] tarefa=' + tarefa + ' tentou=' + cfg.id + ' motivo=' + motivo + ' resultado=pulado')
        appendFailoverLog(raiz, { tarefa, tentou: cfg.id, motivo, resultado: 'pulado' })
        tentativasOut.push({ provider: cfg.id, resultado: 'pulado: ' + motivo })
        saltos++
        if (saltos >= MAX_SALTOS) break
        continue
      }
      if (cfg.tipo === 'local' && /:(?:7|14)b\b/.test(cfg.modelo)) {
        const { guardianPodeOperar } = await import('../guardian')
        if (!guardianPodeOperar()) {
          dglog('[provider] guardiao segurou ' + cfg.modelo)
          tentativasOut.push({ provider: cfg.id, resultado: 'pulado: guardiao' })
          saltos++
          if (saltos >= MAX_SALTOS) break
          continue
        }
      }

      let retriesServer = 0
      while (retriesServer < 2) {
        const t0 = Date.now()
        try {
          dglog(
            '[provider] tarefa=' + tarefa + ' tentou=' + cfg.id +
            ' motivo=tentativa resultado=...'
          )
          const resp = await rodarLoopComProvider(raiz, pergunta, cfg, tarefa, tools, systemExtra, {
            proposeWrites,
            pastas: opcoes.pastas,
            onEvent: opcoes.onEvent,
            signal: opcoes.signal,
            modo: opcoes.modo
          })
          const ms = Date.now() - t0
          dglog(
            '[provider] tarefa=' + tarefa + ' tentou=' + cfg.id +
            ' motivo=ok resultado=ok'
          )
          appendFailoverLog(raiz, {
            tarefa,
            tentou: cfg.id,
            motivo: 'ok modelo=' + resp.modelo,
            resultado: 'ok',
            ms
          })
          tentativasOut.push({ provider: cfg.id, resultado: 'ok' })
          return {
            ...resp,
            ok: true,
            tentativas: tentativasOut,
            duracaoMs: Date.now() - tInicio
          }
        } catch (e) {
          const ms = Date.now() - t0
          const err = e instanceof ErroProvider
            ? e
            : new ErroProvider('outro', String(e), cfg.id)
          const kind = err.kind
          const motivo = kind + ': ' + err.message.slice(0, 160)
          dglog(
            '[provider] tarefa=' + tarefa + ' tentou=' + cfg.id +
            ' motivo=' + motivo + ' resultado=falhou'
          )
          appendFailoverLog(raiz, { tarefa, tentou: cfg.id, motivo, resultado: 'falhou', ms })
          tentativasOut.push({ provider: cfg.id, resultado: 'falhou: ' + motivo })

          if (kind === 'modelo_morto') {
            try {
              process.stderr.write(
                '[dg-failover] ' + cfg.id + '/' + cfg.modelo + ' morto, tentando proximo\n'
              )
            } catch { /* */ }
            saltos++
            if (saltos >= MAX_SALTOS) {
              break
            }
            break // proximo da fila
          }
          if (kind === 'rate_limit' || kind === 'auth' || kind === 'timeout') {
            saltos++
            if (saltos >= MAX_SALTOS) break
            break
          }
          if (kind === 'server' || kind === 'rede') {
            retriesServer++
            if (retriesServer < 2) {
              dglog('[provider] retentativa no mesmo provider ' + cfg.id)
              continue
            }
            saltos++
            if (saltos >= MAX_SALTOS) break
            break
          }
          saltos++
          if (saltos >= MAX_SALTOS) break
          break
        }
      }
      if (saltos >= MAX_SALTOS) break
    }

    const lista = tentativasOut.map((t) => t.provider + ' (' + t.resultado + ')').join('; ')
    throw new Error(
      'Fila esgotada para tarefa=' + tarefa + '. Tentados: ' + (lista || '(nenhum)')
    )
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    profundidadeAgente--
  }
}

export async function historico(raiz: string) {
  return loadChat(raiz)
}
