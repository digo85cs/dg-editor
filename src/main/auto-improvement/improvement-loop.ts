import fs from 'fs'
import path from 'path'
import { autoDiagnosticar } from './self-diagnosis'
import { aplicarPatch, PatchAplicado } from './patch-applier'
import { autoCriarAgentes, listarAgentesComValidacao } from './agent-factory'
import { devinExecutarTarefa, type ResultadoDevin } from '../agent/devin/orchestrator'
import { dglog } from '../dglog'

export type PropostaMelhoria = {
  id: string
  descricao: string
  tipo: 'correcao' | 'refatoracao' | 'novo-agente' | 'nova-tool' | 'atualizacao'
  prioridade: 'baixa' | 'media' | 'alta'
  aplicarAutomaticamente: boolean
}

export type CicloMelhoria = {
  id: string
  timestamp: number
  diagnostico: { ok: boolean; erros: string[] }
  agentesCriados: string[]
  devin: ResultadoDevin | null
  patches: PatchAplicado[]
  validacaoFinal: { ok: boolean; erros: string[] }
  commitFeito: boolean
  sucesso: boolean
}

const CICLOS_DIR = path.join(process.cwd(), '.dg-editor', 'ciclos-melhoria')

export function garantirDirCiclos(): void {
  fs.mkdirSync(CICLOS_DIR, { recursive: true })
}

export async function executarCicloMelhoria(raiz: string): Promise<CicloMelhoria> {
  const id = 'ciclo-' + Date.now()
  dglog('[melhoria] iniciando ciclo ' + id)

  garantirDirCiclos()

  // 1. Auto-diagnóstico
  const diagnostico = autoDiagnosticar()
  dglog('[melhoria] diagnostico: ok=' + diagnostico.ok + ' erros=' + diagnostico.erros.length)

  // 2. Auto-criar agentes necessários (Devin + pesquisador)
  const { criados, erros: errosAgentes } = autoCriarAgentes(raiz)
  dglog('[melhoria] agentes criados: ' + criados.join(', '))

  // 3. Se houver erros, tentar Devin para corrigir
  let devin: ResultadoDevin | null = null
  if (!diagnostico.ok) {
    const objetivo = 'Corrigir automaticamente os seguintes erros no repositório DG Editor:\n' +
      diagnostico.erros.join('\n') +
      '\n\nAplique correções no código fonte, rode typecheck e testes para validar.'
    devin = await devinExecutarTarefa(raiz, objetivo, 'Corrija erros de typecheck, testes e build. Priorize correções mínimas e seguras.')
    dglog('[melhoria] devin: sucesso=' + devin.sucesso)
  }

  // 4. Aplicar patches automáticos simples (se houver)
  const patches: PatchAplicado[] = []
  if (diagnostico.erros.length > 0) {
    const aplicados = requerAplicarPatches(diagnostico.erros)
    patches.push(...aplicados)
  }

  // 5. Validacao final
  const final = autoDiagnosticar()
  const validacaoFinal = { ok: final.ok, erros: final.erros }

  // 6. Commit se houve sucesso
  let commitFeito = false
  if (validacaoFinal.ok && (criados.length > 0 || devin?.sucesso || patches.length > 0)) {
    commitFeito = await tentarCommit(raiz, id, criados, devin, patches)
  }

  const sucesso = validacaoFinal.ok && (criados.length > 0 || devin?.sucesso || patches.length > 0)

  const ciclo: CicloMelhoria = {
    id,
    timestamp: Date.now(),
    diagnostico,
    agentesCriados: criados,
    devin,
    patches,
    validacaoFinal,
    commitFeito,
    sucesso
  }

  fs.writeFileSync(path.join(CICLOS_DIR, id + '.json'), JSON.stringify(ciclo, null, 2), 'utf8')
  dglog('[melhoria] ciclo ' + id + ' finalizado: sucesso=' + sucesso)

  return ciclo
}

function requerAplicarPatches(erros: string[]): PatchAplicado[] {
  const patches: PatchAplicado[] = []
  // Patches simples e seguros são aplicados aqui.
  // Correções complexas são deixadas para o Devin.
  return patches
}

async function tentarCommit(
  raiz: string,
  id: string,
  criados: string[],
  devin: ResultadoDevin | null,
  patches: PatchAplicado[]
): Promise<boolean> {
  try {
    const { execFileSync } = await import('child_process')
    const msg = 'feat(auto-improver): ciclo ' + id +
      ' — agentes=' + criados.join(',') +
      ' devin=' + (devin?.sucesso ? 'ok' : 'nao-executado') +
      ' patches=' + patches.length

    execFileSync('git', ['add', '-A'], { cwd: raiz, encoding: 'utf8' })
    execFileSync('git', ['commit', '-m', msg], { cwd: raiz, encoding: 'utf8' })
    dglog('[melhoria] commit feito: ' + msg)
    return true
  } catch (e: any) {
    dglog('[melhoria] falha ao commitar: ' + String(e))
    return false
  }
}

export function listarCiclos(): CicloMelhoria[] {
  garantirDirCiclos()
  const arquivos = fs.readdirSync(CICLOS_DIR).filter((f) => f.endsWith('.json'))
  return arquivos
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(CICLOS_DIR, f), 'utf8')) as CicloMelhoria
      } catch { return null }
    })
    .filter((c): c is CicloMelhoria => c !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
}
