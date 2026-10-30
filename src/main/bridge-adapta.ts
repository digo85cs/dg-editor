/**
 * Ponte DG Editor ↔ Adapta ONE ↔ Maestro.
 *
 * - ONE: continuidade.md para colar em Contextos do chat
 * - Maestro: comando MCP stdio apontando para o server do DG
 *
 * Sem API HTTP pública da Adapta — integração via contexto + MCP.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { dossieDir as appDossieDir } from './paths'
import { dglog } from './dglog'

export const ADAPTA_URLS = {
  one: 'https://adapta.org/',
  hub: 'https://ia.adapta.org/',
  maestro: 'https://agent.adapta.one/',
  docs: 'https://docs.adapta.org/',
  docsMaestro: 'https://docs.adapta.org/inicio-rapido/maestro',
  docsIntegracoes: 'https://docs.adapta.org/inicio-rapido/integracoes'
} as const

export interface ContinuidadeResult {
  ok: boolean
  destino?: string
  caminhoDossie?: string
  blocos?: number
  erro?: string
}

export type AdaptaStatus = {
  ok: true
  dossieDir: string
  caminhoDossie: string
  caminhoContinuidade: string
  dossieExiste: boolean
  continuidadeExiste: boolean
  mcpServerJs: string
  mcpExiste: boolean
  mcpComando: string
  urls: typeof ADAPTA_URLS
}

export function dossieDirDoApp(): string {
  return appDossieDir()
}

export function caminhoContinuidade(): string {
  return join(dossieDirDoApp(), 'continuidade.md')
}

export function caminhoDossieBridge(): string {
  return join(dossieDirDoApp(), 'dossie.txt')
}

/** Caminho absoluto do MCP compilado (relativo à raiz do projeto). */
export function caminhoMcpServerJs(raizProjeto: string): string {
  return join(raizProjeto, '.dg-editor', 'bin', 'main', 'mcp', 'server.js')
}

/** Comando stdio para colar no conector MCP do Maestro. */
export function comandoMcpMaestro(raizProjeto: string): string {
  const server = caminhoMcpServerJs(raizProjeto)
  // node absoluto-ish: Maestro/Claude Desktop esperam command + args
  return JSON.stringify(
    {
      command: 'node',
      args: [server],
      cwd: raizProjeto
    },
    null,
    2
  )
}

export function statusAdapta(raizProjeto: string): AdaptaStatus {
  const dir = dossieDirDoApp()
  const dossie = join(dir, 'dossie.txt')
  const cont = join(dir, 'continuidade.md')
  const mcp = caminhoMcpServerJs(raizProjeto)
  return {
    ok: true,
    dossieDir: dir,
    caminhoDossie: dossie,
    caminhoContinuidade: cont,
    dossieExiste: existsSync(dossie),
    continuidadeExiste: existsSync(cont),
    mcpServerJs: mcp,
    mcpExiste: existsSync(mcp),
    mcpComando: comandoMcpMaestro(raizProjeto),
    urls: ADAPTA_URLS
  }
}

export function lerContinuidade(): { ok: boolean; texto?: string; caminho?: string; erro?: string } {
  const p = caminhoContinuidade()
  try {
    if (!existsSync(p)) return { ok: false, caminho: p, erro: 'continuidade.md ainda nao existe — use o chat ou Gere continuidade' }
    return { ok: true, texto: readFileSync(p, 'utf8'), caminho: p }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

/** Monta o bloco de continuidade a partir do conteúdo do dossiê */
export function montarBlocoDossie(conteudoDossie: string): string {
  const linhas = conteudoDossie.split(/\r?\n/)

  let raiz = ''
  let total = ''
  let provedor = ''
  let atualizado = ''
  const mensagens: string[] = []

  for (const l of linhas) {
    if (l.startsWith('Raiz:')) raiz = l.replace('Raiz:', '').trim()
    else if (l.startsWith('Total de mensagens')) total = l.replace('Total de mensagens no chat:', '').trim()
    else if (l.startsWith('Provedor mais recente:')) provedor = l.replace('Provedor mais recente:', '').trim()
    else if (l.startsWith('Atualizado em:')) atualizado = l.replace('Atualizado em:', '').trim()
    if (/^\[.*\] (DONO|IA \[)/.test(l)) mensagens.push(l)
  }

  const b: string[] = []
  b.push('# Contexto de Continuidade — DG Editor')
  b.push('')
  b.push('> Gerado pelo DG Editor (`continuidade.md`) para Adapta ONE (Contextos) e Maestro.')
  b.push('')
  b.push('## Resumo do dossiê')
  b.push('')
  b.push(`- **Projeto (raiz):** \`${raiz || 'n/d'}\``)
  b.push(`- **Mensagens no chat:** ${total || 'n/d'}`)
  b.push(`- **Provedor mais recente:** ${provedor || 'n/d'}`)
  b.push(`- **Atualizado em:** ${atualizado || 'n/d'}`)
  b.push('')
  b.push('### Últimas mensagens')
  b.push('')
  for (const m of mensagens) {
    b.push('```')
    b.push(m)
    b.push('```')
  }
  if (mensagens.length === 0) {
    b.push('_(nenhuma mensagem registrada ainda)_')
  }
  b.push('')
  b.push('---')
  b.push('')
  b.push('## Como usar')
  b.push('')
  b.push('1. **Adapta ONE:** + → Contextos → novo contexto "DG Editor" → cole este markdown.')
  b.push('2. **Maestro:** conecte o MCP do DG (ver `docs/adapta.md`) e peça `dossie_read` / tools do projeto.')
  b.push('')
  b.push('## Próximo passo sugerido')
  b.push('')
  b.push('Escolha a próxima ação no ONE ou no Maestro e, se editar código, traga o resultado de volta ao DG Editor.')

  return b.join('\n')
}

export function gerarContinuidade(diretorioDossie: string): ContinuidadeResult {
  try {
    const caminhoDossie = join(diretorioDossie, 'dossie.txt')
    if (!existsSync(caminhoDossie)) {
      return { ok: false, caminhoDossie, erro: 'dossie.txt ainda não existe' }
    }
    const conteudo = readFileSync(caminhoDossie, 'utf8')
    const bloco = montarBlocoDossie(conteudo)

    const destino = join(diretorioDossie, 'continuidade.md')
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, bloco, 'utf8')

    dglog('[bridge] continuidade.md gerado em ' + destino)
    return { ok: true, destino, caminhoDossie, blocos: mensagensCount(conteudo) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    dglog('[bridge] erro ao gerar continuidade: ' + msg)
    return { ok: false, erro: msg }
  }
}

function mensagensCount(conteudo: string): number {
  const m = conteudo.match(/^\[.*\] (DONO|IA \[)/gm)
  return m ? m.length : 0
}

export function urlAdaptaPermitida(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return (
      host === 'adapta.org' ||
      host.endsWith('.adapta.org') ||
      host === 'adapta.one' ||
      host.endsWith('.adapta.one') ||
      host === 'docs.adapta.org' ||
      host === 'agent.adapta.one' ||
      host === 'ia.adapta.org'
    )
  } catch {
    return false
  }
}
