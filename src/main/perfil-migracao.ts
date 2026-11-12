/**
 * Exporta/importa perfil (contas/IAs/prefs) sem embutir no instalador.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import { dglog } from './dglog'

const ARQUIVOS = [
  'providers-keys.bin',
  'onboarding.json',
  'hardware-profile.json',
  'mcp-prefs.json',
  'workspace.json',
  'tools-falhas.json'
]

function userData(): string {
  return app.getPath('userData')
}

export function exportarPerfil(): { ok: boolean; caminho?: string; erro?: string; arquivos?: string[] } {
  try {
    const win = BrowserWindow.getFocusedWindow()
    const escolha = dialog.showSaveDialogSync(win!, {
      title: 'Exportar perfil DG Editor',
      defaultPath: 'dg-editor-perfil.json',
      filters: [{ name: 'Perfil DG', extensions: ['json'] }]
    })
    if (!escolha) return { ok: false, erro: 'cancelado' }
    const base = userData()
    const payload: Record<string, string | null> = {
      versao: '1',
      exportadoEm: new Date().toISOString(),
      appVersion: app.getVersion()
    }
    const incluidos: string[] = []
    for (const nome of ARQUIVOS) {
      const abs = join(base, nome)
      if (!existsSync(abs)) {
        payload[nome] = null
        continue
      }
      if (nome.endsWith('.bin')) {
        payload[nome] = readFileSync(abs).toString('base64')
      } else {
        payload[nome] = readFileSync(abs, 'utf8')
      }
      incluidos.push(nome)
    }
    const tema = join(base, 'tema.json')
    if (existsSync(tema)) {
      payload['tema.json'] = readFileSync(tema, 'utf8')
      incluidos.push('tema.json')
    }
    writeFileSync(escolha, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, caminho: escolha, arquivos: incluidos }
  } catch (e) {
    dglog('[perfil] export falhou: ' + String(e))
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export function importarPerfil(): { ok: boolean; caminho?: string; erro?: string; arquivos?: string[] } {
  try {
    const win = BrowserWindow.getFocusedWindow()
    const escolha = dialog.showOpenDialogSync(win!, {
      title: 'Importar perfil DG Editor',
      filters: [{ name: 'Perfil DG', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (!escolha?.[0]) return { ok: false, erro: 'cancelado' }
    const bruto = JSON.parse(readFileSync(escolha[0], 'utf8')) as Record<string, string | null>
    const base = userData()
    if (!existsSync(base)) mkdirSync(base, { recursive: true })
    const incluidos: string[] = []
    for (const nome of [...ARQUIVOS, 'tema.json']) {
      const v = bruto[nome]
      if (v == null || v === '') continue
      const abs = join(base, nome)
      if (nome.endsWith('.bin')) {
        writeFileSync(abs, Buffer.from(String(v), 'base64'))
      } else {
        writeFileSync(abs, String(v), 'utf8')
      }
      incluidos.push(nome)
    }
    return { ok: true, caminho: escolha[0], arquivos: incluidos }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export function statusPerfil(): { ok: true; presentes: string[]; userData: string } {
  const base = userData()
  const presentes: string[] = []
  for (const nome of [...ARQUIVOS, 'tema.json']) {
    if (existsSync(join(base, nome))) presentes.push(nome)
  }
  try {
    if (existsSync(join(base, 'auth')) && readdirSync(join(base, 'auth')).length) {
      presentes.push('auth/')
    }
  } catch {
    /* */
  }
  return { ok: true, presentes, userData: base }
}
