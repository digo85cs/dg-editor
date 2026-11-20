/**
 * Utilitarios do painel de terminal (abas, perfis, tema xterm, rotulos de shell).
 * Extraido de terminal.js — funcoes puras de UI/storage, sem estado do painel.
 */

const LS_PERFIS = 'dg.terminal.perfis'

export function lerPerfis() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PERFIS) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p) => p && typeof p.id === 'string' && typeof p.nome === 'string')
      .slice(0, 30)
      .map((p) => ({
        id: p.id,
        nome: String(p.nome).slice(0, 60),
        shellId: typeof p.shellId === 'string' && p.shellId ? p.shellId : null,
        cwd: typeof p.cwd === 'string' && p.cwd ? p.cwd : null
      }))
  } catch {
    return []
  }
}

export function gravarPerfis(lista) {
  try {
    localStorage.setItem(LS_PERFIS, JSON.stringify(lista.slice(0, 30)))
  } catch {
    /* quota cheia */
  }
}

export function cssVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim()
  return v || fallback
}

export function temaXterm() {
  return {
    background: cssVar('--dg-bg', '#1a1a1a'),
    foreground: cssVar('--dg-text', '#f2f2f2'),
    cursor: cssVar('--dg-accent', '#2dd4a0'),
    cursorAccent: cssVar('--dg-bg', '#1a1a1a'),
    selectionBackground: cssVar('--dg-selection', 'rgba(45,212,160,0.28)'),
    black: cssVar('--dg-term-black', '#4a4a4a'),
    red: cssVar('--dg-term-red', '#f07178'),
    green: cssVar('--dg-term-green', '#4fbf82'),
    yellow: cssVar('--dg-term-yellow', '#e3c34a'),
    blue: cssVar('--dg-term-blue', '#82aaff'),
    magenta: cssVar('--dg-term-magenta', '#c792ea'),
    cyan: cssVar('--dg-term-cyan', '#89ddff'),
    brightBlack: cssVar('--dg-term-bright-black', '#a0a0a0'),
    brightRed: cssVar('--dg-term-bright-red', '#f07178'),
    brightGreen: cssVar('--dg-term-bright-green', '#4fbf82'),
    brightYellow: cssVar('--dg-term-bright-yellow', '#e3c34a'),
    brightBlue: cssVar('--dg-term-bright-blue', '#82aaff'),
    brightMagenta: cssVar('--dg-term-bright-magenta', '#c792ea'),
    brightCyan: cssVar('--dg-term-bright-cyan', '#89ddff'),
    white: cssVar('--dg-term-white', '#f5f5f5'),
    brightWhite: cssVar('--dg-term-bright-white', '#ffffff')
  }
}

export function apiTerm() {
  return window.api?.terminal
}

export function formatShellLabel(shell) {
  if (!shell) return ''
  if (typeof shell === 'string') return rotuloDoShellId(shell)
  if (shell.tipo === 'pwsh' || shell.tipo === 'pwsh-preview') {
    return `pwsh ${shell.versao || ''}`.trim()
  }
  if (shell.tipo === 'powershell') return 'Windows PowerShell'
  return shell.tipo || 'shell'
}

/** Traduz o id tecnico do shell (pwsh-7.5.4 / powershell-5.1 / cmd) para rotulo. */
export function rotuloDoShellId(id) {
  if (typeof id !== 'string' || !id) return ''
  if (id === 'cmd') return 'cmd'
  if (id.startsWith('powershell-')) return 'Windows PowerShell ' + id.slice('powershell-'.length)
  if (id.startsWith('pwsh-preview-')) return 'pwsh ' + id.slice('pwsh-preview-'.length) + ' (preview)'
  if (id.startsWith('pwsh-')) return 'pwsh ' + id.slice('pwsh-'.length)
  return id
}

export function resumirScrollback(txt, maxLinhas = 80, maxChars = 8000) {
  if (!txt) return ''
  const linhas = String(txt).replace(/\r/g, '').split('\n')
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop()
  return linhas.slice(-maxLinhas).join('\n').slice(-maxChars)
}

export function shellIdFromInfo(shell) {
  if (!shell) return null
  if (shell.tipo === 'cmd') return 'cmd'
  if (shell.tipo === 'powershell') return 'powershell-' + (shell.versao || '5.1')
  if (shell.tipo === 'pwsh-preview') return 'pwsh-preview-' + (shell.versao || 'x')
  return 'pwsh-' + (shell.versao || 'x')
}

/* ---------- Snapshot de layout (abas/split) ---------- */

export const LS_LAYOUT = 'dg.terminal.layout'
export const MAX_SCROLLBACK_LINHAS = 80
export const MAX_SCROLLBACK_CHARS = 8000

/**
 * Serializa o estado dos grupos de abas para localStorage.
 * resumoFn(a) deve retornar o scrollback resumido da aba.
 */
export function serializarLayout(grupos, grupoAtivoKey, modo, orientacao, resumoFn) {
  const keys = [...grupos.keys()].sort()
  return {
    modo,
    orientacao,
    grupos: keys.map((k) => ({
      abas: [...(grupos.get(k)?.abas.values() || [])].map((a) => ({
        shellId: a.shellId || '',
        cwd: a.cwd || '',
        perfilNome: a.perfilNome || '',
        scrollback: resumoFn(a)
      }))
    })),
    grupoAtivo: Math.max(0, keys.indexOf(grupoAtivoKey))
  }
}

/** Parse defensivo do snapshot salvo; remove chave corrompida e retorna null. */
export function parseLayoutSnapshot(raw) {
  try {
    if (!raw) return null
    const snap = JSON.parse(raw)
    if (!snap || (snap.modo !== 'single' && snap.modo !== 'split')) return null
    if (!Array.isArray(snap.grupos) || snap.grupos.length < 1) return null
    return snap
  } catch {
    try {
      localStorage.removeItem(LS_LAYOUT)
    } catch {
      /* */
    }
    return null
  }
}

/** Escreve o scrollback restaurado no xterm com marcador visual discreto. */
export function escreverScrollbackRestaurado(xterm, texto) {
  const linhas = String(texto).replace(/\r/g, '').split('\n').slice(-MAX_SCROLLBACK_LINHAS)
  if (!linhas.length) return
  try {
    xterm.write('\x1b[90m' + linhas.join('\r\n') + '\x1b[0m\r\n')
  } catch {
    /* xterm descartado */
  }
}
