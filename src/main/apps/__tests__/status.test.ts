import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pastaOneDriveApp, statusApps } from '../index'

const dir = mkdtempSync(join(tmpdir(), 'dg-apps-'))
const sdk = join(dir, 'sdk')
const oneDrive = join(dir, 'OneDrive', 'APP')
const antes = {
  sdk: process.env.DG_ANDROID_SDK,
  one: process.env.DG_ONEDRIVE_APP
}

beforeAll(() => {
  process.env.DG_ANDROID_SDK = sdk
  process.env.DG_ONEDRIVE_APP = oneDrive
  require('node:fs').mkdirSync(sdk, { recursive: true })
  writeFileSync(
    join(sdk, '.dg-toolchain.json'),
    JSON.stringify({ ok: true, java: '17', pacotes: ['platform-tools'] }),
    'utf8'
  )
})

afterAll(() => {
  if (antes.sdk === undefined) delete process.env.DG_ANDROID_SDK
  else process.env.DG_ANDROID_SDK = antes.sdk
  if (antes.one === undefined) delete process.env.DG_ONEDRIVE_APP
  else process.env.DG_ONEDRIVE_APP = antes.one
  rmSync(dir, { recursive: true, force: true })
})

describe('status do construtor Apps', () => {
  it('respeita as pastas configuradas e lê o marcador do SDK', () => {
    expect(pastaOneDriveApp()).toBe(oneDrive)
    const s = statusApps()
    expect(s.sdk.pasta).toBe(sdk)
    expect(s.sdk.ok).toBe(true)
    expect(s.pastas.oneDrive).toBe(oneDrive)
    expect(Array.isArray(s.apk)).toBe(true)
  })
})
