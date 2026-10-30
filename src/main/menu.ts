import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron'
import { DG_APP_NAME, mostrarSobreDg } from './branding'

export type MenuHooks = {
  onAbrirNavegador?: () => void
  /** Encaminha itens de menu para o renderer (janela frameless). */
  onAcao?: (id: string) => void
}

export function installPtBrMenu(hooks: MenuHooks = {}): void {
  const isMac = process.platform === 'darwin'
  const acao = (id: string) => () => hooks.onAcao?.(id)

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Abrir pasta de trabalho...', accelerator: 'CmdOrCtrl+O', click: acao('abrir-pasta') },
        { label: 'Abrir vault Markdown…', click: acao('abrir-vault') },
        { type: 'separator' },
        { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: acao('salvar') },
        { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: acao('fechar-aba') },
        { type: 'separator' },
        ...(isMac
          ? []
          : [{ label: 'Sair', accelerator: 'Alt+F4', click: acao('sair') }])
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', role: 'undo' },
        { label: 'Refazer', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar tudo', role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: acao('recarregar') },
        { label: 'Forçar recarregamento', accelerator: 'CmdOrCtrl+Shift+R', click: acao('forcar-recarregar') },
        { type: 'separator' },
        { label: 'Zoom: aumentar', accelerator: 'CmdOrCtrl+=', click: acao('zoom-in') },
        { label: 'Zoom: diminuir', accelerator: 'CmdOrCtrl+-', click: acao('zoom-out') },
        { label: 'Zoom: padrão', accelerator: 'CmdOrCtrl+0', click: acao('zoom-reset') },
        { type: 'separator' },
        { label: 'Alternar Explorer', accelerator: 'CmdOrCtrl+B', click: acao('toggle-sidebar') },
        { label: 'Alternar painel direito', accelerator: 'CmdOrCtrl+Alt+B', click: acao('toggle-right') },
        { label: 'Alternar terminal', accelerator: 'CmdOrCtrl+`', click: acao('toggle-terminal') },
        { label: 'Alternar tema', click: acao('tema') },
        { type: 'separator' },
        { label: 'Tela cheia', accelerator: 'F11', click: acao('tela-cheia') }
      ]
    },
    {
      label: 'Sistemas',
      submenu: [
        { label: 'Paleta de comandos', accelerator: 'CmdOrCtrl+Shift+P', click: acao('paleta-comandos') },
        { label: 'Quick Open', accelerator: 'CmdOrCtrl+P', click: acao('quick-open') },
        { type: 'separator' },
        { label: 'Contas e saúde', click: acao('contas') },
        { label: 'Configurações', click: acao('config') },
        { label: 'Análise do sistema', click: acao('analisar') },
        { label: 'Auto auditoria', click: acao('auditar') },
        { type: 'separator' },
        {
          label: 'Navegador embutido',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            hooks.onAbrirNavegador?.()
            hooks.onAcao?.('navegador')
          }
        }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o ' + DG_APP_NAME,
          click: () => {
            hooks.onAcao?.('sobre')
            const win = BrowserWindow.getFocusedWindow()
            void mostrarSobreDg(win)          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
