/**
 * IPC export/import de perfil (userData seletivo).
 */
import { ipcMain } from 'electron'
import { dglog } from '../dglog'
import { exportarPerfil, importarPerfil, statusPerfil } from '../perfil-migracao'

export function registrarHandlersPerfil(): void {
  dglog('[ipc:perfil] registrando...')
  ipcMain.handle('perfil:status', () => statusPerfil())
  ipcMain.handle('perfil:exportar', () => exportarPerfil())
  ipcMain.handle('perfil:importar', () => importarPerfil())
}
