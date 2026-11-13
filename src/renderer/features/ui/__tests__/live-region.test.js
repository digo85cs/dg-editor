import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function criarRegiao() {
  const escritas = []
  let valor = ''
  return {
    escritas,
    regiao: {
      get textContent() {
        return valor
      },
      set textContent(v) {
        valor = String(v)
        if (valor) escritas.push(valor)
      }
    }
  }
}

function instalar() {
  const polite = criarRegiao()
  const assertivo = criarRegiao()
  vi.stubGlobal('document', {
    getElementById: (id) =>
      id === 'dg-live-region' ? polite.regiao : id === 'dg-live-alert' ? assertivo.regiao : null
  })
  return { polite: polite.regiao, escritas: polite.escritas, assertivo: assertivo.regiao, escritasAlerta: assertivo.escritas }
}

async function carregar() {
  vi.resetModules()
  return import('../live-region.js')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('anunciar', () => {
  it('escreve na região educada após o debounce', async () => {
    const { polite } = instalar()
    const { anunciar } = await carregar()
    anunciar('Primeira frase')
    vi.advanceTimersByTime(119)
    expect(polite.textContent).toBe('')
    vi.advanceTimersByTime(1)
    expect(polite.textContent).toBe('Primeira frase')
  })

  it('ignora texto vazio e normaliza espaços', async () => {
    const { escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('   ')
    anunciar('  duas   linhas  ')
    vi.advanceTimersByTime(200)
    expect(escritas).toEqual(['duas linhas'])
  })

  it('usa a região assertiva quando pedido', async () => {
    const { polite, escritasAlerta } = instalar()
    const { anunciar } = await carregar()
    anunciar('Falhou', { urgencia: 'assertivo' })
    vi.advanceTimersByTime(200)
    expect(escritasAlerta).toEqual(['Falhou'])
    expect(polite.textContent).toBe('')
  })

  it('silencia repetição dentro da janela de dedupe', async () => {
    const { escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('Etapa concluída')
    vi.advanceTimersByTime(200)
    anunciar('Etapa concluída')
    vi.advanceTimersByTime(1000)
    expect(escritas).toEqual(['Etapa concluída'])
  })

  it('volta a anunciar a mesma mensagem depois da janela', async () => {
    const { escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('Etapa concluída')
    vi.advanceTimersByTime(200)
    vi.advanceTimersByTime(4001)
    anunciar('Etapa concluída')
    vi.advanceTimersByTime(200)
    expect(escritas).toEqual(['Etapa concluída', 'Etapa concluída'])
  })

  it('ignora mensagem já pendente na fila', async () => {
    const { escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('Etapa A')
    anunciar('Etapa B')
    anunciar('Etapa B')
    vi.advanceTimersByTime(400)
    expect(escritas).toEqual(['Etapa A', 'Etapa B'])
  })

  it('enfileira sem perder mensagens distintas em sequência', async () => {
    const { escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('Etapa A')
    anunciar('Etapa B')
    vi.advanceTimersByTime(600)
    expect(escritas).toEqual(['Etapa A', 'Etapa B'])
  })

  it('mantém cada mensagem visível por uma janela antes da próxima', async () => {
    const { polite, escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('Etapa A')
    anunciar('Etapa B')
    vi.advanceTimersByTime(120)
    expect(polite.textContent).toBe('Etapa A')
    vi.advanceTimersByTime(100)
    expect(polite.textContent).toBe('Etapa A')
    vi.advanceTimersByTime(140)
    expect(polite.textContent).toBe('Etapa B')
    expect(escritas).toEqual(['Etapa A', 'Etapa B'])
  })

  it('descarta mensagens antigas quando a fila transborda', async () => {
    const { escritas } = instalar()
    const { anunciar } = await carregar()
    anunciar('Ms1')
    anunciar('Ms2')
    anunciar('Ms3')
    anunciar('Ms4')
    vi.advanceTimersByTime(600)
    expect(escritas).not.toContain('Ms2')
    expect(escritas).toContain('Ms1')
    expect(escritas).toContain('Ms3')
    expect(escritas).toContain('Ms4')
  })
})
