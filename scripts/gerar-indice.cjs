#!/usr/bin/env node
/**
 * Gera .dg-editor/indice-codigo.json a partir dos .ts em src/
 * Uso: node scripts/gerar-indice.cjs [raiz]
 */
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

const raiz = path.resolve(process.argv[2] || process.env.DG_ROOT || process.cwd())
const bin = path.join(raiz, '.dg-editor', 'bin', 'main', 'brain', 'indice.js')

function garantirBuild() {
  if (fs.existsSync(bin)) return
  console.log('[indice] compilando MCP/brain...')
  const r = spawnSync('npm', ['run', 'build:mcp'], {
    cwd: raiz,
    shell: true,
    stdio: 'inherit'
  })
  if (r.status !== 0) {
    console.error('[indice] build:mcp falhou')
    process.exit(1)
  }
}

garantirBuild()

if (!fs.existsSync(bin)) {
  console.error('[indice] modulo ausente: ' + bin)
  process.exit(1)
}

const { gerarIndice, salvarIndice } = require(bin)
const idx = gerarIndice(raiz)
const destino = salvarIndice(raiz, idx)
console.log('[indice] gerado: ' + destino)
console.log('[indice] simbolos: ' + idx.simbolos.length)
console.log('[indice] referencias: ' + idx.referencias.length)

const alvos = process.argv.slice(3)
for (const nome of alvos) {
  const hit = idx.simbolos.find((s) => s.nome === nome)
  if (hit) {
    console.log('[consulta] ' + nome + ' -> ' + hit.arquivo + ':' + hit.linha + ' (' + hit.assinatura + ')')
  } else {
    console.log('[consulta] ' + nome + ' -> NAO ENCONTRADO')
  }
}
