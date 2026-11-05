import { app, shell } from 'electron'
import { createServer } from 'http'
import { randomBytes, createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import { criarJanelaNavegador } from '../navegador/janela'

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || ''
const TENANT = 'common'
const SCOPES = ['openid', 'profile', 'email', 'User.Read', 'Files.ReadWrite', 'offline_access']

function base64url(buffer: Buffer) { return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function sha256(str: string) { return createHash('sha256').update(str).digest() }
function authDir() { const dir = join(app.getPath('userData'), 'auth'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); return dir }
function authPath() { return join(authDir(), 'microsoft.json') }
function salvarSeguro(obj: any) {
  const p = authPath(); const json = JSON.stringify(obj, null, 2)
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(json)
      writeFileSync(p + '.enc', enc); try { if (existsSync(p)) unlinkSync(p) } catch {}
      return
    }
  } catch {}
  writeFileSync(p, json, 'utf8')
}
function lerSeguro(): any | null {
  try {
    const penc = authPath() + '.enc'; const p = authPath()
    if (existsSync(penc) && safeStorage.isEncryptionAvailable()) {
      const buf = readFileSync(penc); return JSON.parse(safeStorage.decryptString(buf))
    }
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  } catch {}
  return null
}
export function getMicrosoftStatus() {
  const data = lerSeguro(); if (!data) return { conectado: false }
  return { conectado: true, email: data.email, nome: data.nome }
}
export function desconectarMicrosoft() {
  try { const p = authPath(); const penc = p + '.enc'; if (existsSync(p)) unlinkSync(p); if (existsSync(penc)) unlinkSync(penc); return { ok: true } } catch(e:any){ return { ok: false, erro: e.message } }
}
export async function conectarMicrosoft(): Promise<{ ok: boolean; erro?: string; email?: string }> {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(sha256(verifier))
  const state = base64url(randomBytes(16))
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1')
        if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return }
        const code = url.searchParams.get('code')
        const returned = url.searchParams.get('state')
        if (returned !== state || !code) { res.writeHead(400); res.end('Erro'); server.close(); return resolve({ ok: false, erro: 'OAuth inválido' }) }
        const addr: any = server.address()
        const port = addr.port
        const redirectUri = 'http://127.0.0.1:' + port + '/callback'
        const body = new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES.join(' '), code: code, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier })
        const tokenRes = await fetch('https://login.microsoftonline.com/' + TENANT + '/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
        const tokens = await tokenRes.json()
        if (!tokens.access_token) { res.writeHead(500); res.end('Erro'); server.close(); return resolve({ ok: false, erro: tokens.error_description || 'token error' }) }
        const userRes = await fetch('https://graph.microsoft.com/v1.0/me?=displayName,mail,userPrincipalName', { headers: { Authorization: 'Bearer ' + tokens.access_token } })
        const user = await userRes.json()
        const data = { email: user.mail || user.userPrincipalName, nome: user.displayName, access_token: tokens.access_token, refresh_token: tokens.refresh_token, conectadoEm: new Date().toISOString() }
        salvarSeguro(data)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Conectado ao OneDrive/Microsoft</h2><p>Feche esta janela e volte ao DG Editor.</p></body></html>')
        server.close()
        resolve({ ok: true, email: data.email })
      } catch (e:any) { try { res.writeHead(500); res.end('Erro') } catch {}; server.close(); resolve({ ok: false, erro: e.message }) }
    })
    server.listen(0, '127.0.0.1', () => {
      const addr: any = server.address()
      const port = addr.port
      const redirectUri = 'http://127.0.0.1:' + port + '/callback'
      const authUrl = 'https://login.microsoftonline.com/' + TENANT + '/oauth2/v2.0/authorize?client_id=' + encodeURIComponent(CLIENT_ID) + '&response_type=code&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_mode=query&scope=' + encodeURIComponent(SCOPES.join(' ')) + '&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=S256&state=' + encodeURIComponent(state) + '&prompt=select_account'
      try { criarJanelaNavegador(authUrl, { mostrar: true }) } catch { shell.openExternal(authUrl) }
    })
    setTimeout(() => { try { server.close() } catch {}; resolve({ ok: false, erro: 'timeout' }) }, 120000)
  })
}
