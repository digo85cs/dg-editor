export const ipcMain = {
  handle: (_channel: string, _handler: unknown) => undefined,
  removeHandler: (_channel: string) => undefined,
}
export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
}
export class BrowserWindow {}
export const app = {
  getPath: (_name: string) => process.env.DG_TEST_USERDATA ?? 'C:/tmp/dg-editor-test',
  getVersion: () => '0.0.0-test',
}
export default { ipcMain, dialog, BrowserWindow, app }
