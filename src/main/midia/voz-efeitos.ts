/**
 * Efeitos de voz gratuitos inspirados no RealVoice Pro e no Voice Changer do
 * PowerDirector: muda tom/formantes, aplica telefone, rádio, caverna,
 * megafone, robô, coro, além de redução de ruído, de-esser e corte de
 * silêncios. Tudo local com ffmpeg (rubberband, afftdn, aecho, deesser).
 */
import { existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import {
  binarioResolvido,
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  previewDe,
  rodar,
  validarEntrada,
  type RespostaMidia
} from './core'

export type FormatoVoz = 'mp3' | 'wav' | 'm4a' | 'ogg'

export type PresetVoz =
  | 'original'
  | 'grave'
  | 'agudo'
  | 'crianca'
  | 'idoso'
  | 'monstro'
  | 'robo'
  | 'telefone'
  | 'radio'
  | 'caverna'
  | 'megafone'
  | 'sussurro'
  | 'coro'

export const PRESETS_VOZ: {
  id: PresetVoz
  rotulo: string
  descricao: string
  usaPitch: boolean
}[] = [
  { id: 'original', rotulo: 'Original (só limpeza)', descricao: 'Mantém a voz e aplica apenas redução de ruído/normalização.', usaPitch: false },
  { id: 'grave', rotulo: 'Grave (locutor)', descricao: 'Voz mais grave e encorpada, estilo locução.', usaPitch: true },
  { id: 'agudo', rotulo: 'Agudo', descricao: 'Voz mais aguda sem ficar artificial.', usaPitch: true },
  { id: 'crianca', rotulo: 'Criança', descricao: 'Tom infantil com formantes deslocados.', usaPitch: true },
  { id: 'idoso', rotulo: 'Idoso', descricao: 'Voz envelhecida com leve vibrato.', usaPitch: true },
  { id: 'monstro', rotulo: 'Monstro', descricao: 'Tom muito grave com eco curto e abafado.', usaPitch: true },
  { id: 'robo', rotulo: 'Robô', descricao: 'Modulação metálica de sintetizador.', usaPitch: false },
  { id: 'telefone', rotulo: 'Telefone', descricao: 'Banda estreita de 300–3400 Hz com compressão.', usaPitch: false },
  { id: 'radio', rotulo: 'Rádio antigo', descricao: 'Banda limitada, compressão forte e eco curto.', usaPitch: false },
  { id: 'caverna', rotulo: 'Caverna', descricao: 'Eco longo com graves reduzidos.', usaPitch: false },
  { id: 'megafone', rotulo: 'Megafone', descricao: 'Som abafado e saturado de alto-falante.', usaPitch: false },
  { id: 'sussurro', rotulo: 'Sussurro', descricao: 'Realce de agudos e volume baixo, estilo ASMR.', usaPitch: false },
  { id: 'coro', rotulo: 'Coro / multidão', descricao: 'Camadas de eco simulando várias vozes.', usaPitch: false }
]

export type OpcoesEfeitoVoz = {
  entrada: string
  preset: PresetVoz
  saida?: string
  intensidade?: number
  reduzirRuido?: boolean
  deesser?: boolean
  cortarSilencios?: boolean
  normalizar?: boolean
  formato?: FormatoVoz
}

function clamp(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : padrao
  return Math.min(max, Math.max(min, n))
}

function pitch(base: number, intensidade: number): string {
  const alvo = 1 + (base - 1) * intensidade
  return 'rubberband=pitch=' + alvo.toFixed(3) + ':pitchq=quality'
}

/** Cadeia de filtros de voz. Exportada para testes e para o agente. */
export function construirFiltrosVoz(
  preset: PresetVoz,
  intensidade = 0.7,
  opts: { reduzirRuido?: boolean; deesser?: boolean; cortarSilencios?: boolean; normalizar?: boolean } = {}
): string[] {
  const i = clamp(intensidade, 0.1, 1, 0.7)
  const f: string[] = []
  if (opts.reduzirRuido !== false) f.push('afftdn=nf=-28:nr=10')
  if (opts.deesser) f.push('deesser=i=0.5')
  if (opts.cortarSilencios) {
    f.push('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25')
    f.push('areverse')
    f.push('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25')
    f.push('areverse')
  }

  switch (preset) {
    case 'grave':
      f.push(pitch(0.78, i))
      f.push('equalizer=f=180:t=q:w=1:g=2')
      break
    case 'agudo':
      f.push(pitch(1.22, i))
      break
    case 'crianca':
      f.push('rubberband=pitch=' + (1 + 0.42 * i).toFixed(3) + ':formant=shifted:pitchq=quality')
      f.push('highpass=f=120')
      break
    case 'idoso':
      f.push(pitch(0.9, i))
      f.push('vibrato=f=5:d=' + (0.05 * i).toFixed(3))
      break
    case 'monstro':
      f.push('rubberband=pitch=' + (1 - 0.38 * i).toFixed(3) + ':formant=shifted:pitchq=quality')
      f.push('lowpass=f=5000')
      f.push('aecho=0.8:0.85:35:0.25')
      break
    case 'robo':
      f.push('chorus=0.6:0.9:50:0.4:0.25:2')
      f.push('aphaser=type=t:speed=2:decay=0.4')
      break
    case 'telefone':
      f.push('highpass=f=300')
      f.push('lowpass=f=3400')
      f.push('acompressor=threshold=-18dB:ratio=4:attack=10:release=120')
      break
    case 'radio':
      f.push('highpass=f=200')
      f.push('lowpass=f=5000')
      f.push('acompressor=threshold=-16dB:ratio=6:attack=5:release=80')
      f.push('aecho=0.8:0.7:12:0.15')
      break
    case 'caverna':
      f.push('aecho=0.8:0.9:60|120:0.4|0.3')
      f.push('equalizer=f=250:t=q:w=1:g=-4')
      break
    case 'megafone':
      f.push('highpass=f=500')
      f.push('lowpass=f=3000')
      f.push('acompressor=threshold=-20dB:ratio=8:attack=5:release=60')
      f.push('volume=2')
      break
    case 'sussurro':
      f.push('highpass=f=900')
      f.push('equalizer=f=3200:t=q:w=1.2:g=4')
      f.push('volume=0.8')
      break
    case 'coro':
      f.push('chorus=0.7:0.9:55:0.4:0.25:2')
      f.push('aecho=0.8:0.88:40:0.3')
      break
    default:
      break
  }

  if (opts.normalizar !== false) f.push('loudnorm=I=-16:TP=-1.5:LRA=11')
  return f.length ? f : ['anull']
}

export function catalogoVoz(): { presets: typeof PRESETS_VOZ; formatos: FormatoVoz[] } {
  return { presets: PRESETS_VOZ, formatos: ['mp3', 'wav', 'm4a', 'ogg'] }
}

function argsCodificacao(formato: FormatoVoz): string[] {
  if (formato === 'wav') return ['-c:a', 'pcm_s16le']
  if (formato === 'm4a') return ['-c:a', 'aac', '-b:a', '192k']
  if (formato === 'ogg') return ['-c:a', 'libvorbis', '-q:a', '5']
  return ['-c:a', 'libmp3lame', '-b:a', '192k']
}

/** Aplica um preset de voz e grava o resultado dentro do projeto. */
export async function aplicarEfeitoVoz(raiz: string, opts: OpcoesEfeitoVoz): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'audio')
  if (invalido) return { ok: false, erro: invalido }
  const preset = PRESETS_VOZ.find((p) => p.id === opts.preset)
  if (!preset) return { ok: false, erro: 'preset de voz desconhecido: ' + String(opts.preset) }
  const formato: FormatoVoz = ['mp3', 'wav', 'm4a', 'ogg'].includes(String(opts.formato))
    ? (opts.formato as FormatoVoz)
    : 'mp3'
  const filtros = construirFiltrosVoz(opts.preset, opts.intensidade, {
    reduzirRuido: opts.reduzirRuido,
    deesser: opts.deesser,
    cortarSilencios: opts.cortarSilencios,
    normalizar: opts.normalizar
  })
  const ext = '.' + formato
  const destino = destinoArquivo(raiz, nomeArquivo('voz-' + opts.preset, ext), opts.saida)
  const r = await rodar(
    binarioResolvido('ffmpeg'),
    ['-y', '-i', opts.entrada, '-af', filtros.join(','), ...argsCodificacao(formato), destino],
    1_800_000
  )
  if (!r.ok || !existsSync(destino)) {
    const detalhe = (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
    const dica = /rubberband|No such filter|Error initializing filter/i.test(detalhe)
      ? ' — o ffmpeg embutido precisa ser a build completa (com rubberband). Rode "npm run ferramentas".'
      : ''
    return { ok: false, erro: 'ffmpeg falhou ao aplicar o efeito de voz: ' + detalhe + dica }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: mimePorExt(extname(destino)),
    previewBase64: formato === 'wav' && statSync(destino).size <= 4 * 1024 * 1024 ? previewDe(destino) : undefined,
    detalhes: { preset: opts.preset, formato, filtros },
    aviso: 'Voz "' + preset.rotulo + '" processada localmente (grátis).'
  }
}
