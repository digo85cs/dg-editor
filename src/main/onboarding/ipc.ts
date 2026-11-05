import { ipcMain } from 'electron'
import { statusOnboarding, concluirOnboarding, resetarOnboarding } from './first-run'

export function registrarOnboardingIpc() {
  ipcMain.handle('onboarding:status', () => statusOnboarding())
  ipcMain.handle('onboarding:concluir', () => concluirOnboarding())
  ipcMain.handle('onboarding:resetar', () => resetarOnboarding())
}
