import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

export type AtualizacaoSugerida = {
  tipo: 'dependencia' | 'electron' | 'script'
  nome: string
  versaoAtual: string | null
  versaoSugerida: string | null
  comando: string
  urgencia: 'baixa' | 'media' | 'alta'
}

const RAIZ = process.cwd()

function run(cmd: string, args: string[]): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', timeout: 60_000 })
    return { ok: true, saida }
  } catch {
    return { ok: false, saida: '' }
  }
}

export function verificarDependencias(): AtualizacaoSugerida[] {
  const sugestoes: AtualizacaoSugerida[] = []

  // Verifica package.json
  const pkgPath = path.join(RAIZ, 'package.json')
  if (!fs.existsSync(pkgPath)) return sugestoes
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const [nome, versao] of Object.entries(deps)) {
    const r = run('npm', ['view', nome, 'version'])
    if (r.ok && r.saida.trim()) {
      const ultima = r.saida.trim().split('\n')[0]
      if (ultima && ultima !== String(versao)) {
        sugestoes.push({
          tipo: 'dependencia',
          nome,
          versaoAtual: String(versao),
          versaoSugerida: ultima,
          comando: `npm install ${nome}@${ultima}`,
          urgencia: 'media'
        })
      }
    }
  }

  return sugestoes
}

export function verificarElectron(): AtualizacaoSugerida | null {
  const pkgPath = path.join(RAIZ, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const atual = pkg.devDependencies?.electron || null

  const r = run('npm', ['view', 'electron', 'version'])
  if (!r.ok || !r.saida.trim()) return null

  const ultima = r.saida.trim().split('\n')[0]
  if (atual && ultima && atual !== ultima) {
    return {
      tipo: 'electron',
      nome: 'electron',
      versaoAtual: atual,
      versaoSugerida: ultima,
      comando: `npm install electron@${ultima} --save-dev`,
      urgencia: 'alta'
    }
  }
  return null
}

export function verificarAtualizacoes(): {
  dependencias: AtualizacaoSugerida[]
  electron: AtualizacaoSugerida | null
  temAtualizacao: boolean
} {
  const deps = verificarDependencias()
  const electron = verificarElectron()
  return {
    dependencias: deps,
    electron,
    temAtualizacao: deps.length > 0 || electron !== null
  }
}

export function aplicarAtualizacao(sugestao: AtualizacaoSugerida): { ok: boolean; erro?: string; saida?: string } {
  try {
    const [cmd, ...args] = sugestao.comando.split(' ')
    const saida = execFileSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', timeout: 120_000 })
    return { ok: true, saida }
  } catch (e: any) {
    const saida = typeof e.stdout === 'string' ? e.stdout : ''
    const stderr = typeof e.stderr === 'string' ? e.stderr : ''
    return { ok: false, erro: String(e.message), saida: saida + stderr }
  }
}
