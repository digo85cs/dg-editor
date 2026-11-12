import { ipcMain } from 'electron'
import { dglog } from '../dglog'
import {
  listarFtpSites,
  salvarFtpSite,
  removerFtpSite,
  testarFtp,
  deployFtp,
  type FtpSite
} from '../deploy/ftp'

export function registrarHandlersDeploy(): void {
  dglog('[ipc:deploy] registrando handlers FTP...')
  ipcMain.handle('deploy:ftp-listar', () => ({ ok: true, sites: listarFtpSites() }))
  ipcMain.handle('deploy:ftp-salvar', (_e, site) => salvarFtpSite((site || {}) as FtpSite))
  ipcMain.handle('deploy:ftp-remover', (_e, id) => {
    if (typeof id !== 'string' || !id.trim()) return { ok: false, erro: 'id obrigatorio' }
    return removerFtpSite(id.trim())
  })
  ipcMain.handle('deploy:ftp-testar', async (_e, id) => {
    if (typeof id !== 'string' || !id.trim()) return { ok: false, erro: 'id obrigatorio' }
    return testarFtp(id.trim())
  })
  ipcMain.handle('deploy:ftp-deploy', async (_e, opts) => {
    const o = (opts || {}) as { id?: string; localPath?: string; remotePath?: string; arquivos?: string[]; dryRun?: boolean }
    if (!o.id) return { ok: false, erro: 'id obrigatorio' }
    return deployFtp({
      id: o.id,
      localPath: o.localPath,
      remotePath: o.remotePath,
      arquivos: Array.isArray(o.arquivos) ? o.arquivos : undefined,
      dryRun: !!o.dryRun
    })
  })
  dglog('[ipc:deploy] handlers OK')
}
