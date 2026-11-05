import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

function resolverRaiz(): string {
  const candidatos = [app.getAppPath(), path.resolve(process.cwd())]
  for (const c of candidatos) {
    try {
      if (fs.existsSync(path.join(c,'package.json')) && fs.existsSync(path.join(c,'node_modules'))) return c
    } catch {}
  }
  return app.getAppPath()
}

function listar(dir: string, acc: string[] = []): string[] {
  try {
    for (const e of fs.readdirSync(dir)) {
      if (e === 'node_modules' || e === '.git' || e === 'out' || e === 'dist' || e === 'dist-app') continue
      const p = path.join(dir,e)
      const st = fs.statSync(p)
      if (st.isDirectory()) listar(p, acc)
      else if (/\.(ts|js|mjs|cjs|json)$/.test(e)) acc.push(p)
    }
  } catch {}
  return acc
}

function resolverImport(from: string, spec: string, raiz: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null // externo
  const base = path.resolve(path.dirname(from), spec)
  const cand = [base, base+'.ts', base+'.js', base+'.mjs', base+'.cjs', path.join(base,'index.ts'), path.join(base,'index.js')]
  for (const c of cand) if (fs.existsSync(c)) return c
  return null
}

export function auditoriaImports() {
  const raiz = resolverRaiz()
  const arquivos = listar(path.join(raiz,'src'))
  const quebrados: string[] = []
  const imports: any[] = []
  for (const f of arquivos) {
    try {
      const txt = fs.readFileSync(f,'utf8')
      const re = /import\s+[^'"]*['"]([^'"]+)['"]/g
      let m
      while((m=re.exec(txt))){
        const spec = m[1]
        if (spec.startsWith('.') || spec.startsWith('/')){
          const res = resolverImport(f,spec,raiz)
          if(!res) quebrados.push(path.relative(raiz,f)+': '+spec)
          imports.push({from:path.relative(raiz,f), to:spec, ok:!!res})
        }
      }
      // require
      const re2 = /require\(['"]([^'"]+)['"]\)/g
      while((m=re2.exec(txt))){
        const spec = m[1]
        if (spec.startsWith('.') || spec.startsWith('/')){
          const res = resolverImport(f,spec,raiz)
          if(!res) quebrados.push(path.relative(raiz,f)+': '+spec+' (require)')
        }
      }
    } catch {}
  }
  const res = { ok: quebrados.length===0, total: arquivos.length, quebrados: quebrados.slice(0,200) }
  try {
    const out = path.join(raiz,'.dg-editor','auditoria-imports.json')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(res,null,2))
  } catch {}
  return res
}
