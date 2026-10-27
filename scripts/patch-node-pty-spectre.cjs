/**
 * Desativa SpectreMitigation no binding.gyp do node-pty (MSB8040 sem libs Spectre).
 * Idempotente — seguro em postinstall.
 */
const fs = require('fs')
const path = require('path')

const roots = [
  path.join(__dirname, '..', 'node_modules', 'node-pty', 'binding.gyp'),
  path.join(__dirname, '..', 'node_modules', 'node-pty', 'deps', 'winpty', 'src', 'winpty.gyp')
]

for (const f of roots) {
  if (!fs.existsSync(f)) continue
  let t = fs.readFileSync(f, 'utf8')
  const next = t.replace(/'SpectreMitigation'\s*:\s*'Spectre'/g, "'SpectreMitigation': 'false'")
  if (next !== t) {
    fs.writeFileSync(f, next, 'utf8')
    console.log('[patch-node-pty] SpectreMitigation=false em', path.relative(process.cwd(), f))
  }
}
