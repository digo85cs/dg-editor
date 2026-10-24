import { chamarTool, listarTools, type McpTool } from '../mcp/client'
import { montarContexto, blocoMemoria } from '../memory/hybrid'
import { indexarTurno } from '../memory/embeddings'
import { dglog } from '../dglog'
import { loadChat, appendChat } from '../chatstore'
import { OLLAMA_URL, escolherModelo, ollamaHttpJson } from './ollama'
import { garantirSkillsPadrao, skillsRelevantes } from './skills'
import { garantirAgentesPadrao } from './agentes'

/**
 * Agente do DG Editor: modelo local (Ollama) + tools do MCP interno.
 * Loop de tool-calling no padrao OpenAI/Ollama.
 * Sem chamada externa: tudo em 127.0.0.1.
 */

const MAX_ITER = 6

export interface PassoAgente {
  tipo: 'tool' | 'texto'
  nome?: string
  args?: Record<string, unknown>
  resultado?: string
  texto?: string
}

export interface RespostaAgente {
  texto: string
  modelo: string
  passos: PassoAgente[]
}

export { escolherModelo, detectarGpu } from './ollama'

interface MensagemOllama {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
  tool_name?: string
}

const SYSTEM = `Voce e o DG, agente interno do DG Editor.
Voce opera o projeto localmente usando ferramentas (tools) do MCP interno.
Regras:
- Use as tools para ler e escrever arquivos do projeto, consultar o dossie e a arvore.
- Nunca invente conteudo de arquivo: leia antes de afirmar.
- Respostas curtas, tecnicas, em portugues do Brasil.
- Se a tool falhar, relate o erro e proponha alternativa.`

/**
 * Modelos pequenos em CPU confundem o schema da tool com os argumentos,
 * achatando "type: object / properties / required" dentro do valor.
 * Esta funcao remove esses artefatos e mantem so os valores reais.
 */
/** Ollama as vezes devolve arguments como STRING JSON. Normaliza para objeto. */
function normalizarArgs(bruto: unknown): Record<string, unknown> {
  if (!bruto) return {}
  if (typeof bruto === 'string') {
    const s = bruto.trim()
    if (!s) return {}
    try {
      const p = JSON.parse(s)
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch { /* nao e JSON valido */ }
    return {}
  }
  if (typeof bruto === 'object' && !Array.isArray(bruto)) return bruto as Record<string, unknown>
  return {}
}
function sanitizarArgs(
  brutos: Record<string, unknown>,
  schema: unknown
): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  const props = (schema as { properties?: Record<string, { type?: string }> })?.properties || {}

  // chaves que sao metadados de schema, jamais argumentos reais
  const lixo = new Set(['type', 'description', 'properties', 'required', 'object', 'nil', '[]', 'Lista', 'lista'])

  for (const [k, v] of Object.entries(brutos)) {
    if (lixo.has(k)) continue
    const def = props[k]

    // se nao esta no schema, mas e um valor escalar valido, aceita
    if (!def) {
      if (v === null || v === undefined) continue
      if (typeof v === 'object') {
        // objeto aninhado de schema: descarta
        const pareceSchema = typeof v === 'object' && v !== null &&
          ('type' in (v as object) || 'properties' in (v as object))
        if (pareceSchema) continue
      }
      saida[k] = v
      continue
    }

    // coage ao tipo declarado
    if (def.type === 'integer' || def.type === 'number') {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      if (!Number.isNaN(n)) saida[k] = n
    } else if (def.type === 'string') {
      if (typeof v === 'string') saida[k] = v
      else if (v !== null && v !== undefined) saida[k] = String(v)
    } else if (def.type === 'boolean') {
      saida[k] = v === true || v === 'true'
    } else if (def.type === 'array' && Array.isArray(v)) {
      saida[k] = v
    } else if (def.type === 'object' && typeof v === 'object' && v !== null) {
      const pareceSchema = 'type' in (v as object) || 'properties' in (v as object)
      if (!pareceSchema) saida[k] = v
    }
  }
  return saida
}
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
}function toolsParaOllama(tools: McpTool[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || t.name,
      parameters: t.inputSchema || { type: 'object', properties: {} }
    }
  }))
}

function pareceJsonTool(texto: string): boolean {
  const t = (texto || '').trim()
  if (!t) return false
  if (/^```/.test(t)) return true
  return /^\s*\{\s*"name"\s*:/.test(t) || /^\s*\{\s*"\w+"\s*:\s*\{/.test(t)
}

function sintetizarDeTools(passos: PassoAgente[]): string {
  const tools = passos.filter((p) => p.tipo === 'tool' && p.resultado)
  if (tools.length === 0) return 'Nao obtive resultado das ferramentas.'
  const partes: string[] = []
  for (const t of tools) {
    const linhas = String(t.resultado || '').split(/\r?\n/).filter((l) => l.trim().length > 0)
    partes.push(
      'A tool "' + t.nome + '" retornou ' + linhas.length + ' linhas.' +
      (linhas.length > 0 ? ' Trecho:\n' + linhas.slice(0, 30).join('\n') : '')
    )
  }
  return partes.join('\n\n')
}

async function finalizarAgente(
  raiz: string,
  pergunta: string,
  modelo: string,
  texto: string,
  passos: PassoAgente[]
): Promise<RespostaAgente> {
  let final = texto
  if (pareceJsonTool(final) || !final.trim()) {
    final = sintetizarDeTools(passos)
  }
  passos.push({ tipo: 'texto', texto: final })
  appendChat(raiz, { role: 'user', content: pergunta, at: Date.now(), provider: modelo })
  appendChat(raiz, { role: 'assistant', content: final, at: Date.now(), provider: modelo })
  await indexarTurno(raiz, 'user', pergunta)
  await indexarTurno(raiz, 'assistant', final)
  return { texto: final, modelo, passos }
}

export async function executarAgente(
  raiz: string,
  pergunta: string,
  modeloForcado?: string
): Promise<RespostaAgente> {
  const modelo = modeloForcado || (await escolherModelo('codigo'))
  dglog('[agente] modelo=' + modelo)

  garantirSkillsPadrao(raiz)
  garantirAgentesPadrao(raiz)

  const ctx = await montarContexto(raiz, pergunta)
  const memoria = blocoMemoria(ctx)
  const skills = skillsRelevantes(raiz, pergunta)
  const blocoSkills = skills.length
    ? '\n\n### SKILLS ATIVAS\n' + skills.map((s) => '- ' + s.titulo + ': ' + s.instrucao).join('\n')
    : ''

  let tools: McpTool[] = []
  try {
    tools = await listarTools()
    dglog('[agente] ' + tools.length + ' tools disponiveis')
  } catch (e) {
    dglog('[agente] MCP indisponivel: ' + String(e))
  }

  const mensagens: MensagemOllama[] = [
    { role: 'system', content: SYSTEM + (memoria ? '\n\n' + memoria : '') + blocoSkills },
    { role: 'user', content: pergunta }
  ]

  const passos: PassoAgente[] = []
  const assinaturasFeitas = new Set<string>()
  let pediuResumo = false

  for (let i = 0; i < MAX_ITER; i++) {
    const jaUsouTool = passos.some((p) => p.tipo === 'tool')
    const corpo: Record<string, unknown> = {
      model: modelo,
      messages: mensagens,
      stream: false,
      options: { temperature: 0.3, num_ctx: 8192 }
    }
    // Apos a primeira tool, nao oferece mais tools: forca linguagem natural.
    if (tools.length > 0 && !jaUsouTool) corpo.tools = toolsParaOllama(tools)
    if (jaUsouTool && !pediuResumo) {
      mensagens.push({
        role: 'user',
        content: 'Com o resultado da tool acima, responda em portugues do Brasil, em linguagem natural. Nao emita JSON nem chame tools de novo.'
      })
      pediuResumo = true
    }

    const r = (await ollamaHttpJson(OLLAMA_URL + '/api/chat', corpo, 'POST', 180000)) as {
      message?: MensagemOllama
      done?: boolean
    }
    const msg = r.message
    if (!msg) throw new Error('resposta vazia do Ollama')

    let chamadas = (msg.tool_calls || []).map((c) => ({
      function: {
        name: String((c as { function?: { name?: string } }).function?.name || ''),
        arguments: normalizarArgs((c as { function?: { arguments?: unknown } }).function?.arguments)
      }
    })).filter((c) => c.function.name)

    dglog('[agente] iter=' + i + ' | tool_calls=' + chamadas.length +
      ' | content=' + (msg.content ? msg.content.length + 'c' : 'vazio'))

    if (chamadas.length === 0 && msg.content && !jaUsouTool) {
      const extraido = extrairToolDoTexto(msg.content, tools)
      if (extraido) {
        dglog('[agente] FALLBACK texto->tool: ' + extraido.nome)
        chamadas = [{ function: { name: extraido.nome, arguments: extraido.args } }]
        mensagens.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: chamadas
        })
      }
    }

    // Modelo insistiu em JSON de tool depois de ja ter resultado: sintetiza e fecha.
    if (chamadas.length === 0 && jaUsouTool && pareceJsonTool(msg.content || '')) {
      dglog('[agente] modelo repetiu JSON apos tool; sintetizando')
      return finalizarAgente(raiz, pergunta, modelo, '', passos)
    }

    if (chamadas.length === 0) {
      dglog('[agente] final apos ' + (i + 1) + ' iteracoes')
      return finalizarAgente(raiz, pergunta, modelo, msg.content || '', passos)
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      mensagens.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })
    }

    for (const ch of chamadas) {
      const nome = ch.function?.name || ''
      const schemaDaTool = tools.find((t) => t.name === nome)?.inputSchema
      const args = sanitizarArgs(
        normalizarArgs(ch.function?.arguments),
        schemaDaTool
      )
      const sig = nome + '|' + JSON.stringify(args)
      if (assinaturasFeitas.has(sig)) {
        dglog('[agente] tool repetida ignorada: ' + sig.slice(0, 80))
        return finalizarAgente(raiz, pergunta, modelo, '', passos)
      }
      assinaturasFeitas.add(sig)
      dglog('[agente] tool ' + nome + ' ' + JSON.stringify(args).slice(0, 120))
      const res = await chamarTool(nome, args)
      passos.push({ tipo: 'tool', nome, args, resultado: res.texto })
      mensagens.push({
        role: 'tool',
        tool_name: nome,
        content: res.texto.slice(0, 6000)
      })
    }
  }

  dglog('[agente] limite de iteracoes; sintetizando')
  return finalizarAgente(raiz, pergunta, modelo, '', passos)
}

export async function historico(raiz: string) {
  return loadChat(raiz)
}
