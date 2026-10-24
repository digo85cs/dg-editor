/**
 * auto-auditoria.ts — Auto auditoria + auto reparo + auto update
 * Nunca destrói dados do usuario (chats, projetos, configs, index DB).
 */
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

const execFileP = promisify(execFile)

export type Severidade = 'ok' | 'warn' | 'erro'
export type StatusCorrecao = 'corrigido' | 'falhou' | 'nao-aplicavel'

export interface Achado {
  id: string
  area: string
  titulo: string
  severidade: Severidade
  detalhe?: string
  corrigivel: boolean
  status: StatusCorrecao
  acao?: string
  erro?: string
}

export interface RelatorioAuditoria {
  inicio: string
  duracaoMs: number
  achados: Achado[]
  resumo: { ok: number; warn: number; erro: number; corrigidos: number; falhas: number }
  reiniciarPendente: boolean
  motivoReinicio?: string
}

const DIR_DADOS = app.getPath('userData')
const DIR_LOGS = path.join(DIR_DADOS, 'logs')
const DIR_TMP = path.join(DIR_DADOS, 'tmp')

const PROTEGIDOS = ['chats','projetos','projects','sessions','config','settings','index.db','dgrules.json','accounts.json','contexts','Local Storage','IndexedDB','Cookies','Preferences','dg-modo','backup','logs']

function ehProtegido(alvo: string): boolean {
  const base = path.basename(alvo).toLowerCase()
  return PROTEGIDOS.some((p) => base === p.toLowerCase() || base.startsWith(p.toLowerCase() + '.'))
}

function garantirPasta(p: string): Achado {
  const nome = path.basename(p)
  const id = 'pasta:' + nome
  try {
    if (fs.existsSync(p)) return { id, area: 'arquivos', titulo: 'Pasta ' + nome + ' OK', severidade: 'ok', corrigivel: false, status: 'nao-aplicavel' }
    fs.mkdirSync(p, { recursive: true })
    return { id, area: 'arquivos', titulo: 'Pasta ' + nome + ' recriada', severidade: 'warn', corrigivel: true, status: 'corrigido', acao: 'mkdir' }
  } catch (e: any) {
    return { id, area: 'arquivos', titulo: 'Falha ao criar ' + nome, severidade: 'erro', corrigivel: true, status: 'falhou', erro: String(e?.message || e) }
  }
}

async function checarOllama(): Promise<Achado[]> {
  const out: Achado[] = []
  try {
    const r = await execFileP('ollama', ['list'], { timeout: 12000, windowsHide: true })
    const n = r.stdout.trim().split(/\r?\n/).filter(Boolean).slice(1).length
    out.push({ id: 'ollama:servico', area: 'ia', titulo: 'Ollama ativo (' + n + ' modelos)', severidade: n > 0 ? 'ok' : 'warn', corrigivel: false, status: 'nao-aplicavel' })
    if (n === 0) out.push({ id: 'ollama:sermodelo', area: 'ia', titulo: 'Nenhum modelo instalado', severidade: 'erro', corrigivel: false, status: 'nao-aplicavel', detalhe: 'ollama pull llama3' })
  } catch {
    try { await execFileP('ollama', ['serve'], { timeout: 6000, windowsHide: true } as any) } catch {}
    await new Promise((r) => setTimeout(r, 2500))
    try {
      const r2 = await execFileP('ollama', ['list'], { timeout: 12000, windowsHide: true })
      const n2 = r2.stdout.trim().split(/\r?\n/).filter(Boolean).slice(1).length
      out.push({ id: 'ollama:servico', area: 'ia', titulo: 'Ollama reiniciado automaticamente', severidade: 'warn', corrigivel: true, status: 'corrigido', acao: 'ollama serve' })
      out.push({ id: 'ollama:modelos', area: 'ia', titulo: n2 + ' modelos disponiveis', severidade: n2 > 0 ? 'ok' : 'erro', corrigivel: false, status: 'nao-aplicavel' })
    } catch (e: any) {
      out.push({ id: 'ollama:servico', area: 'ia', titulo: 'Ollama indisponivel', severidade: 'erro', corrigivel: true, status: 'falhou', erro: String(e?.message || e) })
    }
  }
  return out
}

function limparTemporarios(): Achado[] {
  const out: Achado[] = []
  for (const dir of [DIR_TMP, path.join(app.getPath('temp'), 'dg-editor')]) {
    try {
      if (!fs.existsSync(dir)) {
        out.push({
          id: 'tmp:' + path.basename(dir),
          area: 'limpeza',
          titulo: 'Pasta tmp ausente (nada a limpar)',
          severidade: 'ok',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
        continue
      }
      if (ehProtegido(dir)) continue
      let removidos = 0
      let bytes = 0
      const falhas: string[] = []
      for (const nome of fs.readdirSync(dir)) {
        const alvo = path.join(dir, nome)
        if (ehProtegido(alvo)) continue
        try {
          bytes += fs.statSync(alvo).size
          fs.rmSync(alvo, { recursive: true, force: true })
          removidos++
        } catch (e: any) {
          falhas.push(nome + ': ' + String(e?.message || e))
        }
      }
      if (falhas.length > 0) {
        out.push({
          id: 'tmp:' + path.basename(dir),
          area: 'limpeza',
          titulo: 'Limpeza parcial (' + removidos + ' ok, ' + falhas.length + ' falha)',
          detalhe: falhas.slice(0, 3).join(' | '),
          severidade: 'warn',
          corrigivel: true,
          status: 'falhou',
          acao: 'rm tmp',
          erro: falhas[0]
        })
      } else if (removidos > 0) {
        out.push({
          id: 'tmp:' + path.basename(dir),
          area: 'limpeza',
          titulo: removidos + ' temporario(s) removido(s)',
          detalhe: (bytes / 1048576).toFixed(1) + ' MB liberados',
          severidade: 'ok',
          corrigivel: true,
          status: 'corrigido',
          acao: 'rm tmp'
        })
      } else {
        out.push({
          id: 'tmp:' + path.basename(dir),
          area: 'limpeza',
          titulo: 'Limpeza: pasta ja vazia',
          detalhe: '0.0 MB',
          severidade: 'ok',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
      }
    } catch (e: any) {
      out.push({
        id: 'tmp:' + path.basename(dir),
        area: 'limpeza',
        titulo: 'Falha ao limpar temporarios',
        severidade: 'warn',
        corrigivel: true,
        status: 'falhou',
        erro: String(e?.message || e)
      })
    }
  }
  return out
}

function resolverRaizProjeto(): string {
  // app.getAppPath() em dev/preview aponta para a raiz do projeto; empacotado
  // aponta para app.asar. Usa cwd como fallback. So aceita caminho que tenha
  // package.json E node_modules juntos.
  const candidatos = [app.getAppPath(), path.resolve(process.cwd())]
  for (const c of candidatos) {
    try {
      if (fs.existsSync(path.join(c, 'package.json')) && fs.existsSync(path.join(c, 'node_modules'))) return c
    } catch {}
  }
  return app.getAppPath()
}

function checarDependencias(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  const nm = path.join(raiz, 'node_modules')
  if (!fs.existsSync(nm)) {
    // Em modo dev/preview o app roda direto do projeto e node_modules sempre
    // existe. Se faltar, ou e bug de resolucao de raiz, ou e build empacotado
    // (nesse caso as deps ja estao em app.asar/node_modules).
    const empacotado = raiz.includes('app.asar') || !fs.existsSync(path.join(raiz, 'package.json'))
    out.push({
      id: 'deps:node_modules',
      area: 'dependencias',
      titulo: empacotado ? 'build empacotado (sem node_modules externo - normal)' : 'node_modules ausente da raiz do projeto',
      detalhe: 'raiz checada: ' + raiz,
      severidade: empacotado ? 'ok' : 'warn',
      corrigivel: !empacotado,
      status: empacotado ? 'nao-aplicavel' : 'falhou',
      acao: empacotado ? undefined : 'npm install'
    })
    return out
  }
  let pkg: any = {}
  try { pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')) } catch {}
  const deps: Record<string, string> = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {})
  const nomes = Object.keys(deps)
  const faltando = nomes.filter((d) => !fs.existsSync(path.join(nm, d)))
  if (faltando.length === 0) {
    out.push({ id: 'deps:ok', area: 'dependencias', titulo: nomes.length + ' dependencias presentes', severidade: 'ok', corrigivel: false, status: 'nao-aplicavel' })
  } else {
    out.push({ id: 'deps:faltando', area: 'dependencias', titulo: faltando.length + ' dependencia(s) faltando', detalhe: faltando.slice(0, 6).join(', '), severidade: 'erro', corrigivel: true, status: 'falhou', acao: 'npm install' })
  }
  return out
}

function checarIntegridadeDados(): Achado[] {
  const out: Achado[] = []
  for (const nome of ['dgrules.json', 'accounts.json', 'settings.json', 'config.json']) {
    const p = path.join(DIR_DADOS, nome)
    if (!fs.existsSync(p)) continue
    try {
      JSON.parse(fs.readFileSync(p, 'utf8'))
      out.push({ id: 'json:' + nome, area: 'dados', titulo: nome + ' integro', severidade: 'ok', corrigivel: false, status: 'nao-aplicavel' })
    } catch {
      try {
        fs.copyFileSync(p, p + '.corrompido-' + Date.now())
        fs.writeFileSync(p, '{}', 'utf8')
        out.push({ id: 'json:' + nome, area: 'dados', titulo: nome + ' corrompido - resetado (backup salvo)', severidade: 'erro', corrigivel: true, status: 'corrigido', acao: 'reset json + backup' })
      } catch (e: any) {
        out.push({ id: 'json:' + nome, area: 'dados', titulo: nome + ' corrompido - falha ao corrigir', severidade: 'erro', corrigivel: true, status: 'falhou', erro: String(e?.message || e) })
      }
    }
  }
  return out
}

async function autoAtualizar(): Promise<Achado> {
  const raiz = resolverRaizProjeto()
  if (!fs.existsSync(path.join(raiz, "package.json"))) {
    return { id: "update:sem-pkg", area: "atualizacao", titulo: "package.json nao encontrado", severidade: "warn", corrigivel: false, status: "nao-aplicavel" }
  }
  try {
    await execFileP("npm", ["install", "--no-audit", "--no-fund"], { cwd: raiz, timeout: 300000, windowsHide: true, shell: true })
    return { id: "update:deps", area: "atualizacao", titulo: "Dependencias sincronizadas", severidade: "ok", corrigivel: true, status: "corrigido", acao: "npm install" }
  } catch (e: any) {
    const msg = String(e?.stderr || e?.message || e)
    // EBUSY / EPERM / locked = arquivo em uso pelo proprio Electron vivo.
    // Nao e defeito: e limitacao fisica de atualizar de dentro de si mesmo.
    const travado = /EBUSY|EPERM|resource busy or locked/i.test(msg)
    if (travado) {
      return {
        id: "update:deps",
        area: "atualizacao",
        titulo: "dependencias em uso pelo app (atualizacao adiada)",
        detalhe: "feche o DG Editor e rode: npm install",
        severidade: "warn",
        corrigivel: false,
        status: "nao-aplicavel",
        acao: "npm install (com app fechado)"
      }
    }
    return { id: "update:deps", area: "atualizacao", titulo: "Falha ao atualizar dependencias", severidade: "erro", corrigivel: true, status: "falhou", erro: msg.slice(0, 400) }
  }
}

async function executarChecagens(opcoes: { autoAtualizar?: boolean }): Promise<{ achados: Achado[]; reiniciarPendente: boolean; motivoReinicio?: string }> {
  const achados: Achado[] = []
  achados.push(garantirPasta(DIR_DADOS))
  achados.push(garantirPasta(DIR_LOGS))
  achados.push(garantirPasta(DIR_TMP))
  achados.push(garantirPasta(path.join(DIR_DADOS, 'backup')))
  achados.push(...checarIntegridadeDados())
  achados.push(...limparTemporarios())
  achados.push(...checarDependencias())
  achados.push(...(await checarOllama()))

  let reiniciarPendente = false
  let motivoReinicio: string | undefined
  if (opcoes.autoAtualizar) {
    const rUp = await autoAtualizar()
    achados.push(rUp)
    if (rUp.status === 'corrigido' && rUp.id === 'update:deps') {
      reiniciarPendente = true
      motivoReinicio = 'Dependencias atualizadas - reinicio recomendado para aplicar'
    }
  }
  return { achados, reiniciarPendente, motivoReinicio }
}

function resumir(achados: Achado[]) {
  return {
    ok: achados.filter((a) => a.severidade === 'ok').length,
    warn: achados.filter((a) => a.severidade === 'warn').length,
    erro: achados.filter((a) => a.severidade === 'erro').length,
    corrigidos: achados.filter((a) => a.status === 'corrigido').length,
    falhas: achados.filter((a) => a.status === 'falhou').length
  }
}

export async function rodarAuditoria(opcoes: { autoAtualizar?: boolean; reiniciarAoFim?: boolean } = {}): Promise<RelatorioAuditoria> {
  const t0 = Date.now()

  // Passo 1: detectar (+ corrigir inline onde ja existe)
  let { achados, reiniciarPendente, motivoReinicio } = await executarChecagens(opcoes)

  const problemasIniciais = achados.filter((a) => a.severidade !== 'ok')
  if (problemasIniciais.length) {
    console.log('[auditoria] detectados ' + problemasIniciais.length + ' achado(s) nao-ok:')
    for (const a of problemasIniciais) {
      console.log(
        '  id=' + a.id +
        ' sev=' + a.severidade +
        ' status=' + a.status +
        ' area=' + a.area +
        ' | ' + a.titulo +
        (a.detalhe ? ' | ' + a.detalhe : '') +
        (a.acao ? ' | acao=' + a.acao : '') +
        (a.erro ? ' | erro=' + a.erro : '')
      )
    }
  }

  // Passo 2: se houve correcao, re-verificar
  const houveCorrecao = achados.some((a) => a.status === 'corrigido')
  if (houveCorrecao) {
    console.log('[auditoria] re-verificando apos correcoes...')
    const segunda = await executarChecagens({ autoAtualizar: false })
    const aindaRuim = segunda.achados.filter((a) => a.severidade !== 'ok')
    if (aindaRuim.length === 0) {
      console.log('[auditoria] re-verificacao: todos ok')
    } else {
      console.log('[auditoria] re-verificacao ainda com problemas:')
      for (const a of aindaRuim) {
        console.log('  ESCALAR id=' + a.id + ' | ' + a.titulo + (a.erro ? ' | ' + a.erro : ''))
      }
    }
    // Relatorio final reflete o estado POS re-verificacao
    achados = segunda.achados
    reiniciarPendente = reiniciarPendente || segunda.reiniciarPendente
    motivoReinicio = motivoReinicio || segunda.motivoReinicio
  }

  const resumo = resumir(achados)
  const relatorio: RelatorioAuditoria = {
    inicio: new Date().toISOString(),
    duracaoMs: Date.now() - t0,
    achados,
    resumo,
    reiniciarPendente,
    motivoReinicio
  }

  try {
    fs.mkdirSync(DIR_LOGS, { recursive: true })
    fs.appendFileSync(path.join(DIR_LOGS, 'auto-auditoria.log'), JSON.stringify(relatorio) + '\n', 'utf8')
  } catch {}

  console.log(
    '[auditoria:boot] ok=' + resumo.ok +
    ' warn=' + resumo.warn +
    ' erro=' + resumo.erro +
    ' corrigidos=' + resumo.corrigidos
  )

  if (resumo.warn > 0 || resumo.erro > 0) {
    const restantes = achados.filter((a) => a.severidade !== 'ok')
    console.log('[auditoria] ' + restantes.length + ' achado(s) nao-ok apos ciclo:')
    for (const a of restantes) {
      const marca = a.severidade === 'erro' ? 'ERRO' : 'WARN'
      console.log('  ' + marca + ' [' + a.area + '] ' + a.titulo + (a.detalhe ? ' | ' + a.detalhe : ''))
    }
  }

  return relatorio
}

let timer: NodeJS.Timeout | null = null

export function iniciarAuditoriaPeriodica(intervaloMs = 1800000) {
  if (timer) clearInterval(timer)
  // Periodica: detectar -> corrigir -> re-verificar -> logar
  timer = setInterval(() => { void rodarAuditoria({ autoAtualizar: false }) }, intervaloMs)
  if (timer.unref) timer.unref()
}

export function pararAuditoriaPeriodica() {
  if (timer) { clearInterval(timer); timer = null }
}
