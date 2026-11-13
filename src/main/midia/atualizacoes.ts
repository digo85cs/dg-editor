/**
 * Central de atualizações — verifica ComfyUI, nós customizados, memes e vozes.
 *
 * Tudo é opcional e roda fora do repositório. O pull de código só é aplicado
 * quando o ComfyUI está parado; memes podem sincronizar a qualquer momento.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { rodar } from './core'
import { pastaAppComfy, statusComfy } from './comfyui'
import { sincronizarMemes, statusMemes } from './memes'
import { baixarModelos, modelosFaltando, type MotorVoz } from './vozes'

export type IdComponente = 'app' | 'comfyui' | 'animatediff' | 'memes' | 'vozes'

export type ComponenteAtualizacao = {
  id: IdComponente
  nome: string
  instalado: boolean
  versao?: string
  atras?: number
  disponivel?: boolean
  detalhe: string
  acao?: 'pull' | 'sincronizar' | 'baixar'
}

export type ResultadoAtualizacoes = {
  ok: boolean
  verificadoEm: string
  online: boolean
  componentes: ComponenteAtualizacao[]
  novidades: number
  erro?: string
}

type PreferenciasAtualizacao = {
  automatico: boolean
  aplicarAutomatico: boolean
  ultimaVerificacao?: string
}

function pastaDados(): string {
  const base = process.env.DG_ATUALIZACOES_DIR || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'dg-editor') : join(homedir(), '.dg-editor'))
  mkdirSync(base, { recursive: true })
  return base
}

function arquivoPreferencias(): string {
  return join(pastaDados(), 'atualizacoes.json')
}

export function lerPreferenciasAtualizacao(): PreferenciasAtualizacao {
  try {
    const p = JSON.parse(readFileSync(arquivoPreferencias(), 'utf8')) as Partial<PreferenciasAtualizacao>
    return {
      automatico: p.automatico !== false,
      aplicarAutomatico: p.aplicarAutomatico === true,
      ultimaVerificacao: typeof p.ultimaVerificacao === 'string' ? p.ultimaVerificacao : undefined
    }
  } catch {
    return { automatico: true, aplicarAutomatico: false }
  }
}

export function salvarPreferenciasAtualizacao(p: Partial<PreferenciasAtualizacao>): PreferenciasAtualizacao {
  const atual = { ...lerPreferenciasAtualizacao(), ...p }
  writeFileSync(arquivoPreferencias(), JSON.stringify(atual, null, 2), 'utf8')
  return atual
}

async function git(repo: string, args: string[], timeoutMs = 60_000) {
  return rodar('git', ['-C', repo, ...args], timeoutMs, {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0'
  })
}

async function estadoGit(
  repo: string,
  nome: string,
  id: IdComponente,
  rede: boolean
): Promise<ComponenteAtualizacao> {
  if (!existsSync(join(repo, '.git'))) {
    return {
      id,
      nome,
      instalado: false,
      detalhe: 'sem repositório git em ' + repo,
      acao: 'pull'
    }
  }
  const versao = (await git(repo, ['rev-parse', '--short', 'HEAD'], 15_000)).stdout.trim()
  const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], 15_000)).stdout.trim()
  let atras: number | undefined
  let detalhe = versao || 'instalado'
  if (rede) {
    const fetch = await git(repo, ['fetch', '--quiet', '--prune'], 90_000)
    if (!fetch.ok) {
      return {
        id,
        nome,
        instalado: true,
        versao: versao || undefined,
        detalhe: 'versão ' + (versao || '?') + ' (' + branch + '); sem acesso ao upstream agora',
        acao: 'pull'
      }
    }
    const rev = await git(repo, ['rev-list', '--count', 'HEAD..@{u}'], 20_000)
    if (rev.ok && /^\d+$/.test(rev.stdout.trim())) {
      atras = Number(rev.stdout.trim())
      detalhe = atras
        ? atras + ' atualização(ões) disponível(is)'
        : 'versão ' + (versao || '?') + ' em dia (' + branch + ')'
    }
  }
  return {
    id,
    nome,
    instalado: true,
    versao: versao || undefined,
    atras,
    disponivel: atras !== undefined ? atras > 0 : undefined,
    detalhe,
    acao: 'pull'
  }
}

export function versaoLocalApp(): string {
  const candidatos = [
    join(process.cwd(), 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
    join(__dirname, '..', '..', '..', '..', 'package.json')
  ]
  for (const p of candidatos) {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8')) as { name?: string; version?: string }
      if (j.version && (j.name === 'dg-editor' || p === candidatos[0])) return j.version
    } catch {
      /* tenta o próximo */
    }
  }
  return '0.0.0'
}

async function estadoApp(rede: boolean, versaoAtual: string): Promise<ComponenteAtualizacao> {
  const base: ComponenteAtualizacao = {
    id: 'app',
    nome: 'DG Editor (app)',
    instalado: true,
    versao: versaoAtual,
    detalhe: 'versão ' + versaoAtual + ' (verificação local)'
  }
  if (!rede) return base
  try {
    const r = await fetch('https://api.github.com/repos/digo85cs/dg-editor/releases/latest', {
      headers: { 'User-Agent': 'dg-editor', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!r.ok) {
      return {
        ...base,
        detalhe:
          r.status === 404
            ? 'canal de releases ainda não publicado no GitHub'
            : 'sem resposta do canal de releases (HTTP ' + r.status + ')'
      }
    }
    const j = (await r.json()) as { tag_name?: string }
    const tag = String(j.tag_name || '').replace(/^v/i, '')
    const atras = compararVersao(tag, versaoAtual)
    return {
      ...base,
      atras: atras > 0 ? atras : 0,
      disponivel: atras > 0,
      detalhe: atras > 0 ? 'nova versão ' + tag + ' disponível' : 'versão ' + versaoAtual + ' em dia'
    }
  } catch {
    return { ...base, detalhe: 'sem acesso ao canal de releases agora' }
  }
}

function compararVersao(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number(x) || 0)
  const pb = b.split(/[.-]/).map((x) => Number(x) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export async function verificarAtualizacoes(opts: { rede?: boolean; versaoAtual?: string } = {}): Promise<ResultadoAtualizacoes> {
  const rede = opts.rede !== false
  const versaoAtual = opts.versaoAtual || versaoLocalApp()
  const app = pastaAppComfy()
  const [comfy, animatediff, status, memeStatus, appEstado] = await Promise.all([
    estadoGit(app, 'ComfyUI', 'comfyui', rede),
    estadoGit(join(app, 'custom_nodes', 'ComfyUI-AnimateDiff-Evolved'), 'AnimateDiff-Evolved', 'animatediff', rede),
    statusComfy(),
    Promise.resolve(statusMemes()),
    estadoApp(rede, versaoAtual)
  ])
  const faltando = modelosFaltando()
  const motores = (Object.keys(faltando) as MotorVoz[]).filter((m) => faltando[m] === true)
  const componentes: ComponenteAtualizacao[] = [
    appEstado,
    comfy,
    animatediff,
    {
      id: 'memes',
      nome: 'Banco de memes',
      instalado: memeStatus.total > 0,
      versao: memeStatus.total ? memeStatus.total + ' templates' : undefined,
      atras: undefined,
      disponivel: memeStatus.desatualizado,
      detalhe: memeStatus.total
        ? memeStatus.desatualizado
          ? 'manifesto com ' + (memeStatus.idadeDias ?? '?') + ' dias — sincronize'
          : memeStatus.total + ' templates, ' + memeStatus.baixados + ' já baixados'
        : 'não sincronizado',
      acao: 'sincronizar'
    },
    {
      id: 'vozes',
      nome: 'Modelos de voz',
      instalado: motores.length === 0,
      versao: motores.length ? undefined : 'completos',
      disponivel: motores.length > 0,
      detalhe: motores.length ? 'faltam modelos: ' + motores.join(', ') : 'modelos locais completos',
      acao: 'baixar'
    }
  ]
  const novidades = componentes.filter((c) => c.disponivel).length
  const resultado: ResultadoAtualizacoes = {
    ok: true,
    verificadoEm: new Date().toISOString(),
    online: status.online,
    componentes,
    novidades
  }
  salvarPreferenciasAtualizacao({ ultimaVerificacao: resultado.verificadoEm })
  return resultado
}

export type ResultadoAplicacao = {
  id: IdComponente
  ok: boolean
  detalhe: string
}

export async function aplicarAtualizacoes(opts: { componentes?: IdComponente[] } = {}): Promise<{
  ok: boolean
  resultados: ResultadoAplicacao[]
  erro?: string
}> {
  const alvos = new Set(opts.componentes || ['comfyui', 'animatediff', 'memes', 'vozes'])
  const resultados: ResultadoAplicacao[] = []
  const app = pastaAppComfy()

  if (alvos.has('comfyui') || alvos.has('animatediff')) {
    const status = await statusComfy()
    if (status.online) {
      resultados.push({
        id: 'comfyui',
        ok: false,
        detalhe: 'Pare o ComfyUI antes de atualizar o código (a atualização não foi aplicada).'
      })
    } else {
      if (alvos.has('comfyui')) {
        const r = await git(app, ['pull', '--ff-only'], 300_000)
        resultados.push({
          id: 'comfyui',
          ok: r.ok,
          detalhe: r.ok
            ? 'ComfyUI atualizado: ' + (r.stdout.trim().split(/\r?\n/).pop() || 'ok')
            : 'falha no git pull: ' + (r.erro || r.stderr).split(/\r?\n/).slice(-2).join(' ').slice(0, 300)
        })
      }
      if (alvos.has('animatediff')) {
        const repo = join(app, 'custom_nodes', 'ComfyUI-AnimateDiff-Evolved')
        const r = existsSync(join(repo, '.git'))
          ? await git(repo, ['pull', '--ff-only'], 300_000)
          : { ok: false, stdout: '', stderr: 'repositório ausente', erro: undefined }
        resultados.push({
          id: 'animatediff',
          ok: r.ok,
          detalhe: r.ok
            ? 'AnimateDiff-Evolved atualizado: ' + (r.stdout.trim().split(/\r?\n/).pop() || 'ok')
            : 'falha: ' + (r.erro || r.stderr).split(/\r?\n/).slice(-2).join(' ').slice(0, 300)
        })
      }
    }
  }

  if (alvos.has('memes')) {
    const r = await sincronizarMemes({ forcar: true })
    resultados.push({
      id: 'memes',
      ok: r.ok,
      detalhe: r.ok ? 'banco atualizado: ' + r.total + ' templates' : r.erro || 'falha ao sincronizar'
    })
  }

  if (alvos.has('vozes')) {
    const faltando = modelosFaltando()
    const motores = (Object.keys(faltando) as MotorVoz[]).filter((m) => faltando[m] === true)
    if (!motores.length) {
      resultados.push({ id: 'vozes', ok: true, detalhe: 'nenhum modelo faltando' })
    }
    for (const motor of motores) {
      const r = await baixarModelos(motor)
      resultados.push({
        id: 'vozes',
        ok: r.ok,
        detalhe: r.ok ? motor + ': baixado' : motor + ': ' + (r.erro || 'falha')
      })
    }
  }

  return { ok: resultados.every((r) => r.ok), resultados }
}

/** Verificação diária em segundo plano; aplica só o que é seguro automaticamente. */
export async function verificarEmSegundoPlano(): Promise<ResultadoAtualizacoes | null> {
  const p = lerPreferenciasAtualizacao()
  if (!p.automatico) return null
  const ultima = p.ultimaVerificacao ? Date.parse(p.ultimaVerificacao) : 0
  if (Number.isFinite(ultima) && Date.now() - ultima < 24 * 3600_000) return null
  const r = await verificarAtualizacoes({ rede: true })
  if (p.aplicarAutomatico) {
    const alvos: IdComponente[] = ['memes']
    const status = await statusComfy()
    if (!status.online) {
      if (r.componentes.find((c) => c.id === 'comfyui')?.disponivel) alvos.push('comfyui')
      if (r.componentes.find((c) => c.id === 'animatediff')?.disponivel) alvos.push('animatediff')
    }
    if (r.componentes.find((c) => c.id === 'vozes')?.disponivel) alvos.push('vozes')
    await aplicarAtualizacoes({ componentes: alvos })
  }
  return r
}
