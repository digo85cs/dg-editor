// Rótulos e caminhos de exibição de arquivos/pastas (puros, dependem só de state).
import { state } from '../state/app-state.js'
import { caminhoSobPasta } from '../features/arquivos/recentes.js'
import { formatNomePastaUi } from './nomes-amigaveis.js'

export function caminhoNoVault(caminho) {
  if (!state.vaultRaiz || !caminho) return false
  return caminhoSobPasta(caminho, state.vaultRaiz)
}

export function nomeArquivo(p) {
  const s = String(p || '').replace(/\//g, '\\')
  const i = s.lastIndexOf('\\')
  return i >= 0 ? s.slice(i + 1) : s
}

/** Nome amigável na UI (DGEditor → DG Editor). */
export function nomePastaUi(p) {
  return formatNomePastaUi(p) || nomeArquivo(p)
}

export function caminhoRelativo(abs) {
  const a = String(abs || '')
  for (const raiz of state.pastasRecentes) {
    const r = String(raiz)
    if (a === r) return nomeArquivo(r)
    const sep = r.endsWith('\\') || r.endsWith('/') ? '' : '\\'
    if (a.toLowerCase().startsWith((r + sep).toLowerCase())) {
      return a.slice(r.length + sep.length).replace(/\//g, '\\')
    }
  }
  return nomeArquivo(a)
}

export function extIcon(nome) {
  const m = String(nome).toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m ? m[1] : ''
  const label = (ext || '·').slice(0, 3).toUpperCase()
  return `<span class="file-icon ext-${ext || 'txt'}">${label}</span>`
}
