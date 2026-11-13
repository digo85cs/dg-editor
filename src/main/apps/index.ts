/**
 * Construtor "Apps": APK Android (Capacitor) + instalador Windows.
 * O trabalho pesado fica em scripts/apps; aqui expomos status e execução.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ArtefatoApp = {
  nome: string
  caminho: string
  bytes: number
  atualizadoEm: string
}

export type StatusApps = {
  ok: boolean
  versao: string
  sdk: { ok: boolean; pasta: string; java: string | null; pacotes: string[] }
  projeto: { mobile: boolean; dependencias: boolean; androidGerado: boolean }
  pastas: { dist: string; oneDrive: string }
  apk: ArtefatoApp[]
  instaladores: ArtefatoApp[]
  publicados: ArtefatoApp[]
  disponivel: boolean
  erro?: string
}

function raizRepo(): string {
  if (process.env.DG_REPO_DIR) return process.env.DG_REPO_DIR
  const provavel = join(__dirname, '..', '..')
  if (existsSync(join(provavel, 'scripts', 'apps', 'build.cjs'))) return provavel
  return process.cwd()
}

function scriptBuild(): string {
  return join(raizRepo(), 'scripts', 'apps', 'build.cjs')
}

export function pastaOneDriveApp(): string {
  if (process.env.DG_ONEDRIVE_APP) return process.env.DG_ONEDRIVE_APP
  const oneDrive = process.env.OneDrive || join(homedir(), 'OneDrive')
  return join(oneDrive, 'APP')
}

function pastaSdk(): string {
  if (process.env.DG_ANDROID_SDK) return process.env.DG_ANDROID_SDK
  return process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'dg-editor', 'android-sdk')
    : join(homedir(), '.dg-editor', 'android-sdk')
}

function versaoMobile(): string {
  try {
    const p = JSON.parse(
      readFileSync(join(raizRepo(), 'apps', 'mobile', 'package.json'), 'utf8')
    ) as { version?: string }
    return String(p.version || '0.1.0')
  } catch {
    return '0.1.0'
  }
}

function listar(dir: string, ext: RegExp): ArtefatoApp[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((f) => ext.test(f))
      .map((f) => {
        const caminho = join(dir, f)
        const st = statSync(caminho)
        return { nome: f, caminho, bytes: st.size, atualizadoEm: st.mtime.toISOString() }
      })
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
  } catch {
    return []
  }
}

export function statusApps(): StatusApps {
  const raiz = raizRepo()
  const sdkDir = pastaSdk()
  let sdkOk = false
  let java: string | null = null
  let pacotes: string[] = []
  try {
    const j = JSON.parse(readFileSync(join(sdkDir, '.dg-toolchain.json'), 'utf8')) as {
      ok?: boolean
      java?: string
      pacotes?: string[]
    }
    sdkOk = j.ok === true
    java = typeof j.java === 'string' ? j.java : null
    pacotes = Array.isArray(j.pacotes) ? j.pacotes : []
  } catch {
    /* ainda não instalado */
  }
  const dist = join(raiz, 'dist-apps')
  const oneDrive = pastaOneDriveApp()
  const disponivel = existsSync(scriptBuild())
  return {
    ok: sdkOk && disponivel,
    versao: versaoMobile(),
    sdk: { ok: sdkOk, pasta: sdkDir, java, pacotes },
    projeto: {
      mobile: existsSync(join(raiz, 'apps', 'mobile')),
      dependencias: existsSync(join(raiz, 'apps', 'mobile', 'node_modules', '@capacitor', 'cli')),
      androidGerado: existsSync(join(raiz, 'apps', 'mobile', 'android'))
    },
    pastas: { dist, oneDrive },
    apk: listar(dist, /\.apk$/i),
    instaladores: listar(join(raiz, 'dist-app'), /\.exe$/i),
    publicados: [...listar(oneDrive, /\.apk$/i), ...listar(oneDrive, /\.exe$/i)],
    disponivel,
    erro: disponivel ? undefined : 'scripts/apps não encontrados (build de desenvolvimento)'
  }
}

type ResultadoExecucao = { ok: boolean; codigo: number; log: string; saida: string }

function executarScript(args: string[], timeoutMs: number): Promise<ResultadoExecucao> {
  return new Promise((resolve) => {
    const script = scriptBuild()
    if (!existsSync(script)) {
      resolve({
        ok: false,
        codigo: -1,
        log: 'Construtor Apps indisponível neste build (scripts/apps ausente).',
        saida: ''
      })
      return
    }
    const p = spawn(process.execPath, [script, ...args], {
      cwd: raizRepo(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DG_ONEDRIVE_APP: pastaOneDriveApp()
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const linhas: string[] = []
    let saida = ''
    const empurrar = (d: Buffer) => {
      const txt = String(d)
      saida += txt
      for (const l of txt.split(/\r?\n/)) {
        if (!l.trim()) continue
        linhas.push(l)
        if (linhas.length > 400) linhas.shift()
      }
    }
    p.stdout.on('data', empurrar)
    p.stderr.on('data', empurrar)
    const timer = setTimeout(() => {
      p.kill()
      linhas.push('[apps] tempo limite atingido')
    }, timeoutMs)
    p.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, codigo: -1, log: linhas.join('\n') + '\n' + String(e), saida })
    })
    p.on('close', (codigo) => {
      clearTimeout(timer)
      resolve({ ok: codigo === 0, codigo: codigo ?? -1, log: linhas.join('\n'), saida })
    })
  })
}

export async function instalarToolchainApps(): Promise<ResultadoExecucao> {
  return executarScript(['--setup'], 30 * 60_000)
}

export async function construirApps(tipo: 'apk' | 'win' | 'tudo'): Promise<ResultadoExecucao> {
  return executarScript(['--tipo=' + tipo], tipo === 'apk' ? 60 * 60_000 : 90 * 60_000)
}

export async function publicarApps(): Promise<ResultadoExecucao> {
  return executarScript(['--publicar'], 10 * 60_000)
}
