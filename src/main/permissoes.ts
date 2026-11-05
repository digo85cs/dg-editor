import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type Permissoes = {
  permitirLeitura: boolean
  permitirEdicao: boolean
  permitirBash: boolean
  permitirMcp: boolean
  semprePedirMcp: boolean
}

function permPath() {
  const dir = join(app.getPath('userData'), 'dg-perm')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'permissoes.json')
}

export function obterPermissoes(): Permissoes {
  try {
    const p = permPath()
    if (!existsSync(p)) {
      const def: Permissoes = { permitirLeitura: true, permitirEdicao: true, permitirBash: false, permitirMcp: true, semprePedirMcp: true }
      writeFileSync(p, JSON.stringify(def, null, 2), 'utf8')
      return def
    }
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return { permitirLeitura: true, permitirEdicao: true, permitirBash: false, permitirMcp: true, semprePedirMcp: true }
  }
}

export function salvarPermissoes(p: Permissoes) {
  try {
    writeFileSync(permPath(), JSON.stringify(p, null, 2), 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
