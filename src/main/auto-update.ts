/**
 * Atualização contínua via electron-updater (GitHub Releases).
 * Só ativo em build empacotado; em dev fica desligado.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { dglog } from './dglog'

export type UpdateStatus = {
  ativo: boolean
  empacotado: boolean
  versaoAtual: string
  estado: 'idle' | 'checando' | 'disponivel' | 'baixando' | 'pronta' | 'erro' | 'atualizado'
  versaoRemota?: string
  progresso?: number
  erro?: string
  mensagem: string
}

let status: UpdateStatus = {
  ativo: false,
  empacotado: false,
  versaoAtual: app.getVersion(),
  estado: 'idle',
  mensagem: 'Auto-update em espera'
}

let getMainWindow: (() => BrowserWindow | null) | null = null
let iniciado = false

function publicar(): void {
  const win = getMainWindow?.()
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('update:status', status)
    } catch {
      /* ignore */
    }
  }
}

function setStatus(parcial: Partial<UpdateStatus>): void {
  status = { ...status, ...parcial, versaoAtual: app.getVersion() }
  publicar()
}

export function obterStatusUpdate(): UpdateStatus {
  return { ...status }
}

export async function verificarAtualizacao(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    setStatus({
      ativo: false,
      empacotado: false,
      estado: 'idle',
      mensagem: 'Update completo só no app instalado (outro PC / Program Files)'
    })
    return obterStatusUpdate()
  }
  try {
    const { autoUpdater } = await import('electron-updater')
    setStatus({ estado: 'checando', mensagem: 'Verificando atualizações…', erro: undefined })
    const r = await autoUpdater.checkForUpdates()
    const remota = r?.updateInfo?.version
    if (remota && remota !== app.getVersion()) {
      setStatus({
        estado: 'disponivel',
        versaoRemota: remota,
        mensagem: 'Atualização ' + remota + ' disponível'
      })
    } else {
      setStatus({ estado: 'atualizado', mensagem: 'DG Editor já está na versão mais recente' })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const semFeed =
      /404|Not Found|Unable to find latest|Cannot find channel|ERR_UPDATER|no published/i.test(msg)
    setStatus({
      estado: 'erro',
      erro: msg,
      mensagem: semFeed
        ? 'Sem feed de release no GitHub — app local v' + app.getVersion()
        : 'Falha ao verificar atualização'
    })
  }
  return obterStatusUpdate()
}

export async function instalarAtualizacaoAgora(): Promise<UpdateStatus> {
  if (!app.isPackaged) return obterStatusUpdate()
  try {
    const { autoUpdater } = await import('electron-updater')
    if (status.estado !== 'pronta') {
      await verificarAtualizacao()
    }
    setStatus({ mensagem: 'Reiniciando para aplicar atualização…' })
    autoUpdater.quitAndInstall(false, true)
  } catch (e) {
    setStatus({
      estado: 'erro',
      erro: e instanceof Error ? e.message : String(e),
      mensagem: 'Falha ao instalar atualização'
    })
  }
  return obterStatusUpdate()
}

export function iniciarAutoUpdate(obterJanela: () => BrowserWindow | null): void {
  if (iniciado) return
  iniciado = true
  getMainWindow = obterJanela
  status.empacotado = app.isPackaged
  status.versaoAtual = app.getVersion()

  if (!app.isPackaged) {
    setStatus({
      ativo: false,
      estado: 'idle',
      mensagem: 'Dev mode — auto-update desligado'
    })
    return
  }

  void (async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.logger = {
        info: (m: string) => dglog('[update] ' + m),
        warn: (m: string) => dglog('[update:warn] ' + m),
        error: (m: string) => dglog('[update:erro] ' + m),
        debug: (m: string) => dglog('[update:debug] ' + m)
      } as any

      autoUpdater.on('checking-for-update', () => {
        setStatus({ estado: 'checando', mensagem: 'Verificando atualizações…' })
      })
      autoUpdater.on('update-available', (info) => {
        setStatus({
          ativo: true,
          estado: 'disponivel',
          versaoRemota: info.version,
          mensagem: 'Baixando ' + info.version + '…'
        })
      })
      autoUpdater.on('update-not-available', () => {
        setStatus({ estado: 'atualizado', mensagem: 'Atualizado (' + app.getVersion() + ')' })
      })
      autoUpdater.on('download-progress', (p) => {
        setStatus({
          estado: 'baixando',
          progresso: Math.round(p.percent || 0),
          mensagem: 'Baixando atualização ' + Math.round(p.percent || 0) + '%'
        })
      })
      autoUpdater.on('update-downloaded', (info) => {
        setStatus({
          ativo: true,
          estado: 'pronta',
          versaoRemota: info.version,
          progresso: 100,
          mensagem: 'Atualização pronta — reinicie para aplicar'
        })
      })
      autoUpdater.on('error', (err) => {
        const msg = String(err?.message || err)
        const semFeed =
          /404|Not Found|Unable to find latest|Cannot find channel|ERR_UPDATER|no published/i.test(msg)
        setStatus({
          estado: 'erro',
          erro: msg,
          mensagem: semFeed
            ? 'Sem feed de release no GitHub — app local v' + app.getVersion()
            : 'Erro no auto-update'
        })
      })

      setStatus({ ativo: true, mensagem: 'Auto-update ativo' })
      setTimeout(() => {
        void verificarAtualizacao()
      }, 12_000)
    } catch (e) {
      dglog('[update] init falhou: ' + String(e))
      setStatus({
        ativo: false,
        estado: 'erro',
        erro: String(e),
        mensagem: 'Auto-update indisponivel'
      })
    }
  })()
}

export function registrarUpdateIpc(): void {
  ipcMain.handle('update:status', () => obterStatusUpdate())
  ipcMain.handle('update:verificar', () => verificarAtualizacao())
  ipcMain.handle('update:instalar', () => instalarAtualizacaoAgora())
}
