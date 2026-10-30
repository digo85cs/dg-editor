/**
 * Checkpoints de arquivos antes de apply do agente/OpenClaw — permite desfazer.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join, basename } from 'path'
import { createHash, randomBytes } from 'crypto'
import { promises as fsp } from 'fs'
import { dirname } from 'path'

export type CheckpointMeta = {
  id: string
  criadoEm: string
  origem: string
  arquivos: Array<{ path: string; hash: string; existia: boolean }>
}

function dirCheckpoints(): string {
  const d = join(app.getPath('userData'), 'agent-checkpoints')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function metaPath(id: string): string {
  return join(dirCheckpoints(), id + '.json')
}

function blobPath(id: string, pathAbs: string): string {
  const h = createHash('sha1').update(pathAbs).digest('hex').slice(0, 12)
  return join(dirCheckpoints(), id + '-' + h + '.blob')
}

export async function criarCheckpoint(
  arquivos: string[],
  origem: string
): Promise<CheckpointMeta> {
  const id = Date.now().toString(36) + '-' + randomBytes(3).toString('hex')
  const meta: CheckpointMeta = {
    id,
    criadoEm: new Date().toISOString(),
    origem,
    arquivos: []
  }
  for (const p of arquivos) {
    const abs = p
    let existia = false
    let hash = ''
    try {
      const buf = await fsp.readFile(abs)
      existia = true
      hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
      await fsp.writeFile(blobPath(id, abs), buf)
    } catch {
      existia = false
      hash = 'missing'
      await fsp.writeFile(blobPath(id, abs), Buffer.alloc(0))
    }
    meta.arquivos.push({ path: abs, hash, existia })
  }
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), 'utf8')
  // mantem so os 20 mais recentes
  limparAntigos(20)
  return meta
}

function limparAntigos(manter: number): void {
  try {
    const dir = dirCheckpoints()
    const metas = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ f, t: existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '' }))
      .map((x) => {
        try {
          return JSON.parse(x.t) as CheckpointMeta
        } catch {
          return null
        }
      })
      .filter((m): m is CheckpointMeta => !!m)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
    for (const m of metas.slice(manter)) {
      try {
        unlinkSync(metaPath(m.id))
        for (const a of m.arquivos) {
          try {
            unlinkSync(blobPath(m.id, a.path))
          } catch {
            /* */
          }
        }
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  }
}

export function listarCheckpoints(limite = 10): CheckpointMeta[] {
  try {
    const dir = dirCheckpoints()
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(dir, f), 'utf8')) as CheckpointMeta
        } catch {
          return null
        }
      })
      .filter((m): m is CheckpointMeta => !!m)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
      .slice(0, limite)
  } catch {
    return []
  }
}

export async function restaurarCheckpoint(id: string): Promise<{ ok: boolean; erro?: string; restaurados: number }> {
  const mp = metaPath(id)
  if (!existsSync(mp)) return { ok: false, erro: 'checkpoint inexistente', restaurados: 0 }
  let meta: CheckpointMeta
  try {
    meta = JSON.parse(readFileSync(mp, 'utf8')) as CheckpointMeta
  } catch {
    return { ok: false, erro: 'meta invalida', restaurados: 0 }
  }
  let n = 0
  for (const a of meta.arquivos) {
    const blob = blobPath(id, a.path)
    try {
      if (!a.existia) {
        try {
          await fsp.unlink(a.path)
        } catch {
          /* nao existia / ja sumiu */
        }
        n++
        continue
      }
      const buf = await fsp.readFile(blob)
      await fsp.mkdir(dirname(a.path), { recursive: true })
      const tmp = a.path + '.chk.' + randomBytes(3).toString('hex') + '.tmp'
      await fsp.writeFile(tmp, buf)
      await fsp.rename(tmp, a.path)
      n++
    } catch (e) {
      return { ok: false, erro: String((e as Error).message || e), restaurados: n }
    }
  }
  return { ok: true, restaurados: n }
}

export function ultimoCheckpoint(): CheckpointMeta | null {
  return listarCheckpoints(1)[0] || null
}
