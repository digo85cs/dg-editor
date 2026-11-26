/**
 * Hooks do agente (agent-first): PreToolUse, PostToolUse, SessionStart.
 *
 * Regras:
 * - PreToolUse: pode permitir, pedir aprovação ou bloquear. É aqui que o sandbox vive.
 * - PostToolUse: valida o resultado da tool.
 * - SessionStart: carrega AGENTS.md e skills.
 *
 * Hook configurável por projeto em .dg-editor/hooks.json e roda comando de shell ou regra interna.
 * Regra dura: hook que BLOQUEIA é soberano; o modelo não pode contornar pedindo de novo na mesma iteração.
 * Se hooks.json estiver corrompido, o padrão seguro é perguntar em tudo que não for leitura.
 */
import fs from 'fs'
import path from 'path'
import { dglog } from './dglog'
import { decidirPermissaoTool } from './sandbox-permissao'

export type TipoHook = 'PreToolUse' | 'PostToolUse' | 'SessionStart'

export interface HookConfig {
  id: string
  tipo: TipoHook
  nome: string
  descricao?: string
  comando?: string
  regra?: string
  bloquear?: boolean
}

export interface DecisaoHook {
  acao: 'permitir' | 'perguntar' | 'bloquear'
  motivo: string
  hookId?: string
}

const hooksCachePorRaiz = new Map<string, HookConfig[]>()

function carregarHooks(raiz: string): HookConfig[] {
  const chave = path.resolve(raiz)
  if (hooksCachePorRaiz.has(chave)) return hooksCachePorRaiz.get(chave)!
  try {
    const arq = path.join(raiz, '.dg-editor', 'hooks.json')
    if (!fs.existsSync(arq)) {
      hooksCachePorRaiz.set(chave, [])
      return []
    }
    const raw = fs.readFileSync(arq, 'utf8')
    const parsed = JSON.parse(raw) as { hooks?: HookConfig[] }
    if (Array.isArray(parsed.hooks)) {
      hooksCachePorRaiz.set(chave, parsed.hooks.filter((h) => h && h.tipo && h.nome))
    } else {
      hooksCachePorRaiz.set(chave, [])
    }
  } catch (e) {
    dglog('[hooks] hooks.json corrompido: ' + String((e as Error)?.message || e))
    hooksCachePorRaiz.set(chave, [])
  }
  return hooksCachePorRaiz.get(chave)!
}

export function limparCacheHooks(raiz?: string): void {
  if (raiz) {
    hooksCachePorRaiz.delete(path.resolve(raiz))
  } else {
    hooksCachePorRaiz.clear()
  }
}

export function executarPreToolUse(raiz: string, toolNome: string, toolArgs?: Record<string, unknown>): DecisaoHook {
  const hooks = carregarHooks(raiz).filter((h) => h.tipo === 'PreToolUse')
  if (hooks.length === 0) {
    // Sem hooks configurados: delega ao sandbox-permissao
    const decisao = decidirPermissaoTool(toolNome, toolArgs)
    return {
      acao: decisao.permissao === 'permitir' ? 'permitir' : decisao.permissao === 'bloquear' ? 'bloquear' : 'perguntar',
      motivo: decisao.motivo
    }
  }

  // Executa hooks na ordem; primeiro bloqueio vence
  for (const hook of hooks) {
    const decisao = executarHookPre(raiz, hook, toolNome, toolArgs)
    if (decisao.acao === 'bloquear') {
      dglog('[hooks] ' + hook.id + ' bloqueou ' + toolNome + ': ' + decisao.motivo)
      return { ...decisao, hookId: hook.id }
    }
    if (decisao.acao === 'perguntar') {
      dglog('[hooks] ' + hook.id + ' pede aprovação para ' + toolNome + ': ' + decisao.motivo)
      return { ...decisao, hookId: hook.id }
    }
  }

  // Todos hooks permitiram: aplica sandbox como fallback
  const decisao = decidirPermissaoTool(toolNome, toolArgs)
  return {
    acao: decisao.permissao === 'permitir' ? 'permitir' : decisao.permissao === 'bloquear' ? 'bloquear' : 'perguntar',
    motivo: decisao.motivo
  }
}

function executarHookPre(raiz: string, hook: HookConfig, toolNome: string, toolArgs?: Record<string, unknown>): DecisaoHook {
  if (hook.regra === 'bloquear') {
    return { acao: 'bloquear', motivo: 'regra interna de bloqueio' }
  }
  if (hook.comando) {
    // Regra simples: se o comando contém o nome da tool, bloqueia
    const cmd = hook.comando.toLowerCase()
    const tool = toolNome.toLowerCase()
    if (cmd.includes(tool)) {
      return { acao: 'bloquear', motivo: 'hook comando bloqueou: ' + hook.comando }
    }
    return { acao: 'permitir', motivo: 'hook comando não bloqueou' }
  }
  return { acao: 'permitir', motivo: 'hook sem regra ou comando' }
}

export function executarPostToolUse(raiz: string, toolNome: string, resultado: string): void {
  const hooks = carregarHooks(raiz).filter((h) => h.tipo === 'PostToolUse')
  for (const hook of hooks) {
    try {
      if (hook.regra === 'bloquear' && resultado.includes('"ok":false')) {
        dglog('[hooks] ' + hook.id + ' PostToolUse bloqueou resultado de ' + toolNome)
      }
    } catch (e) {
      dglog('[hooks] PostToolUse erro: ' + String((e as Error)?.message || e))
    }
  }
}

export function executarSessionStart(raiz: string): void {
  const hooks = carregarHooks(raiz).filter((h) => h.tipo === 'SessionStart')
  for (const hook of hooks) {
    dglog('[hooks] SessionStart: ' + hook.id + ' - ' + (hook.descricao || hook.nome))
  }
  // Carrega AGENTS.md se existir
  try {
    const agents = path.join(raiz, 'AGENTS.md')
    if (fs.existsSync(agents)) {
      dglog('[hooks] AGENTS.md carregado na raiz')
    }
  } catch {
    /* */
  }
}
