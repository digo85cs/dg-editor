import { app, shell } from 'electron'
import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import { criarJanelaNavegador } from '../navegador/janela'

function authDir(){ const dir=join(app.getPath('userData'),'auth'); if(!existsSync(dir)) mkdirSync(dir,{recursive:true}); return dir }
function authPath(){ return join(authDir(),'adapta.json') }
function salvarSeguro(obj:any){ const p=authPath(); const json=JSON.stringify(obj,null,2); try{ if(safeStorage.isEncryptionAvailable()){ const enc=safeStorage.encryptString(json); writeFileSync(p+'.enc',enc); try{if(existsSync(p))unlinkSync(p)}catch{} return }}catch{} writeFileSync(p,json,'utf8') }
function lerSeguro():any|null{ try{ const penc=authPath()+'.enc'; const p=authPath(); if(existsSync(penc)&&safeStorage.isEncryptionAvailable()){ const buf=readFileSync(penc); return JSON.parse(safeStorage.decryptString(buf)) } if(existsSync(p)) return JSON.parse(readFileSync(p,'utf8')) }catch{} return null }
export function getAdaptaStatus(){ const data=lerSeguro(); if(!data) return {conectado:false}; return {conectado:true, email:data.email, nome:data.nome} }
export function desconectarAdapta(){ try{ const p=authPath(); const penc=p+'.enc'; if(existsSync(p))unlinkSync(p); if(existsSync(penc))unlinkSync(penc); return {ok:true} }catch(e:any){return {ok:false,erro:e.message}} }
export async function conectarAdapta(): Promise<{ok:boolean;erro?:string;email?:string}>{
  const state=randomBytes(16).toString('hex')
  return new Promise((resolve)=>{
    const server=createServer((req,res)=>{
      try{
        const url = new URL(req.url || '', 'http://127.0.0.1')
        if(url.pathname!=='/callback'){ res.writeHead(404); res.end(); return }
        const returned=url.searchParams.get('state')
        const email=url.searchParams.get('email') || undefined
        if(returned!==state){ res.writeHead(400); res.end('Erro'); server.close(); return resolve({ok:false,erro:'state invalido'}) }
        const data={email:email, conectadoEm:new Date().toISOString()}
        salvarSeguro(data)
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Conta Adapta conectada</h2><p>Feche esta janela e volte ao DG Editor.</p></body></html>')
        server.close()
        resolve({ok:true,email:email})
      }catch(e:any){ try{res.writeHead(500);res.end('Erro')}catch{} server.close(); resolve({ok:false,erro:e.message}) }
    })
    server.listen(0,'127.0.0.1',()=>{
      const addr:any=server.address()
      const port=addr.port
      const redirectUri='http://127.0.0.1:'+port+'/callback'
      const authUrl='https://adapta.org/login?next='+encodeURIComponent(redirectUri)+'&state='+state+'&src=dg-editor'
      try{ criarJanelaNavegador(authUrl,{mostrar:true}) }catch{ shell.openExternal(authUrl) }
    })
    setTimeout(()=>{try{server.close()}catch{};resolve({ok:false,erro:'timeout'})},120000)
  })
}
