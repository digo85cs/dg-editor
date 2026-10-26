import { app, Menu, MenuItemConstructorOptions } from 'electron'

export type MenuHooks = {
  onAbrirNavegador?: () => void
}

export function installPtBrMenu(hooks: MenuHooks = {}): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Abrir pasta de trabalho...', accelerator: 'CmdOrCtrl+O', click: () => { /* evento via IPC no renderer */ } },
        { type: 'separator' },
        {
          label: 'Navegador…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => hooks.onAbrirNavegador?.()
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ label: 'Sair', role: 'quit' as const }])
      ]
    },
    { label: 'Editar', submenu: [
      { label: 'Desfazer', role: 'undo' },
      { label: 'Refazer', role: 'redo' },
      { type: 'separator' },
      { label: 'Copiar', role: 'copy' },
      { label: 'Colar', role: 'paste' },
      { label: 'Selecionar tudo', role: 'selectAll' }
    ]},
    { label: 'Ver', submenu: [
      { label: 'Recarregar', role: 'reload' },
      { label: 'Forcar recarregamento', role: 'forceReload' },
      { label: 'Zoom: aumentar', role: 'zoomIn' },
      { label: 'Zoom: diminuir', role: 'zoomOut' },
      { label: 'Zoom: padrao', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Tela cheia', role: 'togglefullscreen' }
    ]},
    { label: 'Sistemas', submenu: [
      { label: 'Paleta de comandos', accelerator: 'CmdOrCtrl+P', click: () => { /* renderer intercepta Ctrl+P */ } },
      { label: 'Contas e saude', click: () => { /* renderer abre modal */ } },
      { label: 'Analise do sistema', click: () => { /* renderer executa */ } },
      { type: 'separator' },
      { label: 'Navegador embutido', accelerator: 'CmdOrCtrl+Shift+N', click: () => hooks.onAbrirNavegador?.() }
    ]},
    { label: 'Ajuda', submenu: [
      { label: 'Sobre o DG Editor', click: () => { app.showAboutPanel?.() } }
    ]}
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
