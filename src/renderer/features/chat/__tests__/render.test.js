import { describe, expect, it } from 'vitest'
import {
  normalizarMensagensChat,
  bolhaHtml,
  formatarConteudoChat,
  organizarRespostaCursor
} from '../render.js'

describe('chat render', () => {
  it('normaliza mensagens', () => {
    expect(normalizarMensagensChat([{ role: 'user' }])).toHaveLength(1)
    expect(normalizarMensagensChat({ mensagens: [{ role: 'user' }] })).toHaveLength(1)
    expect(normalizarMensagensChat(null)).toEqual([])
  })
  it('mensagem usuario -> classe, escape, copiar e reeditar', () => {
    const b = bolhaHtml('user', '<oi>', null)
    expect(b.cls).toBe('msg user')
    expect(b.html).toContain('&lt;oi&gt;')
    expect(b.html).toContain('msg-copy')
    expect(b.html).toContain('msg-reedit')
    expect(b.html).toContain('Copiar prompt')
  })
  it('mensagem assistant com provider', () => {
    const b = bolhaHtml('assistant', 'ok', 'openai')
    expect(b.cls).toBe('msg assistant')
    expect(b.html).toContain('msg-provider')
    expect(b.html).toContain('msg-copy')
    expect(b.html).toContain('data-copy="full"')
    expect(b.html).toContain('msg-body')
    expect(b.html).not.toContain('msg-reedit')
  })
  it('formata fence de codigo sem copy por fence', () => {
    const html = formatarConteudoChat('antes\n```js\nconst x=1\n```\ndepois')
    expect(html).toContain('msg-code-inner')
    expect(html).toContain('const x=1')
    expect(html).not.toContain('msg-copy')
  })
  it('assistant com fence tem um unico copy no corpo', () => {
    const b = bolhaHtml('assistant', '**BLOCO A**\n```\nFullName\nC:\\Windows\\Autopilot\n```', 'ollama')
    const copies = (b.html.match(/msg-copy/g) || []).length
    expect(copies).toBe(1)
    expect(b.html).toContain('Copiar prompt')
  })
  it('organiza lista longa em bloco unico', () => {
    const lista = Array.from({ length: 12 }, (_, i) => '- item' + i).join('\n')
    const out = organizarRespostaCursor(lista + '\n\nMySQL nao esta rodando.')
    expect(out).toContain('Itens encontrados:')
    expect(out).toContain('MySQL')
    expect(out.split('\n').filter((l) => l.startsWith('- ')).length).toBe(0)
  })
})
