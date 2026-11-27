import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extrairCodigoInline, handleEditorEditarInline } from '../ipc/editor'

const ROOT = process.cwd()

afterEach(() => {
  delete process.env.DG_FAKE_LLM
})

describe('Onda 2 — Design & UX (Inline Edit, Perspectivas, Command Bar)', () => {
  it('extrairCodigoInline remove cercas markdown preservando o código', () => {
    expect(extrairCodigoInline('```ts\nconst x = 42\n```')).toBe('const x = 42')
    expect(extrairCodigoInline('const y = 1')).toBe('const y = 1')
    expect(extrairCodigoInline('   ')).toBe('')
  })

  it('handleEditorEditarInline valida instrução vazia e responde em DG_FAKE_LLM=1', async () => {
    const vazio = await handleEditorEditarInline({} as any, { instrucao: '   ', selecao: 'a = 1' })
    expect(vazio.ok).toBe(false)
    expect(vazio.erro).toBeTruthy()

    process.env.DG_FAKE_LLM = '1'
    const ok = await handleEditorEditarInline({} as any, {
      instrucao: 'adicionar log',
      selecao: 'const a = 1',
      caminho: 'src/a.ts'
    })
    expect(ok.ok).toBe(true)
    expect(ok.codigo).toContain('const a = 1')
    expect(ok.codigo).toContain('adicionar log')
    expect(ok.provider).toBe('fake-inline')
  })

  it('preload libera editor:editar-inline e comandos/atalhos expõem Ctrl+K e Perspectivas', () => {
    const preload = readFileSync(join(ROOT, 'src/preload/index.ts'), 'utf8')
    expect(preload).toContain("'editor:editar-inline'")

    const comandos = readFileSync(join(ROOT, 'src/renderer/features/ui/comandos.js'), 'utf8')
    expect(comandos).toContain("'editor-inline-edit'")
    expect(comandos).toContain("'perspectiva-zen'")
    expect(comandos).toContain("'perspectiva-midia'")

    const atalhos = readFileSync(join(ROOT, 'src/renderer/features/ui/atalhos-teclado.js'), 'utf8')
    expect(atalhos).toContain('editor-inline-edit')
    expect(atalhos).toContain('perspectiva-zen')

    const paleta = readFileSync(join(ROOT, 'src/renderer/features/ui/paleta.js'), 'utf8')
    expect(paleta).toContain("bruto.startsWith('@')")
    expect(paleta).toContain('palette-kbd')
  })
})
