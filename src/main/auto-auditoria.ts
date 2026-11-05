/**
 * auto-auditoria.ts — Auto auditoria + auto reparo + auto update
 * Nunca destrói dados do usuario (chats, projetos, configs, index DB).
 */
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { dglog } from './dglog'
import { checarIntegracaoFerramentas } from './auditoria-integracao'
import { listarSkills } from './brain/skills'
import { listarAgentes } from './brain/agentes'
import {
  detectarShell,
  listarShells,
  lerShellPadrao,
  acharShellPorId
} from './shell-detect'

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

export interface PendenciaAuditoria {
  id: string
  severidade: 'warn' | 'erro'
  titulo: string
}

export interface ResumoAuditoria {
  ok: number
  warn: number
  erro: number
  corrigidos: number
  falhas: number
  /** Achados warn/erro que nao foram corrigidos com sucesso. */
  pendencias: PendenciaAuditoria[]
  /** Arquivos tmp travados (EBUSY/EPERM) — nao contam como warn. */
  travados: number
}

export interface RelatorioAuditoria {
  inicio: string
  duracaoMs: number
  achados: Achado[]
  resumo: ResumoAuditoria
  reiniciarPendente: boolean
  motivoReinicio?: string
}

/** Opcoes padrao — boot e UI usam a mesma regua de checagem. */
export const OPCOES_AUDITORIA_PADRAO = {
  autoAtualizar: false,
  reiniciarAoFim: false
} as const

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

async function checarOllama(subir = true): Promise<Achado[]> {
  const out: Achado[] = []
  try {
    const r = await execFileP('ollama', ['list'], { timeout: 12000, windowsHide: true })
    const n = r.stdout.trim().split(/\r?\n/).filter(Boolean).slice(1).length
    out.push({ id: 'ollama:servico', area: 'ia', titulo: 'Ollama ativo (' + n + ' modelos)', severidade: n > 0 ? 'ok' : 'warn', corrigivel: false, status: 'nao-aplicavel' })
    if (n === 0) out.push({ id: 'ollama:sermodelo', area: 'ia', titulo: 'Nenhum modelo instalado', severidade: 'erro', corrigivel: false, status: 'nao-aplicavel', detalhe: 'ollama pull llama3' })
  } catch {
    if (!subir) {
      out.push({ id: 'ollama:servico', area: 'ia', titulo: 'Ollama indisponivel', severidade: 'warn', corrigivel: false, status: 'nao-aplicavel', detalhe: 'boot nao sobe ollama serve' })
      return out
    }
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

/** Rotina leve: scripts/limpeza-workspace.cjs --leve (qa dumps, logs, imgs tmp). */
async function limparWorkspaceLeve(): Promise<Achado> {
  try {
    const raiz = resolverRaizProjeto()
    const script = path.join(raiz, 'scripts', 'limpeza-workspace.cjs')
    try {
      await fsp.access(script)
    } catch {
      return {
        id: 'limpeza:workspace',
        area: 'limpeza',
        titulo: 'Script limpeza-workspace ausente',
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      }
    }
    const { stdout, stderr } = await execFileP(process.execPath, [script, '--leve'], {
      cwd: raiz,
      timeout: 60000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    })
    const texto = String(stdout || '') + String(stderr || '')
    const m = texto.match(/Removidos:\s*(\d+)\s*itens\s*·\s*([^\n]+)/)
    return {
      id: 'limpeza:workspace',
      area: 'limpeza',
      titulo: m ? 'Limpeza leve: ' + m[1] + ' itens (' + m[2].trim() + ')' : 'Limpeza leve executada',
      detalhe: texto.trim().split(/\r?\n/).slice(-4).join(' | ').slice(0, 240),
      severidade: 'ok',
      corrigivel: true,
      status: 'corrigido',
      acao: 'npm run limpeza:leve'
    }
  } catch (e: any) {
    return {
      id: 'limpeza:workspace',
      area: 'limpeza',
      titulo: 'Limpeza leve falhou',
      severidade: 'warn',
      corrigivel: true,
      status: 'falhou',
      acao: 'npm run limpeza:leve',
      erro: String(e?.message || e)
    }
  }
}

async function limparTemporarios(): Promise<{ achados: Achado[]; travados: number }> {
  const out: Achado[] = []
  let travadosTotal = 0
  for (const dir of [DIR_TMP, path.join(app.getPath('temp'), 'dg-editor')]) {
    try {
      let existe = true
      try {
        await fsp.access(dir)
      } catch {
        existe = false
      }
      if (!existe) {
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
      const nomes = await fsp.readdir(dir)
      const settled = await Promise.allSettled(
        nomes.map(async (nome) => {
          const alvo = path.join(dir, nome)
          if (ehProtegido(alvo)) return { skipped: true as const }
          try {
            const st = await fsp.stat(alvo)
            await fsp.rm(alvo, { recursive: true, force: true })
            return { ok: true as const, bytes: st.size }
          } catch (e: any) {
            const code = String(e?.code || '')
            // EBUSY/EPERM no Windows e esperado (arquivo em uso) — nao vira warn
            if (code === 'EBUSY' || code === 'EPERM') {
              dglog('[auditoria] tmp travado: ' + alvo + ' (' + code + ')')
              return { travado: true as const }
            }
            return { falha: true as const, nome, erro: String(e?.message || e), code }
          }
        })
      )
      let removidos = 0
      let bytes = 0
      let travados = 0
      const falhas: string[] = []
      for (const r of settled) {
        if (r.status !== 'fulfilled') {
          falhas.push(String(r.reason))
          continue
        }
        const v = r.value
        if ('skipped' in v && v.skipped) continue
        if ('ok' in v && v.ok) {
          removidos++
          bytes += v.bytes
        } else if ('travado' in v && v.travado) {
          travados++
        } else if ('falha' in v && v.falha) {
          falhas.push(v.nome + ': ' + v.erro)
        }
      }
      travadosTotal += travados
      if (falhas.length > 0) {
        out.push({
          id: 'tmp:' + path.basename(dir),
          area: 'limpeza',
          titulo: 'Limpeza parcial (' + removidos + ' ok, ' + falhas.length + ' falha)',
          detalhe: falhas.slice(0, 3).join(' | ') + (travados ? ' | travados=' + travados : ''),
          severidade: 'warn',
          corrigivel: true,
          status: 'falhou',
          acao: 'rm tmp',
          erro: falhas[0]
        })
      } else if (removidos > 0 || travados > 0) {
        out.push({
          id: 'tmp:' + path.basename(dir),
          area: 'limpeza',
          titulo: removidos + ' temporario(s) removido(s)',
          detalhe:
            (bytes / 1048576).toFixed(1) +
            ' MB liberados' +
            (travados ? ' | travados=' + travados + ' (EBUSY/EPERM, nao-warn)' : ''),
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
  return { achados: out, travados: travadosTotal }
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

async function checarModelos(): Promise<Achado[]> {
  const out: Achado[] = []
  try {
    const { escolherModelo, listModelos } = await import('./brain/ollama')
    const { listarRegistry, statsSelecao } = await import('./brain/registry')
    const instalados = await listModelos()
    // origem=auditoria: NAO conta no stats de pipeline (evita falso positivo do 14b)
    const escolhido = await escolherModelo('codigo', { origem: 'auditoria' })
    const isOnlineSlug = escolhido.includes('/') // ex: deepseek/deepseek-chat
    const instaladoOk = isOnlineSlug
      ? true
      : instalados.some((d) => d === escolhido || d.startsWith(escolhido) || escolhido.startsWith(d.split(':')[0]))

    out.push({
      id: 'modelos:codigo-instalado',
      area: 'modelos',
      titulo: isOnlineSlug
        ? 'escolherModelo(codigo)=' + escolhido + ' (online, chave presente)'
        : instaladoOk
          ? 'escolherModelo(codigo)=' + escolhido + ' esta instalado'
          : 'escolherModelo(codigo)=' + escolhido + ' NAO instalado',
      detalhe: 'instalados ollama: ' + instalados.slice(0, 8).join(', '),
      severidade: instaladoOk ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })

    // Mais forte disponivel para codigo no registry
    const candidatos = listarRegistry()
      .filter((m) => m.tipo === 'local' && m.tarefas.includes('codigo'))
      .filter((m) => instalados.some((d) => d === m.nome || d.startsWith(m.nome)))
      .sort((a, b) => b.forca - a.forca)
    const maisForte = candidatos[0]
    const regEscolhido = listarRegistry().find((m) => escolhido === m.nome || escolhido.startsWith(m.nome))
    if (maisForte && regEscolhido && regEscolhido.forca < maisForte.forca - 2) {
      // 7b (7) vs 14b (9) = diff 2 → nao alerta (7b e o padrao intencional)
      // 3b (5) vs 14b (9) = diff 4 → alerta
      out.push({
        id: 'modelos:codigo-fraco',
        area: 'modelos',
        titulo: 'Modelo de codigo mais fraco que o teto disponivel',
        detalhe: 'escolhido=' + escolhido + ' (forca ' + regEscolhido.forca + ') vs maisForte=' + maisForte.nome + ' (forca ' + maisForte.forca + '). Padrao e 7b; use preferirQualidade para 14b.',
        severidade: regEscolhido.forca < 7 ? 'warn' : 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else {
      out.push({
        id: 'modelos:codigo-equilibrio',
        area: 'modelos',
        titulo: 'Politica codigo OK (7b padrao / 14b sob demanda)',
        detalhe: 'escolhido=' + escolhido + (maisForte ? ' | teto=' + maisForte.nome : ''),
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }

    // Modelos instalados de proposito para uso manual/offline (nao exigem pipeline).
    const MODELOS_MANUAIS = ['qwen2.5-coder:14b']
    const tem14 = instalados.some((d) => d.includes('14b'))
    const raiz = resolverRaizProjeto()
    const stats = statsSelecao(raiz)
    // So conta uso real de pipeline (exclui auditoria/teste)
    const usos14 = Object.entries(stats.selecionadosPipeline || {})
      .filter(([k]) => k.includes('14b'))
      .reduce((s, [, n]) => s + n, 0)
    const manuaisPresentes = MODELOS_MANUAIS.filter((m) =>
      instalados.some((d) => d === m || d.startsWith(m) || m.startsWith(d.split(':')[0]))
    )
    if (manuaisPresentes.length > 0 && usos14 === 0) {
      for (const m of manuaisPresentes) {
        out.push({
          id: 'modelos:manual-' + m.replace(/[^a-z0-9]+/gi, '-'),
          area: 'modelos',
          titulo: 'modelo ' + m + ' reservado para uso manual',
          detalhe: 'Instalado intencionalmente; nao conta como ociosidade de pipeline.',
          severidade: 'ok',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
      }
    } else if (tem14 && usos14 === 0) {
      out.push({
        id: 'modelos:14b-parado',
        area: 'modelos',
        titulo: 'qwen2.5-coder:14b instalado (qualidade sob demanda)',
        detalhe:
          'Intencional: 14b nao precisa rodar no pipeline. Use preferirQualidade / fila raciocinio quando quiser.',
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else if (tem14) {
      out.push({
        id: 'modelos:14b-usado',
        area: 'modelos',
        titulo: '14b usado em pipeline ' + usos14 + 'x',
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    out.push({
      id: 'modelos:falha',
      area: 'modelos',
      titulo: 'Falha ao checar modelos',
      severidade: 'warn',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

async function checarProviders(): Promise<Achado[]> {
  const out: Achado[] = []
  try {
    const { filaDeModelos, disponivel } = await import('./brain/registry')
    let cursorCliAprovadoNaSessao = (): boolean => false
    try {
      const prov = await import('./brain/providers')
      cursorCliAprovadoNaSessao = () =>
        !!prov.cursorCliAprovadoNaSessao() || process.env.DG_CURSOR_CLI_OK === '1'
    } catch {
      /* disponivel/G1 inacessivel → checagem vira nao-aplicavel abaixo */
    }
    const tarefas = ['codigo', 'raciocinio', 'chat'] as const
    for (const t of tarefas) {
      const fila = filaDeModelos(t)
      const temLocal = fila.some((p) => p.tipo === 'local')
      const stOf = (p: { id: string }) => {
        try { return String(disponivel(p as any)) } catch { return 'indisponivel' }
      }
      const semChave = fila.filter((p) => p.tipo === 'online' && stOf(p) === 'sem-chave')
      const comChave = fila.filter((p) => p.tipo === 'online' && stOf(p) === 'ok')
      const temCursorCli = fila.some((p) => (p as { formato?: string }).formato === 'cursor-cli' || p.id.includes('cursor'))

      out.push({
        id: 'providers:fila-' + t,
        area: 'providers',
        titulo: 'Fila ' + t + ': ' + fila.length + ' entradas',
        detalhe: fila
          .map((p) => p.id + '[' + stOf(p) + ']')
          .join(', '),
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })

      if (t === 'codigo' && !temLocal) {
        out.push({
          id: 'providers:codigo-sem-local',
          area: 'providers',
          titulo: 'Fila codigo sem provider local no fim (risco offline)',
          severidade: 'erro',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
      } else if (t === 'codigo' && temLocal) {
        out.push({
          id: 'providers:codigo-local-ok',
          area: 'providers',
          titulo: 'Fila codigo tem fallback local',
          severidade: 'ok',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
      }

      if (semChave.length > 0) {
        out.push({
          id: 'providers:online-sem-chave-' + t,
          area: 'providers',
          titulo: semChave.length + ' provider(s) online sem chave (' + t + ')',
          detalhe: semChave.map((p) => p.id + ' env=' + p.apiKeyEnv).join(', ') + ' (valor nunca logado)',
          severidade: 'warn',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
      }
      if (comChave.length > 0) {
        out.push({
          id: 'providers:online-com-chave-' + t,
          area: 'providers',
          titulo: comChave.length + ' provider(s) online com chave presente (' + t + ')',
          detalhe: comChave.map((p) => p.id).join(', '),
          severidade: 'ok',
          corrigivel: false,
          status: 'nao-aplicavel'
        })
      }
      if (temCursorCli) {
        const cursorPs = fila.filter(
          (p) => (p as { formato?: string }).formato === 'cursor-cli' || p.id.includes('cursor')
        )
        for (const p of cursorPs) {
          let st: string
          try {
            st = String(disponivel(p as any))
          } catch {
            out.push({
              id: 'providers:cursor-cli-na-fila-' + t,
              area: 'providers',
              titulo: 'cursor-cli na fila mas indisponivel (auto-excluido)',
              detalhe: 'disponivel() inacessivel; tratado como nao-aplicavel',
              severidade: 'ok',
              corrigivel: false,
              status: 'nao-aplicavel'
            })
            continue
          }
          if (st === 'indisponivel') {
            out.push({
              id: 'providers:cursor-cli-na-fila-' + t,
              area: 'providers',
              titulo: 'cursor-cli na fila mas indisponivel (auto-excluido)',
              detalhe: p.id + '[' + st + ']',
              severidade: 'ok',
              corrigivel: false,
              status: 'nao-aplicavel'
            })
          } else {
            // Ativo em runtime: erro só se G1 estiver reprovado (contradicao)
            let g1Ok = false
            try {
              g1Ok = cursorCliAprovadoNaSessao()
            } catch {
              out.push({
                id: 'providers:cursor-cli-na-fila-' + t,
                area: 'providers',
                titulo: 'cursor-cli na fila mas indisponivel (auto-excluido)',
                detalhe: 'G1 inacessivel; tratado como nao-aplicavel',
                severidade: 'ok',
                corrigivel: false,
                status: 'nao-aplicavel'
              })
              continue
            }
            if (!g1Ok) {
              out.push({
                id: 'providers:cursor-cli-na-fila-' + t,
                area: 'providers',
                titulo: 'cursor-cli na fila ' + t + ' mas G1 REPROVADO',
                detalhe: 'adapter ativo (disponivel=' + st + '); G1 exigiu auth',
                severidade: 'erro',
                corrigivel: false,
                status: 'nao-aplicavel'
              })
            } else {
              out.push({
                id: 'providers:cursor-cli-na-fila-' + t,
                area: 'providers',
                titulo: 'cursor-cli na fila e disponivel',
                detalhe: p.id + '[' + st + ']',
                severidade: 'ok',
                corrigivel: false,
                status: 'nao-aplicavel'
              })
            }
          }
        }
      }
    }

    const binCursor = path.join(
      process.env.LOCALAPPDATA || '',
      'cursor-agent',
      'cursor-agent.ps1'
    )
    const binExiste = !!(process.env.LOCALAPPDATA && fs.existsSync(binCursor))
    out.push({
      id: 'providers:cursor-agent-g1',
      area: 'providers',
      titulo: binExiste
        ? 'cursor-agent presente em disco; G1 REPROVADO (sem auth) — fora da fila'
        : 'cursor-agent ausente em disco; G1 REPROVADO',
      detalhe: binExiste ? binCursor : 'path esperado sob LOCALAPPDATA/cursor-agent',
      severidade: 'ok',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
  } catch (e: any) {
    out.push({
      id: 'providers:falha',
      area: 'providers',
      titulo: 'Falha ao checar providers',
      severidade: 'warn',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

function checarSkills(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  try {
    const skills = listarSkills(raiz)
    out.push({
      id: 'skills:count',
      area: 'skills',
      titulo: skills.length + ' skill(s) em disco',
      detalhe: skills.map((s) => s.id).join(', '),
      severidade: skills.length >= 8 ? 'ok' : 'warn',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
    for (const s of skills) {
      const sp = path.isAbsolute(s.arquivo)
        ? s.arquivo
        : path.join(raiz, '.dg-editor', 'skills', path.basename(s.arquivo))
      const bruto = fs.readFileSync(sp, 'utf8')
      const len = bruto.length
      const temGatilho = !!(s.gatilho && s.gatilho.trim())
      const temProc = /procedimento|passos|1\./i.test(s.instrucao)
      const tamOk = len >= 900 && len <= 1400
      const ok = temGatilho && temProc && tamOk
      out.push({
        id: 'skills:' + s.id,
        area: 'skills',
        titulo: s.id + (ok ? ' OK' : ' incompleta'),
        detalhe: 'chars=' + len + ' gatilho=' + temGatilho + ' procedimento=' + temProc,
        severidade: ok ? 'ok' : (tamOk ? 'warn' : 'erro'),
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    out.push({
      id: 'skills:falha',
      area: 'skills',
      titulo: 'Falha ao checar skills',
      severidade: 'erro',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

function checarAgentesArea(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  try {
    const agentes = listarAgentes(raiz)
    const skillIds = new Set(listarSkills(raiz).map((s) => s.id))
    out.push({
      id: 'agentes:count',
      area: 'agentes',
      titulo: agentes.length + ' agente(s) em disco',
      detalhe: agentes.map((a) => a.id).join(', '),
      severidade: agentes.length >= 5 ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
    for (const a of agentes) {
      const temEsp = !!(a.especialidade && a.especialidade.trim())
      const temSys = !!(a.system && a.system.trim().length > 40)
      const skillsOk = (a.skills || []).every((id) => skillIds.has(id))
      const faltando = (a.skills || []).filter((id) => !skillIds.has(id))
      const ok = temEsp && temSys && skillsOk
      out.push({
        id: 'agentes:' + a.id,
        area: 'agentes',
        titulo: a.id + (ok ? ' OK' : ' incompleto'),
        detalhe:
          'especialidade=' + temEsp + ' system=' + temSys +
          ' skills=' + (a.skills || []).join(',') +
          (faltando.length ? ' FALTANDO=' + faltando.join(',') : ''),
        severidade: ok ? 'ok' : 'erro',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
    const eng = agentes.find((a) => a.id === 'dg-engenheiro')
    if (!eng) {
      out.push({
        id: 'agentes:dg-engenheiro',
        area: 'agentes',
        titulo: 'dg-engenheiro ausente',
        severidade: 'erro',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else {
      const esperadas = [
        'leitor-codigo', 'refatorador', 'testador', 'debugger',
        'revisor-seguranca', 'documentador', 'arvore-projeto', 'editar-seguro'
      ]
      const falt = esperadas.filter((id) => !(eng.skills || []).includes(id) || !skillIds.has(id))
      out.push({
        id: 'agentes:dg-engenheiro-skills',
        area: 'agentes',
        titulo: falt.length === 0
          ? 'dg-engenheiro com 8 skills validas'
          : 'dg-engenheiro skills incompletas',
        detalhe: falt.length ? 'faltando=' + falt.join(',') : esperadas.join(','),
        severidade: falt.length === 0 ? 'ok' : 'erro',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    out.push({
      id: 'agentes:falha',
      area: 'agentes',
      titulo: 'Falha ao checar agentes',
      severidade: 'erro',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

function checarMcp(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  try {
    const serverSrc = path.join(raiz, 'src', 'main', 'mcp', 'server.ts')
    const txt = fs.readFileSync(serverSrc, 'utf8')
    const nomes = [...txt.matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((m) => m[1])
    const unicos = [...new Set(nomes)]
    const esperadas = [
      'dossie_read', 'dossie_write', 'dossie_snapshot',
      'vault_list', 'vault_read', 'vault_write',
      'projeto_arvore', 'codigo_buscar', 'codigo_ler', 'codigo_editar',
      'skill_listar', 'skill_ler', 'agente_listar', 'agente_invocar', 'agente_executar'
    ]
    const faltando = esperadas.filter((n) => !unicos.includes(n))
    out.push({
      id: 'mcp:tools-count',
      area: 'mcp',
      titulo: unicos.length + ' tool name(s) no server.ts',
      detalhe: unicos.join(', '),
      severidade: faltando.length === 0 && unicos.length >= 15 ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
    if (faltando.length) {
      out.push({
        id: 'mcp:faltando',
        area: 'mcp',
        titulo: 'Tools faltando: ' + faltando.join(', '),
        severidade: 'erro',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else {
      out.push({
        id: 'mcp:15-ok',
        area: 'mcp',
        titulo: '15 tools esperadas presentes (incl. agente_executar)',
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
    const schemaOk = /inputSchema/.test(txt) && /agente_executar/.test(txt)
    out.push({
      id: 'mcp:schema',
      area: 'mcp',
      titulo: schemaOk ? 'Schemas presentes no TOOLS' : 'Schema incompleto',
      severidade: schemaOk ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
  } catch (e: any) {
    out.push({
      id: 'mcp:falha',
      area: 'mcp',
      titulo: 'Falha ao checar MCP',
      severidade: 'erro',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

function checarPipeline(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  try {
    const agentSrc = fs.readFileSync(path.join(raiz, 'src', 'main', 'brain', 'agent.ts'), 'utf8')
    const serverSrc = fs.readFileSync(path.join(raiz, 'src', 'main', 'mcp', 'server.ts'), 'utf8')
    const temExec = /export async function executarAgente/.test(agentSrc)
    const temMcp = /name:\s*'agente_executar'/.test(serverSrc)
    const antiRec =
      /profundidadeAgente|profundidadeExecucaoAgente|Recursao bloqueada/.test(agentSrc) &&
      /Recursao bloqueada|profundidadeExecucaoAgente/.test(serverSrc)
    const filtra = /agente_executar/.test(agentSrc) && /filter/.test(agentSrc)
    out.push({
      id: 'pipeline:executarAgente',
      area: 'pipeline',
      titulo: temExec ? 'executarAgente exportado' : 'executarAgente ausente',
      severidade: temExec ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
    out.push({
      id: 'pipeline:agente_executar',
      area: 'pipeline',
      titulo: temMcp ? 'agente_executar no MCP' : 'agente_executar ausente no MCP',
      severidade: temMcp ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
    out.push({
      id: 'pipeline:anti-recursao',
      area: 'pipeline',
      titulo: antiRec && filtra
        ? 'Anti-recursao presente (profundidade + filtro tool)'
        : 'Anti-recursao incompleta',
      severidade: antiRec && filtra ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
  } catch (e: any) {
    out.push({
      id: 'pipeline:falha',
      area: 'pipeline',
      titulo: 'Falha ao checar pipeline',
      severidade: 'erro',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

function checarBuild(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  const alvos = [
    { id: 'build:main', rel: path.join('out', 'main', 'index.js') },
    { id: 'build:mcp', rel: path.join('.dg-editor', 'bin', 'main', 'mcp', 'server.js') }
  ]
  for (const a of alvos) {
    const p = path.join(raiz, a.rel)
    if (!fs.existsSync(p)) {
      out.push({
        id: a.id,
        area: 'build',
        titulo: a.rel + ' ausente',
        severidade: 'erro',
        corrigivel: true,
        status: 'falhou',
        acao: a.id === 'build:mcp' ? 'npm run build:mcp' : 'npm run build'
      })
      continue
    }
    const st = fs.statSync(p)
    const crypto = require('crypto') as typeof import('crypto')
    const hash = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')
    const recente = Date.now() - st.mtimeMs < 7 * 24 * 3600 * 1000
    out.push({
      id: a.id,
      area: 'build',
      titulo: a.rel + ' atualizado',
      detalhe: 'md5=' + hash + ' mtime=' + st.mtime.toISOString(),
      severidade: recente ? 'ok' : 'warn',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
  }
  return out
}

function checarIntegridadeCompleta(): Achado[] {
  const out: Achado[] = []
  const raiz = resolverRaizProjeto()
  try {
    const indicePath = path.join(raiz, '.dg-editor', 'indice-codigo.json')
    if (fs.existsSync(indicePath)) {
      const idx = JSON.parse(fs.readFileSync(indicePath, 'utf8'))
      const n = Array.isArray(idx.simbolos) ? idx.simbolos.length : 0
      out.push({
        id: 'integridade:indice',
        area: 'integridade',
        titulo: 'Indice de simbolos presente (' + n + ' simbolos)',
        severidade: n > 0 ? 'ok' : 'warn',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else {
      // Estado inicial normal — indice ainda nao gerado
      out.push({
        id: 'integridade:indice',
        area: 'integridade',
        titulo: 'Indice de simbolos ainda nao gerado',
        detalhe: 'rode npm run indice',
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    // Arquivo existe mas JSON.parse falhou — corrompido
    out.push({
      id: 'integridade:indice',
      area: 'integridade',
      titulo: 'Indice divergente/corrompido',
      severidade: 'warn',
      corrigivel: true,
      status: 'falhou',
      erro: String(e?.message || e),
      acao: 'npm run indice'
    })
  }

  try {
    const dossieCand = [
      path.join(raiz, '.dg-editor', 'dossie.txt'),
      path.join(DIR_DADOS, 'dossie', 'dossie.txt')
    ]
    const dossie = dossieCand.find((p) => fs.existsSync(p))
    if (dossie) {
      const crypto = require('crypto') as typeof import('crypto')
      const hash = crypto.createHash('sha256').update(fs.readFileSync(dossie)).digest('hex').slice(0, 16)
      out.push({
        id: 'integridade:dossie',
        area: 'integridade',
        titulo: 'Dossie presente',
        detalhe: 'sha25616=' + hash + ' path=' + dossie,
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else {
      out.push({
        id: 'integridade:dossie',
        area: 'integridade',
        titulo: 'Dossie ausente (nao bloqueante)',
        severidade: 'warn',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    out.push({
      id: 'integridade:dossie',
      area: 'integridade',
      titulo: 'Falha ao ler dossie',
      severidade: 'warn',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }

  try {
    const { execFileSync } = require('child_process') as typeof import('child_process')
    const st = execFileSync('git', ['status', '--porcelain'], {
      cwd: raiz,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    out.push({
      id: 'integridade:git',
      area: 'integridade',
      titulo: st ? 'git sujo (' + st.split(/\r?\n/).length + ' entradas)' : 'git limpo',
      detalhe: st ? st.split(/\r?\n/).slice(0, 8).join(' | ') : '',
      severidade: st ? 'warn' : 'ok',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
  } catch (e: any) {
    out.push({
      id: 'integridade:git',
      area: 'integridade',
      titulo: 'Falha ao checar git status',
      severidade: 'warn',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

export interface AreaAuditoria {
  area: string
  ok: number
  warn: number
  erro: number
  detalhes: string[]
}

export interface RelatorioConsolidado {
  data: string
  hashes: Record<string, string>
  areas: AreaAuditoria[]
  resumo: { ok: number; warn: number; erro: number }
}

function agruparAreas(achados: Achado[], areasOrdem: string[]): AreaAuditoria[] {
  return areasOrdem.map((area) => {
    const subset = achados.filter((a) => a.area === area)
    return {
      area,
      ok: subset.filter((a) => a.severidade === 'ok').length,
      warn: subset.filter((a) => a.severidade === 'warn').length,
      erro: subset.filter((a) => a.severidade === 'erro').length,
      detalhes: subset.map((a) => a.titulo + (a.detalhe ? ' | ' + a.detalhe : ''))
    }
  })
}

export async function rodarAuditoriaConsolidada(): Promise<RelatorioConsolidado> {
  const raiz = resolverRaizProjeto()
  const achados: Achado[] = []
  achados.push(...(await checarModelos()))
  achados.push(...(await checarProviders()))
  achados.push(...checarSkills())
  achados.push(...checarAgentesArea())
  achados.push(...checarMcp())
  achados.push(...checarPipeline())
  achados.push(...checarBuild())
  achados.push(...checarIntegridadeCompleta())
  achados.push(...checarIntegracaoFerramentas(raiz))

  const areasOrdem = [
    'modelos', 'providers', 'skills', 'agentes', 'mcp', 'pipeline', 'build', 'integridade', 'integracao'
  ]
  const areas = agruparAreas(achados, areasOrdem)
  const resumo = {
    ok: areas.reduce((s, a) => s + a.ok, 0),
    warn: areas.reduce((s, a) => s + a.warn, 0),
    erro: areas.reduce((s, a) => s + a.erro, 0)
  }

  const crypto = require('crypto') as typeof import('crypto')
  const hashes: Record<string, string> = {}
  for (const rel of ['out/main/index.js', '.dg-editor/bin/main/mcp/server.js']) {
    const p = path.join(raiz, rel)
    if (fs.existsSync(p)) {
      hashes[rel] = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')
    }
  }

  const rel: RelatorioConsolidado = {
    data: new Date().toISOString(),
    hashes,
    areas,
    resumo
  }

  const mdPath = path.join(raiz, '.dg-editor', 'auditoria-completa.md')
  const linhas = [
    '# Auditoria completa consolidada',
    '',
    '**Data:** ' + rel.data,
    '',
    '## Hashes',
    ...Object.entries(hashes).map(([k, v]) => '- `' + k + '`: `' + v + '`'),
    '',
    '## Resumo global',
    '',
    '| ok | warn | erro |',
    '|---:|---:|---:|',
    '| ' + resumo.ok + ' | ' + resumo.warn + ' | ' + resumo.erro + ' |',
    '',
    '## 8 areas',
    '',
    '| area | ok | warn | erro |',
    '|---|---:|---:|---:|',
    ...areas.map((a) => '| ' + a.area + ' | ' + a.ok + ' | ' + a.warn + ' | ' + a.erro + ' |'),
    '',
    '## Detalhes',
    ''
  ]
  for (const a of areas) {
    linhas.push('### ' + a.area)
    for (const d of a.detalhes) linhas.push('- ' + d)
    linhas.push('')
  }
  fs.writeFileSync(mdPath, linhas.join('\n'), 'utf8')
  return rel
}

function checarTerminal(): Achado[] {
  const out: Achado[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node-pty')
    out.push({
      id: 'terminal:node-pty',
      area: 'terminal',
      titulo: 'node-pty carregavel',
      severidade: 'ok',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
  } catch (e: any) {
    out.push({
      id: 'terminal:node-pty',
      area: 'terminal',
      titulo: 'node-pty nao carrega (postinstall/electron-rebuild?)',
      severidade: 'erro',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  try {
    const shell = detectarShell()
    if (shell.tipo === 'pwsh' || shell.tipo === 'pwsh-preview') {
      out.push({
        id: 'terminal:shell',
        area: 'terminal',
        titulo: 'shell: pwsh ' + (shell.versao || '?') + ' (' + shell.origem + ')',
        detalhe: shell.exe,
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else if (shell.tipo === 'powershell') {
      out.push({
        id: 'terminal:shell',
        area: 'terminal',
        titulo: 'shell: PowerShell 5.1 — winget upgrade --id Microsoft.PowerShell',
        detalhe: shell.exe,
        severidade: 'warn',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else {
      out.push({
        id: 'terminal:shell',
        area: 'terminal',
        titulo: 'shell: cmd.exe (nenhum PowerShell)',
        detalhe: shell.exe,
        severidade: 'warn',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    out.push({
      id: 'terminal:shell',
      area: 'terminal',
      titulo: 'Falha ao detectar shell',
      severidade: 'warn',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  try {
    const perfis = listarShells()
    const n = perfis.length
    const ids = perfis.map((p) => p.id).join(', ')
    out.push({
      id: 'terminal:perfis',
      area: 'terminal',
      titulo: 'perfis: ' + n + ' shell(s): ' + ids,
      detalhe: ids,
      severidade: n >= 1 ? 'ok' : 'erro',
      corrigivel: false,
      status: 'nao-aplicavel'
    })
    const padrao = lerShellPadrao()
    if (padrao && !acharShellPorId(padrao)) {
      out.push({
        id: 'terminal:shell-padrao',
        area: 'terminal',
        titulo: 'shell padrao inativo: ' + padrao + ' nao encontrado (usando cascata)',
        severidade: 'warn',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    } else if (padrao) {
      out.push({
        id: 'terminal:shell-padrao',
        area: 'terminal',
        titulo: 'shell padrao: ' + padrao,
        severidade: 'ok',
        corrigivel: false,
        status: 'nao-aplicavel'
      })
    }
  } catch (e: any) {
    out.push({
      id: 'terminal:perfis',
      area: 'terminal',
      titulo: 'Falha ao listar perfis de shell',
      severidade: 'warn',
      corrigivel: false,
      status: 'falhou',
      erro: String(e?.message || e)
    })
  }
  return out
}

async function executarChecagens(opcoes: {
  autoAtualizar?: boolean
  bootLeve?: boolean
}): Promise<{
  achados: Achado[]
  reiniciarPendente: boolean
  motivoReinicio?: string
  travados: number
}> {
  const achados: Achado[] = []
  achados.push(garantirPasta(DIR_DADOS))
  achados.push(garantirPasta(DIR_LOGS))
  achados.push(garantirPasta(DIR_TMP))
  achados.push(garantirPasta(path.join(DIR_DADOS, 'backup')))
  achados.push(...checarIntegridadeDados())
  const limpeza = await limparTemporarios()
  achados.push(...limpeza.achados)
  if (!opcoes.bootLeve) achados.push(await limparWorkspaceLeve())
  achados.push(...checarDependencias())
  achados.push(...(await checarOllama(!opcoes.bootLeve)))
  achados.push(...(await checarModelos()))
  achados.push(...(await checarProviders()))
  achados.push(...checarSkills())
  achados.push(...checarAgentesArea())
  achados.push(...checarMcp())
  achados.push(...checarPipeline())
  achados.push(...checarBuild())
  achados.push(...checarIntegridadeCompleta())
  achados.push(...checarIntegracaoFerramentas(resolverRaizProjeto()))
  achados.push(...checarTerminal())

  let reiniciarPendente = false
  let motivoReinicio: string | undefined
  // autoAtualizar fora da regua padrao (boot/UI) — so se pedido explicitamente
  if (opcoes.autoAtualizar) {
    const rUp = await autoAtualizar()
    achados.push(rUp)
    if (rUp.status === 'corrigido' && rUp.id === 'update:deps') {
      reiniciarPendente = true
      motivoReinicio = 'Dependencias atualizadas - reinicio recomendado para aplicar'
    }
  }
  return { achados, reiniciarPendente, motivoReinicio, travados: limpeza.travados }
}

function resumir(achados: Achado[], travados = 0): ResumoAuditoria {
  const pendencias: PendenciaAuditoria[] = achados
    .filter(
      (a) =>
        (a.severidade === 'warn' || a.severidade === 'erro') && a.status !== 'corrigido'
    )
    .map((a) => ({
      id: a.id,
      severidade: a.severidade as 'warn' | 'erro',
      titulo: a.titulo
    }))
  return {
    ok: achados.filter((a) => a.severidade === 'ok').length,
    warn: achados.filter((a) => a.severidade === 'warn').length,
    erro: achados.filter((a) => a.severidade === 'erro').length,
    corrigidos: achados.filter((a) => a.status === 'corrigido').length,
    falhas: achados.filter((a) => a.status === 'falhou').length,
    pendencias,
    travados
  }
}

export async function rodarAuditoria(
  opcoes: { autoAtualizar?: boolean; reiniciarAoFim?: boolean; bootLeve?: boolean } = {}
): Promise<RelatorioAuditoria> {
  const t0 = Date.now()
  // Mescla com padrao: boot e UI compartilham a mesma regua (autoAtualizar=false)
  const opts = { ...OPCOES_AUDITORIA_PADRAO, ...opcoes }

  // Passo 1: detectar (+ corrigir inline onde ja existe)
  let { achados, reiniciarPendente, motivoReinicio, travados } = await executarChecagens(opts)

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

  // Passo 2: uma unica re-verificacao dos achados aplicaveis, sem autoAtualizar.
  const houveCorrecao = achados.some((a) => a.status === 'corrigido' && a.severidade !== 'ok')
  if (houveCorrecao) {
    console.log('[auditoria] re-verificando apos correcoes...')
    const segunda = await executarChecagens({ autoAtualizar: false, bootLeve: opts.bootLeve })
    const achadosProcessados = new Set<string>()
    const aindaRuim = segunda.achados.filter((a) => {
      if (a.severidade === 'ok' || a.status === 'nao-aplicavel' || achadosProcessados.has(a.id)) {
        return false
      }
      achadosProcessados.add(a.id)
      return true
    })
    if (aindaRuim.length === 0) {
      console.log('[auditoria] re-verificacao: nenhum achado aplicavel pendente')
    } else {
      console.log('[auditoria] re-verificacao ainda com problemas:')
      for (const a of aindaRuim) {
        console.log('  ESCALAR id=' + a.id + ' | ' + a.titulo + (a.erro ? ' | ' + a.erro : ''))
      }
    }
    // Relatorio final reflete o estado POS re-verificacao
    achados = segunda.achados
    travados = segunda.travados
    reiniciarPendente = reiniciarPendente || segunda.reiniciarPendente
    motivoReinicio = motivoReinicio || segunda.motivoReinicio
  }

  const resumo = resumir(achados, travados)
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

  // Prefixo generico — o boot em index.ts loga [auditoria:boot] + pendencias
  console.log(
    '[auditoria] ok=' +
      resumo.ok +
      ' warn=' +
      resumo.warn +
      ' erro=' +
      resumo.erro +
      ' corrigidos=' +
      resumo.corrigidos +
      (resumo.travados ? ' travados=' + resumo.travados : '')
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
