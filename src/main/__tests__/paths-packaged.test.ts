import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { resolverRaizDGEditor, getLogsDir, getUserDataPath } from '../paths'

const resourcesPathOriginal = (process as { resourcesPath?: string }).resourcesPath

describe('paths empacotado', () => {
  beforeEach(() => {
    delete process.env.DG_ROOT
    ;(process as { resourcesPath?: string }).resourcesPath = 'C:/Arquivos/DG Editor/resources'
    delete (process as { defaultApp?: boolean }).defaultApp
  })

  afterEach(() => {
    ;(process as { resourcesPath?: string }).resourcesPath = resourcesPathOriginal
  })

  it('raiz do app empacotado e o userData, nao o diretorio de instalacao', () => {
    const raiz = resolverRaizDGEditor()
    expect(raiz).toBe(getUserDataPath())
    expect(raiz).not.toContain('Program Files')
    expect(raiz).not.toBe(process.cwd())
  })

  it('logs resolvem dentro do userData', () => {
    const ud = getUserDataPath()
    expect(getLogsDir().startsWith(ud)).toBe(true)
  })
})
