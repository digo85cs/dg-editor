/**
 * Sandbox de permissão para ferramentas do agente (agent-first).
 *
 * Regras aplicadas no ponto de execução, nunca na interface:
 * - leitura (ler, buscar, status): automática
 * - escrita (editar, vault_write, dossie_write): exige aprovação humana com diff
 * - comando: allowlist explícita; fora da allowlist pergunta ao usuário
 * - destrutivo (rm, rmdir, drop, format, git reset --hard, git checkout --, git clean, > existente):
 *   SEMPRE pergunta, nunca entra na allowlist
 * - rede (deploy, publicar, request para host novo): pergunta + teto
 *
 * Toda decisão é devolvida com permissao, motivo e categoria.
 */
import { dglog } from './dglog'

export type Permissao = 'permitir' | 'perguntar' | 'bloquear'

export interface DecisaoPermissao {
  permissao: Permissao
  motivo: string
  categoria: 'leitura' | 'escrita' | 'comando' | 'destrutivo' | 'rede'
}

/** Allowlist de comandos considerados seguros para execução automática. */
const ALLOWLIST = new Set([
  'npm test',
  'npm run build',
  'npx tsc --noEmit',
  'npx vitest',
  'git status',
  'git diff',
  'git log',
  'ls',
  'dir',
  'type',
  'cat',
  'node -v',
  'npm -v',
  'git branch',
  'git show',
  'git remote -v'
])

/** Ferramentas de leitura: automáticas. */
const TOOLS_LEITURA = new Set([
  'codigo_ler',
  'projeto_arvore',
  'disco_inspecionar',
  'disco_buscar',
  'codigo_buscar',
  'git_status',
  'git_diff',
  'vault_read',
  'dossie_read',
  'skill_ler',
  'skill_listar',
  'agente_listar',
  'conector_listar',
  'vault_list',
  'navegador_ler',
  'ftp_listar'
])

/** Ferramentas de escrita: exigem aprovação com diff. */
const TOOLS_ESCRITA = new Set(['codigo_editar', 'vault_write', 'dossie_write'])

/** Padrões destrutivos detectados em comandos. */
const DESTRUTIVOS = /rm\s+-rf|rmdir\s+-s|del\s+[\/]?q|drop\s+table|truncate|format|git\s+reset\s+--hard|git\s+checkout\s+--[^s]|git\s+clean/gi

/** Ferramentas de rede sensíveis. */
const TOOLS_REDE = new Set(['ftp_deploy', 'midia_pdf', 'midia_planilha', 'apps_build', 'provisionamento_atualizar'])

export function decidirPermissaoTool(nome: string, args?: Record<string, unknown>): DecisaoPermissao {
  if (TOOLS_LEITURA.has(nome)) {
    return { permissao: 'permitir', motivo: 'ferramenta de leitura', categoria: 'leitura' }
  }

  if (TOOLS_ESCRITA.has(nome)) {
    return { permissao: 'perguntar', motivo: 'ferramenta de escrita exige aprovação com diff', categoria: 'escrita' }
  }

  if (TOOLS_REDE.has(nome)) {
    return { permissao: 'perguntar', motivo: 'ferramenta de rede exige aprovação', categoria: 'rede' }
  }

  if (nome === 'terminal_exec' && args?.comando) {
    const cmd = String(args.comando).trim()
    if (ALLOWLIST.has(cmd)) {
      return { permissao: 'permitir', motivo: 'comando na allowlist', categoria: 'comando' }
    }
    if (DESTRUTIVOS.test(cmd)) {
      return { permissao: 'bloquear', motivo: 'comando destrutivo bloqueado mesmo com aprovação', categoria: 'destrutivo' }
    }
    return { permissao: 'perguntar', motivo: 'comando fora da allowlist exige aprovação', categoria: 'comando' }
  }

  return { permissao: 'permitir', motivo: 'ferramenta não classificada, permitida por padrão', categoria: 'leitura' }
}
