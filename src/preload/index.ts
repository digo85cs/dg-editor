import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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
  'chat:load', 'chat:send', 'chat:clear', 'orientar:prompt', 'chat:anexar',
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
  'janela:recarregar', 'janela:zoom', 'janela:tela-cheia',
  'app:get-version',
  'app:raiz-projeto',
  'arquivo:ler', 'arquivo:ler-base64', 'arquivo:salvar', 'arquivo:listar', 'arquivo:existe',
  'navegador:abrir',
  'navegador:fechar',
  'navegador:voltar',
  'navegador:avancar',
  'navegador:recarregar',
  'dg:status',
  'terminal:create', 'terminal:write', 'terminal:resize', 'terminal:kill', 'terminal:shell',
  'terminal:shells', 'terminal:getShellPadrao', 'terminal:setShellPadrao',
  'qa:run',
  'hibrido:analisar', 'hibrido:executar',
  'agente:executar', 'agente:modelo', 'agente:historico',
  'busca:arquivos', 'busca:conteudo', 'busca:cancelar', 'comandos:listar',
  'modelos:listar', 'modelos:recarregar', 'modelos:para-tarefa', 'modelos:versoes-remotas',
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
  'dg:comfyui:status', 'dg:comfyui:gerar', 'dg:comfyui:docs',
  'ui:dialog-responder',
  'automation:listar', 'automation:executar', 'automation:aprovacao-resolver'
]

/** Canais de evento (ipcRenderer.on) permitidos. */
const terminalOnChannels = ['terminal:data', 'terminal:exit'] as const
const eventOnChannels = [
  'terminal:data',
  'terminal:exit',
  'brain:fallback',
  'navegador:aberto',
  'navegador:fechado',
  'agente:progresso',
  'menu:acao',
  'chat:delta',
  'brain:cota',
  'update:status',
  'ui:dialog-pedir',
  'automation:aprovacao-pendente'
] as const

/** Canais de send (fire-and-forget) permitidos. */
const sendChannels = ['app:quit', 'navegador:bounds', 'navegador:mostrar']

/** Canais que manipulam caminhos de arquivo — exige sanitizacao. */
const caminhoChannels = new Set([
  'arquivo:ler', 'arquivo:ler-base64', 'arquivo:salvar', 'arquivo:listar', 'arquivo:existe',
  'dossie:ler', 'dossie:gravar',
  'vault:nota', 'vault:salvar',
  'propostas:preview',
  'analise:run'
])

const MAX_ARGS = 8
const MAX_ARG_LEN = 200000

function ehCaminhoSeguro(caminho: unknown): boolean {
  if (typeof caminho !== 'string') return false
  if (!caminho || caminho.length > 1000) return false
  // Bloqueia travessia de diretorio e caminhos absolutos fora do espaco do usuario
  if (caminho.includes('..')) return false
  if (caminho.startsWith('/') && !caminho.startsWith('/home/') && !caminho.startsWith('/Users/')) return false
  if (/^[A-Za-z]:[\\/]/.test(caminho)) return false // C:\, D:\ etc. sem raiz conhecida
  return true
}

function sanitizarArgs(args: unknown[]): unknown[] {
  if (args.length > MAX_ARGS) throw new Error('Demais argumentos para o canal')
  return args.map((a) => {
    if (typeof a === 'string' && a.length > MAX_ARG_LEN) {
      throw new Error('Argumento excede tamanho maximo permitido')
    }
    return a
  })
}

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!invokeChannels.includes(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    // Sanitiza argumentos de canais de caminho
    if (caminhoChannels.has(channel)) {
      const primeiro = args[0]
      if (!ehCaminhoSeguro(primeiro)) {
        return Promise.reject(new Error(`Caminho invalido para o canal ${channel}`))
      }
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
    }
  }
})

void terminalOnChannels

