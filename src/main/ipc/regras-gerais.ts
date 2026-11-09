/**
 * Handlers IPC para regras gerais
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { listarRegrasGerais, obterRegrasAtivas, salvarRegrasGerais, type Regra } from '../regras-gerais';

// ============================================================================
// HANDLERS DE REGRAS GERAIS
// ============================================================================

export function registrarHandlersRegrasGerais(): void {
  dglog('[ipc:regras-gerais] registrando handlers...');

  try {
    ipcMain.handle('dg:regrasgerais:listar', () => ({ ok: true, regras: listarRegrasGerais() }));
    ipcMain.handle('dg:regrasgerais:salvar', (_e: Electron.IpcMainInvokeEvent, r: unknown) =>
      salvarRegrasGerais(Array.isArray(r) ? (r as Regra[]) : [])
    );
    ipcMain.handle('dg:regrasgerais:ativas', () => ({ ok: true, texto: obterRegrasAtivas() }));
    ipcMain.handle('dg:regrasgerais:reordenar', (_e: Electron.IpcMainInvokeEvent, ids: unknown) => {
      try {
        const ordem = Array.isArray(ids) ? ids.map(String) : []
        const regras = listarRegrasGerais()
        const map = new Map(regras.map((r) => [r.id, r]))
        const reordenadas: Regra[] = ordem.map((id) => map.get(id)).filter(Boolean) as Regra[]
        regras.forEach((r) => { if (!ordem.includes(r.id)) reordenadas.push(r) })
        salvarRegrasGerais(reordenadas)
        return { ok: true, regras: reordenadas }
      } catch (e: unknown) {
        return { ok: false, erro: String(e) }
      }
    })
    dglog('[ipc:regras-gerais] handlers registrados!');
  } catch (e: unknown) {
    dglog('[ipc:regras-gerais] erro ao registrar handlers: ' + String(e));
  }
}
