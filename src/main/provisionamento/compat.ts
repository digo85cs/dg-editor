/**
 * Compatibilidade das ferramentas portáteis com o app e com o PC.
 *
 * Regras (puras, testáveis):
 * - plataforma precisa estar listada como suportada no manifesto;
 * - componente só é instalado se a versão do app >= minVersaoApp;
 * - entre os assets remotos, escolhe o que casa com a arquitetura do PC.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PlataformaManifesto = {
  rotulo: string
  suportado: boolean
  motivo?: string
}

export type ManifestoFerramentas = {
  schema: number
  appMinimo: string
  plataformas: Record<string, PlataformaManifesto>
  python: {
    serie: string
    minVersaoApp: string
    repo: string
    assetRegex: Record<string, string>
    pacotes: string[]
    pacotesMinVersaoApp: string
  }
  ffmpeg: {
    minVersaoApp: string
    repo: string
    tag: string
    assetRegex: Record<string, string>
    urlFallback: Record<string, string>
    filtrosObrigatorios: string[]
  }
  pacotesPip: {
    minVersaoApp: string
    essenciais: string[]
    completos: string[]
  }
}

export type AssetRemoto = {
  name: string
  browser_download_url: string
  updated_at?: string
  size?: number
}

export function chavePlataforma(platform: string, arch: string): string {
  const a = arch === 'x32' ? 'ia32' : arch
  return platform + '-' + a
}

export function compararVersao(a: string, b: string): number {
  const pa = String(a || '0').split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = String(b || '0').split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export function avaliarPlataforma(
  manifesto: ManifestoFerramentas,
  plataforma: string
): { ok: boolean; rotulo: string; motivo?: string } {
  const p = manifesto.plataformas[plataforma]
  if (!p) return { ok: false, rotulo: plataforma, motivo: 'plataforma não prevista no manifesto' }
  return { ok: p.suportado, rotulo: p.rotulo, motivo: p.suportado ? undefined : p.motivo }
}

export function componenteCompativel(versaoApp: string, minVersaoApp: string): boolean {
  return compararVersao(versaoApp, minVersaoApp) >= 0
}

/** Escolhe o asset mais recente cujo nome casa com o regex da arquitetura. */
export function escolherAsset(assets: AssetRemoto[], regex: string, arquitetura: string): AssetRemoto | null {
  let re: RegExp
  try {
    re = new RegExp(regex)
  } catch {
    return null
  }
  const candidatos = assets.filter((a) => a && typeof a.name === 'string' && re.test(a.name))
  if (!candidatos.length) return null
  candidatos.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  return candidatos[0]
}

/** Data (YYYY-MM-DD) de um ISO remoto, para comparar builds do ffmpeg. */
export function dataDoBuild(iso?: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso || ''))
  return m ? m[1] : ''
}

export function precisaAtualizarBuild(instalada: string | undefined, remota: string | undefined): boolean {
  const a = dataDoBuild(instalada)
  const b = dataDoBuild(remota)
  if (!b) return false
  if (!a) return true
  return b > a
}

export function pastasManifesto(): string[] {
  const dirs: string[] = []
  const env = process.env.DG_FERRAMENTAS_MANIFESTO
  if (env && env.trim()) dirs.push(env.trim())
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath
  if (typeof rp === 'string' && rp) dirs.push(join(rp, 'ferramentas.json'))
  dirs.push(join(process.cwd(), 'resources', 'ferramentas.json'))
  dirs.push(join(__dirname, '..', '..', '..', 'resources', 'ferramentas.json'))
  dirs.push(join(__dirname, '..', '..', 'resources', 'ferramentas.json'))
  dirs.push(join(__dirname, '..', '..', '..', '..', 'resources', 'ferramentas.json'))
  return dirs
}

let cache: ManifestoFerramentas | null = null

export function carregarManifesto(): ManifestoFerramentas {
  if (cache) return cache
  const caminho = pastasManifesto().find((p) => existsSync(p))
  if (!caminho) throw new Error('manifesto resources/ferramentas.json não encontrado')
  cache = JSON.parse(readFileSync(caminho, 'utf8')) as ManifestoFerramentas
  return cache
}

/** Só para testes: limpa o manifesto em cache. */
export function limparCacheManifesto(): void {
  cache = null
}
