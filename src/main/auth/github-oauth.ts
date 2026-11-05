import { app, shell } from 'electron'
import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import { criarJanelaNavegador } from '../navegador/janela'

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''

function authDir() { const dir = join(app.getPath('userData'), 'auth'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); return dir }
function authPath() { return join(authDir(), 'github.json') }
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
export function getGithubStatus() {
  const data = lerSeguro(); if (!data) return { conectado: false }
  return { conectado: true, email: data.email, nome: data.nome, usuario: data.login }
}
export function desconectarGithub() {
  try { const p = authPath(); const penc = p + '.enc'; if (existsSync(p)) unlinkSync(p); if (existsSync(penc)) unlinkSync(penc); return { ok: true } } catch(e:any){ return { ok: false, erro: e.message } }
}
export async function conectarGithub(): Promise<{ ok: boolean; erro?: string; email?: string }> {
  const state = randomBytes(16).toString('hex')
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
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: code, redirect_uri: redirectUri, state: state })
        })
        const tokens = await tokenRes.json()
        const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + tokens.access_token, 'User-Agent': 'DG-Editor' } })
        const user = await userRes.json()
        const data = { login: user.login, nome: user.name, email: user.email, avatar: user.avatar_url, access_token: tokens.access_token, conectadoEm: new Date().toISOString() }
        salvarSeguro(data)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Conectado ao GitHub</h2><p>Feche esta janela e volte ao DG Editor.</p></body></html>')
        server.close()
        resolve({ ok: true, email: user.email })
      } catch(e:any){ try{res.writeHead(500);res.end('Erro')}catch{} server.close(); resolve({ ok:false, erro:e.message }) }
    })
    server.listen(0, '127.0.0.1', ()=>{
      const addr: any = server.address()
      const port = addr.port
      const redirectUri = 'http://127.0.0.1:' + port + '/callback'
      const authUrl = 'https://github.com/login/oauth/authorize?client_id=' + encodeURIComponent(CLIENT_ID) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&scope=repo%20user%20read:org&state=' + state
      try { criarJanelaNavegador(authUrl, { mostrar: true }) } catch { shell.openExternal(authUrl) }
    })
    setTimeout(()=>{try{server.close()}catch{};resolve({ok:false,erro:'timeout'})},120000)
  })
}
