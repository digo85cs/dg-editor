/**
 * IPC extras: onboarding, skills hub, MCP presets, dados, rota, auditoria leve.
 */
import { ipcMain } from 'electron'
import { dglog } from '../dglog'
import { registrarOnboardingIpc } from '../onboarding/ipc'
import { listarSkillsHub, importarSkillMd, salvarSkillsHub } from '../skills-hub'
import { listarPresetsMcp, salvarPresetsMcp } from '../mcp-presets'
import { registrarDadosLocalIpc } from '../dados-local'
import { resolverRotaChat } from '../agent-router'
import { checarIntegracaoFerramentas } from '../auditoria-integracao'
import { resolverRaizProjeto } from '../paths'

export function registrarHubExtras(): void {
  dglog('[ipc:hub-extras] registrando...')
  try {
    registrarOnboardingIpc()
  } catch (e) {
    dglog('[ipc:hub-extras] onboarding: ' + String(e))
  }
  try {
    registrarDadosLocalIpc()
  } catch (e) {
    dglog('[ipc:hub-extras] dados: ' + String(e))
  }

  ipcMain.handle('dg:skills:listar', () => {
    try {
      return { ok: true, skills: listarSkillsHub() }
    } catch (e) {
      return { ok: false, erro: String(e), skills: [] }
    }
  })
  ipcMain.handle('dg:skills:importar', (_e, txt: unknown, nome?: unknown) => {
    const c = typeof txt === 'string' ? txt : ''
    const n = typeof nome === 'string' ? nome : undefined
    if (!c.trim()) return { ok: false, erro: 'conteudo vazio' }
    return importarSkillMd(c, n)
  })
  ipcMain.handle('dg:skills:salvar', (_e, skills: unknown) => {
    if (!Array.isArray(skills)) return { ok: false }
    return salvarSkillsHub(skills as never)
  })

  ipcMain.handle('dg:mcp-presets:listar', () => {
    try {
      return { ok: true, presets: listarPresetsMcp() }
    } catch (e) {
      return { ok: false, erro: String(e), presets: [] }
    }
  })
  ipcMain.handle('dg:mcp-presets:salvar', (_e, presets: unknown) => {
    if (!Array.isArray(presets)) return { ok: false }
    return salvarPresetsMcp(presets as never)
  })

  ipcMain.handle('dg:agente:rotasugerir', (_e, texto: unknown) => {
    const t = typeof texto === 'string' ? texto : ''
    const rota = resolverRotaChat('auto', t || 'oi')
    return { ok: true, rota }
  })

  ipcMain.handle('auditoria:imports', () => {
    try {
      const achados = checarIntegracaoFerramentas(resolverRaizProjeto())
      const quebrados = achados.filter((a) => a.severidade === 'erro')
      return {
        ok: true,
        resumo: {
          quebrados,
          total: achados.length,
          avisos: achados.filter((a) => a.severidade === 'warn').length
        }
      }
    } catch (e) {
      return { ok: false, erro: String(e), resumo: { quebrados: [], total: 0 } }
    }
  })
  ipcMain.handle('auditoria:externa', () => {
    return {
      ok: true,
      resumo: { ok: 0, warn: 0, erro: 0 },
      detalhe: 'use auditoria:rodar para relatorio completo'
    }
  })

  dglog('[ipc:hub-extras] ok')
}
