import { app, dialog, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/** Identidade publica do produto - nunca expor "Electron" na UI. */
export const DG_APP_NAME = 'DG Editor'
export const DG_APP_ID = 'com.dgeditor.app'
export const DG_COPYRIGHT = '(c) Rodrigo Soares'
export const DG_TAGLINE = 'Editor de sistemas com IA local'


export function resolverIconeApp(): string | undefined {
  const candidatos = [
    join(app.getAppPath(), 'resources', 'dg-editor.ico'),
    join(app.getAppPath(), 'resources', 'dg-editor.png'),
    join(app.getAppPath(), 'resources', 'dg-studio.ico'),
    join(process.cwd(), 'resources', 'dg-editor.ico'),
    join(process.cwd(), 'resources', 'dg-editor.png')
  ]
  for (const c of candidatos) {
    if (existsSync(c)) return c
  }
  return undefined
}

/** Chamar ANTES de app.whenReady(). */
export function aplicarIdentidadeDg(): void {
  try {
    app.setName(DG_APP_NAME)
  } catch {
    /* ignore */
  }
  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId(DG_APP_ID)
    } catch {
      /* ignore */
    }
  }
  try {
    app.setAboutPanelOptions({
      applicationName: DG_APP_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: DG_COPYRIGHT,
      credits: DG_TAGLINE
    })
  } catch {
    /* ignore */
  }
}


export async function mostrarSobreDg(parent?: BrowserWindow | null): Promise<void> {
  const iconPath = resolverIconeApp()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined
  const opts = {
    type: 'info' as const,
    title: 'Sobre - ' + DG_APP_NAME,
    message: DG_APP_NAME,
    detail:
      'Versao ' +
      app.getVersion() +
      '\n' +
      DG_TAGLINE +
      '\n' +
      DG_COPYRIGHT,
    buttons: ['OK'],
    noLink: true,
    ...(icon && !icon.isEmpty() ? { icon } : {})
  }
  if (parent && !parent.isDestroyed()) {
    await dialog.showMessageBox(parent, opts)
  } else {
    await dialog.showMessageBox(opts)
  }
}
