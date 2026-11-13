import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { caminhoArgumentoValido, sanitizarArgs } from './sanitize'

/** Canais permitidos para ipcRenderer.invoke (request-response). */
const invokeChannels = [
  'auth:get-state', 'auth:ensure-identity', 'auth:logout',
  'auth:adapta:conectar', 'auth:adapta:desconectar', 'auth:adapta:status',
  'auth:google:conectar', 'auth:google:desconectar', 'auth:google:status',
  'auth:microsoft:conectar', 'auth:microsoft:desconectar', 'auth:microsoft:status',
  'auth:github:conectar', 'auth:github:desconectar', 'auth:github:status',
  'auth:apple:conectar', 'auth:apple:desconectar', 'auth:apple:status',
  'auth:oauth-clients:get', 'auth:oauth-clients:set', 'auth:contas:listar',
  'system:get-profile', 'system:profile-strength',
  'folder:scan', 'folder:format-summary', 'folder:select',
  'brain:ask', 'brain:providers', 'brain:ollama-status', 'brain:models', 'brain:avaliar',
  'analysis:run', 'analysis:cached', 'analysis:choose-scope',
  'whereis:ask',
  'rules:exists', 'rules:read', 'rules:create-template', 'rules:write',
  'chat:load', 'chat:send', 'chat:cancelar', 'chat:clear', 'orientar:prompt', 'chat:anexar',
  'chat:salvar', 'chat:listar', 'chat:carregar', 'chat:apagar',
  'git:status', 'git:diff', 'git:repos', 'git:commit',
  'accounts:get-state', 'guardian:snapshot', 'guardian:resumo',
  'tema:get', 'tema:set',
  'dossie:ler', 'dossie:gravar', 'dossie:snapshot', 'dossie:caminho',
  'skills:listar', 'skills:criar', 'mcp:tools', 'mcp:status', 'mcp:set-habilitado', 'mcp:smoke', 'memoria:status',
  'memoria:listar', 'memoria:propor', 'memoria:decidir', 'editor:completar',
  'adapta:status', 'adapta:gerar', 'adapta:ler-continuidade', 'adapta:abrir',
  'roteador:planejar',
  'diagnostico:rodar',
  'auditoria:rodar', 'auditoria:periodica',
  'janela:minimizar', 'janela:maximizar', 'janela:fechar', 'janela:estado',
  'janela:recarregar', 'janela:zoom', 'janela:zoom-fator', 'janela:zoom-estado', 'janela:tela-cheia',
  'app:get-version', 'app:qa-mode',
  'app:raiz-projeto',
  'arquivo:ler', 'arquivo:ler-base64', 'arquivo:salvar', 'arquivo:listar', 'arquivo:existe',
  'arquivo:criar', 'arquivo:renomear', 'arquivo:mover', 'arquivo:excluir',
  'navegador:abrir',
  'navegador:fechar',
  'navegador:voltar',
  'navegador:avancar',
  'navegador:recarregar',
  'navegador:download-cancelar',
  'dg:status',
  'terminal:create', 'terminal:write', 'terminal:resize', 'terminal:kill', 'terminal:shell',
  'terminal:shells', 'terminal:getShellPadrao', 'terminal:setShellPadrao',
  'qa:run',
  'hibrido:analisar', 'hibrido:executar',
  'agente:executar', 'agente:modelo', 'agente:historico',
  'busca:arquivos', 'busca:conteudo', 'busca:cancelar', 'busca:substituir', 'comandos:listar',
  'modelos:listar', 'modelos:recarregar', 'modelos:para-tarefa', 'modelos:versoes-remotas',
  'ollama:pull', 'ollama:pull-status',
  'config:backup', 'backup:onedrive', 'workspace:carregar', 'workspace:salvar', 'workspace:definir-raiz',
  'onboarding:status', 'onboarding:concluir', 'onboarding:resetar',
  'update:status', 'update:verificar', 'update:instalar',
  'perfil:status', 'perfil:exportar', 'perfil:importar',
  'hardware:perfil', 'hardware:atualizar',
  'dg:skills:listar', 'dg:skills:importar', 'dg:skills:salvar',
  'dg:mcp-presets:listar', 'dg:mcp-presets:salvar',
  'dg:dados:consultar', 'dg:agente:rotasugerir',
  'auditoria:imports', 'auditoria:externa',
  'sistema:safe-mode', 'app:is-safe-mode',
  'indice:iniciar', 'indice:listar', 'indice:status', 'analysis:invalidar',
  'vault:abrir', 'vault:fechar', 'vault:estado', 'vault:listar',
  'vault:resolver-link', 'vault:backlinks', 'vault:tags', 'vault:nota', 'vault:salvar',
  'deps:status', 'deps:diagnostico', 'deps:ollama:start',
  'deps:manutencao-status', 'deps:manutencao-rodar', 'deps:manutencao-config',
  'providers:listar', 'providers:configurar', 'providers:testar', 'providers:cotas',
  'providers:resetar', 'providers:fila', 'providers:permitir-pago', 'providers:gasto', 'providers:teto-diario',
  'providers:sincronizar-env', 'providers:testar-todos', 'providers:health',
  'deploy:ftp-listar', 'deploy:ftp-salvar', 'deploy:ftp-remover', 'deploy:ftp-testar', 'deploy:ftp-deploy',
  'conectores:listar',
  'openclaw:config-get', 'openclaw:config-set',
  'openclaw:token-set', 'openclaw:token-clear', 'openclaw:token-status', 'openclaw:token-ensure',
  'openclaw:pedir', 'openclaw:pendentes', 'openclaw:aplicar', 'openclaw:rejeitar',
  'openclaw:auditoria-listar',
  'agente:pedir', 'agente:orquestrar', 'agente:listar', 'agente:criar', 'agente:fila-status',
  'agente:cancelar', 'agente:propostas', 'agente:aplicar-proposta', 'agente:rejeitar-proposta',
  'agente:plano-salvar', 'agente:plano-ler', 'agente:plano-limpar', 'agente:executar-plano',
  'agente:plano-marcar-passo', 'agente:plano-atualizar-passos',
  'agente:verificar', 'agente:diagnosticos', 'agente:diagnostico-manual',
  'dg:modes:listar', 'dg:modes:salvar', 'dg:permissoes:obter', 'dg:permissoes:salvar',
  'dg:regrasgerais:listar', 'dg:regrasgerais:salvar', 'dg:regrasgerais:ativas', 'dg:regrasgerais:reordenar',
  'simbolos:indexar', 'simbolos:buscar',
  'propostas:listar', 'propostas:hunks', 'propostas:definir-hunks', 'propostas:preview',
  'agente:checkpoint-criar', 'agente:checkpoint-listar', 'agente:checkpoint-restaurar',
  'agente:checkpoint-desfazer', 'contexto:projeto',
  'navegador:embed-status',
  'dg:comfyui:status', 'dg:comfyui:gerar', 'dg:comfyui:docs', 'dg:comfyui:iniciar', 'dg:comfyui:parar',
  'midia:status', 'midia:escolher-arquivos', 'midia:escolher-pasta', 'midia:listar', 'midia:abrir-pasta',
  'midia:imagem', 'midia:diagrama', 'midia:html-imagem', 'midia:imagem-melhorar',
  'midia:fotos-video', 'midia:video-cortar', 'midia:video-juntar', 'midia:video-capa',
  'midia:video-analisar', 'midia:video-melhorar', 'midia:imagem-qualidade',
  'midia:transcrever', 'midia:narrar', 'midia:legendas',
  'midia:vozes', 'midia:vozes-baixar', 'midia:voz-previa', 'midia:voz-padrao',
  'midia:memes', 'midia:memes-sincronizar', 'midia:memes-pasta', 'midia:meme', 'midia:foto-video',
  'midia:hardware', 'midia:comfy-pre', 'midia:comfy-instalar', 'midia:comfy-instalacao',
  'midia:atualizacoes', 'midia:atualizacoes-aplicar', 'midia:atualizacoes-prefs',
  'apps:status', 'apps:instalar', 'apps:build', 'apps:publicar', 'apps:abrir-pasta',
  'midia:musicas', 'midia:musicas-pasta', 'midia:musica-mixar',
  'midia:musicas-catalogo', 'midia:musicas-baixar', 'midia:audio-analisar', 'midia:audio-processar',
  'ui:dialog-responder',
  'automation:listar', 'automation:executar', 'automation:aprovacao-resolver'
]

/** Canais de evento (ipcRenderer.on) permitidos. */
const terminalOnChannels = ['terminal:data', 'terminal:exit', 'terminal:cwd'] as const
const eventOnChannels = [
  'terminal:data',
  'terminal:exit',
  'terminal:cwd',
  'brain:fallback',
  'navegador:aberto',
  'navegador:fechado',
  'navegador:download',
  'navegador:download-progresso',
  'agente:progresso',
  'menu:acao',
  'chat:delta',
  'chat:fallback',
  'brain:cota',
  'update:status',
  'ui:dialog-pedir',
  'automation:aprovacao-pendente',
  'ollama:pull-progresso'
] as const

/** Canais de send (fire-and-forget) permitidos. */
const sendChannels = ['app:quit', 'navegador:bounds', 'navegador:mostrar']

/** Canais que manipulam caminhos de arquivo — exige sanitizacao. */
const caminhoChannels = new Set([
  'arquivo:ler', 'arquivo:ler-base64', 'arquivo:salvar', 'arquivo:listar', 'arquivo:existe',
  'arquivo:criar', 'arquivo:renomear', 'arquivo:mover', 'arquivo:excluir',
  'dossie:ler', 'dossie:gravar',
  'vault:nota', 'vault:salvar',
  'propostas:preview',
  'analise:run'
])

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!invokeChannels.includes(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    // Canais de caminho recebem caminhos absolutos legitimamente (ex.: C:\proj).
    // A contencao pelas raizes abertas e validada no main por caminhoSeguro().
    if (caminhoChannels.has(channel) && !caminhoArgumentoValido(args[0])) {
      return Promise.reject(new Error(`Caminho invalido para o canal ${channel}`))
    }
    sanitizarArgs(args)
    return ipcRenderer.invoke(channel, ...args)
  },
  analysisRun: (root: string, force: boolean, escopo: 'rapida' | 'completa') =>
    ipcRenderer.invoke('analysis:run', root, force, { escopo }),
  on: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
    if (!(eventOnChannels as readonly string[]).includes(channel)) {
      return () => {}
    }
    const handler = (event: IpcRendererEvent, ...args: unknown[]) => callback(event, ...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  send: (channel: string, ...args: unknown[]) => {
    if (!sendChannels.includes(channel)) return
    ipcRenderer.send(channel, ...args)
  },
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  quit: () => ipcRenderer.send('app:quit'),
  terminal: {
    create: (id: string, opts?: unknown) => ipcRenderer.invoke('terminal:create', id, opts),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    shell: () => ipcRenderer.invoke('terminal:shell'),
    shells: () => ipcRenderer.invoke('terminal:shells'),
    getShellPadrao: () => ipcRenderer.invoke('terminal:getShellPadrao'),
    setShellPadrao: (id: string | null) => ipcRenderer.invoke('terminal:setShellPadrao', id),
    onData: (cb: (payload: { id: string; data: string }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string; data: string }) => cb(payload)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (cb: (payload: { id: string; code: number }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string; code: number }) => cb(payload)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    },
    onCwd: (cb: (payload: { id: string; cwd: string }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string; cwd: string }) => cb(payload)
      ipcRenderer.on('terminal:cwd', handler)
      return () => ipcRenderer.removeListener('terminal:cwd', handler)
    }
  }
})

void terminalOnChannels

