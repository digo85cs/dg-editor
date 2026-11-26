import { describe, it, expect } from 'vitest'
import { decidirPermissaoTool } from '../sandbox-permissao'

describe('sandbox-permissao', () => {
  it('bloqueia destrutivo 3x seguidas', () => {
    for (let i = 0; i < 3; i++) {
      const d1 = decidirPermissaoTool('terminal_exec', { comando: 'rm -rf /tmp/x' })
      const d2 = decidirPermissaoTool('terminal_exec', { comando: 'git reset --hard HEAD' })
      const d3 = decidirPermissaoTool('terminal_exec', { comando: 'del /q C:/x' })
      expect(d1.permissao).toBe('bloquear')
      expect(d2.permissao).toBe('bloquear')
      expect(d3.permissao).toBe('bloquear')
    }
  })

  it('allowlist por prefixo', () => {
    expect(decidirPermissaoTool('terminal_exec', { comando: 'npx vitest run' }).permissao).toBe('permitir')
    expect(decidirPermissaoTool('terminal_exec', { comando: 'npx vitest run -t x' }).permissao).toBe('permitir')
    expect(decidirPermissaoTool('terminal_exec', { comando: 'npx tsc --noEmit -p .' }).permissao).toBe('permitir')
    expect(decidirPermissaoTool('terminal_exec', { comando: 'npm run build' }).permissao).toBe('permitir')
    expect(decidirPermissaoTool('terminal_exec', { comando: 'npm test && rm -rf /' }).permissao).not.toBe('permitir')
  })

  it('default perguntar', () => {
    expect(decidirPermissaoTool('tool_que_nao_existe').permissao).toBe('perguntar')
  })
})
