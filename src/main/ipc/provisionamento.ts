import { BrowserWindow, ipcMain } from 'electron'
import {
  lerPreferenciasProvisionamento,
  provisionar,
  salvarPreferenciasProvisionamento,
  statusProvisionamento,
  type EventoProgresso,
  type IdProvisionamento
} from '../provisionamento'

/** Envia progresso para todas as janelas (o boot não tem remetente). */
export function enviarProgressoProvisionamento(ev: EventoProgresso): void {
  for (const janela of BrowserWindow.getAllWindows()) {
    try {
      if (!janela.isDestroyed()) janela.webContents.send('prov:progresso', ev)
    } catch {
      /* janela fechando */
    }
  }
}

export function registrarHandlersProvisionamento(): void {
  ipcMain.handle('prov:status', async () => {
    try {
      return await statusProvisionamento()
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e), itens: [], suportado: false, emAndamento: false }
    }
  })

  ipcMain.handle('prov:executar', async (_e, opts?: { forcar?: boolean; componentes?: IdProvisionamento[] }) => {
    const componentes = Array.isArray(opts?.componentes)
      ? opts.componentes.filter((c): c is IdProvisionamento => c === 'ffmpeg' || c === 'python' || c === 'pacotes')
      : undefined
    return provisionar({
      forcar: opts?.forcar === true,
      componentes: componentes && componentes.length ? componentes : undefined,
      onProgresso: enviarProgressoProvisionamento
    })
  })

  ipcMain.handle('prov:preferencias', (_e, p?: { auto?: boolean; atualizar?: boolean }) =>
    p && typeof p === 'object'
      ? salvarPreferenciasProvisionamento({ auto: p.auto, atualizar: p.atualizar })
      : lerPreferenciasProvisionamento()
  )
}
