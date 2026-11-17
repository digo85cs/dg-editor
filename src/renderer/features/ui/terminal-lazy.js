// Lazy-load do terminal: só importa terminal.js no primeiro uso.
let terminalIniciado = null

export function garantirTerminal() {
  terminalIniciado ??= import('../../terminal.js').then((m) => m.initTerminalPanel())
  return terminalIniciado
}

export function prepararTerminalLazy() {
  const termPanel = document.getElementById('terminal-panel')
  if (termPanel && !termPanel.dataset.lazyReady) {
    termPanel.dataset.lazyReady = '0'
  }
}
