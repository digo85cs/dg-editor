import { app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import { criarJanelaNavegador } from '../navegador/janela'

function authDir() {
  const dir = join(app.getPath('userData'), 'auth')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
function authPath() { return join(authDir(), 'apple.json') }

function salvarSeguro(obj: unknown) {
  const p = authPath()
  const json = JSON.stringify(obj, null, 2)
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(p + '.enc', safeStorage.encryptString(json))
      try { if (existsSync(p)) unlinkSync(p) } catch { /* */ }
      return
    }
  } catch { /* */ }
  writeFileSync(p, json, 'utf8')
}

function lerSeguro(): { email?: string; nome?: string; contas?: Array<{ email: string; nome?: string }> } | null {
  try {
    const penc = authPath() + '.enc'
    const p = authPath()
    if (existsSync(penc) && safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(readFileSync(penc)))
    }
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  } catch { /* */ }
  return null
}

export function getAppleStatus() {
  const data = lerSeguro()
  if (!data) return { conectado: false, contas: [] as string[] }
  const contas = Array.isArray(data.contas) ? data.contas : (data.email ? [{ email: data.email, nome: data.nome }] : [])
  return {
    conectado: contas.length > 0,
    email: contas[0]?.email,
    nome: contas[0]?.nome,
    contas: contas.map((c) => c.email)
  }
}

export function desconectarApple(email?: string) {
  try {
    if (!email) {
      const p = authPath()
      const penc = p + '.enc'
      if (existsSync(p)) unlinkSync(p)
      if (existsSync(penc)) unlinkSync(penc)
      return { ok: true }
    }
    const data = lerSeguro() || { contas: [] as Array<{ email: string; nome?: string }> }
    const contas = (data.contas || []).filter((c) => c.email.toLowerCase() !== email.toLowerCase())
    if (!contas.length) return desconectarApple()
    salvarSeguro({ ...data, contas, email: contas[0].email, nome: contas[0].nome })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/** Apple Sign In completo exige Apple Developer; aqui vinculamos identidade (1+) no cofre. */
export async function conectarApple(opts?: { email?: string; nome?: string }): Promise<{ ok: boolean; erro?: string; email?: string }> {
  const email = String(opts?.email || '').trim().toLowerCase()
  const nome = String(opts?.nome || '').trim()
  if (!email || !email.includes('@')) {
    // Abre pagina oficial; usuario confirma e-mail no modal do DG
    try { criarJanelaNavegador('https://appleid.apple.com/', { mostrar: true }) } catch { shell.openExternal('https://appleid.apple.com/') }
    return { ok: false, erro: 'Informe o e-mail Apple ID para vincular (1 ou mais contas).' }
  }
  const data = lerSeguro() || { contas: [] as Array<{ email: string; nome?: string }> }
  const contas = Array.isArray(data.contas) ? [...data.contas] : []
  const i = contas.findIndex((c) => c.email.toLowerCase() === email)
  const entry = { email, nome: nome || email.split('@')[0] }
  if (i >= 0) contas[i] = entry
  else contas.push(entry)
  salvarSeguro({ email: entry.email, nome: entry.nome, contas, conectadoEm: new Date().toISOString() })
  return { ok: true, email: entry.email }
}