/**
 * Preferências de acessibilidade do renderer: movimento, alto contraste e
 * escala da interface. Persistidas em localStorage e reaplicadas no boot; a
 * escala usa o zoomFactor do Electron para reflow correto.
 */

const CHAVE = 'dg-a11y-prefs'
const PADRAO = {
  movimento: 'sistema',
  altoContraste: false,
  escalaInterface: 1,
  anuncioStreaming: 'frases',
  tamanhoEditor: 13,
  tamanhoTerminal: 13,
  fonteEditor: 'mono'
}
const MOVIMENTOS = ['sistema', 'reduzir', 'normal']
export const ANUNCIOS_STREAMING = ['frases', 'completo', 'silencioso']
export const ESCALAS_VALIDAS = [0.9, 1, 1.1, 1.25]
export const TAMANHOS_EDITOR = [11, 12, 13, 14, 15, 16, 17, 18]
export const TAMANHOS_TERMINAL = [10, 11, 12, 13, 14, 15, 16, 17, 18]
export const FONTES_EDITOR = ['mono', 'cascadia', 'consolas']

const FONTE_CSS = {
  mono: "'Cascadia Code', Consolas, monospace",
  cascadia: "'Cascadia Code', 'Fira Code', Consolas, monospace",
  consolas: "Consolas, 'Courier New', monospace"
}

function normalizarMovimento(bruto) {
  if (MOVIMENTOS.includes(bruto?.movimento)) return bruto.movimento
  // Migração da chave antiga (boolean): true→reduzir; false/ausente→sistema.
  if (bruto?.reduzirMovimento === true) return 'reduzir'
  return PADRAO.movimento
}

function normalizarAnuncio(bruto) {
  return ANUNCIOS_STREAMING.includes(bruto?.anuncioStreaming)
    ? bruto.anuncioStreaming
    : PADRAO.anuncioStreaming
}

function normalizarTamanho(bruto, validos, padrao) {
  const n = Number(bruto)
  return validos.includes(n) ? n : padrao
}

function normalizarFonte(bruto) {
  return FONTES_EDITOR.includes(bruto?.fonteEditor) ? bruto.fonteEditor : PADRAO.fonteEditor
}

/** Família CSS correspondente à preferência de fonte do editor. */
export function familiaFonteEditor(prefs) {
  return FONTE_CSS[normalizarFonte(prefs)] || FONTE_CSS.mono
}

export function lerPreferenciasA11y() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return {
      movimento: normalizarMovimento(bruto),
      altoContraste: bruto.altoContraste === true,
      escalaInterface: ESCALAS_VALIDAS.includes(Number(bruto.escalaInterface))
        ? Number(bruto.escalaInterface)
        : PADRAO.escalaInterface,
      anuncioStreaming: normalizarAnuncio(bruto),
      tamanhoEditor: normalizarTamanho(bruto?.tamanhoEditor, TAMANHOS_EDITOR, PADRAO.tamanhoEditor),
      tamanhoTerminal: normalizarTamanho(
        bruto?.tamanhoTerminal,
        TAMANHOS_TERMINAL,
        PADRAO.tamanhoTerminal
      ),
      fonteEditor: normalizarFonte(bruto)
    }
  } catch {
    return { ...PADRAO }
  }
}

export function salvarPreferenciasA11y(prefs) {
  const p = {
    movimento: normalizarMovimento(prefs),
    altoContraste: !!prefs?.altoContraste,
    escalaInterface: ESCALAS_VALIDAS.includes(Number(prefs?.escalaInterface))
      ? Number(prefs.escalaInterface)
      : 1,
    anuncioStreaming: normalizarAnuncio(prefs),
    tamanhoEditor: normalizarTamanho(prefs?.tamanhoEditor, TAMANHOS_EDITOR, PADRAO.tamanhoEditor),
    tamanhoTerminal: normalizarTamanho(
      prefs?.tamanhoTerminal,
      TAMANHOS_TERMINAL,
      PADRAO.tamanhoTerminal
    ),
    fonteEditor: normalizarFonte(prefs)
  }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p))
  } catch {
    /* storage indisponível */
  }
  return p
}

/** true quando o SO pede menos movimento (prefers-reduced-motion). */
export function sistemaPrefereMenosMovimento() {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  } catch {
    return false
  }
}

export function movimentoReduzidoAtivo(prefs = lerPreferenciasA11y()) {
  if (prefs.movimento === 'reduzir') return true
  if (prefs.movimento === 'normal') return false
  return sistemaPrefereMenosMovimento()
}

export function aplicarPreferenciasA11y(prefs = lerPreferenciasA11y()) {
  const p = prefs || PADRAO
  document.body.classList.toggle('dg-reduzir-movimento', movimentoReduzidoAtivo(p))
  document.body.classList.toggle('dg-alto-contraste', !!p.altoContraste)
  try {
    void window.api?.invoke?.('janela:zoom-fator', Number(p.escalaInterface) || 1)
  } catch {
    /* sem IPC (testes de unidade) */
  }
  try {
    const raiz = document.documentElement
    raiz?.style?.setProperty(
      '--dg-editor-fs',
      (Number(p.tamanhoEditor) || PADRAO.tamanhoEditor) + 'px'
    )
    raiz?.style?.setProperty('--dg-editor-fonte', familiaFonteEditor(p))
  } catch {
    /* ambiente sem DOM raiz (testes) */
  }
  try {
    window.dispatchEvent?.(
      new CustomEvent('dg:escala-ui', { detail: { escala: Number(p.escalaInterface) || 1 } })
    )
    window.dispatchEvent?.(
      new CustomEvent('dg:fonte-painel', {
        detail: {
          editor: Number(p.tamanhoEditor) || PADRAO.tamanhoEditor,
          terminal: Number(p.tamanhoTerminal) || PADRAO.tamanhoTerminal
        }
      })
    )
  } catch {
    /* ambiente sem CustomEvent (testes) */
  }
  return p
}

/**
 * Ajusta a escala em degraus (1) ou volta ao padrão (0).
 * @param {number} delta
 * @param {ReturnType<typeof lerPreferenciasA11y>} [prefs]
 */
export function ajustarEscalaInterface(delta, prefs = lerPreferenciasA11y()) {
  const atual = ESCALAS_VALIDAS.includes(Number(prefs?.escalaInterface))
    ? Number(prefs.escalaInterface)
    : 1
  const i = ESCALAS_VALIDAS.indexOf(atual)
  const passo = Number(delta) || 0
  const novo = passo === 0 ? 1 : ESCALAS_VALIDAS[Math.max(0, Math.min(ESCALAS_VALIDAS.length - 1, i + passo))]
  const p = salvarPreferenciasA11y({ ...prefs, escalaInterface: novo })
  aplicarPreferenciasA11y(p)
  return p
}

const TAMANHOS_POR_PAINEL = {
  editor: { validos: TAMANHOS_EDITOR, chave: 'tamanhoEditor' },
  terminal: { validos: TAMANHOS_TERMINAL, chave: 'tamanhoTerminal' }
}

/**
 * Ajusta a fonte de um painel em degraus (1) ou volta ao padrão (0).
 * @param {'editor' | 'terminal'} alvo
 * @param {number} delta
 * @param {ReturnType<typeof lerPreferenciasA11y>} [prefs]
 */
export function ajustarTamanhoFonte(alvo, delta, prefs = lerPreferenciasA11y()) {
  const cfg = TAMANHOS_POR_PAINEL[alvo] || TAMANHOS_POR_PAINEL.editor
  const bruto = Number(prefs?.[cfg.chave])
  const atual = cfg.validos.includes(bruto) ? bruto : PADRAO[cfg.chave]
  const i = cfg.validos.indexOf(atual)
  const passo = Number(delta) || 0
  const novo =
    passo === 0
      ? PADRAO[cfg.chave]
      : cfg.validos[Math.max(0, Math.min(cfg.validos.length - 1, i + passo))]
  const p = salvarPreferenciasA11y({ ...prefs, [cfg.chave]: novo })
  aplicarPreferenciasA11y(p)
  return p
}
