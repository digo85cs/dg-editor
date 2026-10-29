/**
 * Backup de configs antes de migrações / sob demanda.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { appDataDir, resolverRaizProjeto } from './paths'
import { logEstruturado } from './logs-estruturados'

function dirBackups(): string {
  const d = join(appDataDir(), 'backups')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

export function backupConfigs(motivo = 'manual'): {
  ok: boolean
  pasta?: string
  arquivos?: string[]
  erro?: string
} {
  try {
    const dest = join(dirBackups(), stamp() + '_' + motivo.replace(/[^\w-]+/g, '_').slice(0, 40))
    mkdirSync(dest, { recursive: true })
    const copiados: string[] = []
    const raiz = resolverRaizProjeto()
    const candidatos = [
      join(appDataDir(), 'dg-editor.json'),
      join(raiz, 'qa-artifacts', 'baseline.json'),
      join(raiz, '.dg-editor', 'modelos.json')
    ]
    const agentesDir = join(raiz, '.dg-editor', 'agentes')
    for (const c of candidatos) {
      if (!existsSync(c)) continue
      const nome = basename(c)
      copyFileSync(c, join(dest, nome))
      copiados.push(nome)
    }
    if (existsSync(agentesDir)) {
      const sub = join(dest, 'agentes')
      mkdirSync(sub, { recursive: true })
      for (const f of readdirSync(agentesDir)) {
        if (!f.endsWith('.md')) continue
        copyFileSync(join(agentesDir, f), join(sub, f))
        copiados.push('agentes/' + f)
      }
    }
    writeFileSync(
      join(dest, 'manifest.json'),
      JSON.stringify({ motivo, em: new Date().toISOString(), arquivos: copiados }, null, 2),
      'utf-8'
    )
    logEstruturado('info', 'backup', 'backup criado', { pasta: dest, n: copiados.length })
    return { ok: true, pasta: dest, arquivos: copiados }
  } catch (e) {
    const erro = String((e as Error)?.message || e)
    logEstruturado('erro', 'backup', erro)
    return { ok: false, erro }
  }
}
