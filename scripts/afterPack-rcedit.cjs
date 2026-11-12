/**
 * afterPack: grava ProductName/FileDescription no .exe via resedit (JS puro).
 * Evita signAndEditExecutable (winCodeSign + symlink quebra no Windows sem Developer Mode).
 */
'use strict'

const fs = require('fs')
const path = require('path')

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPackRcedit(context) {
  if (context.electronPlatformName !== 'win32') return

  const ResEdit = require('resedit')
  const PELibrary = require('pe-library')

  const productName = String(context.packager.appInfo.productName || 'DG Editor')
  const version = String(context.packager.appInfo.version || '0.0.0')
  const copyright = String(
    context.packager.appInfo.copyright || 'Copyright © Rodrigo Soares'
  )
  const company = 'Rodrigo Soares'
  const exeName = `${context.packager.appInfo.productFilename || productName}.exe`
  const exePath = path.join(context.appOutDir, exeName)

  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack-rcedit] exe nao encontrado:', exePath)
    return
  }

  const data = fs.readFileSync(exePath)
  const exe = PELibrary.NtExecutable.from(data, { ignoreCert: true })
  const res = PELibrary.NtExecutableResource.from(exe)
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
  if (!viList.length) {
    console.warn('[afterPack-rcedit] sem VersionInfo em', exeName)
    return
  }

  const vi = viList[0]
  const parts = version.split('.').map((n) => parseInt(n, 10) || 0)
  while (parts.length < 4) parts.push(0)
  const [maj, min, pat, build] = parts
  vi.fixedInfo.fileVersionMS = ((maj & 0xffff) << 16) | (min & 0xffff)
  vi.fixedInfo.fileVersionLS = ((pat & 0xffff) << 16) | (build & 0xffff)
  vi.fixedInfo.productVersionMS = vi.fixedInfo.fileVersionMS
  vi.fixedInfo.productVersionLS = vi.fixedInfo.fileVersionLS

  const verStr = `${maj}.${min}.${pat}.${build}`
  for (const { lang, codepage } of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(
      { lang, codepage },
      {
        ProductName: productName,
        FileDescription: productName,
        CompanyName: company,
        LegalCopyright: copyright,
        InternalName: productName,
        OriginalFilename: exeName,
        ProductVersion: verStr,
        FileVersion: verStr
      }
    )
  }

  vi.outputToResourceEntries(res.entries)
  res.outputResource(exe)
  const out = Buffer.from(exe.generate())
  fs.writeFileSync(exePath, out)
  console.log('[afterPack-rcedit] ProductName="' + productName + '" → ' + exeName)
}
