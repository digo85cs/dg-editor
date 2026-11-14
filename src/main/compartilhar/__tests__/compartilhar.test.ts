import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  iniciarCompartilhamento,
  listarRecebidos,
  nomeRecebidoSeguro,
  pararCompartilhamento,
  pastaRecebidos,
  statusCompartilhamento
} from '../index'

let raiz = ''

beforeEach(async () => {
  raiz = mkdtempSync(join(tmpdir(), 'dg-share-'))
  await pararCompartilhamento()
})

afterEach(async () => {
  await pararCompartilhamento()
  rmSync(raiz, { recursive: true, force: true })
})

describe('compartilhamento local (AirDrop via navegador)', () => {
  it('nome seguro remove caminho e caracteres proibidos', () => {
    expect(nomeRecebidoSeguro('foto.jpg')).toBe('foto.jpg')
    expect(nomeRecebidoSeguro('../../etc/passwd')).toBe('passwd')
    expect(nomeRecebidoSeguro('C:\\temp\\a.txt')).toBe('a.txt')
    expect(nomeRecebidoSeguro('a<b>c?.txt')).toBe('a-b-c-.txt')
    expect(nomeRecebidoSeguro('   ')).toBeNull()
  })

  it('inicia servidor, recebe upload autenticado e lista o arquivo', async () => {
    const s = await iniciarCompartilhamento(raiz, { porta: 0 })
    expect(s.ok).toBe(true)
    expect(s.porta).toBeGreaterThan(0)
    const base = 'http://127.0.0.1:' + s.porta
    const res = await fetch(base + '/enviar?t=' + s.token + '&nome=' + encodeURIComponent('nota.txt'), {
      method: 'PUT',
      body: 'conteúdo de teste'
    })
    const j = (await res.json()) as { ok: boolean; nome: string; caminhoRel: string }
    expect(j.ok).toBe(true)
    expect(j.caminhoRel).toBe('.dg-editor/recebidos/nota.txt')
    expect(readFileSync(join(pastaRecebidos(raiz), 'nota.txt'), 'utf8')).toBe('conteúdo de teste')
    expect(listarRecebidos(raiz).map((r) => r.nome)).toEqual(['nota.txt'])
    const st = statusCompartilhamento(raiz)
    expect(st.ativo).toBe(true)
    expect(st.recebidos).toBe(1)
  })

  it('recusa upload sem token válido', async () => {
    const s = await iniciarCompartilhamento(raiz, { porta: 0 })
    const res = await fetch('http://127.0.0.1:' + s.porta + '/enviar?t=errado&nome=x.txt', {
      method: 'PUT',
      body: 'x'
    })
    expect(res.status).toBe(403)
    expect(existsSync(join(pastaRecebidos(raiz), 'x.txt'))).toBe(false)
  })

  it('evita sobrescrever arquivo existente', async () => {
    const s = await iniciarCompartilhamento(raiz, { porta: 0 })
    const url = 'http://127.0.0.1:' + s.porta + '/enviar?t=' + s.token + '&nome=igual.txt'
    await fetch(url, { method: 'PUT', body: 'um' })
    const segunda = await fetch(url, { method: 'PUT', body: 'dois' })
    const j = (await segunda.json()) as { nome: string }
    expect(j.nome).toBe('igual (2).txt')
    expect(listarRecebidos(raiz).length).toBe(2)
  })

  it('página inicial entrega HTML de upload', async () => {
    const s = await iniciarCompartilhamento(raiz, { porta: 0 })
    const res = await fetch('http://127.0.0.1:' + s.porta + '/')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('receber arquivos')
    expect(html).toContain('/enviar')
  })
})
