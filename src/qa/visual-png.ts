/**
 * Decodifica PNG RGBA/RGB 8-bit (sem interlace) e compara pixels.
 * Sem dependencias: usa apenas zlib. Suficiente para screenshots do Chromium.
 */
import { inflateSync } from 'zlib'

export type ImagemPng = { w: number; h: number; data: Buffer }

const ASSINATURA = 0x89504e47

export function decodificarPng(buf: Buffer): ImagemPng | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== ASSINATURA) return null
  let pos = 8
  let w = 0
  let h = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat: Buffer[] = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const tipo = buf.toString('ascii', pos + 4, pos + 8)
    if (pos + 12 + len > buf.length) return null
    const dados = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (tipo === 'IHDR') {
      w = dados.readUInt32BE(0)
      h = dados.readUInt32BE(4)
      bitDepth = dados[8]
      colorType = dados[9]
      interlace = dados[12]
    } else if (tipo === 'IDAT') {
      idat.push(dados)
    } else if (tipo === 'IEND') {
      break
    }
  }
  if (!w || !h || bitDepth !== 8 || interlace !== 0) return null
  if (colorType !== 6 && colorType !== 2) return null

  const canais = colorType === 6 ? 4 : 3
  let raw: Buffer
  try {
    raw = inflateSync(Buffer.concat(idat))
  } catch {
    return null
  }
  const stride = w * canais
  if (raw.length < (stride + 1) * h) return null

  const out = Buffer.alloc(w * h * 4)
  const prev = Buffer.alloc(stride)
  const cur = Buffer.alloc(stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filtro = raw[p++]
    raw.copy(cur, 0, p, p + stride)
    p += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= canais ? cur[x - canais] : 0
      const b = prev[x]
      const c = x >= canais ? prev[x - canais] : 0
      let v = cur[x]
      if (filtro === 1) v = (v + a) & 255
      else if (filtro === 2) v = (v + b) & 255
      else if (filtro === 3) v = (v + ((a + b) >> 1)) & 255
      else if (filtro === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        v = (v + pr) & 255
      }
      cur[x] = v
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (canais === 4) {
        out[o] = cur[x * 4]
        out[o + 1] = cur[x * 4 + 1]
        out[o + 2] = cur[x * 4 + 2]
        out[o + 3] = cur[x * 4 + 3]
      } else {
        out[o] = cur[x * 3]
        out[o + 1] = cur[x * 3 + 1]
        out[o + 2] = cur[x * 3 + 2]
        out[o + 3] = 255
      }
    }
    cur.copy(prev)
  }
  return { w, h, data: out }
}

export type ResultadoComparacao = {
  ok: boolean
  w: number
  h: number
  total: number
  diferentes: number
  pct: number
  erro?: string
}

/** Compara duas capturas ignorando ruido de antialias por canal. */
export function compararPng(
  base: Buffer,
  atual: Buffer,
  toleranciaCanal = 16
): ResultadoComparacao {
  const a = decodificarPng(base)
  const b = decodificarPng(atual)
  if (!a || !b) {
    return { ok: false, w: 0, h: 0, total: 0, diferentes: 0, pct: 0, erro: 'png invalido' }
  }
  if (a.w !== b.w || a.h !== b.h) {
    return {
      ok: false,
      w: b.w,
      h: b.h,
      total: b.w * b.h,
      diferentes: b.w * b.h,
      pct: 100,
      erro: `dimensoes diferentes ${a.w}x${a.h} -> ${b.w}x${b.h}`
    }
  }
  const total = a.w * a.h
  let diferentes = 0
  for (let i = 0; i < total; i++) {
    const o = i * 4
    if (
      Math.abs(a.data[o] - b.data[o]) > toleranciaCanal ||
      Math.abs(a.data[o + 1] - b.data[o + 1]) > toleranciaCanal ||
      Math.abs(a.data[o + 2] - b.data[o + 2]) > toleranciaCanal
    ) {
      diferentes++
    }
  }
  return {
    ok: true,
    w: a.w,
    h: a.h,
    total,
    diferentes,
    pct: total ? (diferentes * 100) / total : 0
  }
}
