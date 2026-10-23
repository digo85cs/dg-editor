// Faz a ponte entre o dossiê local do DG Editor e o chat da Adapta ONE.
// Lê .dg-editor/dossie.txt e gera .dg-editor/continuidade.md, um bloco
// Markdown pronto para copiar e colar aqui no chat, mantendo a continuidade
// do trabalho entre DG Editor <-> Adapta ONE <-> Maestro.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { dossieDir as appDossieDir } from './paths'
import { join, dirname } from 'path'
import { dglog } from './dglog'

export interface ContinuidadeResult {
  ok: boolean
  destino?: string
  caminhoDossie?: string
  blocos?: number
  erro?: string
}

// Monta o bloco de continuidade a partir do conteúdo do dossiê
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
    // coleta as linhas de mensagem (DONO: e IA [..]:)
    if (/^\[.*\] (DONO|IA \[)/.test(l)) mensagens.push(l)
  }

  const b: string[] = []
  b.push('# Contexto de Continuidade — DG Editor')
  b.push('')
  b.push('> Este bloco foi gerado automaticamente pelo DG Editor (bridge `continuidade.md`)')
  b.push('> para manter a continuidade do trabalho entre DG Editor, Adapta ONE e Maestro.')
  b.push('')
  b.push('## Resumo do que foi feito até agora (dossiê)')
  b.push('')
  b.push(`- **Projeto (raiz):** \`${raiz || 'n/d'}\``)
  b.push(`- **Mensagens no chat:** ${total || 'n/d'}`)
  b.push(`- **Provedor mais recente:** ${provedor || 'n/d'}`)
  b.push(`- **Atualizado em:** ${atualizado || 'n/d'}`)
  b.push('')
  b.push('### Últimas mensagens (histórico)')
  b.push('')
  for (const m of mensagens) {
    b.push(`\`\`\``)
    b.push(m)
    b.push(`\`\`\``)
  }
  if (mensagens.length === 0) {
    b.push('_(nenhuma mensagem registrada ainda)_')
  }
  b.push('')
  b.push('---')
  b.push('')
  b.push('## Próximo passo sugerido')
  b.push('')
  b.push('Escolha a próxima ação e retorne o resultado aqui no chat da Adapta ONE para seguirmos a evolução deste projeto.')

  return b.join('\n')
}

// Lê o dossiê e grava o continuidade.md ao lado dele
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

// Retorna o diretorio de dossie do app (independente do projeto)
export function dossieDirDoApp(): string {
  return appDossieDir()
}