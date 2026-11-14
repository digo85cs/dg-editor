/**
 * Compartilhamento local de arquivos (estilo AirDrop, via navegador):
 * sobe um HTTP temporário na LAN com token e recebe uploads em
 * `.dg-editor/recebidos`. Sem dependências externas.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { caminhoDentroDaRaiz } from '../paths'

export type Recebido = {
  nome: string
  caminho: string
  caminhoRel: string
  bytes: number
  mtimeMs: number
}

type Estado = { servidor: Server; porta: number; token: string; raiz: string; inicio: number }

let estado: Estado | null = null

export function pastaRecebidos(raiz: string): string {
  const pasta = join(resolve(raiz), '.dg-editor', 'recebidos')
  mkdirSync(pasta, { recursive: true })
  return pasta
}

export function nomeRecebidoSeguro(nome: unknown): string | null {
  if (typeof nome !== 'string' || !nome.trim()) return null
  const base = basename(nome.trim().replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '-').trim()
  if (!base || base === '.' || base === '..') return null
  return base.slice(0, 180)
}

function nomeLivre(pasta: string, nome: string): string {
  const ponto = nome.lastIndexOf('.')
  const radical = ponto > 0 ? nome.slice(0, ponto) : nome
  const ext = ponto > 0 ? nome.slice(ponto) : ''
  let candidato = nome
  let i = 2
  while (existsSync(join(pasta, candidato))) {
    candidato = radical + ' (' + i + ')' + ext
    i++
    if (i > 999) break
  }
  return candidato
}

function ipLocal(): string {
  for (const lista of Object.values(networkInterfaces())) {
    for (const item of lista || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

function pagina(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DG Editor — Enviar arquivos</title>
<style>
:root{color-scheme:light dark}
body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;padding:24px;background:#0f1220;color:#e8ecf5}
main{max-width:560px;margin:0 auto}
h1{font-size:20px;margin:0 0 6px}
p{color:#a8b0c4;font-size:14px}
.caixa{border:1px dashed #3a4666;border-radius:12px;padding:16px;margin-top:16px;background:#161a2c}
input[type=file]{width:100%;margin-bottom:12px}
button{background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
progress{width:100%;height:10px}
ul{padding-left:18px}
li{font-size:13px;margin:3px 0}
.ok{color:#5ee08a}.erro{color:#ff8a8a}
</style></head><body><main>
<h1>DG Editor — receber arquivos</h1>
<p>Escolha um ou mais arquivos. Eles serão salvos na pasta <code>.dg-editor/recebidos</code> do projeto aberto.</p>
<div class="caixa">
<input id="arquivos" type="file" multiple>
<button id="enviar">Enviar</button>
<progress id="barra" value="0" max="100" hidden></progress>
<div id="log"></div>
<ul id="lista"></ul>
</div>
</main>
<script>
const token = new URLSearchParams(location.search).get('t') || '';
const arquivos = document.getElementById('arquivos');
const botao = document.getElementById('enviar');
const barra = document.getElementById('barra');
const log = document.getElementById('log');
const lista = document.getElementById('lista');
botao.addEventListener('click', async () => {
  const itens = [...arquivos.files];
  if (!itens.length) { log.innerHTML = '<p class="erro">Escolha ao menos um arquivo.</p>'; return; }
  botao.disabled = true; barra.hidden = false; lista.textContent = '';
  let enviados = 0;
  for (let i = 0; i < itens.length; i++) {
    const f = itens[i];
    try {
      const resp = await fetch('/enviar?t=' + encodeURIComponent(token) + '&nome=' + encodeURIComponent(f.name), {
        method: 'PUT', body: f, headers: { 'content-type': 'application/octet-stream' }
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j.ok) throw new Error(j.erro || ('HTTP ' + resp.status));
      enviados++;
      const li = document.createElement('li');
      li.className = 'ok';
      li.textContent = f.name + ' — salvo como ' + j.nome;
      lista.appendChild(li);
    } catch (e) {
      const li = document.createElement('li');
      li.className = 'erro';
      li.textContent = f.name + ' — falhou: ' + e.message;
      lista.appendChild(li);
    }
    barra.value = Math.round(((i + 1) / itens.length) * 100);
  }
  log.innerHTML = enviados ? '<p class="ok">' + enviados + ' arquivo(s) recebido(s).</p>' : '<p class="erro">Nenhum arquivo enviado.</p>';
  botao.disabled = false;
});
</script></body></html>`
}

function json(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(texto)
}

const LIMITE_ARQUIVO = 1024 * 1024 * 1024

function tokenValido(t: string | null): boolean {
  if (!estado || !t) return false
  const a = Buffer.from(t)
  const b = Buffer.from(estado.token)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function receber(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!tokenValido(url.searchParams.get('t'))) {
    req.resume()
    json(res, 403, { ok: false, erro: 'token inválido' })
    return
  }
  const raiz = estado?.raiz
  if (!raiz) {
    req.resume()
    json(res, 409, { ok: false, erro: 'compartilhamento encerrado' })
    return
  }
  const nome = nomeRecebidoSeguro(url.searchParams.get('nome'))
  if (!nome) {
    req.resume()
    json(res, 400, { ok: false, erro: 'nome de arquivo inválido' })
    return
  }
  const pasta = pastaRecebidos(raiz)
  let final: string
  try {
    final = caminhoDentroDaRaiz(raiz, join(pasta, nomeLivre(pasta, nome))).abs
  } catch {
    req.resume()
    json(res, 400, { ok: false, erro: 'destino fora do projeto' })
    return
  }
  const parcial = final + '.parcial'
  let bytes = 0
  let excedeu = false
  req.on('data', (c: Buffer) => {
    bytes += c.length
    if (bytes > LIMITE_ARQUIVO) excedeu = true
  })
  try {
    await pipeline(req, createWriteStream(parcial))
  } catch (e) {
    try {
      await import('node:fs/promises').then((fsp) => fsp.rm(parcial, { force: true }))
    } catch {
      /* */
    }
    json(res, 500, { ok: false, erro: String((e as Error).message || e) })
    return
  }
  if (excedeu) {
    try {
      await import('node:fs/promises').then((fsp) => fsp.rm(parcial, { force: true }))
    } catch {
      /* */
    }
    json(res, 413, { ok: false, erro: 'arquivo maior que 1 GB' })
    return
  }
  if (bytes === 0) {
    try {
      await import('node:fs/promises').then((fsp) => fsp.rm(parcial, { force: true }))
    } catch {
      /* */
    }
    json(res, 400, { ok: false, erro: 'arquivo vazio' })
    return
  }
  try {
    await import('node:fs/promises').then((fsp) => fsp.rename(parcial, final))
  } catch (e) {
    json(res, 500, { ok: false, erro: String((e as Error).message || e) })
    return
  }
  json(res, 200, {
    ok: true,
    nome: basename(final),
    caminhoRel: relative(resolve(raiz), final).replace(/\\/g, '/'),
    bytes
  })
}

export async function iniciarCompartilhamento(
  raiz: string,
  opts: { porta?: number } = {}
): Promise<{ ok: boolean; erro?: string; url?: string; porta?: number; token?: string }> {
  if (estado) {
    return {
      ok: true,
      url: 'http://' + ipLocal() + ':' + estado.porta + '/?t=' + estado.token,
      porta: estado.porta,
      token: estado.token
    }
  }
  const abs = resolve(raiz)
  if (!existsSync(abs)) return { ok: false, erro: 'projeto inexistente' }
  pastaRecebidos(abs)
  const token = randomBytes(12).toString('hex')
  const servidor = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
          const html = Buffer.from(pagina(), 'utf8')
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length })
          res.end(html)
          return
        }
        if (req.method === 'GET' && url.pathname === '/status') {
          if (!tokenValido(url.searchParams.get('t'))) {
            json(res, 403, { ok: false, erro: 'token inválido' })
            return
          }
          json(res, 200, { ok: true, recebidos: listarRecebidos(abs) })
          return
        }
        if (req.method === 'PUT' && url.pathname === '/enviar') {
          await receber(req, res, url)
          return
        }
        req.resume()
        json(res, 404, { ok: false, erro: 'rota desconhecida' })
      } catch (e) {
        json(res, 500, { ok: false, erro: String((e as Error).message || e) })
      }
    })()
  })
  const porta = Number.isFinite(opts.porta) && Number(opts.porta) > 0 ? Math.floor(Number(opts.porta)) : 0
  try {
    await new Promise<void>((ok, falha) => {
      servidor.once('error', (e) => falha(e))
      servidor.listen(porta, '0.0.0.0', () => ok())
    })
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
  const endereco = servidor.address()
  const real = typeof endereco === 'object' && endereco ? endereco.port : porta
  estado = { servidor, porta: real, token, raiz: abs, inicio: Date.now() }
  return { ok: true, url: 'http://' + ipLocal() + ':' + real + '/?t=' + token, porta: real, token }
}

export async function pararCompartilhamento(): Promise<{ ok: true }> {
  const atual = estado
  estado = null
  if (!atual) return { ok: true }
  await new Promise<void>((ok) => atual.servidor.close(() => ok()))
  return { ok: true }
}

export function statusCompartilhamento(raiz?: string): {
  ok: boolean
  ativo: boolean
  url?: string
  porta?: number
  ip?: string
  inicio?: number
  recebidos: number
} {
  const base = raiz || estado?.raiz || ''
  return {
    ok: true,
    ativo: !!estado,
    url: estado ? 'http://' + ipLocal() + ':' + estado.porta + '/?t=' + estado.token : undefined,
    porta: estado?.porta,
    ip: estado ? ipLocal() : undefined,
    inicio: estado?.inicio,
    recebidos: base ? listarRecebidos(base).length : 0
  }
}

export function listarRecebidos(raiz: string): Recebido[] {
  const pasta = pastaRecebidos(raiz)
  const out: Recebido[] = []
  for (const nome of readdirSync(pasta)) {
    if (/\.parcial$/i.test(nome)) continue
    const abs = join(pasta, nome)
    try {
      const st = statSync(abs)
      if (!st.isFile()) continue
      out.push({
        nome,
        caminho: abs,
        caminhoRel: relative(resolve(raiz), abs).replace(/\\/g, '/'),
        bytes: st.size,
        mtimeMs: st.mtimeMs
      })
    } catch {
      /* */
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs || a.nome.localeCompare(b.nome))
}
