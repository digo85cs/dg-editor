/**
 * Deploy FTP para o DG Editor — sites no cofre local (userData/deploy).
 */
import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync, readdirSync } from 'fs'
import { join, relative, dirname } from 'path'
import { dglog } from '../dglog'

export type FtpSite = {
  id: string
  nome: string
  host: string
  port?: number
  user: string
  password?: string
  secure?: boolean | 'implicit'
  remotePath?: string
  localPath?: string
  passive?: boolean
}

type Store = { versao: 1; sites: FtpSite[] }

function dirAuth() {
  const d = join(app.getPath('userData'), 'deploy')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}
function pathStore() { return join(dirAuth(), 'ftp-sites.json') }

function salvarStore(s: Store) {
  const json = JSON.stringify(s, null, 2)
  const p = pathStore()
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(p + '.enc', safeStorage.encryptString(json))
      try { if (existsSync(p)) unlinkSync(p) } catch { /* */ }
      return
    }
  } catch { /* */ }
  writeFileSync(p, json, 'utf8')
}

function lerStore(): Store {
  try {
    const penc = pathStore() + '.enc'
    const p = pathStore()
    if (existsSync(penc) && safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(readFileSync(penc))) as Store
    }
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as Store
  } catch { /* */ }
  return { versao: 1, sites: [] }
}

export function listarFtpSites(): Array<Omit<FtpSite, 'password'> & { temSenha: boolean }> {
  return lerStore().sites.map(({ password, ...rest }) => ({
    ...rest,
    temSenha: !!(password && password.length)
  }))
}

export function salvarFtpSite(site: FtpSite): { ok: boolean; erro?: string } {
  if (!site.id || !site.host || !site.user) return { ok: false, erro: 'id, host e user obrigatorios' }
  const store = lerStore()
  const i = store.sites.findIndex((s) => s.id === site.id)
  const prev = i >= 0 ? store.sites[i] : null
  const next: FtpSite = {
    ...site,
    password: site.password && site.password.length ? site.password : prev?.password,
    port: site.port || 21,
    remotePath: site.remotePath || '/',
    passive: site.passive !== false
  }
  if (i >= 0) store.sites[i] = next
  else store.sites.push(next)
  salvarStore(store)
  return { ok: true }
}

export function removerFtpSite(id: string): { ok: boolean } {
  const store = lerStore()
  store.sites = store.sites.filter((s) => s.id !== id)
  salvarStore(store)
  return { ok: true }
}

function listarArquivosRecursivo(raiz: string, atual = raiz, out: string[] = []): string[] {
  let entries: string[] = []
  try { entries = readdirSync(atual) } catch { return out }
  for (const nome of entries) {
    if (nome === 'node_modules' || nome === '.git' || nome === 'dist-app' || nome === 'out') continue
    const full = join(atual, nome)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) listarArquivosRecursivo(raiz, full, out)
    else out.push(full)
  }
  return out
}

async function comCliente(site: FtpSite, fn: (client: import('basic-ftp').Client) => Promise<unknown>) {
  let Client: typeof import('basic-ftp').Client
  try {
    ;({ Client } = await import('basic-ftp'))
  } catch {
    throw new Error('Pacote basic-ftp nao instalado. Rode npm i basic-ftp')
  }
  const client = new Client(30_000)
  client.ftp.verbose = false
  try {
    await client.access({
      host: site.host,
      port: site.port || 21,
      user: site.user,
      password: site.password || '',
      secure: site.secure === true ? true : site.secure === 'implicit' ? 'implicit' : false
    })
    return await fn(client)
  } finally {
    client.close()
  }
}

export async function testarFtp(id: string): Promise<{ ok: boolean; erro?: string; pwd?: string }> {
  const site = lerStore().sites.find((s) => s.id === id)
  if (!site) return { ok: false, erro: 'site nao encontrado' }
  try {
    const pwd = await comCliente(site, async (c) => c.pwd()) as string
    return { ok: true, pwd: String(pwd) }
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function deployFtp(opts: {
  id: string
  localPath?: string
  remotePath?: string
  arquivos?: string[]
  dryRun?: boolean
}): Promise<{ ok: boolean; erro?: string; enviados?: number; falhas?: string[]; dryRun?: boolean; previstos?: number }> {
  const site = lerStore().sites.find((s) => s.id === opts.id)
  if (!site) return { ok: false, erro: 'site nao encontrado' }
  const localRoot = opts.localPath || site.localPath
  if (!localRoot || !existsSync(localRoot)) return { ok: false, erro: 'localPath invalido' }
  const remoteRoot = (opts.remotePath || site.remotePath || '/').replace(/\\/g, '/')
  const lista = (opts.arquivos && opts.arquivos.length)
    ? opts.arquivos.map((a) => join(localRoot, a))
    : listarArquivosRecursivo(localRoot)
  if (opts.dryRun) {
    return { ok: true, dryRun: true, previstos: lista.length, enviados: 0 }
  }
  const falhas: string[] = []
  let enviados = 0
  try {
    await comCliente(site, async (client) => {
      for (const full of lista) {
        const rel = relative(localRoot, full).replace(/\\/g, '/')
        const remoto = (remoteRoot.replace(/\/$/, '') + '/' + rel).replace(/\/+/g, '/')
        try {
          await client.ensureDir(dirname(remoto).replace(/\\/g, '/'))
          await client.uploadFrom(full, remoto)
          enviados++
        } catch (e: unknown) {
          falhas.push(rel + ': ' + (e instanceof Error ? e.message : String(e)))
        }
      }
    })
    dglog('[ftp] deploy id=' + opts.id + ' enviados=' + enviados + ' falhas=' + falhas.length)
    return { ok: falhas.length === 0, enviados, falhas: falhas.length ? falhas.slice(0, 20) : undefined, erro: falhas.length ? falhas[0] : undefined }
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e), enviados, falhas }
  }
}
