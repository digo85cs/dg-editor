import {
  garantirFixtureTypo,
  tentarAutocorrecao,
  type ResultadoAutocorrecao
} from './autocorrigir'
import type { ResultadoCenario } from '../tipos'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

async function main() {
  const raiz = process.cwd()
  const dryRun = process.argv.includes('--dry-run')
  const usarFixture = true

  const fixture = garantirFixtureTypo(raiz)
  // Garante typo presente para o teste
  writeFileSync(fixture, 'Botao: salvarr arquivo\n', 'utf-8')

  const cenario: ResultadoCenario = {
    id: 'fixture.typo.salvarr',
    area: 'qualidade',
    titulo: 'typo UI salvarr',
    severidade: 'erro',
    duracaoMs: 0,
    detalhe: 'typo salvarr',
    erro: 'typo ortografia salvarr',
    corrigivel: true
  }

  console.log('[qa:ia] dryRun=' + dryRun + ' fixture=' + fixture)
  const r: ResultadoAutocorrecao = await tentarAutocorrecao(raiz, cenario, {
    dryRun,
    usarFixture: true,
    arquivo: fixture
  })
  console.log(JSON.stringify({ aplicado: r.aplicado, dryRun: r.dryRun, motivo: r.motivo, patch: r.patch?.descricao }, null, 2))

  if (!dryRun && r.aplicado) {
    // teste de regressão seção 11+ — append assert estático se ainda não existe
    const val = join(raiz, 'test', 'validator.cjs')
    let src = readFileSync(val, 'utf-8')
    if (!/regressao\.ia\.fixture\.typo/.test(src)) {
      const bloco = `
  // ---------- 15. Regressao IA typo ----------
  section('15. Regressao IA: typo UI corrigido')
  const typoFix = pathT.join(rootT, 'test', 'fixtures', 'typo-ui.txt')
  assert(
    'regressao.ia.fixture.typo.salvarr',
    fsT.existsSync(typoFix) && /Salvar/.test(fsT.readFileSync(typoFix, 'utf-8')) && !/salvarr/.test(fsT.readFileSync(typoFix, 'utf-8'))
  )
`
      src = src.replace('  // ---------- Summary ----------', bloco + '\n  // ---------- Summary ----------')
      writeFileSync(val, src, 'utf-8')
    }
    try {
      const msg = 'fix(qa): fixture.typo.salvarr + regressao.ia.fixture.typo.salvarr'
      execSync('git add test/fixtures/typo-ui.txt test/validator.cjs', { cwd: raiz, stdio: 'inherit' })
      execSync('git commit -m "' + msg.replace(/"/g, '\\"') + '"', { cwd: raiz, stdio: 'inherit' })
      console.log('[qa:ia] commit criado')
    } catch (e) {
      console.warn('[qa:ia] commit falhou (talvez nada a commitar):', e)
    }
  }

  process.exit(r.pendenteManual && !dryRun ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
