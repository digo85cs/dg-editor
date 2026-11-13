/**
 * Biblioteca de vozes naturais pt-BR do DG Editor (100% gratuita).
 *
 * Motores locais (offline, rodam em CPU):
 * - Supertonic 3 (OpenRAIL-M): 10 vozes neurais pt, 385 MB de modelos;
 * - Kokoro-82M (Apache-2.0): pf_dora/pm_alex/pm_santa, 115 MB;
 * - Piper (MIT): cadu/faber/jeff/edresson, 250 MB.
 * Motor em nuvem (grátis, precisa de internet): edge-tts (Microsoft).
 *
 * As vozes infantis são derivadas de vozes naturais com deslocamento de tom e
 * formantes via ffmpeg rubberband (não existem modelos infantis pt-BR livres).
 * Os modelos ficam fora do repositório, em %LOCALAPPDATA%/dg-editor/tts.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type MotorVoz = 'supertonic' | 'kokoro' | 'piper' | 'edge'
export type CategoriaVoz = 'mulher' | 'homem' | 'menina' | 'menino' | 'parodia'

export type Voz = {
  id: string
  rotulo: string
  motor: MotorVoz
  estilo: string
  categoria: CategoriaVoz
  descricao: string
  /** Fator de tom (rubberband) para vozes derivadas. */
  tom?: number
  /** Velocidade padrão (ex.: '+14%'), usada quando o pedido não informa taxa. */
  taxaPadrao?: string
  /** Precisa de internet (edge-tts). */
  internet?: boolean
  /** Derivada de voz adulta (infantil). */
  derivada?: boolean
}

export type VozInfo = Voz & { disponivel: boolean; motivo?: string }

export type DiagnosticoVozes = Record<
  MotorVoz,
  { ok: boolean; motivo?: string; modelos: boolean; bytes?: number }
>

const VOZES: Voz[] = [
  // ---------------------------------------------------------------- Supertonic
  { id: 'st:f1', rotulo: 'Ana Clara', motor: 'supertonic', estilo: 'F1', categoria: 'mulher', descricao: 'Feminina jovem, timbre claro e suave.' },
  { id: 'st:f2', rotulo: 'Marina', motor: 'supertonic', estilo: 'F2', categoria: 'mulher', descricao: 'Feminina, voz mais aguda e leve.' },
  { id: 'st:f3', rotulo: 'Helena', motor: 'supertonic', estilo: 'F3', categoria: 'mulher', descricao: 'Feminina madura, ritmo calmo.' },
  { id: 'st:f4', rotulo: 'Sofia', motor: 'supertonic', estilo: 'F4', categoria: 'mulher', descricao: 'Feminina expressiva, boa para histórias.' },
  { id: 'st:f5', rotulo: 'Clara', motor: 'supertonic', estilo: 'F5', categoria: 'mulher', descricao: 'Feminina grave, tom de locução.' },
  { id: 'st:m1', rotulo: 'Rafael', motor: 'supertonic', estilo: 'M1', categoria: 'homem', descricao: 'Masculina natural, locução neutra.' },
  { id: 'st:m2', rotulo: 'Bruno', motor: 'supertonic', estilo: 'M2', categoria: 'homem', descricao: 'Masculina grave e marcada.' },
  { id: 'st:m3', rotulo: 'Otávio', motor: 'supertonic', estilo: 'M3', categoria: 'homem', descricao: 'Masculina profunda, ritmo pausado.' },
  { id: 'st:m4', rotulo: 'Caio', motor: 'supertonic', estilo: 'M4', categoria: 'homem', descricao: 'Masculina jovem, mais leve.' },
  { id: 'st:m5', rotulo: 'Miguel', motor: 'supertonic', estilo: 'M5', categoria: 'homem', descricao: 'Masculina muito grave.' },
  // ------------------------------------------------------------------- Kokoro
  { id: 'kokoro:dora', rotulo: 'Dora', motor: 'kokoro', estilo: 'pf_dora', categoria: 'mulher', descricao: 'Feminina pt-BR do Kokoro, offline.' },
  { id: 'kokoro:alex', rotulo: 'Alex', motor: 'kokoro', estilo: 'pm_alex', categoria: 'homem', descricao: 'Masculina pt-BR do Kokoro, offline.' },
  { id: 'kokoro:santa', rotulo: 'Santa', motor: 'kokoro', estilo: 'pm_santa', categoria: 'homem', descricao: 'Masculina pt-BR do Kokoro, offline.' },
  // -------------------------------------------------------------------- Piper
  { id: 'piper:cadu', rotulo: 'Cadu', motor: 'piper', estilo: 'pt_BR-cadu-medium', categoria: 'homem', descricao: 'Masculina média, dicção firme (Piper).' },
  { id: 'piper:faber', rotulo: 'Faber', motor: 'piper', estilo: 'pt_BR-faber-medium', categoria: 'homem', descricao: 'Masculina expressiva (Piper).' },
  { id: 'piper:jeff', rotulo: 'Jeff', motor: 'piper', estilo: 'pt_BR-jeff-medium', categoria: 'homem', descricao: 'Masculina jovem (Piper).' },
  { id: 'piper:edresson', rotulo: 'Edresson', motor: 'piper', estilo: 'pt_BR-edresson-low', categoria: 'homem', descricao: 'Masculina leve, modelo compacto (Piper).' },
  // --------------------------------------------------------------- edge (nuvem)
  { id: 'edge:francisca', rotulo: 'Francisca', motor: 'edge', estilo: 'pt-BR-FranciscaNeural', categoria: 'mulher', descricao: 'Neural da Microsoft (edge-tts), precisa de internet.', internet: true },
  { id: 'edge:antonio', rotulo: 'Antônio', motor: 'edge', estilo: 'pt-BR-AntonioNeural', categoria: 'homem', descricao: 'Neural da Microsoft (edge-tts), precisa de internet.', internet: true },
  { id: 'edge:thalita', rotulo: 'Thalita', motor: 'edge', estilo: 'pt-BR-ThalitaNeural', categoria: 'mulher', descricao: 'Neural da Microsoft (edge-tts), precisa de internet.', internet: true },
  // --------------------------------------------------- infantil (derivadas)
  { id: 'infantil:bia', rotulo: 'Bia', motor: 'supertonic', estilo: 'F1', categoria: 'menina', tom: 1.26, derivada: true, descricao: 'Menina (~237 Hz), derivada de voz natural.' },
  { id: 'infantil:lila', rotulo: 'Lila', motor: 'supertonic', estilo: 'F3', categoria: 'menina', tom: 1.2, derivada: true, descricao: 'Menina mais suave (~209 Hz), derivada.' },
  { id: 'infantil:theo', rotulo: 'Theo', motor: 'supertonic', estilo: 'M1', categoria: 'menino', tom: 1.55, derivada: true, descricao: 'Menino (~208 Hz), derivado de voz natural.' },
  { id: 'infantil:davi', rotulo: 'Davi', motor: 'supertonic', estilo: 'M4', categoria: 'menino', tom: 1.6, derivada: true, descricao: 'Menino mais grave (~185 Hz), derivado.' },
  // ------------------------------------- paródia (arquétipos, sem pessoas reais)
  // Não são clones de pessoas reais: são timbres genéricos de arquétipo,
  // obtidos com tom/velocidade sobre vozes naturais da biblioteca.
  { id: 'parodia:locutor', rotulo: 'Locutor de estádio', motor: 'supertonic', estilo: 'M2', categoria: 'parodia', tom: 0.94, taxaPadrao: '+14%', descricao: 'Arquétipo de locutor esportivo, empolgado e rápido.' },
  { id: 'parodia:ancora', rotulo: 'Âncora de telejornal', motor: 'supertonic', estilo: 'M1', categoria: 'parodia', taxaPadrao: '+2%', descricao: 'Arquétipo de âncora de telejornal, dicção neutra.' },
  { id: 'parodia:trailer', rotulo: 'Narrador de trailer', motor: 'supertonic', estilo: 'M3', categoria: 'parodia', tom: 0.9, taxaPadrao: '-10%', descricao: 'Arquétipo de narrador de trailer, grave e solene.' },
  { id: 'parodia:vila', rotulo: 'Vilão de desenho', motor: 'supertonic', estilo: 'M5', categoria: 'parodia', tom: 0.9, taxaPadrao: '-6%', descricao: 'Arquétipo de vilão caricato, grave e arrastado.' },
  { id: 'parodia:heroina', rotulo: 'Dubladora de heroína', motor: 'supertonic', estilo: 'F4', categoria: 'parodia', tom: 1.04, taxaPadrao: '+6%', descricao: 'Arquétipo de dublagem de heroína, expressiva.' },
  { id: 'parodia:radio', rotulo: 'Locutora de rádio', motor: 'supertonic', estilo: 'F5', categoria: 'parodia', taxaPadrao: '-2%', descricao: 'Arquétipo de locução de rádio, timbre firme.' },
  { id: 'parodia:auditorio', rotulo: 'Apresentadora de auditório', motor: 'supertonic', estilo: 'F2', categoria: 'parodia', taxaPadrao: '+12%', descricao: 'Arquétipo de apresentadora animada de auditório.' },
  { id: 'parodia:influencer', rotulo: 'Influenciador animado', motor: 'kokoro', estilo: 'pm_alex', categoria: 'parodia', tom: 1.05, taxaPadrao: '+20%', descricao: 'Arquétipo de influencer jovem, acelerado e informal.' }
]

export const VOZ_PADRAO = 'st:f1'
export const CATEGORIAS: { id: CategoriaVoz; titulo: string }[] = [
  { id: 'mulher', titulo: 'Mulheres' },
  { id: 'homem', titulo: 'Homens' },
  { id: 'menina', titulo: 'Meninas (infantil)' },
  { id: 'menino', titulo: 'Meninos (infantil)' },
  { id: 'parodia', titulo: 'Paródias (arquétipos)' }
]

export function pastaTts(): string {
  const custom = process.env.DG_TTS_DIR
  const base =
    custom && custom.trim()
      ? custom.trim()
      : process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'dg-editor', 'tts')
        : join(homedir(), '.dg-editor', 'tts')
  mkdirSync(base, { recursive: true })
  return base
}

export function pastaMotor(motor: MotorVoz): string {
  const p = join(pastaTts(), motor)
  mkdirSync(p, { recursive: true })
  return p
}

export function arquivoKokoro(): { modelo: string; vozes: string } {
  const d = pastaMotor('kokoro')
  return { modelo: join(d, 'kokoro-v1.0.int8.onnx'), vozes: join(d, 'voices-v1.0.bin') }
}

export function arquivoPiper(estilo: string): string {
  return join(pastaMotor('piper'), estilo + '.onnx')
}

const MODELOS_PIPER = ['pt_BR-cadu-medium', 'pt_BR-faber-medium', 'pt_BR-jeff-medium', 'pt_BR-edresson-low']

const URL_KOKORO = {
  modelo:
    'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx',
  vozes:
    'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin'
}

function urlPiper(estilo: string, ext: string): string {
  const voz = estilo.replace('pt_BR-', '')
  const nome = estilo.split('-').pop() || 'medium'
  return (
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/' +
    voz +
    '/' +
    nome +
    '/' +
    estilo +
    ext
  )
}

function tamanho(p: string): number {
  try {
    const st = statSync(p)
    return st.isFile() ? st.size : 0
  } catch {
    return 0
  }
}

function tamanhoPasta(p: string): number {
  try {
    let total = 0
    for (const nome of readdirSync(p)) {
      const abs = join(p, nome)
      try {
        const st = statSync(abs)
        total += st.isDirectory() ? tamanhoPasta(abs) : st.size
      } catch {
        /* */
      }
    }
    return total
  } catch {
    return 0
  }
}

function modelosBaixados(motor: MotorVoz): boolean {
  if (motor === 'supertonic') {
    const d = join(pastaTts(), 'supertonic3', 'onnx')
    return (
      tamanho(join(d, 'vector_estimator.onnx')) > 100 * 1024 * 1024 &&
      tamanho(join(d, 'vocoder.onnx')) > 50 * 1024 * 1024
    )
  }
  if (motor === 'kokoro') {
    const a = arquivoKokoro()
    return tamanho(a.modelo) > 80 * 1024 * 1024 && tamanho(a.vozes) > 20 * 1024 * 1024
  }
  if (motor === 'piper') return MODELOS_PIPER.every((m) => tamanho(arquivoPiper(m)) > 40 * 1024 * 1024)
  return true
}

export function pythonBinVozes(): string {
  const custom = process.env.DG_PYTHON
  return custom && custom.trim() ? custom.trim() : 'python'
}

function rodarCurto(
  binario: string,
  args: string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((finalizar) => {
    let stdout = ''
    let stderr = ''
    let filho: ReturnType<typeof spawn>
    try {
      filho = spawn(binario, args, { windowsHide: true, env })
    } catch (e) {
      finalizar({ ok: false, stdout, stderr: String(e) })
      return
    }
    const timer = setTimeout(() => {
      try {
        filho.kill('SIGKILL')
      } catch {
        /* */
      }
      finalizar({ ok: false, stdout, stderr: 'timeout' })
    }, timeoutMs)
    filho.stdout?.on('data', (c: Buffer) => (stdout += c.toString('utf8')))
    filho.stderr?.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    filho.on('error', (e) => {
      clearTimeout(timer)
      finalizar({ ok: false, stdout, stderr: e.message })
    })
    filho.on('close', (codigo) => {
      clearTimeout(timer)
      finalizar({ ok: codigo === 0, stdout, stderr })
    })
  })
}

const SCRIPT_SONDAR = String.raw`import json
mods = {}
for nome in ("kokoro_onnx", "supertonic", "piper", "edge_tts"):
    try:
        m = __import__(nome)
        mods[nome] = getattr(m, "__version__", "ok")
    except Exception as e:
        mods[nome] = None
print(json.dumps(mods))
`

let cacheDiagnostico: { em: number; dados: Record<string, string | null> } | null = null

/** Uma única chamada ao Python detecta os pacotes dos motores locais (cache 60s). */
async function pacotesPython(): Promise<Record<string, string | null>> {
  if (cacheDiagnostico && Date.now() - cacheDiagnostico.em < 60_000) return cacheDiagnostico.dados
  const r = await rodarCurto(pythonBinVozes(), ['-c', SCRIPT_SONDAR], 20_000)
  let dados: Record<string, string | null> = {}
  if (r.ok) {
    try {
      const l = r.stdout.trim().split(/\r?\n/).filter(Boolean)
      dados = JSON.parse(l[l.length - 1]) as Record<string, string | null>
    } catch {
      dados = {}
    }
  }
  cacheDiagnostico = { em: Date.now(), dados }
  return dados
}

export function invalidarDiagnostico(): void {
  cacheDiagnostico = null
}

export async function diagnosticoVozes(): Promise<DiagnosticoVozes> {
  const pacotes = await pacotesPython()
  const stModelos = modelosBaixados('supertonic')
  const kokoroModelos = modelosBaixados('kokoro')
  const piperModelos = modelosBaixados('piper')
  const edgeOk = !!pacotes.edge_tts
  const stOk = !!pacotes.supertonic && stModelos
  const kokoroOk = !!pacotes.kokoro_onnx && kokoroModelos
  const piperOk = !!pacotes.piper && piperModelos
  const motivo = (pkg: string | null, modelos: boolean, pacote: string) => {
    if (!pkg) return 'instale o pacote Python ' + pacote
    if (!modelos) return 'baixe os modelos da voz'
    return undefined
  }
  return {
    supertonic: {
      ok: stOk,
      motivo: motivo(pacotes.supertonic, stModelos, 'supertonic'),
      modelos: stModelos,
      bytes: tamanhoPasta(join(pastaTts(), 'supertonic3'))
    },
    kokoro: { ok: kokoroOk, motivo: motivo(pacotes.kokoro_onnx, kokoroModelos, 'kokoro-onnx'), modelos: kokoroModelos },
    piper: { ok: piperOk, motivo: motivo(pacotes.piper, piperModelos, 'piper-tts'), modelos: piperModelos },
    edge: { ok: edgeOk, motivo: edgeOk ? undefined : 'instale o pacote Python edge-tts', modelos: true }
  }
}

export async function listarVozes(): Promise<VozInfo[]> {
  const d = await diagnosticoVozes()
  return VOZES.map((v) => {
    const motor = d[v.motor]
    return {
      ...v,
      disponivel: motor.ok,
      motivo: motor.ok ? undefined : motor.motivo
    }
  })
}

/** Lista imediata (sem sondar o Python): usa só a presença dos modelos em disco. */
export function listarVozesRapido(): VozInfo[] {
  return VOZES.map((v) => {
    const disponivel = v.motor === 'edge' ? true : modelosBaixados(v.motor)
    return {
      ...v,
      disponivel,
      motivo: disponivel ? undefined : 'baixe os modelos e verifique o motor'
    }
  })
}

/** Aceita id novo, nome antigo do edge-tts ou vazio (usa a voz padrão do usuário). */
export function acharVoz(id?: string): Voz | undefined {
  const bruto = String(id || '').trim()
  if (!bruto) return acharVoz(lerPreferencias().vozPadrao) || VOZES.find((v) => v.id === VOZ_PADRAO)
  const direto = VOZES.find((v) => v.id.toLowerCase() === bruto.toLowerCase())
  if (direto) return direto
  const porEstilo = VOZES.find((v) => v.estilo.toLowerCase() === bruto.toLowerCase())
  if (porEstilo) return porEstilo
  const porRotulo = VOZES.find((v) => v.rotulo.toLowerCase() === bruto.toLowerCase())
  if (porRotulo) return porRotulo
  // Nomes legados usados antes da biblioteca de vozes.
  const legado: Record<string, string> = {
    'pt-br-franciscaneural': 'edge:francisca',
    'pt-br-antonioneural': 'edge:antonio',
    'pt-br-thalitaneural': 'edge:thalita',
    'pt-br-thalitamultilingualneural': 'edge:thalita'
  }
  const alvo = legado[bruto.toLowerCase()]
  return alvo ? VOZES.find((v) => v.id === alvo) : undefined
}

export function todasVozes(): Voz[] {
  return VOZES.slice()
}

// ------------------------------------------------------------ preferências

type Preferencias = { vozPadrao: string }

function arquivoPreferencias(): string {
  return join(pastaTts(), 'preferencias.json')
}

export function lerPreferencias(): Preferencias {
  try {
    const j = JSON.parse(readFileSync(arquivoPreferencias(), 'utf8')) as Partial<Preferencias>
    const id = typeof j.vozPadrao === 'string' ? j.vozPadrao : VOZ_PADRAO
    return { vozPadrao: VOZES.some((v) => v.id === id) ? id : VOZ_PADRAO }
  } catch {
    return { vozPadrao: VOZ_PADRAO }
  }
}

export function salvarPreferencias(p: Partial<Preferencias>): Preferencias {
  const atual = lerPreferencias()
  const vozPadrao =
    typeof p.vozPadrao === 'string' && VOZES.some((v) => v.id === p.vozPadrao) ? p.vozPadrao : atual.vozPadrao
  const novo = { vozPadrao }
  writeFileSync(arquivoPreferencias(), JSON.stringify(novo, null, 2), 'utf8')
  return novo
}

// ---------------------------------------------------------------- download

async function baixarArquivo(url: string, destino: string): Promise<void> {
  const parcial = destino + '.parcial'
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60_000) })
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status + ' em ' + url)
  const { createWriteStream } = await import('node:fs')
  const { Readable } = await import('node:stream')
  const { pipeline } = await import('node:stream/promises')
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(parcial))
  const { renameSync, rmSync } = await import('node:fs')
  try {
    renameSync(parcial, destino)
  } catch {
    rmSync(parcial, { force: true })
    throw new Error('não foi possível finalizar ' + destino)
  }
}

export async function baixarModelos(motor: MotorVoz): Promise<{ ok: boolean; erro?: string; baixados?: string[] }> {
  try {
    const baixados: string[] = []
    if (motor === 'kokoro') {
      const a = arquivoKokoro()
      if (tamanho(a.modelo) < 80 * 1024 * 1024) {
        await baixarArquivo(URL_KOKORO.modelo, a.modelo)
        baixados.push('kokoro-v1.0.int8.onnx')
      }
      if (tamanho(a.vozes) < 20 * 1024 * 1024) {
        await baixarArquivo(URL_KOKORO.vozes, a.vozes)
        baixados.push('voices-v1.0.bin')
      }
    } else if (motor === 'piper') {
      for (const estilo of MODELOS_PIPER) {
        const destino = arquivoPiper(estilo)
        const json = destino + '.json'
        if (tamanho(destino) < 40 * 1024 * 1024) {
          await baixarArquivo(urlPiper(estilo, '.onnx'), destino)
          baixados.push(estilo + '.onnx')
        }
        if (tamanho(json) < 1000) {
          await baixarArquivo(urlPiper(estilo, '.onnx.json'), json)
          baixados.push(estilo + '.onnx.json')
        }
      }
    } else if (motor === 'supertonic') {
      const env = { ...process.env, SUPERTONIC_CACHE_DIR: join(pastaTts(), 'supertonic3') }
      const r = await rodarCurto(
        pythonBinVozes(),
        [
          '-c',
          'from supertonic import TTS; TTS(auto_download=True); print("modelos ok")'
        ],
        30 * 60_000,
        env
      )
      if (!r.ok) throw new Error((r.stderr || r.stdout || 'falha ao baixar').split(/\r?\n/).slice(-3).join(' ').slice(0, 300))
      baixados.push('supertonic3')
    } else {
      return { ok: false, erro: 'edge-tts não precisa de download (usa internet)' }
    }
    invalidarDiagnostico()
    return { ok: true, baixados }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export function modelosFaltando(): Partial<Record<MotorVoz, boolean>> {
  return {
    supertonic: !modelosBaixados('supertonic'),
    kokoro: !modelosBaixados('kokoro'),
    piper: !modelosBaixados('piper')
  }
}
