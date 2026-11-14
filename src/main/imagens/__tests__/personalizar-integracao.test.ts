/**
 * Validação real de extração/injeção/recriação de ISO com pycdlib.
 * Não roda no `npm test` padrão: use `DG_TEST_MIDIA=1 npx vitest run personalizar-integracao`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pythonBin, rodar } from '../../midia/core'
import { analisarIso } from '../iso'
import {
  criarPastaOverlay,
  extrairIso,
  listarConteudoIso,
  reconstruirIso,
  suporteIso
} from '../personalizar'

const ligado = process.env.DG_TEST_MIDIA === '1'

const CRIAR_FIXTURE = String.raw`
import io, sys, pycdlib
iso = pycdlib.PyCdlib()
iso.new(interchange_level=3, joliet=3, udf='2.60', vol_ident='DGTEST_WIN11')
for d in ['/SOURCES', '/EFI', '/EFI/BOOT', '/ISOLINUX']:
    iso.add_directory(iso_path=d, joliet_path=d.lower(), udf_path=d.lower())
def add(path, dados):
    iso.add_fp(io.BytesIO(dados), len(dados), iso_path=path + ';1', joliet_path=path.lower(), udf_path=path.lower())
add('/SOURCES/INSTALL.WIM', b'WIMDADOS' * 300)
add('/SETUP.EXE', b'MZSETUP' * 100)
add('/ISOLINUX/ISOLINUX.BIN', b'ISOLINUXBOOT' * 400)
add('/EFI/BOOT/BOOTX64.EFI', b'EFIBOOT' * 400)
iso.add_eltorito('/ISOLINUX/ISOLINUX.BIN;1', bootcatfile='/BOOT.CAT;1', platform_id=0,
                 boot_info_table=True, media_name='noemul', boot_load_size=4)
iso.add_eltorito('/EFI/BOOT/BOOTX64.EFI;1', bootcatfile='/EFI/BOOT/BOOT.CAT;1', platform_id=0xEF,
                 efi=True, media_name='noemul')
iso.write(sys.argv[1])
iso.close()
print('OK')
`

const LER_ARQUIVO = String.raw`
import io, sys, pycdlib
iso = pycdlib.PyCdlib()
iso.open(sys.argv[1])
b = io.BytesIO()
iso.get_file_from_iso_fp(b, iso_path=sys.argv[2])
iso.close()
sys.stdout.write(b.getvalue().decode('latin1'))
`

let raiz = ''
let fixture = ''
let pythonOk = false

beforeAll(async () => {
  if (!ligado) return
  raiz = mkdtempSync(join(tmpdir(), 'dg-iso-real-'))
  const v = await rodar(pythonBin(), ['-c', 'import pycdlib;print("ok")'], 60_000)
  pythonOk = v.ok && /ok/.test(v.stdout)
  if (!pythonOk) return
  fixture = join(raiz, 'dg-fixture.iso')
  const r = await rodar(pythonBin(), ['-c', CRIAR_FIXTURE, fixture], 120_000)
  if (!r.ok || !/OK/.test(r.stdout)) pythonOk = false
}, 180_000)

afterAll(() => {
  if (raiz) rmSync(raiz, { recursive: true, force: true })
})

function lerDoIso(caminhoIso: string, interno: string): Promise<string> {
  return rodar(pythonBin(), ['-c', LER_ARQUIVO, caminhoIso, interno], 120_000).then((r) => r.stdout)
}

describe.skipIf(!ligado)('personalização de ISO (pycdlib real)', () => {
  it('reconhece o suporte instalado', async () => {
    expect(pythonOk).toBe(true)
    const s = await suporteIso()
    expect(s.ok).toBe(true)
  }, 60_000)

  it('analisa a ISO de teste com boot BIOS + UEFI e UDF', () => {
    const a = analisarIso(fixture)
    expect(a.ok).toBe(true)
    expect(a.rotulo).toBe('DGTEST_WIN11')
    expect(a.sistema).toBe('windows')
    expect(a.boot.eltorito).toBe(true)
    expect(a.boot.bios).toBe(true)
    expect(a.boot.uefi).toBe(true)
    expect(a.iso?.udf).toBe(true)
    expect(a.iso?.joliet).toBe(true)
  })

  it('lista o conteúdo completo', async () => {
    const r = await listarConteudoIso({ entrada: fixture, limite: 50 })
    expect(r.ok).toBe(true)
    const itens = (r.detalhes?.itens as { caminho: string }[]).map((i) => i.caminho)
    expect(itens).toContain('/SOURCES/INSTALL.WIM;1')
    expect(itens).toContain('/EFI/BOOT/BOOTX64.EFI;1')
  }, 120_000)

  it('extrai para o projeto, injeta overlay e reconstrói mantendo o boot', async () => {
    const extraida = await extrairIso(raiz, { entrada: fixture })
    expect(extraida.ok).toBe(true)
    const pasta = extraida.caminho as string
    expect(existsSync(join(pasta, 'SOURCES', 'INSTALL.WIM'))).toBe(true)
    expect(readFileSync(join(pasta, 'SOURCES', 'INSTALL.WIM')).toString('latin1')).toMatch(/^WIMDADOS/)

    const overlay = criarPastaOverlay(raiz).caminho
    // diretório do overlay em minúsculas: a mesclagem precisa ser case-insensitive
    const r = await rodar(
      pythonBin(),
      ['-c', 'import os,sys;d=os.path.join(sys.argv[1],"sources");os.makedirs(d,exist_ok=True);open(os.path.join(d,"ei.cfg"),"w").write("EDICAO=PRO");open(os.path.join(sys.argv[1],"SOURCES","SETUP.EXE"),"w").write("MODIFICADO")', overlay],
      30_000
    )
    expect(r.ok).toBe(true)

    const nova = await reconstruirIso(raiz, { entrada: fixture, rotulo: 'DG_CUSTOM' })
    expect(nova.ok).toBe(true)
    expect(nova.bytes).toBeGreaterThan(0)
    const saida = nova.caminho as string
    expect(statSync(saida).size).toBeGreaterThan(100_000)

    const a = analisarIso(saida)
    expect(a.ok).toBe(true)
    expect(a.rotulo).toBe('DG_CUSTOM')
    expect(a.sistema).toBe('windows')
    expect(a.boot.eltorito).toBe(true)
    expect(a.boot.bios).toBe(true)
    expect(a.boot.uefi).toBe(true)
    expect(a.iso?.udf).toBe(true)

    expect(await lerDoIso(saida, '/SOURCES/EI.CFG;1')).toBe('EDICAO=PRO')
    expect(await lerDoIso(saida, '/SOURCES/SETUP.EXE;1')).toBe('MODIFICADO')
    expect(await lerDoIso(saida, '/SOURCES/INSTALL.WIM;1')).toMatch(/^WIMDADOS/)
  }, 600_000)
})
