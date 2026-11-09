import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const arq = fileURLToPath(new URL('../src/renderer/app.js', import.meta.url))
const codigo = readFileSync(arq, 'utf8')
const r = ts.transpileModule(codigo, {
  fileName: arq,
  compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  reportDiagnostics: true,
})
const errs = (r.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error)
if (errs.length) {
  console.error('[verificar-sintaxe] ERRO em ' + arq + ':')
  const sf = ts.createSourceFile(arq, codigo, ts.ScriptTarget.ES2022, true)
  for (const d of errs.slice(0, 20)) {
    const pos = d.start != null ? ts.getLineAndCharacterOfPosition(sf, d.start) : null
    const loc = pos ? (':' + (pos.line + 1) + ':' + (pos.character + 1)) : ''
    console.error('  ' + arq + loc + ' ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'))
  }
  process.exit(1)
}
console.log('[verificar-sintaxe] OK')