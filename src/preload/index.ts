import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const invokeChannels = [
  'auth:get-state', 'auth:ensure-identity', 'auth:logout',
  'system:get-profile', 'system:profile-strength',
  'folder:scan', 'folder:format-summary', 'folder:select',
  'brain:ask', 'brain:providers', 'brain:ollama-status', 'brain:models',
  'analysis:run', 'analysis:cached',
  'whereis:ask',
  'rules:exists', 'rules:read', 'rules:create-template',
  'chat:load', 'chat:send', 'chat:clear'
]

const sendChannels = ['app:quit']

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!invokeChannels.includes(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
    const handler = (event: IpcRendererEvent, ...args: unknown[]) => callback(event, ...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  send: (channel: string, ...args: unknown[]) => {
    if (!sendChannels.includes(channel)) return
    ipcRenderer.send(channel, ...args)
  },
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  quit: () => ipcRenderer.send('app:quit')
})