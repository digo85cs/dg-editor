// DG Editor Fase 0 validation tests
// Run: node test/validator.cjs
// Uses esbuild (already installed) to transpile TS source on the fly.
const path = require('path')
const fs = require('fs')
const os = require('os')
const esbuild = require('esbuild')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'src')

function loadModule(relPath) {
  const abs = path.join(SRC, relPath)
  const ts = fs.readFileSync(abs, 'utf-8')
  const result = esbuild.transformSync(ts, {
    loader: 'ts',
    target: 'node20',
    format: 'cjs',
    sourcemap: false
  })
  const moduleObj = { exports: {} }
  const requireMock = (spec) => {
    if (spec === 'electron') {
      return {
        app: {
          getPath: (name) => name === 'userData' ? (process.env.DG_TEST_USERDATA || os.tmpdir()) : os.tmpdir(),
          getVersion: () => '0.1.0-test',
          on: () => {},
          whenReady: () => Promise.resolve(),
          quit: () => {}
        },
        BrowserWindow: class { constructor() {} on() {} webContents = { setWindowOpenHandler() {} } },
        ipcMain: { on() {}, handle() {} },
        dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
        shell: { openExternal() {} }
      }
    }
    if (spec.startsWith('@shared/')) {
      return loadModule('shared/' + spec.slice('@shared/'.length))
    }
    if (spec.startsWith('@main/')) {
      return loadModule('main/' + spec.slice('@main/'.length))
    }
    if (spec.startsWith('./')) {
      const dir = path.dirname(relPath)
      let alvo = path.join(dir, spec.slice(2))
      if (!fs.existsSync(path.join(SRC, alvo)) && fs.existsSync(path.join(SRC, alvo + '.ts'))) alvo += '.ts'
      return loadModule(alvo)
    }
    if (spec.startsWith('../')) {
      return loadModule('main/' + spec.slice(3) + '.ts')
    }
    return require(spec)
  }
  const fn = new Function('module', 'require', result.code + '\nreturn module.exports')
  return fn(moduleObj, requireMock)
}

let passed = 0
let failed = 0
const failures = []

function assert(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS: ' + name) }
  else { failed++; failures.push(name); console.log('  FAIL: ' + name + (detail ? ' - ' + detail : '')) }
}

function section(t) { console.log('\n== ' + t + ' ==') }

async function main() {
  // ---------- 1. Auth: device-token identity ----------
  section('1. Auth: device-token identity')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-auth-'))
  process.env.DG_TEST_USERDATA = tmpDir
  const authMod = loadModule('main/auth/index.ts')
  const { getAuthStore, __resetAuthStoreForTests } = authMod
  __resetAuthStoreForTests()

  const store = getAuthStore()
  let state = store.getState()
  assert('initial state not authenticated', state.authenticated === false)

  const session = store.ensureDeviceIdentity()
  assert('ensureDeviceIdentity ok', session.authenticated === true)
  assert('session has token', typeof session.token === 'string' && session.token.length > 0)
  assert('session user is owner', session.user.username === 'owner')

  const state2 = store.getState()
  assert('state after identity authenticated', state2.authenticated === true)
  assert('state token matches', state2.session && state2.session.token === session.token)

  const session2 = store.ensureDeviceIdentity()
  assert('ensureDeviceIdentity returns same token', session2.token === session.token)

  __resetAuthStoreForTests()
  const storeRestarted = getAuthStore()
  const stateRestarted = storeRestarted.getState()
  assert('restarted state authenticated', stateRestarted.authenticated === true, JSON.stringify(stateRestarted))
  assert('restarted token matches', stateRestarted.session && stateRestarted.session.token === session.token)

  store.logout()
  const stateAfterLogout = store.getState()
  assert('after logout not authenticated', stateAfterLogout.authenticated === false)

  const session3 = store.ensureDeviceIdentity()
  assert('re-boot recreates identity', session3.authenticated === true)
  assert('re-boot new token', session3.token !== session.token)

  const valid = store.validateSession(session3.token)
  assert('validateSession authenticated', valid.authenticated === true)
  const invalid = store.validateSession('badtoken')
  assert('validateSession invalid', invalid.authenticated === false)

  // ---------- 3. Folder scan ignores node_modules/.git/etc ----------
  section('2. Folder scan ignores node_modules/.git/etc')
  const scanMod = loadModule('main/scanner.ts')
  const { scanFolder } = scanMod

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-scan-'))
  fs.writeFileSync(path.join(testRoot, 'a.ts'), 'a')
  fs.writeFileSync(path.join(testRoot, 'b.js'), 'b')
  fs.writeFileSync(path.join(testRoot, 'README.md'), 'r')
  fs.mkdirSync(path.join(testRoot, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(testRoot, 'node_modules', 'dep.js'), 'dep')
  fs.mkdirSync(path.join(testRoot, '.git'), { recursive: true })
  fs.writeFileSync(path.join(testRoot, '.git', 'config'), 'git')
  fs.mkdirSync(path.join(testRoot, 'vendor'), { recursive: true })
  fs.writeFileSync(path.join(testRoot, 'vendor', 'x.php'), 'x')
  fs.mkdirSync(path.join(testRoot, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(testRoot, 'dist', 'bundle.js'), 'b')
  fs.mkdirSync(path.join(testRoot, 'src'), { recursive: true })
  fs.writeFileSync(path.join(testRoot, 'src', 'c.ts'), 'c')

  const result = scanFolder(testRoot)
  assert('scan totalFiles == 4', result.totalFiles === 4, 'got ' + result.totalFiles)
  assert('scan has .ts', result.extensions['.ts'] === 2, JSON.stringify(result.extensions))
  assert('scan has .js', result.extensions['.js'] === 1)
  assert('scan has .md', result.extensions['.md'] === 1)
  assert('scan skippedDirs >= 4', result.skippedDirs >= 4, 'got ' + result.skippedDirs)

  // ---------- 4. System profile ----------
  section('3. System profile')
  const profileMod = loadModule('main/profile.ts')
  const { getSystemProfile, profileStrength } = profileMod
  const profile = getSystemProfile()
  assert('profile platform', typeof profile.platform === 'string')
  assert('profile arch', typeof profile.arch === 'string')
  assert('profile totalMemory > 0', profile.totalMemory > 0)
  assert('profile cpus length > 0', profile.cpus.length > 0)
  const strength = profileStrength(profile)
  assert('profile strength valid', ['light', 'medium', 'strong'].includes(strength))

  // ---------- 5. Brain providers (fachada offline-only) ----------
  section('4. Brain providers')
  const brainMod = loadModule('main/brain/module.ts')
  const { getBrain, __resetBrainForTests } = brainMod
  __resetBrainForTests()
  const brain = getBrain()
  assert('brain tem ask()', typeof brain.ask === 'function')
  assert('brain tem getActiveProvider()', typeof brain.getActiveProvider === 'function')
  assert('brain tem getProviderStatuses()', typeof brain.getProviderStatuses === 'function')
  assert('provider ativo e ollama', brain.getActiveProvider() === 'ollama')
  const statuses = await brain.getProviderStatuses()
  assert('statuses tem 1 provider', statuses.length === 1)
  assert('provider name = ollama', statuses[0].name === 'ollama')

  // ---------- 5. Renderer: selecionarPasta não regride a perf ----------
  section('5. Renderer: selecionarPasta (assertion estática)')
  const path6 = require('path')
  const fs6 = require('fs')
  const appSrc = fs6.readFileSync(path6.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf-8')
  // extrai o corpo de selecionarPasta (da declaração até o fechamento da função)
  const mSel = appSrc.match(/async function selecionarPasta\([^)]*\)\s*\{([\s\S]*?)\n\}/)
  assert('selecionarPasta existe em app.js', !!mSel)
  const corpoSel = mSel ? mSel[1] : ''
  // anti-regressão A: NÃO deve chamar renderizarPastas (a causa do lag de 220ms)
  assert('selecionarPasta NAO chama renderizarPastas', !/renderizarPastas\s*\(/.test(corpoSel))
  // anti-regressão B: deve usar Promise.all (as 3 chamadas IPC em paralelo)
  assert('selecionarPasta usa Promise.all', /Promise\.all\s*\(/.test(corpoSel))
  // anti-regressão C: as 3 chamadas IPC estão DENTRO do Promise.all
  assert('selecionarPasta chama chat:load dentro de Promise.all', /Promise\.all\s*\([\s\S]*chat:load/.test(corpoSel))
  assert('selecionarPasta chama analysis:cached dentro de Promise.all', /Promise\.all\s*\([\s\S]*analysis:cached/.test(corpoSel))
  // anti-regressão D: carregarFilhos só é chamado condicionalmente (childElementCount === 0)
  const temCarregarFilhos = /carregarFilhos\s*\(/.test(corpoSel)
  const temGuard = /childElementCount\s*===\s*0/.test(corpoSel)
  assert('carregarFilhos so quando childElementCount===0', !temCarregarFilhos || temGuard)

  // ---------- 6. Terminal: invariantes estáticas ----------
  section('6. Terminal: invariantes estaticas')
  const pathT = require('path')
  const fsT = require('fs')
  const rootT = pathT.join(__dirname, '..')
  const termJs = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'terminal.js'), 'utf-8')
  const termTs = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'terminal.ts'), 'utf-8')
  const shellTs = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'shell-detect.ts'), 'utf-8')
  const indexTs = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
  const audTs = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'auto-auditoria.ts'), 'utf-8')

  assert(
    'terminal.js nao recria xterm ao trocar de aba',
    /display\s*=\s*['"]none['"]|style\.display/.test(termJs) &&
      !/async function ativarAba[\s\S]{0,800}new Terminal/.test(termJs)
  )
  assert(
    'terminal.js tem unsubscribe em onData e onExit',
    /onData/.test(termJs) &&
      /onExit/.test(termJs) &&
      (/unsub/.test(termJs) || /removeListener/.test(termJs) || /\.off\b/.test(termJs))
  )
  assert(
    'terminal.ts expoe killAllTerminals e e chamado no main no will-quit',
    /killAllTerminals/.test(termTs) &&
      /killAllTerminals/.test(indexTs) &&
      /before-quit|will-quit/.test(indexTs)
  )
  assert(
    'split: ultima aba remove grupo',
    /grupo/.test(termJs) &&
      (/aposEsvaziarGrupo|voltarSinglePreservando|removerGrupo/.test(termJs)) &&
      (/abas\.size\s*===\s*0|abas\.size\s*<=\s*0/.test(termJs))
  )
  assert(
    'shell-detect: semver numerico, nao string',
    /split\([^\)]*\)/.test(shellTs) &&
      (/parseInt|Number\s*\(/.test(shellTs)) &&
      /compararSemver|semver/i.test(shellTs)
  )
  assert('auto-auditoria tem checarTerminal', /checarTerminal/.test(audTs))

  // ---------- 7. Terminal: contexto e resize ----------
  section('7. Terminal: contexto e resize')
  const appJs7 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
  const termJs7 = termJs
  assert('terminal.js expoe abrirEm para a arvore', /abrirEm/.test(termJs7))
  assert(
    'abrirEm aceita cwd',
    /async function abrirEm\s*\(\s*cwd[\s\S]{0,400}criarAba/.test(termJs7) ||
      /function abrirEm\s*\(\s*cwd[\s\S]{0,400}cwd/.test(termJs7)
  )
  assert('divisor tem handler de dblclick', /dblclick/.test(termJs7))
  assert(
    'dblclick reseta para 300',
    /dblclick[\s\S]{0,500}300|300[\s\S]{0,200}dblclick|alturaPadraoReset[\s\S]{0,80}300/.test(termJs7)
  )
  assert(
    'drag so ativa apos mover mais de 3px',
    /Math\.abs[\s\S]{0,120}3|dx\s*\+\s*dy[\s\S]{0,40}[<>]=?\s*3|[<>]=?\s*3[\s\S]{0,40}dx/.test(termJs7)
  )
  assert('app.js registra menu de contexto', /contextmenu/.test(appJs7))

  // ---------- 8. Agente de QA: estrutura e contrato ----------
  section('8. Agente de QA: estrutura e contrato')
  const qaTipos = pathT.join(rootT, 'src', 'qa', 'tipos.ts')
  const qaIpc = pathT.join(rootT, 'src', 'qa', 'runner-ipc.ts')
  const qaE2e = pathT.join(rootT, 'src', 'qa', 'runner-e2e.ts')
  const qaPerf = pathT.join(rootT, 'src', 'qa', 'runner-perf.ts')
  const qaRel = pathT.join(rootT, 'src', 'qa', 'relatorio.ts')
  const qaIa = pathT.join(rootT, 'src', 'qa', 'ia', 'README.md')
  const pkgJson = JSON.parse(fsT.readFileSync(pathT.join(rootT, 'package.json'), 'utf-8'))
  assert(
    'src/qa/tipos.ts define RelatorioQA',
    fsT.existsSync(qaTipos) && /RelatorioQA/.test(fsT.readFileSync(qaTipos, 'utf-8'))
  )
  const ipcSrc = fsT.readFileSync(qaIpc, 'utf-8')
  assert(
    'runner-ipc.ts exercita handlers sem abrir janela',
    (/handler|ipc|executarSuiteIpc/i.test(ipcSrc)) && !/new BrowserWindow/.test(ipcSrc)
  )
  assert(
    'runner-e2e.ts usa Playwright Electron',
    fsT.existsSync(qaE2e) && /_electron|playwright/.test(fsT.readFileSync(qaE2e, 'utf-8'))
  )
  const perfSrc = fsT.readFileSync(qaPerf, 'utf-8')
  const perfBoas = fsT.readFileSync(pathT.join(rootT, 'src', 'qa', 'cenarios', 'perf-boas.ts'), 'utf-8')
  assert(
    'runner-perf.ts mede com mediana de 3',
    /median|mediana|sort/.test(perfSrc + perfBoas)
  )
  assert(
    'relatorio.ts gera markdown',
    fsT.existsSync(qaRel) && /\.md|markdown|montarMarkdown/.test(fsT.readFileSync(qaRel, 'utf-8'))
  )
  assert('package.json tem script qa', typeof pkgJson.scripts?.qa === 'string' && pkgJson.scripts.qa.length > 0)
  assert(
    'ia/README documenta o catalogo fechado',
    fsT.existsSync(qaIa) &&
      /typecheck/.test(fsT.readFileSync(qaIa, 'utf-8')) &&
      /npm test/.test(fsT.readFileSync(qaIa, 'utf-8'))
  )

  // ---------- 9. Agente de QA: leitura de buffer e baseline integro ----------
  section('9. Agente de QA: leitura de buffer e baseline integro')
  const termJs9 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'terminal.js'), 'utf-8')
  const uiTerm9 = fsT.readFileSync(pathT.join(rootT, 'src', 'qa', 'cenarios', 'ui-terminal.ts'), 'utf-8')
  const ipcRun9 = fsT.readFileSync(pathT.join(rootT, 'src', 'qa', 'runner-ipc.ts'), 'utf-8')
  assert('terminal.js expoe bufferTexto', /bufferTexto/.test(termJs9))
  assert('bufferTexto usa translateToString', /translateToString/.test(termJs9))
  assert(
    'ui-terminal le buffer via waitForFunction',
    /bufferTexto/.test(uiTerm9) && /waitForFunction/.test(uiTerm9)
  )
  assert('runner-ipc respeita ausencia de TTY', /isTTY/.test(ipcRun9))
  const basePath9 = pathT.join(rootT, 'qa-artifacts', 'baseline.json')
  let baselineOk9 = false
  if (fsT.existsSync(basePath9)) {
    try {
      const bj = JSON.parse(fsT.readFileSync(basePath9, 'utf-8'))
      const vals = Object.values(bj.metricas || {}).flatMap((m) => {
        if (!m || typeof m !== 'object') return []
        return Object.values(m).filter((v) => typeof v === 'number')
      })
      baselineOk9 = vals.length === 0 || vals.every((v) => v !== 0)
    } catch {
      baselineOk9 = false
    }
  } else {
    baselineOk9 = true
  }
  assert('baseline nao contem metricas zeradas', baselineOk9)

  // ---------- Summary ----------
  console.log('\n==============================')
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed')
  if (failed > 0) {
    console.log('Failures: ' + failures.join(', '))
    process.exit(1)
  } else {
    console.log('ALL TESTS PASSED')
    process.exit(0)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })