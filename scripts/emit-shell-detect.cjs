/** Emite out/main/shell-detect.js (CJS) para testes/node sem alterar electron.vite.config. */
const esbuild = require('esbuild')
const path = require('path')

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'main', 'shell-detect.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(__dirname, '..', 'out', 'main', 'shell-detect.js'),
  logLevel: 'silent'
})
