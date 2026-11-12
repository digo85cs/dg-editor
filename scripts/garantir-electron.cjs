/**
 * Garante que o binario do Electron esteja disponível em
 * node_modules/electron/dist/electron.exe.
 *
 * O postinstall oficial do electron baixa o zip, mas pode falhar silenciosamente
 * em ambientes sem proxy/rede ou com cache corrompido. Quando falta o exe,
 * o app nao inicia (require('electron') retorna um stub de string).
 *
 * Este script verifica a presença do exe e, se faltar, tenta baixar via
 * @electron/get usando o cache local ou download direto.
 */
const fs = require('fs')
const path = require('path')

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron')
const distDir = path.join(electronDir, 'dist')
const exePath = path.join(distDir, 'electron.exe')
const versionPath = path.join(distDir, 'version')
const pathTxt = path.join(electronDir, 'path.txt')

function log (msg) {
  console.log('[garantir-electron] ' + msg)
}

function existeExe () {
  try {
    return fs.existsSync(exePath) && fs.statSync(exePath).size > 1000000
  } catch {
    return false
  }
}

async function baixarViaElectronGet () {
  try {
    const { downloadArtifact } = require('@electron/get')
    const electronPkg = require(path.join(electronDir, 'package.json'))
    const { version } = electronPkg
    const os = require('os')
    const arch = os.arch() === 'x64' ? 'x64' : 'ia32'

    log('Baixando electron v' + version + ' para ' + arch + '...')

    const zipPath = await downloadArtifact({
      version,
      artifactName: 'electron',
      platform: process.platform,
      arch,
      force: true
    })

    const extract = require('extract-zip')
    fs.mkdirSync(distDir, { recursive: true })
    await extract(zipPath, { dir: distDir })

    // Mover electron.d.ts para a raiz do pacote electron (tipo definitions)
    const srcDts = path.join(distDir, 'electron.d.ts')
    const dstDts = path.join(electronDir, 'electron.d.ts')
    if (fs.existsSync(srcDts) && !fs.existsSync(dstDts)) {
      fs.renameSync(srcDts, dstDts)
    }

    // Escrever version e path.txt
    fs.writeFileSync(versionPath, electronPkg.version + '\n', 'utf8')
    fs.writeFileSync(pathTxt, 'electron.exe', 'utf8')

    log('Electron baixado e extraido com sucesso em ' + exePath)
    return true
  } catch (err) {
    log('Falha ao baixar via @electron/get: ' + (err && err.message ? err.message : String(err)))
    return false
  }
}

async function main () {
  if (existeExe()) {
    log('electron.exe ja existe (' + fs.statSync(exePath).size + ' bytes)')
    return
  }

  log('electron.exe NAO encontrado. Tentando baixar...')
  const ok = await baixarViaElectronGet()
  if (!ok) {
    log('AVISO: nao foi possivel baixar o electron automaticamente.')
    log('O app pode nao iniciar. Execute manualmente:')
    log('  node node_modules/electron/install.js')
    log('Ou verifique se ELECTRON_SKIP_BINARY_DOWNLOAD nao esta definido.')
    process.exit(0) // nao falhar o postinstall inteiro
  }
}

main()
