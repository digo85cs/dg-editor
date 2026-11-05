import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const invokeChannels = [
  'auth:get-state', 'auth:ensure-identity', 'auth:logout',
  'system:get-profile', 'system:profile-strength',
  'folder:scan', 'folder:format-summary', 'folder:select',
  'brain:ask', 'brain:providers', 'brain:ollama-status', 'brain:models', 'brain:avaliar',
  'analysis:run', 'analysis:cached', 'analysis:choose-scope',
  'whereis:ask',
  'rules:exists', 'rules:read', 'rules:create-template', 'rules:write',
  'chat:load', 'chat:send', 'chat:clear', 'orientar:prompt', 'chat:anexar',
  'chat:salvar', 'chat:listar', 'chat:carregar', 'chat:apagar',
  'git:status', 'git:diff', 'git:repos',
  'accounts:get-state', 'guardian:snapshot', 'guardian:resumo',
  'tema:get', 'tema:set',
  'dossie:ler', 'dossie:gravar', 'dossie:snapshot', 'dossie:caminho',
  'skills:listar', 'mcp:tools', 'mcp:status', 'memoria:status',
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
  'terminal:create', 'terminal:write', 'terminal:resize', 'terminal:kill', 'terminal:shell',
  'terminal:shells', 'terminal:getShellPadrao', 'terminal:setShellPadrao',
  'qa:run',
  'hibrido:analisar', 'hibrido:executar',
  'agente:executar', 'agente:modelo', 'agente:historico',
  'busca:arquivos', 'busca:conteudo', 'busca:cancelar', 'comandos:listar',
  'modelos:listar', 'modelos:recarregar', 'modelos:para-tarefa', 'modelos:versoes-remotas',
  'config:backup', 'sistema:safe-mode', 'app:is-safe-mode',
  'indice:iniciar', 'indice:listar', 'indice:status', 'analysis:invalidar',
  'vault:abrir', 'vault:fechar', 'vault:estado', 'vault:listar',
  'vault:resolver-link', 'vault:backlinks', 'vault:tags', 'vault:nota', 'vault:salvar',
  'openclaw:config-get', 'openclaw:config-set',
  'openclaw:token-set', 'openclaw:token-clear', 'openclaw:token-status',
  'openclaw:pedir', 'openclaw:pendentes', 'openclaw:aplicar', 'openclaw:rejeitar',
  'openclaw:auditoria-listar',
  'agente:pedir', 'agente:orquestrar', 'agente:listar', 'agente:fila-status',
  'agente:cancelar', 'agente:propostas', 'agente:aplicar-proposta', 'agente:rejeitar-proposta',
  'agente:plano-salvar', 'agente:plano-ler', 'agente:plano-limpar', 'agente:executar-plano',
  'agente:plano-marcar-passo', 'agente:plano-atualizar-passos',
  'agente:verificar', 'agente:diagnosticos', 'agente:diagnostico-manual',
  'propostas:listar', 'propostas:hunks', 'propostas:definir-hunks', 'propostas:preview',
  'agente:checkpoint-criar', 'agente:checkpoint-listar', 'agente:checkpoint-restaurar',
  'agente:checkpoint-desfazer', 'contexto:projeto',
  'navegador:embed-status'
]

const terminalOnChannels = ['terminal:data', 'terminal:exit'] as const
const eventOnChannels = [
  'terminal:data',
  'terminal:exit',
  'brain:fallback',
  'navegador:aberto',
  'navegador:fechado',
  'agente:progresso',
  'menu:acao',
  'chat:delta'
] as const

const sendChannels = ['app:quit', 'navegador:bounds', 'navegador:mostrar']

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!invokeChannels.includes(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
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

