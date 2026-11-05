/**
 * Anexos do chat entram no contexto do turno.
 * Texto conhecido e injetado. Binario ou arquivo grande fica so como referencia.
 */

const EXT_TEXTO = new Set([
  'txt', 'md', 'json', 'js', 'cjs', 'mjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'htm',
  'csv', 'xml', 'svg', 'log', 'yml', 'yaml', 'ps1', 'py', 'php', 'sql', 'env', 'ini', 'toml'
])

const MAX_UM = 32_000
const MAX_TOTAL = 48_000

export type AnexoEntrada = { nome?: string; tipo?: string; data?: string }

export function textoDeAnexo(nome: string, base64: string): { nome: string; texto: string; binario: boolean; bytes: number } {
  const ext = (nome.includes('.') ? nome.split('.').pop() || '' : '').toLowerCase()
  let buf: Buffer
  try {
    buf = Buffer.from(String(base64 || ''), 'base64')
  } catch {
    return { nome, texto: '(anexo ilegivel)', binario: true, bytes: 0 }
  }
  if (!buf.length) return { nome, texto: '(anexo vazio)', binario: true, bytes: 0 }
  if (!EXT_TEXTO.has(ext) || buf.includes(0)) {
    return {
      nome,
      texto: '(binario, ' + buf.length + ' bytes, conteudo nao injetado)',
      binario: true,
      bytes: buf.length
    }
  }
  const texto = buf.toString('utf8').slice(0, MAX_UM)
  const cortado = buf.length > MAX_UM ? '\n…(cortado)' : ''
  return { nome, texto: texto + cortado, binario: false, bytes: buf.length }
}

export function blocoAnexos(bruto: unknown): string {
  if (!Array.isArray(bruto) || !bruto.length) return ''
  const partes: string[] = []
  let total = 0
  const lista = bruto.slice(0, 8) as AnexoEntrada[]
  for (const a of lista) {
    const nome = typeof a?.nome === 'string' && a.nome.trim() ? a.nome.trim() : 'anexo'
    const data = typeof a?.data === 'string' ? a.data : ''
    if (!data) {
      partes.push('## ' + nome + '\n(sem conteudo)')
      continue
    }
    const item = textoDeAnexo(nome, data)
    const bloco = '## ' + nome + '\n' + item.texto
    if (total + bloco.length > MAX_TOTAL) {
      partes.push('## ' + nome + '\n(limite de contexto de anexos atingido)')
      break
    }
    total += bloco.length
    partes.push(bloco)
  }
  return partes.join('\n\n')
}
