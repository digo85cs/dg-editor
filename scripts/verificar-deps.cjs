#!/usr/bin/env node
/**
 * Verifica a saude basica de node_modules: cada pacote instalado deve ter
 * package.json e ao menos um entry point utilizavel em disco.
 * - Resolve main/module como o Node (arquivo, +.js/.mjs/.cjs, dir/index.*).
 * - Pacotes com "exports" sao confiados ao resolver do Node/bundler.
 * - @types/* exigem apenas o .d.ts correspondente.
 * - Pacotes binarios/nativos sem main sao aceitos se tiverem o asset no pacote.
 * Uso: node scripts/verificar-deps.cjs
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const NM = path.join(ROOT, 'node_modules')

function pacotes() {
  const out = []
  if (!fs.existsSync(NM)) return out
  for (const nome of fs.readdirSync(NM)) {
    if (nome.startsWith('.')) continue
    const dir = path.join(NM, nome)
    if (!fs.statSync(dir).isDirectory()) continue
    if (nome.startsWith('@')) {
      for (const sub of fs.readdirSync(dir)) {
        const p = path.join(dir, sub)
        if (fs.statSync(p).isDirectory()) out.push({ nome: nome + '/' + sub, dir: p })
      }
    } else {
      out.push({ nome, dir })
    }
  }
  return out
}

function isFile(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

const EXTS = ['.js', '.mjs', '.cjs', '.json']
const INDEX = ['index.js', 'index.mjs', 'index.cjs']

/** Resolve um entry point no estilo Node: arquivo exato, +extensao, ou dir/index.* */
function resolverEntry(dir, rel) {
  if (!rel || typeof rel !== 'string') return false
  const base = path.resolve(dir, rel)
  if (isFile(base)) return true
  if (!path.extname(base)) {
    for (const ext of EXTS) if (isFile(base + ext)) return true
  }
  try {
    if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
      for (const idx of INDEX) if (isFile(path.join(base, idx))) return true
    }
  } catch { /* ignora */ }
  return false
}

function binOk(dir, pkg) {
  const bin = pkg.bin
  if (!bin) return false
  const alvos = typeof bin === 'string' ? [bin] : Object.values(bin)
  return alvos.some((rel) => resolverEntry(dir, rel) || isFile(path.resolve(dir, rel)))
}

function assetNativo(dir) {
  try {
    return fs.readdirSync(dir).some((f) => /\.(exe|node|wasm|dll|dylib|so)$/i.test(f))
  } catch {
    return false
  }
}

const quebrados = []
let verificados = 0

for (const { nome, dir } of pacotes()) {
  const pjPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pjPath)) {
    quebrados.push(nome + ' (sem package.json)')
    continue
  }
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pjPath, 'utf8'))
  } catch (e) {
    quebrados.push(nome + ' (package.json invalido: ' + e.message + ')')
    continue
  }
  verificados++
  if (pkg.exports) continue

  if (nome.startsWith('@types/')) {
    const dts = pkg.types || pkg.typings || 'index.d.ts'
    if (!resolverEntry(dir, dts) && !isFile(path.resolve(dir, dts))) quebrados.push(nome + ' (sem .d.ts)')
    continue
  }

  const jsOk = [pkg.main, pkg.module, ...INDEX].some((rel) => resolverEntry(dir, rel))
  if (jsOk || binOk(dir, pkg) || assetNativo(dir)) continue

  // pacote so de tipos fora de @types/: aceita .d.ts declarado
  const soTipos = (pkg.types || pkg.typings) && !pkg.main && !pkg.module
  if (soTipos && isFile(path.resolve(dir, pkg.types || pkg.typings))) continue

  // pacote sem nenhum entry point declarado: dados/assets puros (ex.: node-releases)
  const semEntryDeclarado = !pkg.main && !pkg.module && !pkg.types && !pkg.typings && !pkg.bin
  if (semEntryDeclarado) continue

  quebrados.push(nome + ' (entry point ausente: main=' + String(pkg.main) + ')')
}

if (quebrados.length) {
  if (process.env.DEP_SAIDA) {
    fs.writeFileSync(process.env.DEP_SAIDA, quebrados.map((q) => q.replace(/ \(.*$/, '')).join('\n') + '\n', 'utf8')
  }
  console.error('verificar-deps: ' + quebrados.length + ' pacote(s) quebrado(s) de ' + verificados + ' verificados:')
  for (const q of quebrados.slice(0, 60)) console.error('  - ' + q)
  if (quebrados.length > 60) console.error('  ... e mais ' + (quebrados.length - 60))
  console.error('Dica: rode "npm install" para reparar node_modules.')
  process.exit(1)
}

console.log('verificar-deps: OK (' + verificados + ' pacotes com entry point valido)')
