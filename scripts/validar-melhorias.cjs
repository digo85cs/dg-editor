'use strict'
/**
 * Valida roteamento, aprovacao, anexos e gravacao de .dgrules
 * sem subir o Electron e sem carregar modelo na RAM.
 */
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
const falhas = []

function assert(nome, cond) {
  if (!cond) {
    falhas.push(nome)
    console.log('FALHA  ' + nome)
  } else {
    console.log('OK     ' + nome)
  }
}

async function testesLogica() {
  const outfile = path.join(os.tmpdir(), 'dg-validar-melhorias.cjs')
  await esbuild.build({
    absWorkingDir: ROOT,
    stdin: {
      contents: `
        import { resolverRotaChat, decidirAutoAprovacao, detectarIntencao } from './src/main/agent-router.ts'
        import { blocoAnexos, textoDeAnexo } from './src/main/anexos-chat.ts'
        import { writeRules, readRules } from './src/main/dgrules.ts'
        import { checarIntegracaoFerramentas } from './src/main/auditoria-integracao.ts'
        import { proporMemoria, decidirMemoria, textoMemoriasAceitas, listarMemorias } from './src/main/memorias.ts'
        import { regrasParaContexto } from './src/main/regras-escopo.ts'
        import { mapaCompacto } from './src/main/mapa-projeto.ts'
        import fs from 'fs'
        import os from 'os'
        import path from 'path'
        const out = []
        const ok = (n, c) => out.push({ n, c: !!c })
        const chat = resolverRotaChat('auto', 'bom dia')
        ok('auto geral e chat', chat.kind === 'chat' && chat.tarefa === 'chat')
        const cod = resolverRotaChat('auto', 'implementar o botao de salvar')
        ok('auto codigo e dg-engenheiro', cod.kind === 'agente' && cod.agente === 'dg-engenheiro' && cod.tarefa === 'codigo')
        const man = resolverRotaChat('free-reviewer', 'oi')
        ok('agente manual permanece', man.kind === 'agente' && man.agente === 'free-reviewer')
        ok('intencao codigo', detectarIntencao('corrigir bug') === 'codigo')
        ok('auto baixo', decidirAutoAprovacao('baixo', 'somente_leitura', 1).ok === true)
        ok('auto edicao curta', decidirAutoAprovacao('medio', 'edicao_localizada', 1).ok === true)
        ok('auto alto bloqueia', decidirAutoAprovacao('alto', 'terminal_com_confirmacao', 1).ok === false)
        ok('auto amplo bloqueia', decidirAutoAprovacao('baixo', 'edicao_localizada', 5).ok === false)
        ok('auto terminal bloqueia', decidirAutoAprovacao('medio', 'terminal_com_confirmacao', 1).ok === false)
        const b64 = Buffer.from('linha um\\nlinha dois', 'utf8').toString('base64')
        const txt = textoDeAnexo('nota.md', b64)
        ok('anexo texto', txt.binario === false && txt.texto.includes('linha um'))
        const png = textoDeAnexo('foto.png', Buffer.from([0, 1, 2, 3]).toString('base64'))
        ok('anexo binario nao entra', png.binario === true && !png.texto.includes('linha'))
        const bloco = blocoAnexos([{ nome: 'nota.md', data: b64 }])
        ok('bloco de anexo', bloco.includes('nota.md') && bloco.includes('linha dois'))
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-rules-'))
        const wr = writeRules(dir, '# teste\\n- regra')
        ok('writeRules', wr.ok === true && readRules(dir).includes('regra'))
        fs.rmSync(dir, { recursive: true, force: true })
        const achados = checarIntegracaoFerramentas(process.cwd())
        const erros = achados.filter((a) => a.severidade === 'erro')
        ok('integracao sem erro', erros.length === 0)
        if (erros.length) ok(erros.map((e) => e.id + ' ' + (e.detalhe || '')).join(' || '), false)
        const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-mem-'))
        const prop = proporMemoria(dirM, 'o botao salvar fica no canto')
        ok('memoria pendente fora do prompt', prop.ok === true && textoMemoriasAceitas(dirM) === '')
        decidirMemoria(dirM, prop.id || '', true)
        ok('memoria aceita entra', textoMemoriasAceitas(dirM).includes('salvar'))
        decidirMemoria(dirM, prop.id || '', false)
        ok('memoria apagada', listarMemorias(dirM).length === 0)
        fs.rmSync(dirM, { recursive: true, force: true })
        const regras = regrasParaContexto(process.cwd(), ['src/main/index.ts'], 'oi', 4000)
        ok('regras do dgrules', regras.includes('.dgrules'))
        ok('regra por glob typescript', regras.includes('REGRA typescript'))
        const semArquivo = regrasParaContexto(process.cwd(), [], 'oi', 4000)
        ok('glob nao entra sem arquivo', !semArquivo.includes('REGRA typescript'))
        const mapa = mapaCompacto(process.cwd(), 2200)
        ok('mapa compacto', mapa.length > 20 && mapa.length <= 2200 && !mapa.includes('function executar'))
        process.stdout.write(JSON.stringify(out))
      `,
      resolveDir: ROOT,
      sourcefile: 'validar-entry.ts',
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  const { execFileSync } = require('child_process')
  const raw = execFileSync(process.execPath, [outfile], { encoding: 'utf8' })
  fs.rmSync(outfile, { force: true })
  const rows = JSON.parse(raw)
  for (const r of rows) assert(r.n, r.c)
}

function auditarDisco() {
  const agentesDir = path.join(ROOT, '.dg-editor', 'agentes')
  const skillsDir = path.join(ROOT, '.dg-editor', 'skills')
  const agentes = fs.existsSync(agentesDir)
    ? fs.readdirSync(agentesDir).filter((f) => f.endsWith('.md'))
    : []
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'))
    : []
  assert('agentes no disco', agentes.length > 0)
  assert('free-coder presente', agentes.includes('free-coder.md'))
  assert('skills no disco', skills.length > 0)
  const coder = fs.readFileSync(path.join(agentesDir, 'free-coder.md'), 'utf8')
  const citados = (coder.match(/skills:\s*(.+)/i) || ['', ''])[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const id of citados) {
    assert('skill do free-coder: ' + id, skills.includes(id + '.md'))
  }
  const mcp = path.join(ROOT, '.dg-editor', 'bin', 'main', 'mcp', 'server.js')
  assert('MCP compilado', fs.existsSync(mcp))
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, '.dg-editor', 'modelos.default.json'), 'utf8'))
  assert('chat aponta modelo pequeno', cat.modelosPorTarefa.chat === 'qwen2.5-coder:3b')
  assert('codigo aponta 7b', cat.modelosPorTarefa.codigo === 'qwen2.5-coder:7b')
  const reg = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'registry.ts'), 'utf8')
  const chatFila = (reg.match(/if\s*\(\s*t\s*===\s*['"]chat['"]\s*\)\s*\{[\s\S]*?return\s+comPrefixoGlobal\(\[[\s\S]*?\]\s*\)/) || [''])[0]
  assert(
    'fila chat 3b antes de 14b',
    chatFila.includes('qwen2.5-coder:3b') &&
      chatFila.includes('qwen2.5-coder:14b') &&
      chatFila.indexOf('qwen2.5-coder:3b') < chatFila.indexOf('qwen2.5-coder:14b')
  )
  const idx = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf8')
  const chatIpc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'chat.ts'), 'utf8')
  const analiseIpc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'analise.ts'), 'utf8')
  const skillsIpc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'skills.ts'), 'utf8')
  const chatFonte = chatIpc + '\n' + idx
  assert('chat usa fila serial', chatFonte.includes('enfileirarAgente'))
  assert('chat usa roteador', chatFonte.includes('resolverRotaChat'))
  assert('chat decide auto-aprovacao', chatFonte.includes('decidirAutoAprovacao'))
  assert('chat injeta anexos', chatFonte.includes('blocoAnexos'))
  assert(
    'IPC grava regras',
    analiseIpc.includes("ipcMain.handle('rules:write'") ||
      idx.includes("ipcMain.handle('rules:write'")
  )
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'index.ts'), 'utf8')
  assert('preload libera rules:write', preload.includes("'rules:write'"))
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8')
  for (const nome of ['Automações', 'Artefatos', 'Skills', 'Conectores', 'Memória']) {
    assert('botao ' + nome, html.includes('>' + nome + '<'))
  }
  assert('chat no centro', html.includes('id="center-pane-chat"') && html.includes('data-center="chat"'))
  assert('composer com modo/agente', html.includes('id="chat-mode-select"') && html.includes('id="chat-agent-select"'))
  assert('menu Mais no composer', html.includes('id="btn-chat-mais"') && html.includes('id="chat-mais-menu"'))
  {
    const iToolbar = html.indexOf('chat-composer-toolbar')
    const iPrompt = html.indexOf('id="btn-prompt-orientador"')
    const iSend = html.indexOf('id="chat-send"')
    assert('melhorar prompt no composer', iToolbar >= 0 && iPrompt > iToolbar && iPrompt < iSend)
  }
  assert('icones com contexto', html.includes('data-chat-ctx="prompt"') && html.includes('id="chat-ctx-popover"'))
  assert('modal orientar prompt', html.includes('id="modal-prompt-orientador"') && html.includes('id="btn-prompt-melhorar"'))
  assert('aba Execução à direita', html.includes('data-pane="agent"') && html.includes('Execução'))
  assert('plan/verify ocultos no composer', html.includes('id="agent-plan-mode"') && html.includes('id="agent-verify-loop"'))
  const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
  assert('CSS composer toolbar', css.includes('.chat-composer-toolbar'))
  assert('CSS center-tabs', css.includes('.center-tabs'))
  assert('CSS chat-ctx-popover', css.includes('.chat-ctx-popover'))
  const appJs = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.js'), 'utf8')
  assert('initChatIconContext', appJs.includes('function initChatIconContext') && appJs.includes('data-chat-ctx'))
  assert('abrirOrientadorPrompt', appJs.includes('function abrirOrientadorPrompt') && appJs.includes('orientar:prompt'))
  assert('sync mode→plan', appJs.includes('planToggle.checked = modeSel.value === \'plan\''))
  assert('Mais tem Verificar', appJs.includes('Verificar após turno'))
  const ferrIpc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'ferramentas.ts'), 'utf8')
  assert('IPC orientar:prompt', ferrIpc.includes("ipcMain.handle('orientar:prompt'"))
  assert('preload libera orientar:prompt', preload.includes("'orientar:prompt'"))
  const seg = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'segredos-providers.ts'), 'utf8')
  assert('resolverChave irmãos apiKeyRef', seg.includes('mesmoRef') && seg.includes('apiKeyRef'))
  const regTxt = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'registry.ts'), 'utf8')
  assert('disponivel usa lerChave', regTxt.includes('lerChave(cfg.id)') && regTxt.includes("from './segredos-providers'"))
  assert('sync env providers', fs.existsSync(path.join(ROOT, 'src', 'main', 'brain', 'providers-sync-env.ts')))
  assert('FTP deploy modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'deploy', 'ftp.ts')))
  assert('IPC deploy FTP', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'deploy.ts'), 'utf8').includes('deploy:ftp-deploy'))
  assert('preload deploy FTP', preload.includes("'deploy:ftp-deploy'"))
  assert('linguagens free', fs.existsSync(path.join(ROOT, 'src', 'main', 'linguagens-contexto.ts')))
  assert('popover sobe', css.includes('chat-ctx-popover--up') || appJs.includes('abrirCima'))
  assert('contas-ui no html', html.includes('contas-ui.js') || html.includes('contas-conectores'))
  assert('ftp UI no html', html.includes('contas-ftp') || html.includes('Deploy FTP'))
  assert('auth google ipc', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'auth.ts'), 'utf8').includes('auth:google:conectar'))
  assert('providers health', fs.existsSync(path.join(ROOT, 'src', 'main', 'brain', 'providers-health.ts')))
  assert('providers testar-todos', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'providers.ts'), 'utf8').includes('providers:testar-todos'))
  assert('ftp dryRun', fs.readFileSync(path.join(ROOT, 'src', 'main', 'deploy', 'ftp.ts'), 'utf8').includes('dryRun'))
  assert('popover abrirCima', appJs.includes('abrirCima'))
  assert('chat send/stop mode', appJs.includes('setChatSendMode') && appJs.includes("setChatSendMode('stop')"))
  assert('chat send is-stop css', css.includes('.chat-send-btn.is-stop'))
  assert('polish css import', css.includes("styles/polish.css") || fs.existsSync(path.join(ROOT, 'src', 'renderer', 'styles', 'polish.css')))
  assert('contas abas', html.includes('data-contas-tab="ftp"') && html.includes('data-contas-tab="saude"'))
  assert(
    'statusbar atalhos base',
    html.includes('sb-actions') &&
      html.includes('id="btn-tema"') &&
      html.includes('id="btn-provedores-ia"') &&
      html.includes('id="btn-desktop-use"')
  )
  assert('repos e chats sidebar', html.includes('Repositórios') && html.includes('id="agent-chats-list"'))
  assert('guardian-alert existe', html.includes('id="guardian-alert"'))
  assert('chat live status', html.includes('id="chat-live-status"'))
  assert('bloco3 botao base', html.includes('id="btn-right-toggle"') && html.includes('Bloco 3'))
  assert('bloco3 right-rail', html.includes('id="right-rail"') && html.includes('id="rail-novo"') && html.includes('id="rail-terminal"'))
  assert('bloco3 edge expand', html.includes('id="bloco3-edge"') && css.includes('bloco3-edge'))
  assert('bloco3 rail ao recolher', css.includes('#app.right-collapsed #exec-panel') && css.includes('44px'))
  {
    const chatJs = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'chat.js'), 'utf8')
    const polish = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles', 'polish.css'), 'utf8')
    assert('chat menu vertical', chatJs.includes('agent-chat-more') && chatJs.includes("data-chat-act=\"rename\"") && chatJs.includes("data-chat-act=\"delete\""))
    assert('chat menu css', polish.includes('agent-chat-more') && polish.includes('agent-chat-menu'))
  }
  assert(
    'path tools conectores',
    fs.readFileSync(path.join(ROOT, 'src', 'main', 'conectores-status.ts'), 'utf8').includes('listarFerramentasPath') &&
      fs.readFileSync(path.join(ROOT, 'src', 'main', 'conectores-status.ts'), 'utf8').includes('ffmpeg')
  )
  assert(
    'navegador voltar/avancar/recarregar',
    preload.includes("'navegador:voltar'") &&
      preload.includes("'navegador:recarregar'") &&
      fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'navegador.ts'), 'utf8').includes("navegador:voltar") &&
      fs.readFileSync(path.join(ROOT, 'src', 'main', 'navegador', 'janela.ts'), 'utf8').includes('navegadorVoltar')
  )
  assert(
    'dg:status guardian',
    preload.includes("'dg:status'") &&
      fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'guardian.ts'), 'utf8').includes("dg:status")
  )
  assert(
    'self-heal raiz dinamica',
    fs.readFileSync(path.join(ROOT, 'src', 'main', 'win-self-heal.ts'), 'utf8').includes('templatesLaunchers')
  )
  assert('statusbar bullet utf8', !appJs.includes('â—') && appJs.includes('\\u25CF'))
  assert(
    'workspace autosave',
    fs.existsSync(path.join(ROOT, 'src', 'main', 'workspace-store.ts')) &&
      fs.existsSync(path.join(ROOT, 'src', 'renderer', 'workspace-ui.js')) &&
      ferrIpc.includes("workspace:salvar") &&
      preload.includes("'workspace:salvar'") &&
      appJs.includes('ligarWorkspaceAutosave') &&
      appJs.includes('agendarSalvarWorkspace')
  )
  assert(
    'chat flush + ativo',
    fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'chat.js'), 'utf8').includes('flushSalvar') &&
      fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'chat.js'), 'utf8').includes('dg-chat-ativo')
  )
  assert(
    'assistente auto-enviar',
    fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'chat', 'assistente-novo.js'), 'utf8').includes('enviarChat') &&
      fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'chat', 'assistente-novo.js'), 'utf8').includes('precheckFerramentas')
  )
  assert(
    'hub extras ipc',
    fs.existsSync(path.join(ROOT, 'src', 'main', 'ipc', 'hub-extras.ts')) &&
      fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'index.ts'), 'utf8').includes('registrarHubExtras') &&
      preload.includes("'onboarding:status'") &&
      preload.includes("'dg:skills:listar'") &&
      preload.includes("'dg:mcp-presets:listar'")
  )
  assert(
    'extras-ui ligado',
    fs.existsSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js')) &&
      appJs.includes('ligarExtrasUi')
  )
  assert(
    'qualidade legado alias',
    fs.readFileSync(path.join(ROOT, 'src', 'main', 'index-QUALIDADE.ts'), 'utf8').includes("import './index'")
  )
  assert(
    'smoke embed oficial',
    fs.readFileSync(path.join(ROOT, 'docs', 'DIVIDAS.md'), 'utf8').includes('Gate oficial') &&
      fs.readFileSync(path.join(ROOT, 'docs', 'TESTES.md'), 'utf8').includes('embed') &&
      fs.readFileSync(path.join(ROOT, 'docs', 'TESTES.md'), 'utf8').includes('oficial')
  )
    assert('extras simbolos/rota/dados', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('pintarSimbolos') && fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('pintarPlanilha'))
  assert('ligarExtras chama pintarSimbolos', (()=>{const e=fs.readFileSync(path.join(ROOT,'src','renderer','extras-ui.js'),'utf8');const ix=e.indexOf('export function ligarExtrasUi');const bloco=e.slice(ix,ix+900);return bloco.includes('pintarSimbolos()')&&bloco.includes('pintarRota()')&&bloco.includes('pintarPlanilha()');})())
  assert('automation local windows', fs.readFileSync(path.join(ROOT, 'src', 'main', 'automation', 'dispatch.ts'), 'utf8').includes('windows.sistema.info') && fs.readFileSync(path.join(ROOT, 'src', 'main', 'automation', 'dispatch.ts'), 'utf8').includes('windows.arquivo.listar'))
  assert('ensureOllama auto-start', fs.readFileSync(path.join(ROOT,'src','main','ollama-keeper.ts'),'utf8').includes('auto-start'))
  assert('modeloParaTarefa fallback hard', fs.readFileSync(path.join(ROOT,'src','main','brain','modelos-catalogo.ts'),'utf8').includes('FALLBACKS_CHAT'))
  assert('askOllama retry 1.5b', fs.readFileSync(path.join(ROOT,'src','main','brain','ollama.ts'),'utf8').includes('retry 1.5b'))
  assert('analise ensureOllama', fs.readFileSync(path.join(ROOT,'src','main','ipc','analise.ts'),'utf8').includes('ensureOllama'))
  assert('chat menu fixed', fs.readFileSync(path.join(ROOT,'src','renderer','styles','polish.css'),'utf8').includes('position: fixed') && fs.readFileSync(path.join(ROOT,'src','renderer','chat.js'),'utf8').includes('posicionarMenuChat'))
  assert('chats agrupados por pasta', fs.readFileSync(path.join(ROOT,'src','renderer','chat.js'),'utf8').includes('pintarListaSidebarAgrupada') && fs.readFileSync(path.join(ROOT,'src','renderer','chat.js'),'utf8').includes('onTrocarPasta'))
  assert('sync contexto pasta', fs.readFileSync(path.join(ROOT,'src','renderer','app.js'),'utf8').includes('sincronizarContextoPasta'))
  assert('tree click sem expandir', fs.readFileSync(path.join(ROOT,'src','renderer','features','arquivos','tree-render.js'),'utf8').includes('sem exigir expandir'))
  assert('repos cursor sem arvore', fs.readFileSync(path.join(ROOT,'src','renderer','app.js'),'utf8').includes('Sem árvore de arquivos') || fs.readFileSync(path.join(ROOT,'src','renderer','app.js'),'utf8').includes('Sem arvore de arquivos') || fs.readFileSync(path.join(ROOT,'src','renderer','app.js'),'utf8').includes('Cursor (pasta + chats)'))
  assert('iniciar-app oculto', fs.readFileSync(path.join(ROOT,'scripts','iniciar-app.cjs'),'utf8').includes('windowsHide: true') && fs.readFileSync(path.join(ROOT,'scripts','iniciar-app.cjs'),'utf8').includes("stdio: 'ignore'"))
  assert('chat prefere online primeiro', fs.readFileSync(path.join(ROOT,'src','main','ipc','chat.ts'),'utf8').includes('melhores ONLINE primeiro') && fs.readFileSync(path.join(ROOT,'src','main','ipc','chat.ts'),'utf8').includes('filaPronta'))
  assert('sintetizarDeTools limpo', fs.readFileSync(path.join(ROOT,'src','main','brain','agent.ts'),'utf8').includes('pareceDumpTool') && fs.readFileSync(path.join(ROOT,'src','main','brain','agent.ts'),'utf8').includes('extrairTextoUtilTool'))
  assert('ollama ordem ultimo', fs.readFileSync(path.join(ROOT,'src','main','brain','providers-registry.ts'),'utf8').includes('ordem: 99') && fs.readFileSync(path.join(ROOT,'src','main','brain','providers-registry.ts'),'utf8').includes('LOCAL por ultimo'))
  assert('fila online antes local', fs.readFileSync(path.join(ROOT,'src','main','brain','registry.ts'),'utf8').includes('Online/CLI primeiro') || fs.readFileSync(path.join(ROOT,'src','main','brain','registry.ts'),'utf8').includes('online/CLI primeiro'))
  assert('rota auto dg-engenheiro', fs.readFileSync(path.join(ROOT,'src','main','agent-router.ts'),'utf8').includes("agente: 'dg-engenheiro'"))
  assert('context menu dg', fs.readFileSync(path.join(ROOT,'src','renderer','features','ui','context-menu.js'),'utf8').includes('ligarContextMenuDg'))
  assert('cartao um status', fs.readFileSync(path.join(ROOT,'src','renderer','features','chat','progresso-humano.js'),'utf8').includes('chat-work-step-one'))
  assert('whereis oculto analise', fs.readFileSync(path.join(ROOT,'src','renderer','index.html'),'utf8').includes('id="whereis-bar" hidden'))
  assert('tab close sem absolute', fs.readFileSync(path.join(ROOT,'src','renderer','styles','polish.css'),'utf8').includes('position: static') && fs.readFileSync(path.join(ROOT,'src','renderer','styles','polish.css'),'utf8').includes('right-tab-label'))
  assert('bloco3 headers wrap', fs.readFileSync(path.join(ROOT,'src','renderer','styles.css'),'utf8').includes('flex-wrap: wrap') && fs.readFileSync(path.join(ROOT,'src','renderer','styles.css'),'utf8').includes('.whereis-bar[hidden]'))
  assert('chat scroll flex-start', fs.readFileSync(path.join(ROOT,'src','renderer','styles.css'),'utf8').includes('overflow-y: scroll') && fs.readFileSync(path.join(ROOT,'src','renderer','styles.css'),'utf8').includes('impede scroll'))
  assert('organizarRespostaCursor', fs.readFileSync(path.join(ROOT,'src','renderer','features','chat','render.js'),'utf8').includes('organizarRespostaCursor'))
  assert('msg user-select text', fs.readFileSync(path.join(ROOT,'src','renderer','styles.css'),'utf8').includes('user-select: text'))
  assert('copy unico bolha', fs.readFileSync(path.join(ROOT,'src','renderer','features','chat','render.js'),'utf8').includes('data-copy="full"') && fs.readFileSync(path.join(ROOT,'src','renderer','features','chat','render.js'),'utf8').includes('msg-code-inner') && !fs.readFileSync(path.join(ROOT,'src','renderer','features','chat','render.js'),'utf8').includes('Copiar código'))
  {
    const agentSrc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8')
    const mcpClient = fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'client.ts'), 'utf8')
    const mcpServer = fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8')
    const chatIpcSrc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'chat.ts'), 'utf8')
    assert('MAX_ITER 2', /const MAX_ITER\s*=\s*2\b/.test(agentSrc))
    assert('sintese alinhada pedido', agentSrc.includes('textoRelacionadoAoPedido') && agentSrc.includes('sintetizarDeTools(passos, pergunta)'))
    assert('ancora workspace agente', agentSrc.includes('WORKSPACE ATIVO') && agentSrc.includes('garantirMcpNaRaiz'))
    assert('bloqueia systeminfo mysql', agentSrc.includes('systeminfo') && agentSrc.includes('pedidoInstal'))
    assert('mcp client raiz', mcpClient.includes('garantirMcpNaRaiz') && mcpClient.includes('raizMcpConectada'))
    assert('mcp server raizAtual', mcpServer.includes('function raizAtual') && mcpServer.includes('syncRaiz()'))
    assert('chat ancora DG_ROOT', chatIpcSrc.includes('process.env.DG_ROOT = rootOk') && chatIpcSrc.includes('garantirMcpNaRaiz'))
  }
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const winArch = JSON.stringify(pkg.build?.win?.target || [])
    const linuxArch = JSON.stringify(pkg.build?.linux?.target || [])
    assert('dist sem x86', !winArch.includes('"ia32"') && !linuxArch.includes('"ia32"') && !winArch.includes('x86'))
    assert('dist win x64', winArch.includes('x64') && winArch.includes('nsis'))
    assert('dist linux x64', linuxArch.includes('x64') && linuxArch.includes('AppImage'))
    assert('publish github', pkg.build?.publish?.[0]?.provider === 'github' && pkg.build.publish[0].repo === 'dg-editor')
    assert('script dist:linux', !!pkg.scripts?.['dist:linux'])
    assert('script publish:github', !!pkg.scripts?.['publish:github'])
    assert('dep electron-updater', !!(pkg.dependencies && pkg.dependencies['electron-updater']))
  }
  assert('auto-update modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'auto-update.ts')) && fs.readFileSync(path.join(ROOT, 'src', 'main', 'auto-update.ts'), 'utf8').includes('electron-updater'))
  assert('hardware-profile modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'hardware-profile.ts')) && fs.readFileSync(path.join(ROOT, 'src', 'main', 'hardware-profile.ts'), 'utf8').includes('garantirHardwareProfile'))
  assert('first-run preserva perfil', fs.readFileSync(path.join(ROOT, 'src', 'main', 'onboarding', 'first-run.ts'), 'utf8').includes('temContasOuIas') || fs.readFileSync(path.join(ROOT, 'src', 'main', 'onboarding', 'first-run.ts'), 'utf8').includes('perfilTemContasOuIas'))
  assert('preload update channels', preload.includes("'update:verificar'") && preload.includes("'hardware:perfil'"))
  assert('ui update statusbar', html.includes('id="btn-update-check"') && html.includes('id="sb-update"'))
  assert('extras update ui', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('ligarAutoUpdateUi'))
  assert('limites usam hardware', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'registry.ts'), 'utf8').includes('limitesPorHardware'))
  assert('workspace-raiz modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'workspace-raiz.ts')) && fs.readFileSync(path.join(ROOT, 'src', 'main', 'workspace-raiz.ts'), 'utf8').includes('resolverRaizChat'))
  assert('chat ancora repositorio', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'chat.ts'), 'utf8').includes('REPOSITORIO ATIVO') && fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'chat.ts'), 'utf8').includes('mapaCompacto'))
  assert('chat briefing sempre', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'chat.ts'), 'utf8').includes('Briefing do repo sempre'))
  assert('renderer define raiz', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.js'), 'utf8').includes('workspace:definir-raiz') && fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.js'), 'utf8').includes('resolverPastaChatAtiva'))
  assert('preload workspace definir-raiz', preload.includes("'workspace:definir-raiz'"))
  assert('agente mapa sempre', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('REPOSITORIO ATIVO') && fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('mapaCompacto'))
  assert('disco-inventario modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'disco-inventario.ts')) && fs.readFileSync(path.join(ROOT, 'src', 'main', 'disco-inventario.ts'), 'utf8').includes('buscarPastasProjeto'))
  assert('mcp disco_buscar', fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8').includes("name: 'disco_buscar'") && fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8').includes("name: 'disco_inspecionar'"))
  assert('skill inventario-disco', fs.existsSync(path.join(ROOT, '.dg-editor', 'skills', 'inventario-disco.md')) && fs.readFileSync(path.join(ROOT, '.dg-editor', 'skills', 'inventario-disco.md'), 'utf8').includes('disco_buscar'))
  assert('agente inventario prompt', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('PROTOCOLO INVENTARIO') || fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('blocoPromptInventario'))
  assert('filtra ruido Autopilot', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('filtrarRuidoWindows') && fs.readFileSync(path.join(ROOT, 'src', 'main', 'disco-inventario.ts'), 'utf8').includes('Autopilot'))
  assert('MAX_ITER inventario', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('MAX_ITER_INVENTARIO'))
  assert('system espelho Cursor', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('espelho do Cursor Agent'))
  assert('estilo-cursor sempre ativo', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'skills.ts'), 'utf8').includes("'estilo-cursor'") && fs.readFileSync(path.join(ROOT, '.dg-editor', 'skills', 'estilo-cursor.md'), 'utf8').includes('Espelhe o Cursor'))
  assert('chat comportamento Cursor amplo', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'chat.ts'), 'utf8').includes('inventariar/modificar/corrigir/melhorar/editar'))
  assert('dg-engenheiro estilo-cursor', fs.readFileSync(path.join(ROOT, '.dg-editor', 'agentes', 'dg-engenheiro.md'), 'utf8').includes('estilo-cursor'))
  assert('update feedback sem feed', fs.readFileSync(path.join(ROOT, 'src', 'main', 'auto-update.ts'), 'utf8').includes('Nenhuma release publicada') || fs.readFileSync(path.join(ROOT, 'src', 'main', 'auto-update.ts'), 'utf8').includes('Sem feed de release'))
  assert('perfil migracao modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'perfil-migracao.ts')) && fs.readFileSync(path.join(ROOT, 'src', 'main', 'perfil-migracao.ts'), 'utf8').includes('exportarPerfil'))
  assert('perfil ipc', fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc', 'perfil.ts'), 'utf8').includes("perfil:exportar") && preload.includes("'perfil:exportar'"))
  assert('tools telemetry', fs.existsSync(path.join(ROOT, 'src', 'main', 'tools-telemetry.ts')) && fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('registrarFalhaTool'))
  assert('diagnostico tools-falhas', fs.readFileSync(path.join(ROOT, 'src', 'main', 'diagnostico.ts'), 'utf8').includes('tools-falhas'))
  assert('onboarding chaves online', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('onb-key-openrouter') && fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('providers:configurar'))
  assert('perfil ui saude', html.includes('id="btn-perfil-exportar"') && fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('ligarPerfilUi'))
  assert('gitResumo inventario', fs.readFileSync(path.join(ROOT, 'src', 'main', 'disco-inventario.ts'), 'utf8').includes('gitResumo'))
  assert('sintese um bloco', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'chat', 'render.js'), 'utf8').includes('Resposta final') && fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'chat', 'render.js'), 'utf8').includes('split(/\\n-{3,}\\n/)'))
  assert('script publicar-release', fs.existsSync(path.join(ROOT, 'scripts', 'publicar-release.ps1')))
  assert('script build-linux', fs.existsSync(path.join(ROOT, 'scripts', 'build-linux.ps1')))
  assert('logo-wide titlebar', fs.readFileSync(path.join(ROOT,'src','renderer','index.html'),'utf8').includes('logo-wide-tb.png') && fs.readFileSync(path.join(ROOT,'src','renderer','styles.css'),'utf8').includes('tb-logo--wide'))
  assert('logo-wide onboarding', fs.readFileSync(path.join(ROOT,'src','renderer','extras-ui.js'),'utf8').includes('logo-wide-lg.png'))
  assert('logo-wide asset', fs.existsSync(path.join(ROOT,'resources','logo-wide.png')) && fs.existsSync(path.join(ROOT,'resources','logo-wide-tb.png')))
  assert('accent brand azul', fs.readFileSync(path.join(ROOT,'src','renderer','styles','tokens.css'),'utf8').includes('#0080ff'))
  assert('autonomia modulo', fs.existsSync(path.join(ROOT, 'src', 'main', 'autonomia-tools.ts')))
  assert('autonomia git_status', fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8').includes("name: 'git_status'") && fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8').includes("name: 'resultado_avaliar'"))
  assert('MAX_ITER codigo 4', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes('MAX_ITER_CODIGO'))
  assert('desktop ico existe', fs.existsSync(path.join(ROOT, 'resources', 'dg-editor-desktop.ico')))
  assert('overview ruler modulo', fs.existsSync(path.join(ROOT, 'src', 'renderer', 'features', 'editor', 'overview-ruler.js')))
  assert('overview ruler no editor', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'editor-cm.js'), 'utf8').includes('anexarOverviewRuler'))
  assert('overview ruler css', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8').includes('dg-overview-ruler'))
  assert('overview git sync', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.js'), 'utf8').includes('sincronizarOverviewGit'))
  assert('branding logo-source', fs.existsSync(path.join(ROOT, 'resources', 'branding', 'logo-source.png')))
  assert('branding ico regenerado', fs.existsSync(path.join(ROOT, 'resources', 'dg-editor.ico')) && fs.statSync(path.join(ROOT, 'resources', 'dg-editor.ico')).size > 1000)
  assert('onboarding usa logo img', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('logo-wide-lg.png') && fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'extras-ui.js'), 'utf8').includes('onb-logo'))
  assert('smoke disco script', fs.existsSync(path.join(ROOT, 'scripts', 'smoke-disco.cjs')))



assert('backup onedrive script', fs.existsSync(path.join(ROOT, 'scripts', 'backup-onedrive.ps1')))
  assert('backup onedrive setup', fs.existsSync(path.join(ROOT, 'scripts', 'setup-backup-onedrive.ps1')))
  assert('backup:onedrive ipc', ferrIpc.includes("ipcMain.handle('backup:onedrive'") && preload.includes("'backup:onedrive'"))
  assert('backup onedrive ui', html.includes('id="btn-backup-onedrive"') && appJs.includes('rodarBackupOneDrive'))
  assert('tema config persistente', fs.readFileSync(path.join(ROOT, 'src', 'main', 'config.ts'), 'utf8').includes('lerTema'))
  assert('assistente novo modal', html.includes('id="modal-assistente-novo"') && html.includes('data-novo="sistema"'))
  assert('sem agent-input-bar', !html.includes('class="agent-input-bar"'))
  assert(
    'assistente-novo modulo',
    fs.existsSync(path.join(ROOT, 'src', 'renderer', 'features', 'chat', 'assistente-novo.js')) &&
      appJs.includes('ligarRightRail') &&
      appJs.includes('abrirAssistenteNovo')
  )
  assert(
    'progresso humano',
    fs.existsSync(path.join(ROOT, 'src', 'renderer', 'features', 'chat', 'progresso-humano.js')) &&
      appJs.includes('atualizarCartaoTrabalho') &&
      appJs.includes('humanizarToolInicio')
  )
  assert('providers lista densa', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'providers-ui.js'), 'utf8').includes('prov-row'))
  assert('ftp form grid', appJs.includes('ftp-form-grid'))
  assert('agent more menu', html.includes('id="btn-agent-mais"') && html.includes('id="agent-mais-menu"'))
  assert('tokens btn-h', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles', 'tokens.css'), 'utf8').includes('--dg-btn-h'))
  assert('drag config left fix', appJs.includes("box.style.left = rect.left + 'px'"))
  assert('agentes lista row', appJs.includes('chat-ctx-option--row'))
  assert('quick open amigavel', appJs.includes('nomeAmigavelArquivo'))
  assert('sem setas titlebar', html.includes('tb-nav sr-only') || html.includes('tb-nav" hidden') || html.includes('class="tb-nav sr-only"'))
  assert('ia no statusbar', html.includes('id="sb-ia"'))
  assert('right tab close', html.includes('data-right-close'))
  assert('editor imagem toolbar', html.includes('id="img-edit-resize"') && html.includes('id="img-edit-crop"'))
  assert('nomes amigaveis util', fs.existsSync(path.join(ROOT, 'src', 'renderer', 'utils', 'nomes-amigaveis.js')))
  assert('comfyui gerar ipc', fs.readFileSync(path.join(ROOT, 'src', 'main', 'comfyui-mcp.ts'), 'utf8').includes('dg:comfyui:gerar'))
  assert('preload comfyui', preload.includes("'dg:comfyui:gerar'"))
  assert('tooltips ricos', appJs.includes('initTooltipsRicos'))
  assert('openrouter teste boot', appJs.includes("providers:testar', { id: 'openrouter' }") || appJs.includes('providers:testar'))
  const ferr = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'ferramentas-ui.js'), 'utf8')
  assert(
    'criar agente/skill',
    appJs.includes('pedirPermissaoDesktop') && ferr.includes('agente:criar') && ferr.includes('skills:criar')
  )
  const canais = [...ferr.matchAll(/seguro\('([^']+)'/g)].map((m) => m[1])
  assert('ferramentas chamam canais reais', canais.length >= 8)
  for (const canal of canais) {
    assert('preload libera ' + canal, preload.includes("'" + canal + "'"))
  }
  assert(
    'skills:listar no main',
    skillsIpc.includes("ipcMain.handle('skills:listar'") ||
      idx.includes("ipcMain.handle('skills:listar'")
  )
  assert('plano-ler no agente', fs.readFileSync(path.join(ROOT, 'src', 'main', 'agent', 'ipc.ts'), 'utf8').includes("ipcMain.handle('agente:plano-ler'"))
  assert('preload libera editor:completar', preload.includes("'editor:completar'"))
  assert('fila espera o guardiao', fs.readFileSync(path.join(ROOT, 'src', 'main', 'agent', 'fila.ts'), 'utf8').includes('aguardarRecursos'))
  assert('agente emite texto-delta', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes("tipo: 'texto-delta'"))
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'regras-ui.js'), 'utf8')
  assert('UI salva via rules:write', ui.includes("invoke('rules:write'"))
  const ollama = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'ollama.ts'), 'utf8')
  assert('chat nao sobe 7b/14b', ollama.includes('modelo grande bloqueado nesta tarefa'))
  console.log('AGENTES ' + agentes.length + ': ' + agentes.map((a) => a.replace(/\.md$/, '')).join(', '))
  console.log('SKILLS  ' + skills.length + ': ' + skills.map((a) => a.replace(/\.md$/, '')).join(', '))
  const idsSkills = new Set(skills.map((s) => s.replace(/\.md$/, '')))
  for (const arq of agentes) {
    const corpo = fs.readFileSync(path.join(agentesDir, arq), 'utf8')
    const linha = (corpo.match(/skills:\s*(.+)/i) || ['', ''])[1]
    for (const id of linha.split(',').map((s) => s.trim()).filter(Boolean)) {
      assert('agente ' + arq.replace(/\.md$/, '') + ' -> skill ' + id, idsSkills.has(id))
    }
  }
  const mcpSrc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8')
  const tools = []
  const reTool = /name:\s*'([^']+)'/g
  let m
  while ((m = reTool.exec(mcpSrc))) tools.push(m[1])
  assert('MCP tem tools', tools.length >= 8)
  console.log('MCP TOOLS ' + tools.length + ': ' + tools.join(', '))
  const fila = fs.readFileSync(path.join(ROOT, 'src', 'main', 'agent', 'fila.ts'), 'utf8')
  assert('fila serial sem paralelismo', fila.includes('if (rodando) return') && fila.includes('while (fila.length)'))
}

function ollamaTags() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 4000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(body)
          const nomes = (j.models || []).map((m) => m.name)
          console.log('OLLAMA  ' + (nomes.length ? nomes.join(', ') : 'sem modelos'))
          assert('ollama respondeu /api/tags', res.statusCode === 200)
          assert('modelo de chat 3b instalado', nomes.some((n) => n.startsWith('qwen2.5-coder:3b')))
          assert('modelo de codigo 7b instalado', nomes.some((n) => n.startsWith('qwen2.5-coder:7b')))
        } catch (e) {
          assert('ollama json', false)
          console.log('OLLAMA  resposta invalida')
        }
        resolve()
      })
    })
    req.on('error', () => {
      assert('ollama no ar', false)
      console.log('OLLAMA  indisponivel em 127.0.0.1:11434')
      resolve()
    })
    req.on('timeout', () => {
      req.destroy()
      assert('ollama no ar', false)
      resolve()
    })
  })
}

async function main() {
  console.log('--- logica ---')
  await testesLogica()
  console.log('--- disco e integracao ---')
  auditarDisco()
  console.log('--- ollama (so lista, nao carrega modelo) ---')
  await ollamaTags()
  console.log('')
  if (falhas.length) {
    console.log('FALHAS ' + falhas.length + ': ' + falhas.join(' | '))
    process.exit(1)
  }
  console.log('VALIDACAO OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
