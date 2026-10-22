import { app, Menu, MenuItemConstructorOptions, shell } from 'electron'

export function installPtBrMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Abrir pasta de trabalho...', accelerator: 'CmdOrCtrl+O', click: () => { /* evento via IPC no renderer */ } },
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
    { label: 'Ajuda', submenu: [
      { label: 'Sobre o DG Studio', click: () => { app.showAboutPanel?.() } }
    ]}
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}