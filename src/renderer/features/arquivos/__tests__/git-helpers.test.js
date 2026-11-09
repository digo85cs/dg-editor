import { describe, expect, it } from 'vitest'
import { relPosix, corGit, badgeGitHtml } from '../git-helpers.js'

describe('relPosix', () => {
  it('relativiza caminho dentro da raiz', () => {
    expect(relPosix('C:/dev/proj/src/a.ts', 'C:/dev/proj')).toBe('src/a.ts')
    expect(relPosix('C:\\dev\\proj\\b.js', 'C:/dev/proj/')).toBe('b.js')
  })
  it('faz fallback para basename fora da raiz', () => {
    expect(relPosix('C:/outro/x.ts', 'C:/dev/proj')).toBe('x.ts')
  })
})

describe('badgeGitHtml', () => {
  it('retorna vazio sem status', () => {
    expect(badgeGitHtml(null)).toBe('')
    expect(badgeGitHtml('')).toBe('')
  })
  it('gera badge com cor por status', () => {
    expect(badgeGitHtml('M')).toContain('data-git="M"')
    expect(corGit('A')).toBe('#2e7d4f')
    expect(corGit('?')).toBe('#888')
  })
})
