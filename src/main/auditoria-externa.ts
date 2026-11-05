/**
 * Auditoria externa linha-a-linha - varre imports/exports e integrações
 */
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

export function auditoriaExterna() {
  const raiz = resolverRaiz()
  const rels = [
    'src/renderer/context-manager.js',
    'src/renderer/checkpoint-timeline.js',
    'src/renderer/dryrun.js',
    'src/renderer/modes-ui.js',
    'src/renderer/regras-ui.js',
    'src/renderer/simbolos-ui.js',
    'src/renderer/slash-commands.js',
    'src/main/ignore.ts',
    'src/main/modes.ts',
    'src/main/permissoes.ts',
    'src/main/simbolos.ts',
    'src/main/simbolos-ipc.ts',
    '.dgignore'
  ]
  const faltando: string[] = []
  for (const r of rels) {
    if (!fs.existsSync(path.join(raiz,r))) faltando.push(r)
  }
  const appJs = fs.existsSync(path.join(raiz,'src/renderer/app.js')) ? fs.readFileSync(path.join(raiz,'src/renderer/app.js'),'utf8') : ''
  const imports = ['context-manager','modes-ui','regras-ui','simbolos-ui','checkpoint-timeline','dryrun','initModesUI','initContextManager']
  const missingImports = imports.filter(i => !appJs.includes(i))
  const busca = fs.existsSync(path.join(raiz,'src/main/busca.ts')) ? fs.readFileSync(path.join(raiz,'src/main/busca.ts'),'utf8') : ''
  const buscaOk = busca.includes('deveIgnorar')
  const res = { ok: faltando.length===0 && missingImports.length===0 && buscaOk, faltando, missingImports, buscaOk }
  try {
    const out = path.join(raiz,'.dg-editor','auditoria-externa.json')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(res,null,2))
  } catch {}
  return res
}
