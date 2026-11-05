/**
 * REGRA FIXA DA AUDITORIA — integracao das ferramentas do DG Editor.
 * Cada botao ou canal exposto na interface precisa existir no preload
 * e ter handler no processo principal. A conferencia le o texto-fonte,
 * linha a linha, e nao carrega modelo.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

export type AchadoIntegracao = {
  id: string
  area: 'integracao'
  titulo: string
  severidade: 'ok' | 'warn' | 'erro'
  detalhe?: string
  corrigivel: false
  status: 'nao-aplicavel'
}

function linhaDe(texto: string, trecho: string): number {
  const i = texto.indexOf(trecho)
  if (i < 0) return -1
  return texto.slice(0, i).split(/\n/).length
}

function ler(raiz: string, rel: string): string {
  const abs = join(raiz, rel)
  if (!existsSync(abs)) return ''
  return readFileSync(abs, 'utf8')
}

function achado(
  id: string,
  titulo: string,
  ok: boolean,
  detalhe: string,
  erro = false
): AchadoIntegracao {
  return {
    id,
    area: 'integracao',
    titulo,
    severidade: ok ? 'ok' : (erro ? 'erro' : 'warn'),
    detalhe,
    corrigivel: false,
    status: 'nao-aplicavel'
  }
}

function trecho(raiz: string, rel: string, busca: string, id: string, titulo: string): AchadoIntegracao {
  const texto = ler(raiz, rel)
  const linha = texto ? linhaDe(texto, busca) : -1
  if (linha < 0) {
    return achado(id, titulo, false, rel + ' sem "' + busca + '"', true)
  }
  const excerpt = texto.split(/\n/)[linha - 1].trim().slice(0, 180)
  return achado(id, titulo, true, rel + ':' + linha + ' ' + excerpt)
}

function listarFontes(dir: string, acc: string[] = []): string[] {
  let nomes: string[] = []
  try { nomes = readdirSync(dir) } catch { return acc }
  for (const nome of nomes) {
    if (nome === 'node_modules' || nome === 'out' || nome === 'dist') continue
    const abs = join(dir, nome)
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) listarFontes(abs, acc)
    else if (/\.(ts|js)$/.test(nome)) acc.push(abs)
  }
  return acc
}

function handlerDoCanal(raiz: string, canal: string): { arquivo: string; linha: number; excerpt: string } | null {
  const fontes = listarFontes(join(raiz, 'src', 'main'))
  const busca = "handle('" + canal + "'"
  const busca2 = 'handle("' + canal + '"'
  for (const abs of fontes) {
    const texto = readFileSync(abs, 'utf8')
    const linha = linhaDe(texto, busca) >= 0 ? linhaDe(texto, busca) : linhaDe(texto, busca2)
    if (linha < 0) continue
    const rel = abs.slice(raiz.length + 1).replace(/\\/g, '/')
    return { arquivo: rel, linha, excerpt: texto.split(/\n/)[linha - 1].trim().slice(0, 180) }
  }
  return null
}

export function checarIntegracaoFerramentas(raiz: string): AchadoIntegracao[] {
  const out: AchadoIntegracao[] = []
  const pontos: Array<[string, string, string, string]> = [
    ['integracao:registro-vault', 'Handlers do Vault registrados no boot', 'src/main/index.ts', 'registerVaultIpc();'],
    ['integracao:registro-openclaw', 'Handlers do OpenClaw registrados no boot', 'src/main/index.ts', 'registerOpenClawIpc();'],
    ['integracao:registro-agent-extra', 'Handlers extras do Agent registrados no boot', 'src/main/index.ts', 'registerAgentExtrasIpc();'],
    ['integracao:tab', 'Completar no editor usa o modelo 1.5b', 'src/main/completar-tab.ts', 'qwen2.5-coder:1.5b'],
    ['integracao:tab-guardiao', 'Completar respeita o guardiao', 'src/main/completar-tab.ts', 'guardianPodeOperar'],
    ['integracao:tab-ipc', 'Canal editor:completar no main', 'src/main/ipc/editor.ts', "ipcMain.handle('editor:completar'"],
    ['integracao:tab-ui', 'Editor pede editor:completar', 'src/renderer/editor-cm.js', "invoke('editor:completar'"],
    ['integracao:mapa', 'Agente usa mapa compacto', 'src/main/brain/agent.ts', 'mapaCompacto'],
    ['integracao:regras', 'Chat aplica regras por arquivo', 'src/main/ipc/chat.ts', 'regrasParaContexto'],
    ['integracao:regras-arq', 'Existe regra com glob', '.dg-editor/regras/typescript.md', 'globs:'],
    ['integracao:memoria', 'Chat so injeta memorias aceitas', 'src/main/ipc/chat.ts', 'textoMemoriasAceitas'],
    ['integracao:memoria-ui', 'Painel Memoria lista fatos', 'src/renderer/ferramentas-ui.js', 'memoria:listar'],
    ['integracao:diff', 'Proposta abre o diff na hora', 'src/renderer/app.js', 'previewDiffNoEditor'],
    ['integracao:preview', 'Preview do diff tem handler', 'src/main/agent/ipc.ts', "ipcMain.handle('propostas:preview'"],
    ['integracao:aplicar', 'Aceitar diff tem handler', 'src/main/agent/ipc.ts', "ipcMain.handle('agente:aplicar-proposta'"],
    ['integracao:commit', 'Diff aceito vira commit local', 'src/main/agent/propostas.ts', "git', ['commit'"],
    ['integracao:stream', 'Agente emite texto-delta', 'src/main/brain/agent.ts', "tipo: 'texto-delta'"],
    ['integracao:stream-ui', 'Tela do agente recebe texto-delta', 'src/renderer/app.js', "ev.tipo === 'texto-delta'"],
    ['integracao:fila-guardiao', 'Fila espera o guardiao', 'src/main/agent/fila.ts', 'aguardarRecursos'],
    ['integracao:agente-guardiao', 'Agente pula 7b/14b se o guardiao segurou', 'src/main/brain/agent.ts', 'guardianPodeOperar']
  ]
  for (const [id, titulo, rel, busca] of pontos) out.push(trecho(raiz, rel, busca, id, titulo))

  const preload = ler(raiz, 'src/preload/index.ts')
  for (const canal of [
    'agente:pedir',
    'agente:executar-plano',
    'agente:plano-marcar-passo',
    'agente:plano-salvar',
    'agente:plano-limpar',
    'agente:plano-atualizar-passos',
    'agente:verificar',
    'agente:diagnosticos',
    'agente:diagnostico-manual'
  ]) {
    const noPreload = preload.includes("'" + canal + "'")
    const handler = handlerDoCanal(raiz, canal)
    const registrado = ler(raiz, 'src/main/index.ts').includes('registerAgentExtrasIpc();')
    const ok = noPreload && !!handler && registrado
    out.push(achado(
      'integracao:agent-' + canal,
      'Canal ' + canal + ' registrado de ponta a ponta',
      ok,
      [noPreload ? 'preload ok' : 'preload ausente', handler ? handler.arquivo + ':' + handler.linha : 'handler ausente', registrado ? 'registro no boot ok' : 'registro no boot ausente'].join(' | '),
      true
    ))
  }

  const ferramentas = ler(raiz, 'src/main/ipc/ferramentas.ts')
  const registroIpc = ler(raiz, 'src/main/ipc/index.ts')
  for (const canal of [
    'app:get-version', 'busca:arquivos', 'busca:conteudo', 'busca:cancelar',
    'chat:salvar', 'chat:listar', 'chat:carregar', 'chat:apagar',
    'comandos:listar', 'config:backup', 'orientar:prompt', 'roteador:planejar', 'sistema:safe-mode'
  ]) {
    const noPreload = preload.includes("'" + canal + "'")
    const handler = ferramentas.includes("ipcMain.handle('" + canal + "'")
    const registrado = registroIpc.includes('registrarHandlersFerramentas();')
    out.push(achado(
      'integracao:ferramenta-' + canal,
      'Canal ' + canal + ' registrado de ponta a ponta',
      noPreload && handler && registrado,
      [noPreload ? 'preload ok' : 'preload ausente', handler ? 'handler ipc/ferramentas.ts' : 'handler ausente', registrado ? 'registro no boot ok' : 'registro no boot ausente'].join(' | '),
      true
    ))
  }
  const chat = ler(raiz, 'src/main/ipc/chat.ts')
  const chatStream = chat.includes("send('chat:delta'") && chat.includes('streamOllamaChat')
  out.push(achado(
    'integracao:chat-send-stream',
    'Enviar chat chama modelo e transmite resposta',
    chatStream && preload.includes("'chat:delta'"),
    chatStream ? 'handler IPC e preload conectados' : 'handler de chat ou canal de stream ausente',
    true
  ))

  out.push(trecho(raiz, 'src/preload/index.ts', "'editor:completar'", 'integracao:preload-tab', 'Preload libera editor:completar'))
  for (const canal of ['memoria:listar', 'memoria:propor', 'memoria:decidir']) {
    const ok = preload.includes("'" + canal + "'")
    out.push(achado(
      'integracao:preload-' + canal,
      'Preload libera ' + canal,
      ok,
      ok ? 'src/preload/index.ts ' + canal : 'canal ausente no preload',
      true
    ))
  }

  const reg = ler(raiz, 'src/main/brain/registry.ts')
  const chatFila = (reg.match(/if\s*\(\s*t\s*===\s*['"]chat['"]\s*\)\s*\{[\s\S]*?return\s*\[[\s\S]*?\]/) || [''])[0]
  const chatSem15 = !!chatFila && !chatFila.includes('1.5b') && chatFila.includes('qwen2.5-coder:3b')
  out.push(achado(
    'integracao:chat-sem-15',
    'Fila de chat nao usa o 1.5b',
    chatSem15,
    chatSem15 ? 'registry.ts chat com 3b e sem 1.5b' : 'a fila de chat mudou',
    true
  ))

  const ferr = ler(raiz, 'src/renderer/ferramentas-ui.js')
  const canais = [...ferr.matchAll(/seguro\('([^']+)'/g)].map((m) => m[1])
  const vistos = new Set<string>()
  for (const canal of canais) {
    if (vistos.has(canal)) continue
    vistos.add(canal)
    const linhaUi = linhaDe(ferr, "seguro('" + canal + "'")
    const noPreload = preload.includes("'" + canal + "'")
    const handler = handlerDoCanal(raiz, canal)
    const ok = noPreload && !!handler
    const detalhe = [
      'ferramentas-ui.js:' + linhaUi,
      noPreload ? 'preload ok' : 'preload ausente',
      handler ? handler.arquivo + ':' + handler.linha + ' ' + handler.excerpt : 'handler ausente'
    ].join(' | ')
    out.push(achado('integracao:canal-' + canal, 'Canal ' + canal + ' ligado de ponta a ponta', ok, detalhe, true))
  }

  const html = ler(raiz, 'src/renderer/index.html')
  for (const nome of ['Automações', 'Artefatos', 'Skills', 'Conectores', 'Memória']) {
    const linha = linhaDe(html, '>' + nome + '<')
    out.push(achado(
      'integracao:botao-' + nome,
      'Botao ' + nome + ' presente',
      linha > 0,
      linha > 0 ? 'src/renderer/index.html:' + linha : 'botao ausente',
      true
    ))
  }
  return out
}
