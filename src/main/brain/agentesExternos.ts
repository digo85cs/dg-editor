/**
 * Detecção dos agentes externos gratuitos integrados ao DG Editor:
 * QCoder (modelos qwen2.5-coder locais), OpenDevin/OpenHands e Trae Agent.
 * Nada é instalado sem o usuário pedir; aqui só reportamos o que já existe.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listarModelosOllama } from './ollama'

export type AgenteExterno = {
  id: 'qcoder' | 'openhands' | 'trae'
  nome: string
  pronto: boolean
  detectado: boolean
  detalhe: string
  instalar: string
  custo: 'gratuito'
}

export type StatusAgentesExternos = {
  ok: boolean
  agentes: AgenteExterno[]
  ollama: { ok: boolean; modelos: string[] }
}

const TIMEOUT = 6000

function onde(exe: string): string | null {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [exe], {
    encoding: 'utf8',
    timeout: TIMEOUT,
    windowsHide: true
  })
  if (r.status !== 0 || !r.stdout) return null
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null
}

function ver(exe: string, args: string[]): string | null {
  const r = spawnSync(exe, args, { encoding: 'utf8', timeout: TIMEOUT, windowsHide: true })
  if (r.status !== 0) return null
  const saida = (r.stdout || r.stderr || '').trim().split(/\r?\n/)[0]
  return saida || null
}

function qcCli(): string | null {
  const noPath = onde('qc-cli')
  if (noPath) return noPath
  const appData = process.env.APPDATA
  if (!appData) return null
  const p = join(appData, 'com.qoder.app.stable', 'collaboration', 'cli', 'bin', 'qc-cli.cmd')
  return existsSync(p) ? p : null
}

function distrosWsl(): string[] {
  if (process.platform !== 'win32') return []
  const r = spawnSync('wsl.exe', ['-l', '-q'], { encoding: 'utf8', timeout: TIMEOUT, windowsHide: true })
  if (r.status !== 0 || !r.stdout) return []
  return r.stdout
    .replace(/\u0000/g, '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function statusAgentesExternos(): Promise<StatusAgentesExternos> {
  const agentes: AgenteExterno[] = []

  let modelos: string[] = []
  try {
    modelos = (await listarModelosOllama()) || []
  } catch {
    modelos = []
  }
  const coder = modelos.filter((m) => /qwen2\.5-coder/i.test(m))

  const qc = qcCli()
  const qcVer = qc ? ver(qc, ['--version']) : null
  const partesQc: string[] = []
  if (coder.length) partesQc.push('modelos: ' + coder.join(', '))
  if (qc) partesQc.push('qc-cli: ' + (qcVer || qc))
  agentes.push({
    id: 'qcoder',
    nome: 'QCoder (qwen2.5-coder + Qoder CLI)',
    detectado: Boolean(coder.length || qc),
    pronto: Boolean(coder.length || qc),
    detalhe: partesQc.length
      ? partesQc.join(' · ')
      : modelos.length
        ? 'Ollama ativo, mas sem qwen2.5-coder e sem qc-cli'
        : 'Ollama não respondeu em 127.0.0.1:11434',
    instalar: coder.length
      ? 'pronto — escolha o agente QCoder no seletor'
      : qc
        ? 'pronto via qc-cli'
        : 'ollama pull qwen2.5-coder:3b',
    custo: 'gratuito'
  })

  const wsl = distrosWsl()
  const openhands = onde('openhands') || onde('openhands-ai')
  const venvOpenhands =
    process.env.LOCALAPPDATA && existsSync(join(process.env.LOCALAPPDATA, 'dg-editor', 'openhands', 'Scripts', 'openhands.exe'))
  agentes.push({
    id: 'openhands',
    nome: 'OpenDevin / OpenHands',
    detectado: Boolean(openhands || venvOpenhands),
    pronto: Boolean(openhands || venvOpenhands),
    detalhe: openhands
      ? openhands
      : wsl.length
        ? 'WSL: ' + wsl.join(', ') + ' (sem openhands instalado)'
        : 'sem WSL/Docker neste PC',
    instalar: 'wsl --install && wsl pip install openhands-ai && wsl openhands',
    custo: 'gratuito'
  })

  const trae = onde('trae-cli') || onde('trae')
  const uv = onde('uv')
  agentes.push({
    id: 'trae',
    nome: 'Trae Agent',
    detectado: Boolean(trae),
    pronto: Boolean(trae),
    detalhe: trae ? trae : uv ? 'uv disponível, trae-cli não instalado' : 'trae-cli e uv ausentes',
    instalar: 'git clone https://github.com/bytedance/trae-agent && cd trae-agent && uv sync --all-extras',
    custo: 'gratuito'
  })

  return {
    ok: agentes.some((a) => a.pronto),
    agentes,
    ollama: { ok: modelos.length > 0, modelos }
  }
}
