/**
 * Agendador de prompts — jobs persistidos em userData rodam em intervalo.
 * Execução: o main detecta job vencido e emite 'agendador:disparo' para a
 * janela, que injeta o prompt no fluxo normal do chat.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { userDataDir } from './paths'
import { dglog } from './dglog'

export interface JobAgendado {
  id: string
  prompt: string
  /** intervalo em minutos */
  cadaMin: number
  raiz: string
  ativo: boolean
  criadoEm: string
  proximoEm: string
  ultimoDisparo?: string
}

function arquivo(): string {
  const dir = userDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'agendador.json')
}

export function listarJobs(): JobAgendado[] {
  try {
    const j = JSON.parse(readFileSync(arquivo(), 'utf8')) as { jobs?: JobAgendado[] }
    return Array.isArray(j.jobs) ? j.jobs : []
  } catch {
    return []
  }
}

function gravar(jobs: JobAgendado[]): void {
  try {
    writeFileSync(arquivo(), JSON.stringify({ jobs }, null, 2), 'utf8')
  } catch (e) {
    dglog('[agendador] falha ao gravar: ' + String(e), undefined, 'warn')
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let enviar: ((payload: { prompt: string; raiz: string; jobId: string }) => void) | null = null

export function registrarEmissorAgendador(fn: (p: { prompt: string; raiz: string; jobId: string }) => void): void {
  enviar = fn
}

export function adicionarJob(opts: { prompt: string; cadaMin: number; raiz: string }): JobAgendado {
  const jobs = listarJobs()
  const job: JobAgendado = {
    id: 'job_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    prompt: opts.prompt.slice(0, 4000),
    cadaMin: Math.max(5, Math.floor(opts.cadaMin)),
    raiz: opts.raiz,
    ativo: true,
    criadoEm: new Date().toISOString(),
    proximoEm: new Date(Date.now() + opts.cadaMin * 60000).toISOString()
  }
  jobs.push(job)
  gravar(jobs)
  return job
}

export function removerJob(id: string): boolean {
  const jobs = listarJobs()
  const resto = jobs.filter((j) => j.id !== id)
  if (resto.length === jobs.length) return false
  gravar(resto)
  return true
}

export function alternarJob(id: string): JobAgendado | null {
  const jobs = listarJobs()
  const j = jobs.find((x) => x.id === id)
  if (!j) return null
  j.ativo = !j.ativo
  if (j.ativo) j.proximoEm = new Date(Date.now() + j.cadaMin * 60000).toISOString()
  gravar(jobs)
  return j
}

function tick(): void {
  const agora = Date.now()
  const jobs = listarJobs()
  let mudou = false
  for (const j of jobs) {
    if (!j.ativo) continue
    if (new Date(j.proximoEm).getTime() > agora) continue
    j.ultimoDisparo = new Date().toISOString()
    j.proximoEm = new Date(agora + j.cadaMin * 60000).toISOString()
    mudou = true
    dglog('[agendador] disparo ' + j.id)
    try {
      enviar?.({ prompt: j.prompt, raiz: j.raiz, jobId: j.id })
    } catch (e) {
      dglog('[agendador] falha no disparo: ' + String(e), undefined, 'warn')
    }
  }
  if (mudou) gravar(jobs)
}

export function iniciarAgendador(): void {
  if (timer) return
  garantirJobInovacao()
  timer = setInterval(tick, 60_000)
  timer.unref?.()
}

/** Job semanal fixo do agente DG Inovador (idempotente pelo marcador no prompt). */
export function garantirJobInovacao(): JobAgendado | null {
  const MARCADOR = '[inovacao-semanal]'
  const jobs = listarJobs()
  const existente = jobs.find((j) => j.prompt.includes(MARCADOR))
  if (existente) return existente
  const job = adicionarJob({
    prompt:
      MARCADOR +
      ' Execute o agente DG Inovador (.dg-editor/agentes/inovador.md): pesquise inovacoes e ferramentas ' +
      'gratuitas para o DG Editor no GitHub e repositorios de referencia, classifique os achados, ' +
      'implemente o que for aplicavel com validacao e grave o relatorio em .dg-editor/inovacoes/.',
    cadaMin: 7 * 24 * 60,
    raiz: process.cwd()
  })
  dglog('[agendador] job de inovacao semanal criado: ' + job.id)
  return job
}

export function pararAgendador(): void {
  if (timer) clearInterval(timer)
  timer = null
}
