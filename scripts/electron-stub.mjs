// Stub minimo do electron para smokes fora do app (scripts/smoke-midia.mjs).
export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s) => Buffer.from(s, 'utf8'),
  decryptString: (b) => b.toString('utf8')
}
export const app = { getPath: () => process.cwd(), getName: () => 'dg-editor-smoke', isPackaged: false }
export const ipcMain = { handle: () => {}, on: () => {} }
export const BrowserWindow = class {}
export const shell = { openPath: async () => '', openExternal: async () => {} }
export const dialog = {}
export const session = { defaultSession: { webRequest: { onBeforeSendHeaders: () => {} } } }
export const nativeTheme = { shouldUseDarkColors: false }
export const Tray = class {}
export const Menu = { buildFromTemplate: () => ({}) }
export const Notification = class {}
export const clipboard = { writeText: () => {}, readText: () => '' }
export default { safeStorage, app, ipcMain, BrowserWindow, shell, dialog, session, nativeTheme, Tray, Menu, Notification, clipboard }
