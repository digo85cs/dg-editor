/**
 * Autocorreção por IA — catálogo fechado + dry-run.
 * Não aplica patch sem passar typecheck/test/qa:ipc.
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import type { ResultadoCenario, CorrecaoAplicada } from '../tipos'

export type TipoCatalogo =
  | 'lint_typecheck'
  | 'typo_ui'
  | 'seletor_css'
  | 'formatacao'

const TIPOS_SEGUROS: TipoCatalogo[] = ['lint_typecheck', 'typo_ui', 'seletor_css', 'formatacao']

export interface PatchProposto {
  arquivo: string
  conteudoNovo: string
  linhasAlteradas: number
  tipo: TipoCatalogo
  descricao: string
}

export interface ResultadoAutocorrecao {
  aplicado: boolean
  dryRun: boolean
  pendenteManual?: boolean
  motivo?: string
  patch?: PatchProposto
  correcao?: CorrecaoAplicada
}

export function classificarFalha(r: ResultadoCenario): TipoCatalogo | null {
  if (r.corrigivel !== true) return null
  const t = ((r.erro || '') + ' ' + (r.detalhe || '') + ' ' + (r.titulo || '')).toLowerCase()
  if (/typeerror|typecheck|cannot find name|is not assignable/.test(t)) return 'lint_typecheck'
  if (/typo|salvarr|ortografia/.test(t)) return 'typo_ui'
  if (/seletor|data-testid|queryselector|not found/.test(t)) return 'seletor_css'
  if (/indent|espa[cç]o|prettier|format/.test(t)) return 'formatacao'
  return null
}

function contarDiffLinhas(a: string, b: string): number {
  const la = a.split(/\r?\n/)
  const lb = b.split(/\r?\n/)
  let n = Math.abs(la.length - lb.length)
  const m = Math.min(la.length, lb.length)
  for (let i = 0; i < m; i++) if (la[i] !== lb[i]) n++
  return n
}

/** Patch determinístico de fixture (sem LLM) — usado quando brain offline ou dry-run de catálogo. */
export function patchFixtureTypo(raiz: string): PatchProposto | null {
  const arq = join(raiz, 'test', 'fixtures', 'typo-ui.txt')
  if (!existsSync(arq)) return null
  const atual = readFileSync(arq, 'utf-8')
  if (!atual.includes('salvarr')) return null
  const novo = atual.replace(/salvarr/g, 'Salvar')
  return {
    arquivo: arq,
    conteudoNovo: novo,
    linhasAlteradas: contarDiffLinhas(atual, novo),
    tipo: 'typo_ui',
    descricao: 'corrige typo salvarr → Salvar'
  }
}

async function pedirPatchBrain(
  raiz: string,
  cenario: ResultadoCenario,
  trecho: string,
  arquivo: string
): Promise<PatchProposto | null> {
  try {
    const { getBrain } = await import('../../main/brain/module')
    const prompt =
      'Retorne SOMENTE o conteudo completo corrigido do arquivo (sem markdown).\n' +
      'Regras: mudanca <= 20 linhas efetivas, 1 arquivo, tipo no catalogo fechado.\n' +
      'Cenario: ' +
      cenario.id +
      '\nErro: ' +
      (cenario.erro || cenario.detalhe || '') +
      '\nArquivo: ' +
      arquivo +
      '\n---\n' +
      trecho
    const r = await getBrain().ask(prompt, 'catalogo: typo_ui|lint|seletor|formatacao', undefined, 'codigo')
    const texto = (r.text || '').trim()
    if (!texto || texto.length < 2) return null
    const atual = readFileSync(arquivo, 'utf-8')
    const linhas = contarDiffLinhas(atual, texto)
    if (linhas > 20) return null
    return {
      arquivo,
      conteudoNovo: texto,
      linhasAlteradas: linhas,
      tipo: classificarFalha(cenario) || 'typo_ui',
      descricao: 'patch via brain.ask'
    }
  } catch {
    return null
  }
}

function rodarGate(raiz: string): { ok: boolean; motivo?: string } {
  try {
    execSync('npm run typecheck', { cwd: raiz, stdio: 'pipe', encoding: 'utf-8' })
    execSync('npm test', { cwd: raiz, stdio: 'pipe', encoding: 'utf-8' })
    execSync('npm run qa:ipc', { cwd: raiz, stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, DG_QA_SEM_PTY: '1' } })
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: String((e as Error)?.message || e).slice(0, 400) }
  }
}

export async function tentarAutocorrecao(
  raiz: string,
  cenario: ResultadoCenario,
  opcoes?: { dryRun?: boolean; arquivo?: string; usarFixture?: boolean }
): Promise<ResultadoAutocorrecao> {
  const dryRun = !!opcoes?.dryRun
  const tipo = classificarFalha(cenario)
  if (!tipo || !TIPOS_SEGUROS.includes(tipo)) {
    return {
      aplicado: false,
      dryRun,
      pendenteManual: true,
      motivo: 'tipo fora do catalogo fechado'
    }
  }

  let patch: PatchProposto | null = null
  if (opcoes?.usarFixture || tipo === 'typo_ui') {
    patch = patchFixtureTypo(raiz)
  }
  if (!patch && opcoes?.arquivo && existsSync(opcoes.arquivo)) {
    const trecho = readFileSync(opcoes.arquivo, 'utf-8').slice(0, 4000)
    patch = await pedirPatchBrain(raiz, cenario, trecho, opcoes.arquivo)
  }
  if (!patch) {
    return {
      aplicado: false,
      dryRun,
      pendenteManual: true,
      motivo: 'brain offline ou patch invalido'
    }
  }
  if (patch.linhasAlteradas > 20) {
    return {
      aplicado: false,
      dryRun,
      pendenteManual: true,
      motivo: 'patch > 20 linhas',
      patch
    }
  }

  if (dryRun) {
    console.log('[qa:ia] DRY-RUN patch em ' + patch.arquivo + ' (' + patch.linhasAlteradas + ' linhas)')
    console.log(patch.conteudoNovo.slice(0, 500))
    return { aplicado: false, dryRun: true, patch, motivo: 'dry-run: nao aplicado' }
  }

  const bak = patch.arquivo + '.qa-bak'
  copyFileSync(patch.arquivo, bak)
  try {
    writeFileSync(patch.arquivo, patch.conteudoNovo, 'utf-8')
    const gate = rodarGate(raiz)
    if (!gate.ok) {
      copyFileSync(bak, patch.arquivo)
      return {
        aplicado: false,
        dryRun: false,
        pendenteManual: true,
        motivo: 'gate falhou: ' + (gate.motivo || ''),
        patch
      }
    }
    const testeId = 'regressao.ia.' + cenario.id.replace(/[^\w.-]+/g, '_')
    const correcao: CorrecaoAplicada = {
      cenarioId: cenario.id,
      descricao: patch.descricao,
      commit: 'pending',
      testeRegressao: testeId
    }
    return { aplicado: true, dryRun: false, patch, correcao }
  } catch (e) {
    try {
      copyFileSync(bak, patch.arquivo)
    } catch {
      /* */
    }
    return {
      aplicado: false,
      dryRun: false,
      pendenteManual: true,
      motivo: String((e as Error)?.message || e),
      patch
    }
  }
}

export function garantirFixtureTypo(raiz: string): string {
  const dir = join(raiz, 'test', 'fixtures')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const arq = join(dir, 'typo-ui.txt')
  if (!existsSync(arq)) {
    writeFileSync(arq, 'Botao: salvarr arquivo\n', 'utf-8')
  } else {
    const t = readFileSync(arq, 'utf-8')
    if (!t.includes('salvarr') && !t.includes('Salvar')) {
      writeFileSync(arq, 'Botao: salvarr arquivo\n', 'utf-8')
    }
  }
  return arq
}
