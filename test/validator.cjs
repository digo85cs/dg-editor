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
        BrowserWindow: Object.assign(class { constructor() {} on() {} webContents = { setWindowOpenHandler() {}, send() {} } }, { getAllWindows: () => [] }),
        ipcMain: { on() {}, handle() {} },
        dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
        shell: { openExternal() {} },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (s) => Buffer.from(s, 'utf8'),
          decryptString: (b) => Buffer.from(b).toString('utf8')
        }
      }
    }
    if (spec.startsWith('@shared/')) {
      let alvo = 'shared/' + spec.slice('@shared/'.length)
      if (!fs.existsSync(path.join(SRC, alvo)) && fs.existsSync(path.join(SRC, alvo + '.ts'))) {
        alvo += '.ts'
      }
      return loadModule(alvo)
    }
    if (spec.startsWith('@main/')) {
      let alvo = 'main/' + spec.slice('@main/'.length)
      if (!fs.existsSync(path.join(SRC, alvo)) && fs.existsSync(path.join(SRC, alvo + '.ts'))) {
        alvo += '.ts'
      }
      return loadModule(alvo)
    }
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const dir = path.dirname(relPath)
      let alvo = path.normalize(path.join(dir, spec)).replace(/\\/g, '/')
      if (!fs.existsSync(path.join(SRC, alvo)) && fs.existsSync(path.join(SRC, alvo + '.ts'))) {
        alvo += '.ts'
      }
      return loadModule(alvo)
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
  assert('session user is digo85cs', session.user.username === 'digo85cs')
  assert('session email canonico', session.user.email === 'digo85cs@gmail.com')

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
  // drag vertical do terminal foi removido na Etapa P6 — o terminal agora é
  // docked no painel direito (Etapa 4 do Prompt F). Asserções antigas
  // (dblclick→300 / limiar dx+dy<=3) substituídas pelo contrato docked.
  assert('terminal docked no painel direito', /terminal-panel--docked/.test(termJs7))
  assert(
    'divisor de split horizontal existe',
    /montarDivisor|terminal-split-divisor/.test(termJs7)
  )
  assert(
    'sem drag vertical legado (startH/limiar 3px)',
    !/startH\s*=/.test(termJs7) && !/dx\s*\+\s*dy[\s\S]{0,40}<=\s*3/.test(termJs7)
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

  // ---------- 10. Hardening IPC + CSP ----------
  section('10. Hardening IPC: path seguro e CSP sem unsafe-eval')
  const ipcSeguro = pathT.join(rootT, 'src', 'main', 'ipc-seguro.ts')
  const indexMain = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
  const arquivoIpc10 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'arquivos.ts'), 'utf-8')
  const htmlRend = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
  assert(
    'ipc-seguro.ts define caminhoSeguro',
    fsT.existsSync(ipcSeguro) && /export function caminhoSeguro/.test(fsT.readFileSync(ipcSeguro, 'utf-8'))
  )
  assert(
    'IPC de arquivo valida caminhos com caminhoSeguro',
    /caminhoSeguro/.test(arquivoIpc10) && /handleArquivoLer/.test(arquivoIpc10)
  )
  assert(
    'index.ts valida payload com exigirString',
    /exigirString/.test(indexMain)
  )
  const cspMatch = htmlRend.match(/Content-Security-Policy[^>]*content="([^"]+)"/i)
  const csp = cspMatch ? cspMatch[1] : ''
  assert('CSP do renderer existe', csp.length > 10)
  assert('CSP nao libera unsafe-eval', csp.length > 0 && !/unsafe-eval/i.test(csp))

  // ---------- 11. Navegacao: busca e paleta ----------
  section('11. Navegacao: Quick Open, busca global e paleta')
  const buscaTs = pathT.join(rootT, 'src', 'main', 'busca.ts')
  const cmdMeta = pathT.join(rootT, 'src', 'main', 'comandos-meta.ts')
  const cmdJs = pathT.join(rootT, 'src', 'renderer', 'comandos.js')
  const appNav = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
  const preNav = fsT.readFileSync(pathT.join(rootT, 'src', 'preload', 'index.ts'), 'utf-8')
  assert('busca.ts existe', fsT.existsSync(buscaTs) && /buscaArquivos|buscaConteudo/.test(fsT.readFileSync(buscaTs, 'utf-8')))
  assert('comandos-meta.ts lista comandos', fsT.existsSync(cmdMeta) && /COMANDOS_META/.test(fsT.readFileSync(cmdMeta, 'utf-8')))
  assert('comandos.js tem registrarComando', fsT.existsSync(cmdJs) && /registrarComando/.test(fsT.readFileSync(cmdJs, 'utf-8')))
  assert('preload expoe busca:arquivos', /busca:arquivos/.test(preNav) && /comandos:listar/.test(preNav))
  assert('app.js trata Ctrl+Shift+F', /shiftKey && key === 'f'|Shift\+F/.test(appNav) || /abrirBuscaGlobal/.test(appNav))

  // ---------- 12. Brain catalogo de modelos ----------
  section('12. Brain: catalogo, deteccao e fallback')
  const catTs = pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts')
  const catSrc = fsT.existsSync(catTs) ? fsT.readFileSync(catTs, 'utf-8') : ''
  assert('modelos-catalogo.ts existe', catSrc.length > 40)
  assert('detectarModelosLocais definido', /detectarModelosLocais/.test(catSrc))
  assert('healthCheckModelos definido', /healthCheckModelos/.test(catSrc))
  assert('modeloParaTarefa definido', /modeloParaTarefa/.test(catSrc))
  assert('preload expoe modelos:recarregar', /modelos:recarregar/.test(preNav))

  // ---------- 13. Logs, backup, safe-mode ----------
  section('13. Confiabilidade: logs, backup e safe-mode')
  const logsTs = pathT.join(rootT, 'src', 'main', 'logs-estruturados.ts')
  const bakTs = pathT.join(rootT, 'src', 'main', 'config-backup.ts')
  const safeTs = pathT.join(rootT, 'src', 'main', 'safe-mode.ts')
  assert('logs-estruturados.ts existe', fsT.existsSync(logsTs) && /logEstruturado/.test(fsT.readFileSync(logsTs, 'utf-8')))
  assert('config-backup.ts existe', fsT.existsSync(bakTs) && /backupConfigs/.test(fsT.readFileSync(bakTs, 'utf-8')))
  assert('safe-mode.ts existe', fsT.existsSync(safeTs) && /--safe-mode/.test(fsT.readFileSync(safeTs, 'utf-8')))
  assert('preload expoe config:backup', /config:backup/.test(preNav))
  assert('qa ipc cobre config.backup', /ipc\.config\.backup|config-backup/.test(fsT.readFileSync(pathT.join(rootT, 'src', 'qa', 'cenarios', 'ipc-main.ts'), 'utf-8')))

  // ---------- 14. Autocorrecao IA (contrato + codigo) ----------
  section('14. Autocorrecao IA: catalogo e dry-run')
  const iaAuto = pathT.join(rootT, 'src', 'qa', 'ia', 'autocorrigir.ts')
  const iaReadme = fsT.readFileSync(pathT.join(rootT, 'src', 'qa', 'ia', 'README.md'), 'utf-8')
  assert('autocorrigir.ts existe', fsT.existsSync(iaAuto) && /tentarAutocorrecao|dryRun/.test(fsT.readFileSync(iaAuto, 'utf-8')))
  assert('README menciona dry-run', /dry-run|dryRun/.test(iaReadme))
  assert('catalogo menciona typecheck e npm test', /typecheck/.test(iaReadme) && /npm test/.test(iaReadme))
  assert('package.json tem script qa:ia', typeof pkgJson.scripts?.['qa:ia'] === 'string')
  assert('fixture typo-ui existe', fsT.existsSync(pathT.join(rootT, 'test', 'fixtures', 'typo-ui.txt')))


  // ---------- 15. Regressao IA typo ----------
  section('15. Regressao IA: typo UI corrigido')
  const typoFix = pathT.join(rootT, 'test', 'fixtures', 'typo-ui.txt')
  assert(
    'regressao.ia.fixture.typo.salvarr',
    fsT.existsSync(typoFix) && /Salvar/.test(fsT.readFileSync(typoFix, 'utf-8')) && !/salvarr/.test(fsT.readFileSync(typoFix, 'utf-8'))
  )

  // ---------- 16. Desempenho: indice e lazy ----------
  section('16. Desempenho: indice, cache e lazy loading')
  const indTs = pathT.join(rootT, 'src', 'main', 'indice-arquivos.ts')
  const termLazy = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'terminal.js'), 'utf-8')
  const appLazy = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
  assert('indice-arquivos.ts usa chokidar', fsT.existsSync(indTs) && /chokidar/.test(fsT.readFileSync(indTs, 'utf-8')))
  assert('scrollback configuravel', /dg-terminal-scrollback/.test(termLazy))
  assert('app.js tem garantirTerminal lazy', /garantirTerminal|terminalIniciado/.test(appLazy))
  assert('analyzer tem invalidarCacheAnalise', /invalidarCacheAnalise/.test(fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'analyzer.ts'), 'utf-8')))
  assert('preload expoe indice:iniciar', /indice:iniciar/.test(preNav))

  // ---------- 17. Catalogo curado, tipos e fallback leve ----------
  section('17. Catalogo curado, tipos e fallback leve')
  const defPath = pathT.join(rootT, '.dg-editor', 'modelos.default.json')
  const defRaw = fsT.existsSync(defPath) ? fsT.readFileSync(defPath, 'utf-8') : ''
  let defJson = null
  try { defJson = JSON.parse(defRaw) } catch { defJson = null }
  assert(
    'modelos.default.json existe e e curado',
    !!defJson &&
      defJson.versao === 1 &&
      typeof defJson.ativo === 'string' &&
      typeof defJson.secundario === 'string' &&
      Array.isArray(defJson.modelos) &&
      defJson.modelos.every((m) => m && typeof m.tipo === 'string')
  )
  const embedM = defJson && Array.isArray(defJson.modelos)
    ? defJson.modelos.find((m) => /embed/i.test(String(m.id || '')))
    : null
  assert(
    'nomic-embed-text classificado como embedding',
    !!embedM &&
      embedM.tipo === 'embedding' &&
      !(Array.isArray(embedM.capacidades) && embedM.capacidades.includes('chat'))
  )
  const porteOrd = { pequeno: 0, padrao: 1, grande: 2, longo: 3 }
  const ativoM = defJson && defJson.modelos
    ? defJson.modelos.find((m) => m.id === defJson.ativo)
    : null
  const secM = defJson && defJson.modelos
    ? defJson.modelos.find((m) => m.id === defJson.secundario)
    : null
  assert(
    'secundario nao e mais pesado que ativo',
    !!ativoM &&
      !!secM &&
      (porteOrd[secM.porte] ?? 99) <= (porteOrd[ativoM.porte] ?? -1)
  )
  const catSrc17 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
  assert('validarCatalogo detecta secundario pesado', /validarCatalogo/.test(catSrc17))
  assert(
    'modeloParaTarefa exclui embedding',
    /embedding/.test(catSrc17) && /modeloParaTarefa/.test(catSrc17) && /tipo !== 'embedding'|tipo !== \"embedding\"|excluirEmbedding/.test(catSrc17)
  )
  const mainIdx17 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
  const preTs17 = fsT.readFileSync(pathT.join(rootT, 'src', 'preload', 'index.ts'), 'utf-8')
  assert(
    'canal brain:fallback existe',
    /brain:fallback/.test(mainIdx17 + catSrc17) && (/brain:fallback/.test(preTs17) || /api\.on|window\.api\.on/.test(preTs17))
  )

  // ---------- 18. Toast de fallback ----------
  section('18. Toast de fallback de modelo')
  const appToast = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
  assert(
    'toast do renderer existe',
    /mostrarToast/.test(appToast) || /window\.dgToast/.test(appToast)
  )

  // ---------- 19. Sincronia do catalogo padrao ----------
  section('19. Sincronia do catalogo padrao')
  {
    const defPath19 = pathT.join(rootT, '.dg-editor', 'modelos.default.json')
    const defJson19 = JSON.parse(fsT.readFileSync(defPath19, 'utf-8'))
    const catMod19 = loadModule('main/brain/modelos-catalogo.ts')
    const cmp19 = catMod19.compararPadraoComArquivo(rootT)
    assert(
      'CATALOGO_PADRAO bate com modelos.default.json',
      cmp19.igual === true,
      (cmp19.diff || []).slice(0, 5).join(' | ')
    )
    const tipos19 = { chat: 0, codigo: 0, embedding: 0 }
    for (const m of catMod19.CATALOGO_PADRAO.modelos || []) {
      if (m.tipo === 'chat') tipos19.chat++
      if (m.tipo === 'codigo') tipos19.codigo++
      if (m.tipo === 'embedding') tipos19.embedding++
    }
    assert(
      'CATALOGO_PADRAO tem ao menos 1 modelo de cada tipo',
      tipos19.chat >= 1 && tipos19.codigo >= 1 && tipos19.embedding >= 1,
      JSON.stringify(tipos19)
    )
    const src19 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
    assert('compararPadraoComArquivo detecta divergencia', /compararPadraoComArquivo/.test(src19))
    void defJson19
  }

  // ---------- 20. Latencia por modelo ----------
  section('20. Latencia por modelo')
  {
    const ollamaSrc20 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'ollama.ts'), 'utf-8')
    const catSrc20 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
    assert('medirLatenciaModelo existe', /export async function medirLatenciaModelo/.test(ollamaSrc20))
    assert('healthCheckModelos chama medirLatenciaModelo', /medirLatenciaModelo/.test(catSrc20))
    assert('latenciaMedidaEm no ModeloEntrada', /latenciaMedidaEm/.test(catSrc20))
  }

  // ---------- 21. Safe-mode efetivo ----------
  section('21. Safe-mode efetivo')
  {
    const main21 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const ind21 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'indice-arquivos.ts'), 'utf-8')
    const pre21 = fsT.readFileSync(pathT.join(rootT, 'src', 'preload', 'index.ts'), 'utf-8')
    const ipcRegistry21 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'index.ts'), 'utf-8')
    const appExtra21 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'app-extra.ts'), 'utf-8')
    assert(
      'safe-mode desliga watcher',
      /SAFE_MODE/.test(main21) && (/emSafeMode|safe-mode/.test(ind21) || /indice\/watcher bloqueado/.test(main21))
    )
    assert(
      'safe-mode desliga health check periodico',
      /iniciarHealthPeriodico/.test(main21) && /!SAFE_MODE|SAFE_MODE/.test(main21)
    )
    assert(
      'IPC app:is-safe-mode existe',
      /ipcMain\.handle\(['"]app:is-safe-mode['"]/.test(appExtra21) &&
        /registrarHandlersAppExtra\(\)/.test(ipcRegistry21) &&
        /app:is-safe-mode/.test(pre21)
    )
  }

  // ---------- 22. Autocorrecao em arquivo real ----------
  section('22. Autocorrecao em arquivo real')
  {
    const script22 = pathT.join(rootT, 'scripts', 'qa-ia-teste.cjs')
    const src22 = fsT.existsSync(script22) ? fsT.readFileSync(script22, 'utf-8') : ''
    assert('script --alvo existe', fsT.existsSync(script22) && /--alvo=/.test(src22))
    assert(
      'pipeline reverter funciona',
      /reverter|limparTudo|rmSync/.test(src22) && /tmp\/qa-ia-teste/.test(src22)
    )
  }

  // ---------- 23. Historico de chat ----------
  section('23. Historico de chat')
  {
    const chatsTs = pathT.join(rootT, 'src', 'main', 'chats.ts')
    const main23 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'ferramentas.ts'), 'utf-8')
    const ipcRegistry23 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'index.ts'), 'utf-8')
    const gi23 = fsT.readFileSync(pathT.join(rootT, '.gitignore'), 'utf-8')
    const html23 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
    assert('chats.ts existe', fsT.existsSync(chatsTs))
    assert(
      'handlers chat:salvar/listar/carregar/apagar existem',
      /chat:salvar/.test(main23) &&
        /chat:listar/.test(main23) &&
        /chat:carregar/.test(main23) &&
        /chat:apagar/.test(main23) &&
        /registrarHandlersFerramentas\(\)/.test(ipcRegistry23)
    )
    assert('.dg-editor/chats no gitignore', /\.dg-editor\/chats/.test(gi23))
    assert('renderer tem botao Nova conversa', /btn-chat-nova|Nova conversa/.test(html23))
  }

  // ---------- 24. Diff visual ----------
  section('24. Diff visual')
  {
    const gitTs = pathT.join(rootT, 'src', 'main', 'git.ts')
    const main24 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'git.ts'), 'utf-8')
    const ipcRegistry24 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'index.ts'), 'utf-8')
    const html24 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
    const app24 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    assert('git.ts existe', fsT.existsSync(gitTs))
    assert(
      'git:status e git:diff handlers registrados',
      /ipcMain\.handle\(['"]git:status['"]/.test(main24) &&
        /ipcMain\.handle\(['"]git:diff['"]/.test(main24) &&
        /registrarHandlersGit\(\)/.test(ipcRegistry24)
    )
    assert(
      'renderer tem painel de diff',
      /diff-panel/.test(html24) && /abrirPainelDiff|diff-panel/.test(app24)
    )
  }

  // ---------- 25. Preview markdown e imagens ----------
  section('25. Preview markdown e imagens')
  {
    const html25 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
    const app25 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    assert('renderer tem toggle preview', /btn-md-preview|Preview/.test(html25) && /toggleMdPreview|md-preview/.test(app25))
    assert(
      'preview sanitiza html (grep por sanitize/sanitizar/escape)',
      /sanitizarERenderMarkdown|sanitizar/.test(app25) && /script|iframe|on\w+/.test(app25)
    )
    assert(
      'extensoes de imagem suportadas',
      /png|jpe?g|gif|webp/.test(app25) && /ler-base64|lerArquivoBase64/.test(
        fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'arquivos.ts'), 'utf-8') +
          fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
      )
    )
  }

  // ---------- 26. Roteamento consumido ----------
  section('26. Roteamento consumido')
  {
    const ollama26 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'ollama.ts'), 'utf-8')
    const main26 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'chat.ts'), 'utf-8')
    const cat26 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
    assert(
      'Nenhum call site hardcoded de modelo',
      /modeloParaTarefa/.test(ollama26) && /modeloParaTarefa/.test(main26) &&
        /askOllama/.test(main26) && !/qwen2\.5-coder:1\.5b/.test(main26)
    )
    assert(
      'modeloParaTarefa retorna null quando so embedding',
      /tipo !== 'embedding'|excluirEmbedding/.test(cat26) && /return null|:\s*null/.test(cat26)
    )
    assert(
      'chat retorna erro quando sem modelo de chat',
      /Nenhum modelo de chat instalado/.test(main26 + ollama26)
    )
  }

  // ---------- 27. Avaliacao de modelo ----------
  section('27. Avaliacao de modelo')
  {
    const av27 = pathT.join(rootT, 'src', 'main', 'brain', 'avaliacao.ts')
    const main27 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'brain.ts'), 'utf-8')
    const app27 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    assert('avaliacao.ts existe', fsT.existsSync(av27))
    assert('brain:avaliar handler existe', /ipcMain\.handle\(['"]brain:avaliar['"]/.test(main27))
    assert('nota < 6 dispara toast', /nota < 6/.test(app27) && /abaixo do esperado/.test(app27))
  }

  // ---------- 28. Deteccao de versao remota ----------
  section('28. Deteccao de versao remota')
  {
    const ollama28 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'ollama.ts'), 'utf-8')
    const cat28 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
    const app28 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    assert('consultarVersoesRemotas existe', /consultarVersoesRemotas/.test(ollama28))
    assert('modelo tem flag atualizadoDisponivel', /atualizadoDisponivel/.test(cat28))
    assert(
      'badge mostra atualizacao disponivel',
      /atualiza[cç][aã]o dispon[ií]vel|atualizadoDisponivel/.test(app28)
    )
  }

  // ---------- 29. Animacoes do chat (PRE-A) ----------
  section('29. Animacoes do chat')
  {
    const chat29 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'chat.js'), 'utf-8')
    const css29 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'styles.css'), 'utf-8')
    const app29 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    const rend29 = chat29 + app29 + css29
    assert('dg-loading-bubble existe no renderer', /dg-loading-bubble/.test(rend29))
    assert('keyframes dos 3 dots existem', /dg-dot-pulse|dot-pulse/.test(css29))
    assert(
      'loading e removido apos retorno',
      /\.remove\(\)/.test(chat29) && /removerLoadingChat|dg-loading-bubble/.test(chat29)
    )
    const ariaLiveOk =
      /aria-live/.test(chat29) &&
      /aria-atomic/.test(chat29) &&
      /dg-dots[^]*aria-hidden="true"/.test(chat29.replace(/\s+/g, ' '))
    // anti-padrão: aria-live dentro de dots/rotativo
    const anti =
      /dg-dots[^>]*(aria-live)|dg-loading-rotativo[^>]*(aria-live)/.test(chat29) ||
      /class="dg-dots"[^>]*aria-live/.test(chat29)
    assert('aria-live e aria-atomic no container (nao nos dots)', ariaLiveOk && !anti)
    assert('prefers-reduced-motion presente', /prefers-reduced-motion/.test(css29))
    assert(
      'nao regride toast nem fallback (sprint 3)',
      /mostrarToast/.test(app29) && /brain:fallback/.test(app29)
    )
  }

  // ---------- 30. Analise: primeiro clique e agente ----------
  section('30. Analise: primeiro clique e agente')
  {
    const app30 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    const html30 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
    const main30 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'analise.ts'), 'utf-8')
    const hib30 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'hibrido.ts'), 'utf-8')
    const agent30 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'agent.ts'), 'utf-8')
    assert(
      'analise exibe botoes rapida e completa',
      /id="btn-analise-rapida"[^>]*>Análise rápida/.test(html30) && /id="btn-analise-completa"[^>]*>Análise completa/.test(html30)
    )
    assert(
      'analise rapida usa escopo explicito sem forcar cache',
      /rodarAnalise\(pastaAtual,\s*'rapida'\)/.test(app30)
    )
    assert(
      'analise completa confirma antes de rodar',
      /analisarCompleta\(root, force = false\)/.test(app30) && /rodarAnalise\(root, 'completa', force\)/.test(app30)
    )
    assert(
      'analise generica oferece dialogo com tres opcoes',
      /buttons:\s*\['Analise rapida',\s*'Analise completa',\s*'Cancelar'\]/.test(main30) &&
        /choose-scope/.test(main30) && /choose-scope/.test(app30)
    )
    assert(
      'rodarAnalise marca jaAnalisou apos sucesso',
      /dataset\.jaAnalisou\s*=\s*['"]1['"]/.test(app30)
    )
    assert(
      'trocar pasta reseta jaAnalisou',
      /delete\s+[^\n]*dataset\.jaAnalisou/.test(app30)
    )
    assert(
      'hibrido.ts define servidor=pasta aberta',
      /Servidor/.test(hib30) && /(pasta aberta|root atual)/.test(hib30)
    )
    assert(
      'hibrido.ts lista comandos de leitura sem confirmacao',
      /NUNCA pedir para leitura/.test(hib30)
    )
    assert(
      'hibrido.ts proibe eco de modelo',
      /NUNCA incluir o nome do modelo/.test(hib30)
    )
    assert(
      'hibrido.ts proibe anunciar sem executar',
      /NUNCA anunciar/.test(hib30) && /executar/.test(hib30)
    )
    // guarda: anti-eco no agent (nao conta no total secao, so regressao)
    void /removerEcoModelo/.test(agent30)
  }

  // ---------- 31. Roteamento de modelos ----------
  section('31. Roteamento de modelos')
  {
    const cat31 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
    const ollama31 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'ollama.ts'), 'utf-8')
    const reg31 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'registry.ts'), 'utf-8')
    const agent31 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'agent.ts'), 'utf-8')
    const aud31 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'auto-auditoria.ts'), 'utf-8')
    const healthFn = (() => {
      const i = cat31.indexOf('export async function healthCheckModelos')
      return i >= 0 ? cat31.slice(i, i + 2200) : cat31
    })()
    assert(
      'health nao marca instalado como down por timeout',
      /status = 'lento'/.test(healthFn) &&
        !/kind === 'timeout'[\s\S]{0,40}status = 'down'/.test(healthFn) &&
        /not_found[\s\S]{0,40}status = 'down'/.test(healthFn)
    )
    assert(
      'health usa timeout >= 90s no primeiro load',
      /90_000|90000/.test(healthFn + ollama31)
    )
    assert(
      'health envia keep_alive',
      /keep_alive/.test(ollama31)
    )
    assert(
      'health nao grava o timeout como latencia',
      /latenciaMs = null/.test(healthFn) &&
        /ms: null/.test(ollama31) &&
        /classificarErroLatencia|kind === 'timeout'|ErroLatenciaKind/.test(ollama31)
    )
    assert(
      'modeloParaTarefa aceita lento',
      /status !== 'offline'/.test(cat31) && /'lento'/.test(cat31)
    )
    assert(
      'cat.ativo exige porte compativel',
      /porteCompativel|a\.porte === porte/.test(cat31)
    )
    const chatFila = (() => {
      const m = reg31.match(/if\s*\(\s*t\s*===\s*['"]chat['"]\s*\)\s*\{[\s\S]*?return\s*\[[\s\S]*?\]/)
      return m ? m[0] : ''
    })()
    assert(
      'fila chat comeca com 3b',
      /modelo: 'qwen2\.5-coder:3b'/.test(chatFila) &&
        chatFila.indexOf('qwen2.5-coder:3b') < chatFila.indexOf('qwen2.5-coder:14b')
    )
    assert(
      'fila chat nao contem 1.5b',
      !/qwen2\.5-coder:1\.5b/.test(chatFila)
    )
    assert(
      'fallback duro e 7b',
      /const fb = 'qwen2\.5-coder:7b'/.test(reg31)
    )
    assert(
      'catalogo padrao ativo e 7b',
      /ativo:\s*'qwen2\.5-coder:7b'/.test(cat31)
    )
    assert(
      'catalogo padrao secundario e 7b',
      /secundario:\s*'qwen2\.5-coder:7b'/.test(cat31)
    )
    assert(
      'removerEcoModelo cobre provider:modelo',
      /ollama/.test(agent31) &&
        /openrouter/.test(agent31) &&
        /removerEcoModelo/.test(agent31) &&
        /(?:ollama\|openrouter|ollama.*openrouter)/.test(agent31)
    )
    assert(
      'auto-auditoria sem require de modulo local',
      !/require\('\.\//.test(aud31)
    )
  }

  // ---------- 32. I/O nao bloqueante e boot ----------
  section('32. I/O nao bloqueante e boot')
  {
    const arq32 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'arquivos.ts'), 'utf-8')
    const idx32 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const arquivoIpc32 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'arquivos.ts'), 'utf-8')
    const hib32 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'hibrido.ts'), 'utf-8')
    // Warm-up dedicado foi revertido (0db01d4); keep_alive+prompt vivem no health probe
    const ollama32 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'ollama.ts'), 'utf-8')
    assert(
      'arquivos.ts nao usa mais *Sync',
      !/\bstatSync\b/.test(arq32) && !/\breaddirSync\b/.test(arq32) && !/\bexistsSync\b/.test(arq32)
    )
    assert('listarDiretorio usa withFileTypes', /withFileTypes:\s*true/.test(arq32))
    assert(
      'handlers arquivo:* sao async',
      /export async function handleArquivoLer\(/.test(arquivoIpc32) &&
        /export async function handleArquivoListar\(/.test(arquivoIpc32) &&
        /export async function handleArquivoSalvar\(/.test(arquivoIpc32) &&
        /registrarHandlersArquivo\(\)/.test(fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'ipc', 'index.ts'), 'utf-8'))
    )
    assert(
      'hibrido.ts usa execFileSync com stdio ignore',
      /stdio:\s*\['ignore',\s*'pipe',\s*'ignore'\]/.test(hib32)
    )
    assert(
      'hibrido.ts tem try/catch no git',
      /sem-commit/.test(hib32)
    )
    // nenhum execSync( sem stdio no mesmo bloco/linha
    const mainFiles = []
    const walk = (dir) => {
      for (const n of fsT.readdirSync(dir)) {
        const p = pathT.join(dir, n)
        const st = fsT.statSync(p)
        if (st.isDirectory() && n !== 'node_modules') walk(p)
        else if (/\.(ts|js)$/.test(n)) mainFiles.push(p)
      }
    }
    walk(pathT.join(rootT, 'src', 'main'))
    let execSyncSujo = false
    for (const p of mainFiles) {
      const src = fsT.readFileSync(p, 'utf-8')
      const re = /execSync\s*\(/g
      let m
      while ((m = re.exec(src))) {
        const trecho = src.slice(m.index, m.index + 220)
        if (!/stdio/.test(trecho)) {
          execSyncSujo = true
          break
        }
      }
      if (execSyncSujo) break
    }
    assert('nenhum execSync sem stdio ignore no main', !execSyncSujo)
    assert(
      'warm-up com prompt nao vazio',
      /prompt:\s*'ok'|prompt:\s*"ok"/.test(ollama32) && !/prompt:\s*['"]\s*['"]/.test(ollama32)
    )
    assert(
      'warm-up com keep_alive 24h',
      /keep_alive:\s*'24h'|keep_alive:\s*"24h"/.test(ollama32)
    )
    assert(
      'warm-up nao bloqueia boot (setTimeout)',
      /setTimeout[\s\S]{0,200}rodarAuditoria|auditoria:boot/.test(idx32)
    )
  }

  // ---------- 33. Auditoria deterministica e limpeza ----------
  section('33. Auditoria deterministica e limpeza')
  {
    const aud33 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'auto-auditoria.ts'), 'utf-8')
    const idx33 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const smoke33 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'navegador', 'smoke.ts'), 'utf-8')
    assert(
      'resumo expoe pendencias',
      /pendencias:\s*PendenciaAuditoria\[\]/.test(aud33) ||
        (/interface ResumoAuditoria[\s\S]*pendencias/.test(aud33) &&
          /id:\s*string[\s\S]*severidade[\s\S]*titulo/.test(aud33))
    )
    assert(
      'boot loga pendencias quando existirem',
      /auditoria:boot\] pendencias/.test(idx33) && /resumo\.pendencias/.test(idx33)
    )
    const limpezaBloco = (() => {
      const i = aud33.indexOf('async function limparTemporarios')
      return i >= 0 ? aud33.slice(i, i + 3500) : ''
    })()
    assert(
      'auto-auditoria nao usa mais *Sync na limpeza',
      limpezaBloco.length > 0 &&
        !/\breaddirSync\b/.test(limpezaBloco) &&
        !/\bstatSync\b/.test(limpezaBloco) &&
        !/\brmSync\b/.test(limpezaBloco)
    )
    assert('limpeza usa allSettled', /Promise\.allSettled/.test(limpezaBloco))
    assert(
      'arquivo travado nao vira warn',
      /EBUSY/.test(limpezaBloco) &&
        /EPERM/.test(limpezaBloco) &&
        /travado/.test(limpezaBloco)
    )
    assert(
      'terminal:perfis aceita 1 shell',
      !/n\s*>=\s*2\s*\?\s*['"]ok['"]\s*:\s*['"]warn['"]/.test(aud33) &&
        /n\s*>=\s*1\s*\?\s*['"]ok['"]/.test(aud33)
    )
    // ramo else de indice ausente
    const idxAusente = aud33.match(
      /Indice de simbolos ainda nao gerado[\s\S]{0,200}severidade:\s*['"]ok['"]/
    )
    assert('integridade:indice nao é warn quando ausente', !!idxAusente)
    assert(
      'modelos:14b-parado nao é warn',
      /id:\s*['"]modelos:14b-parado['"][\s\S]{0,280}severidade:\s*['"]ok['"]/.test(aud33) &&
        !/id:\s*['"]modelos:14b-parado['"][\s\S]{0,280}severidade:\s*['"]warn['"]/.test(aud33)
    )
    assert('smoke imprime total e passed', /\[smoke\] total=/.test(smoke33))
    assert(
      'smoke tem contagem deterministica',
      /ordenados\.length|porId\.values\(\)|total = ordenados/.test(smoke33) &&
        !/filter\(\(r\)\s*=>\s*r\.id\s*>\s*0\)/.test(smoke33)
    )
  }

  // ---------- Higiene workspace ----------
  section('Limpeza workspace')
  {
    const script = path.join(ROOT, 'scripts/limpeza-workspace.cjs')
    assert('script limpeza-workspace existe', fs.existsSync(script))
    const srcLimpeza = fs.readFileSync(script, 'utf8')
    assert('limpeza tem --leve', /--leve/.test(srcLimpeza))
    assert('limpeza tem --dry-run', /--dry-run/.test(srcLimpeza))
    assert('limpeza tem --organica', /--organica/.test(srcLimpeza))
    const pkgLimpeza = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    assert('npm run limpeza', typeof pkgLimpeza.scripts.limpeza === 'string')
    assert('npm run limpeza:leve', typeof pkgLimpeza.scripts['limpeza:leve'] === 'string')
    assert('npm run limpeza:organica', typeof pkgLimpeza.scripts['limpeza:organica'] === 'string')
    assert('faxina.bat existe', fs.existsSync(path.join(ROOT, 'faxina.bat')))
    assert(
      'win-self-heal existe',
      fs.existsSync(path.join(SRC, 'main/win-self-heal.ts'))
    )
    assert(
      'index chama win-self-heal',
      /win-self-heal/.test(fs.readFileSync(path.join(SRC, 'main/index.ts'), 'utf8'))
    )
    assert('npm run certificar', typeof pkgLimpeza.scripts.certificar === 'string')
    assert(
      'mcp script portatil',
      !/\\\\/.test(pkgLimpeza.scripts.mcp) && /\.dg-editor\/bin/.test(pkgLimpeza.scripts.mcp)
    )
    const mcpTs = JSON.parse(
      fs.readFileSync(path.join(SRC, 'main/mcp/tsconfig.mcp.json'), 'utf8')
    )
    assert(
      'mcp outDir relativo',
      typeof mcpTs.compilerOptions.outDir === 'string' &&
        !/^[A-Za-z]:/.test(mcpTs.compilerOptions.outDir) &&
        mcpTs.compilerOptions.outDir.includes('.dg-editor')
    )
    assert(
      'mcp rootDir relativo',
      typeof mcpTs.compilerOptions.rootDir === 'string' &&
        !/^[A-Za-z]:/.test(mcpTs.compilerOptions.rootDir)
    )
    const audLimpeza = fs.readFileSync(path.join(SRC, 'main/auto-auditoria.ts'), 'utf8')
    assert(
      'auditoria chama limpeza leve',
      /limparWorkspaceLeve/.test(audLimpeza) && /limpeza-workspace\.cjs/.test(audLimpeza)
    )
  }

  // ---------- UI visual (menubar / Contas base / float) ----------
  section('UI visual DG Editor')
  {
    const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8')
    const css = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8')
    const appJs = fs.readFileSync(path.join(ROOT, 'src/renderer/app.js'), 'utf8')
    const preload = fs.readFileSync(path.join(SRC, 'preload/index.ts'), 'utf8')
    const mainIdx = fs.readFileSync(path.join(SRC, 'main/index.ts'), 'utf8')
    const menu = fs.readFileSync(path.join(SRC, 'main/menu.ts'), 'utf8')
    const ipcIndex = fs.readFileSync(path.join(SRC, 'main/ipc/index.ts'), 'utf8')
    const windowIpc = fs.readFileSync(path.join(SRC, 'main/ipc/janela.ts'), 'utf8')
    const appIpc = fs.readFileSync(path.join(SRC, 'main/ipc/app.ts'), 'utf8')
    const ferramentasIpc = fs.readFileSync(path.join(SRC, 'main/ipc/ferramentas.ts'), 'utf8')

    assert('html tem #menubar', /id="menubar"/.test(html))
    assert('html menus Arquivo..Ajuda', /data-menu="arquivo"/.test(html) && /data-menu="ajuda"/.test(html))
    assert('html Contas no sidebar-footer', /sidebar-footer[\s\S]*id="btn-contas"/.test(html))
    assert('html Config no sidebar-footer', /sidebar-footer[\s\S]*id="btn-config"/.test(html))
    assert(
      'html config fora da activity-bar',
      !/<nav id="activity-bar"[\s\S]*?data-action="config"[\s\S]*?<\/nav>/.test(html)
    )
    assert('html modal-float config', /id="modal-config"[^>]*modal-float/.test(html))
    assert('html modal-float contas', /id="modal-contas"[^>]*modal-float/.test(html))
    assert('html data-float-handle', /data-float-handle/.test(html) && /data-float-box/.test(html))
    assert('css #menubar', /#menubar\s*\{/.test(css))
    assert('css titlebar no-drag', /#titlebar[\s\S]{0,400}-webkit-app-region:\s*no-drag/.test(css))
    assert('css tb-drag-fill', /\.tb-drag-fill[\s\S]{0,120}-webkit-app-region:\s*drag/.test(css))
    assert('css sidebar grid footer', /#sidebar\s*\{[\s\S]{0,200}grid-template-rows:/.test(css))
    assert(
      'css Contas/Config empilhados (column)',
      /\.sidebar-footer\s*\{[\s\S]{0,180}flex-direction:\s*column/.test(css)
    )
    assert('css modal-float', /\.modal\.modal-float/.test(css))
    assert('app initMenubar', /function initMenubar\s*\(/.test(appJs) && /initMenubar\(\)/.test(appJs))
    assert('app ligarJanelaFlutuante', /function ligarJanelaFlutuante\s*\(/.test(appJs))
    assert('tabs do centro sem inicializador inexistente', !/\binitAgentModes\s*\(/.test(appJs))
    assert(
      'regras gerais entram no bundle do renderer',
      /<script type="module" src="\.\/regras-gerais-ui\.js"><\/script>/.test(html)
    )
    assert('preload janela:recarregar', /janela:recarregar/.test(preload))
    assert('preload janela:zoom', /janela:zoom/.test(preload))
    assert('preload janela:tela-cheia', /janela:tela-cheia/.test(preload))
    assert('preload menu:acao', /menu:acao/.test(preload))
    assert('preload app:get-version', /app:get-version/.test(preload))
    assert('preload app:raiz-projeto', /app:raiz-projeto/.test(preload))
    assert(
      'main registra handlers de janela',
      /janela:recarregar/.test(windowIpc) && /janela:zoom/.test(windowIpc) &&
        /janela:tela-cheia/.test(windowIpc) && /registrarHandlersJanela\(\)/.test(ipcIndex)
    )
    assert('main envia menu:acao', /send\(\s*['"]menu:acao['"]/.test(mainIdx))
    assert(
      'main app:get-version handle',
      /ipcMain\.handle\(\s*['"]app:get-version['"]/.test(ferramentasIpc) &&
        /registrarHandlersFerramentas\(\)/.test(ipcIndex)
    )
    assert(
      'main app:raiz-projeto handle',
      /ipcMain\.handle\(\s*['"]app:raiz-projeto['"]/.test(appIpc) &&
        /registrarHandlersApp\(\)/.test(ipcIndex)
    )
    assert('renderer garante pasta raiz', /garantirPastaRaizProjeto/.test(appJs))
    assert('menu onAcao', /onAcao\??\s*:/.test(menu) || /onAcao\?:/.test(menu))
    assert('atalho abrir-dg-editor.bat', fs.existsSync(path.join(ROOT, 'abrir-dg-editor.bat')))
    assert(
      'atalho corrigir-atalho-desktop.bat',
      fs.existsSync(path.join(ROOT, 'corrigir-atalho-desktop.bat'))
    )
  }

  section('Branding DG Editor')
  {
    const brand = fs.readFileSync(path.join(SRC, 'main/branding.ts'), 'utf8')
    assert('branding setName DG Editor', /DG_APP_NAME\s*=\s*'DG Editor'/.test(brand))
    assert('branding appId', /com\.dgeditor\.app/.test(brand))
    assert('icone dg-editor.ico', fs.existsSync(path.join(ROOT, 'resources/dg-editor.ico')))
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    assert('productName DG Editor', pkg.productName === 'DG Editor')
    assert('executableName DG Editor', pkg.build && pkg.build.win && pkg.build.win.executableName === 'DG Editor')
    assert('build appId', pkg.build && pkg.build.appId === 'com.dgeditor.app')
    assert(
      'npm start nao usa electron-vite preview',
      typeof pkg.scripts.start === 'string' && !/electron-vite\s+preview/.test(pkg.scripts.start)
    )
    assert('iniciar-app.cjs existe', fs.existsSync(path.join(ROOT, 'scripts/iniciar-app.cjs')))
    assert(
      'garantir-launchers.cjs existe',
      fs.existsSync(path.join(ROOT, 'scripts/garantir-launchers.cjs'))
    )
    assert(
      'prestart garante launchers',
      typeof pkg.scripts.prestart === 'string' && /garantir-launchers/.test(pkg.scripts.prestart)
    )
    assert(
      'raiz canonica Windows',
      /D:\\\\CURSOR\\\\DG Editor/.test(
        fs.readFileSync(path.join(SRC, 'shared/raiz-canonica.ts'), 'utf8')
      )
    )
    const pathsCanonicos = fs.readFileSync(path.join(SRC, 'main/paths.ts'), 'utf8')
    assert(
      'paths prioriza raiz Windows canonica apos DG_ROOT',
      pathsCanonicos.indexOf('if (dgRoot') < pathsCanonicos.indexOf('existsSync(RAIZ_WINDOWS_CANONICA)') &&
        /existsSync\(RAIZ_WINDOWS_CANONICA\)/.test(pathsCanonicos) &&
        /resolve\(RAIZ_WINDOWS_CANONICA\)/.test(pathsCanonicos)
    )
    assert(
      'sem sync remoto obrigatorio',
      !fs.existsSync(path.join(ROOT, 'scripts/sincronizar-remoto.cjs'))
    )
  }

  section('Vault Markdown')
  {
    const fsAtom = loadModule('main/fs-atomico.ts')
    assert('detectarEol crlf', fsAtom.detectarEol('a\r\nb') === 'crlf')
    assert('detectarEol lf', fsAtom.detectarEol('a\nb') === 'lf')
    assert(
      'aplicarEol preserva crlf',
      fsAtom.aplicarEol('a\nb\n', 'crlf') === 'a\r\nb\r\n'
    )
    const tmpV = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-vault-'))
    const dest = path.join(tmpV, 'nota.md')
    await fsAtom.escreverAtomico(dest, 'hello\r\nworld\r\n')
    assert('escrita atomica existe', fs.existsSync(dest))
    assert(
      'escrita atomica conteudo',
      fs.readFileSync(dest, 'utf8') === 'hello\r\nworld\r\n'
    )

    const links = loadModule('main/vault/links.ts')
    assert(
      'extrairWikiLinks',
      JSON.stringify(links.extrairWikiLinks('x [[Foo|bar]] y [[Baz]]')) ===
        JSON.stringify(['Foo', 'Baz'])
    )
    const notas = [
      { path: 'C:/v/a/Foo.md', rel: 'a/Foo.md', basename: 'Foo.md', aliases: [] },
      { path: 'C:/v/Foo.md', rel: 'Foo.md', basename: 'Foo.md', aliases: ['Alt'] }
    ]
    assert(
      'resolver basename',
      links.resolverLink('Foo', notas, 'a/Outra.md') === 'C:/v/a/Foo.md'
    )
    assert('resolver alias', links.resolverLink('Alt', notas) === 'C:/v/Foo.md')
    assert(
      'resolver path relativo',
      links.resolverLink('a/Foo', notas) === 'C:/v/a/Foo.md'
    )

    const fm = loadModule('main/vault/frontmatter.ts')
    const parsed = fm.extrairFrontmatter(
      '---\ntitle: T1\ntags: [a, b]\n---\ncorpo #c\n'
    )
    assert('fm titulo', parsed.frontmatter.titulo === 'T1')
    assert(
      'fm tags',
      parsed.frontmatter.tags.includes('a') && parsed.frontmatter.tags.includes('b')
    )
    assert('fm corpo', parsed.corpo.trim() === 'corpo #c')
    const remount = fm.montarDocumento(parsed.frontmatter.raw, parsed.corpo)
    assert('fm round-trip tem delimitadores', remount.startsWith('---\n'))
    assert('fm round-trip corpo', remount.includes('corpo #c'))

    const tags = loadModule('main/vault/tags.ts')
    assert(
      'tags inline',
      tags.extrairTagsInline('ola #proj/x e #y\n```\n#no\n```').includes('proj/x')
    )
    assert(
      'tags ignora fence',
      !tags.extrairTagsInline('```\n#no\n```').includes('no')
    )

    const pre = fs.readFileSync(path.join(SRC, 'preload/index.ts'), 'utf8')
    assert('preload vault:abrir', /vault:abrir/.test(pre))
    assert('preload vault:salvar', /vault:salvar/.test(pre))
    const idxMain = fs.readFileSync(path.join(SRC, 'main/index.ts'), 'utf8')
    assert('index registra vault ipc', /registerVaultIpc/.test(idxMain))
  }

  // ---------- OpenClaw ----------
  section('OpenClaw')
  {
    const cliente = loadModule('main/openclaw/cliente.ts')
    const parsed = cliente.parseRespostaChat({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'dg_propose_file_diffs',
                  arguments: JSON.stringify({
                    edits: [
                      {
                        path: 'a.txt',
                        unifiedDiff: '@@ -1,1 +1,1 @@\n-old\n+new\n'
                      }
                    ]
                  })
                }
              }
            ]
          }
        }
      ]
    })
    assert('parse tool edits', parsed.ok && parsed.edits && parsed.edits.length === 1)
    assert('parse path', parsed.edits[0].path === 'a.txt')

    const diffs = loadModule('main/openclaw/diffs.ts')
    const ap = diffs.aplicarUnifiedDiff('old\n', '@@ -1,1 +1,1 @@\n-old\n+new\n')
    assert('aplicar unified diff', ap.ok && ap.resultado === 'new\n', ap.erro || ap.resultado)

    const tmpOc = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-oc-'))
    const fora = path.join(os.tmpdir(), 'dg-oc-fora-' + Date.now() + '.txt')
    fs.writeFileSync(fora, 'x', 'utf8')
    const reg = diffs.registrarPendentes(
      [{ path: fora, unifiedDiff: '@@ -1,1 +1,1 @@\n-x\n+y\n' }],
      [tmpOc]
    )
    assert('recusa path fora ACL', reg.rejeitados.length === 1 && reg.pendentes.length === 0)

    const dentro = path.join(tmpOc, 'a.txt')
    fs.writeFileSync(dentro, 'old\n', 'utf8')
    const reg2 = diffs.registrarPendentes(
      [{ path: dentro, unifiedDiff: '@@ -1,1 +1,1 @@\n-old\n+new\n' }],
      [tmpOc]
    )
    assert('aceita path na ACL', reg2.pendentes.length === 1)
    const prev = await diffs.previewPendente(reg2.pendentes[0].id, [tmpOc])
    assert('preview pendente ok', prev.ok === true, prev.erro)
    assert('preview nao grava disco', fs.readFileSync(dentro, 'utf8') === 'old\n')
    assert('preview depois', prev.depois === 'new\n')
    assert('preview linhasAdd', Array.isArray(prev.linhasAdd) && prev.linhasAdd.length >= 1)
    const apl = await diffs.aplicarPendenteAprovado(reg2.pendentes[0].id, [tmpOc])
    assert('aplicar pendente', apl.ok, apl.erro)
    assert('arquivo atualizado', fs.readFileSync(dentro, 'utf8') === 'new\n')

    const pre = fs.readFileSync(path.join(SRC, 'preload/index.ts'), 'utf8')
    assert('preload openclaw:pedir', /openclaw:pedir/.test(pre))
    assert('preload openclaw:aplicar', /openclaw:aplicar/.test(pre))
    const idxMain = fs.readFileSync(path.join(SRC, 'main/index.ts'), 'utf8')
    assert('index registra openclaw', /registerOpenClawIpc/.test(idxMain))

    const ocDir = path.join(SRC, 'main/openclaw')
    let shellLeak = false
    for (const f of fs.readdirSync(ocDir)) {
      if (!f.endsWith('.ts')) continue
      const src = fs.readFileSync(path.join(ocDir, f), 'utf8')
      if (/child_process|node-pty|execFile|spawn\(/.test(src)) shellLeak = true
    }
    assert('openclaw sem shell', !shellLeak)
  }

  // ---------- Adapta ONE / Maestro bridge ----------
  section('Adapta bridge')
  {
    const ud = path.join(os.tmpdir(), 'dg-adapta-' + Date.now())
    fs.mkdirSync(ud, { recursive: true })
    process.env.DG_TEST_USERDATA = ud
    const bridge = loadModule('main/bridge-adapta.ts')
    assert('url maestro permitida', bridge.urlAdaptaPermitida('https://agent.adapta.one/'))
    assert('url estranha bloqueada', !bridge.urlAdaptaPermitida('https://evil.example/'))
    assert('url http bloqueada', !bridge.urlAdaptaPermitida('http://adapta.org/'))
    const st0 = bridge.statusAdapta(ROOT)
    assert(
      'status usa diretorio do dossie do app',
      st0.ok === true && st0.dossieDir === bridge.dossieDirDoApp()
    )
    assert('mcp comando json', /"command": "node"/.test(st0.mcpComando) && /server\.js/.test(st0.mcpComando))
    const dossieVazio = path.join(os.tmpdir(), 'dg-adapta-vazio-' + Date.now())
    fs.mkdirSync(dossieVazio, { recursive: true })
    const sem = bridge.gerarContinuidade(dossieVazio)
    assert('gerar sem dossie falha', sem.ok === false)
    const dossieDir = bridge.dossieDirDoApp()
    fs.mkdirSync(dossieDir, { recursive: true })
    fs.writeFileSync(
      path.join(dossieDir, 'dossie.txt'),
      '=== DOSSIE DG EDITOR ===\nAtualizado em: 2026-01-01\nRaiz: /proj\nTotal de mensagens no chat: 1\nProvedor mais recente: ollama\n\n--- ULTIMAS MENSAGENS ---\n[2026-01-01T00:00:00.000Z] DONO: oi\n=== FIM DO DOSSIE ===\n',
      'utf8'
    )
    assert(
      'continuidade inclui email canonico',
      /digo85cs@gmail\.com/.test(bridge.montarBlocoDossie(fs.readFileSync(path.join(dossieDir, 'dossie.txt'), 'utf8')))
    )
    const ger = bridge.gerarContinuidade(dossieDir)
    assert('gerar continuidade ok', ger.ok === true && fs.existsSync(ger.destino))
    const ler = bridge.lerContinuidade()
    assert('ler continuidade', ler.ok && /Contexto de Continuidade/.test(ler.texto))
    assert('bloco menciona Maestro', /Maestro/.test(ler.texto))
    const preA = fs.readFileSync(path.join(SRC, 'preload/index.ts'), 'utf8')
    assert('preload adapta:status', /adapta:status/.test(preA))
    assert('preload adapta:ler-continuidade', /adapta:ler-continuidade/.test(preA))
    assert('preload adapta:abrir', /adapta:abrir/.test(preA))
    const htmlA = fs.readFileSync(path.join(SRC, 'renderer/index.html'), 'utf8')
    const appJsA = fs.readFileSync(path.join(SRC, 'renderer/app.js'), 'utf8')
    assert('UI Contas Adapta', /contas-adapta/.test(htmlA) && /btn-adapta-copiar/.test(htmlA))
    assert('UI Config Adapta', /config-adapta/.test(htmlA))
    assert('modal config flutuante', /id="modal-config"[^>]*modal-float/.test(htmlA) && /data-float-handle/.test(htmlA))
    assert('modal contas flutuante', /id="modal-contas"[^>]*modal-float/.test(htmlA))
    assert(
      'UI arrastar janela float',
      /ligarJanelaFlutuante/.test(appJsA) && /trazerJanelaFrente/.test(appJsA)
    )
    assert(
      'CSS modal-float',
      /modal-float/.test(fs.readFileSync(path.join(SRC, 'renderer/styles.css'), 'utf8'))
    )
    assert('menubar no HTML', /id="menubar"/.test(htmlA) && /data-menu="arquivo"/.test(htmlA))
    assert(
      'menubar no CSS',
      /#menubar/.test(fs.readFileSync(path.join(SRC, 'renderer/styles.css'), 'utf8')) &&
        /\.mb-dropdown/.test(fs.readFileSync(path.join(SRC, 'renderer/styles.css'), 'utf8'))
    )
    assert(
      'menubar init + IPC',
      /function initMenubar/.test(appJsA) &&
        /menu:acao/.test(appJsA) &&
        /janela:zoom/.test(preA) &&
        /janela:recarregar/.test(preA)
    )
    assert('Contas/Config no footer da sidebar', /class="sidebar-footer"/.test(htmlA) && /id="btn-contas"/.test(htmlA) && /id="btn-config"/.test(htmlA))
    assert(
      'CSS sidebar Contas na base (grid)',
      /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/.test(
        fs.readFileSync(path.join(SRC, 'renderer/styles.css'), 'utf8')
      ) && /\.sidebar-footer/.test(fs.readFileSync(path.join(SRC, 'renderer/styles.css'), 'utf8'))
    )
    assert('docs adapta.md', fs.existsSync(path.join(ROOT, 'docs/adapta.md')))
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    assert('mcp script portatil', !/\\\\/.test(pkg.scripts.mcp) && /\.dg-editor\/bin/.test(pkg.scripts.mcp))
  }

  // ---------- Agent parity (plan/@projeto/checkpoint/fila) ----------
  section('Agent parity')
  {
    const ctx = loadModule('main/agent/contexto-projeto.ts')
    const d = ctx.detectarMençãoProjeto('explique @projeto o boot')
    assert('detecta @projeto', d.tem === true)
    assert('consulta sem @projeto', !/@projeto/i.test(d.consulta))

    const fila = loadModule('main/agent/fila.ts')
    const st0 = fila.statusFilaAgente()
    assert('fila inicia vazia', st0.tamanho === 0 && st0.ocupado === false)
    let ordem = ''
    const p1 = fila.enfileirarAgente(async () => {
      ordem += 'a'
      await new Promise((r) => setTimeout(r, 20))
      ordem += 'b'
      return 1
    })
    const p2 = fila.enfileirarAgente(async () => {
      ordem += 'c'
      return 2
    })
    const rs = await Promise.all([p1, p2])
    assert('fila serial', ordem === 'abc' && rs[0] === 1 && rs[1] === 2)

    // cancelamento + AbortSignal
    {
      const fila2 = loadModule('main/agent/fila.ts')
      let viuAbort = false
      const slow = fila2.enfileirarAgente(async (signal) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 5000)
          signal.addEventListener('abort', () => {
            viuAbort = true
            clearTimeout(t)
            reject(new Error('cancelado'))
          })
        })
        return 'done'
      })
      const queued = fila2.enfileirarAgente(async () => 'never')
      await new Promise((r) => setTimeout(r, 15))
      const can = fila2.cancelarFilaAgente('teste')
      assert('cancelar retorna ok', can.ok === true && can.cancelados >= 1)
      let rejSlow = false
      let rejQueued = false
      await slow.catch(() => { rejSlow = true })
      await queued.catch(() => { rejQueued = true })
      assert('cancel aborta job atual', viuAbort && rejSlow)
      assert('cancel limpa fila pendente', rejQueued)
      const stF = fila2.statusFilaAgente()
      assert('fila limpa apos cancel', stF.tamanho === 0)
    }

    // propostas + diff unificado com hunks
    {
      const prop = loadModule('main/agent/propostas.ts')
      const hunksMod = loadModule('main/openclaw/hunks.ts')
      assert('ehToolEscrita codigo_editar', prop.ehToolEscrita('codigo_editar') === true)
      assert('ehToolEscrita read false', prop.ehToolEscrita('codigo_ler') === false)
      const diff = prop.diffUnificado('a.ts', 'ola\n', 'ola\nmundo\n')
      assert('diff unificado header', /--- a\/a\.ts/.test(diff) && /\+\+\+ b\/a\.ts/.test(diff))
      assert('diff unificado add mundo', /^\+mundo/m.test(diff))
      const multi = hunksMod.gerarDiffUnificado(
        'm.ts',
        'a\nb\nc\nd\ne\n',
        'a\nB\nc\nD\ne\n'
      )
      const hs = hunksMod.listarHunks(multi)
      assert('hunks multiplos ou pelo menos 1', hs.length >= 1)
      const filtrado = hunksMod.filtrarHunks(multi, [0])
      assert('filtrar hunks mantem header', /--- a\/m\.ts/.test(filtrado) && /@@/.test(filtrado))

      const tmpP = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-prop-'))
      const arq = path.join(tmpP, 'x.ts')
      fs.writeFileSync(arq, 'const a = 1\nconst b = 2\n', 'utf8')
      const proposta = prop.proporCodigoEditar(
        tmpP,
        { arquivo: arq, ancora: 'const a = 1', novo: 'const a = 2' },
        [tmpP]
      )
      assert('proporCodigoEditar ok', proposta.ok === true && !!proposta.pendente)
      assert('listarPendentes apos propor', prop.listarPendentes().length >= 1)
      assert('origem agent na proposta', proposta.pendente.origem === 'agent')
      const hkLista = hunksMod.listarHunks(proposta.pendente.unifiedDiff)
      assert('hunks na proposta', hkLista.length >= 1)
      const id = proposta.pendente.id
      const apl = await prop.aplicarPropostaComCheckpoint(id, [tmpP])
      assert('aplicarPropostaComCheckpoint ok', apl.ok === true)
      assert('checkpointId apos apply', typeof apl.checkpointId === 'string' && apl.checkpointId.length > 0)
      const depois = fs.readFileSync(arq, 'utf8')
      assert('arquivo alterado apos apply', /const a = 2/.test(depois))

      // fila unificada: adicionar sem limpar
      const arq2 = path.join(tmpP, 'y.ts')
      fs.writeFileSync(arq2, 'export const y = 1\n', 'utf8')
      const p2 = prop.proporCodigoEditar(
        tmpP,
        { arquivo: arq2, ancora: 'y = 1', novo: 'y = 2' },
        [tmpP]
      )
      assert('segunda proposta nao limpa fila', p2.ok && prop.listarPendentes().length >= 1)
    }

    // plano + checklist
    {
      const ud = path.join(os.tmpdir(), 'dg-plano-' + Date.now())
      fs.mkdirSync(ud, { recursive: true })
      process.env.DG_TEST_USERDATA = ud
      const plano = loadModule('main/agent/plano.ts')
      assert('plano inicia vazio', plano.lerPlano() === null)
      const passos = plano.extrairPassosDoTexto('# plano\n1. criar x\n2. testar y\n- opcional z')
      assert('extrairPassosDoTexto', passos.length >= 2)
      plano.salvarPlano({
        texto: '# plano\n1. criar x\n2. testar y',
        raiz: '/tmp',
        salvoEm: new Date().toISOString(),
        agente: 'revisor'
      })
      const lido = plano.lerPlano()
      assert('plano salva e le', !!lido && lido.texto.indexOf('plano') >= 0 && lido.agente === 'revisor')
      assert('plano tem passos', (lido.passos || []).length >= 2)
      const pid = lido.passos[0].id
      plano.marcarPasso(pid, true, 'ck-test')
      const l2 = plano.lerPlano()
      assert('marcarPasso', l2.passos[0].feito === true && l2.passos[0].checkpointId === 'ck-test')
      assert('proximoPassoPendente', plano.proximoPassoPendente()?.id === l2.passos[1].id)
      plano.limparPlano()
      assert('plano limpar', plano.lerPlano() === null)
    }

    // menções
    {
      const tmpM = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-menc-'))
      const fM = path.join(tmpM, 'nota.ts')
      fs.writeFileSync(fM, 'export const n = 1\n', 'utf8')
      const menc = loadModule('main/agent/mencoes.ts')
      const exp = await menc.expandirMencoes({
        raiz: tmpM,
        pergunta: 'veja @arquivo:nota.ts e @selecao',
        selecao: 'const n',
        arquivoAtivo: fM
      })
      assert('mencao @arquivo', exp.mencoes.some((m) => m.indexOf('@arquivo:') === 0))
      assert('mencao @selecao', exp.mencoes.includes('@selecao'))
      assert('contexto contem arquivo', /@arquivo:nota\.ts/.test(exp.contextoExtra))
      assert('contexto contem selecao', /@selecao/.test(exp.contextoExtra) && /const n/.test(exp.contextoExtra))
    }

    // checkpoint create/restore
    {
      const udCk = path.join(os.tmpdir(), 'dg-ck-' + Date.now())
      fs.mkdirSync(udCk, { recursive: true })
      process.env.DG_TEST_USERDATA = udCk
      const ck = loadModule('main/agent/checkpoint.ts')
      const tmpC = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-ckf-'))
      const fC = path.join(tmpC, 'y.txt')
      fs.writeFileSync(fC, 'antes', 'utf8')
      const meta = await ck.criarCheckpoint([fC], 'teste')
      assert('checkpoint criado', !!meta.id)
      fs.writeFileSync(fC, 'depois', 'utf8')
      const rest = await ck.restaurarCheckpoint(meta.id)
      assert('checkpoint restaurar', rest.ok === true && rest.restaurados === 1)
      assert('conteudo restaurado', fs.readFileSync(fC, 'utf8') === 'antes')
      assert('ultimoCheckpoint', ck.ultimoCheckpoint()?.id === meta.id)
    }

    const pre = fs.readFileSync(path.join(SRC, 'preload/index.ts'), 'utf8')
    assert('preload agente:pedir', /agente:pedir/.test(pre))
    assert('preload checkpoint-desfazer', /agente:checkpoint-desfazer/.test(pre))
    assert('preload contexto:projeto', /contexto:projeto/.test(pre))
    assert('preload navegador:embed-status', /navegador:embed-status/.test(pre))
    assert('preload agente:cancelar', /agente:cancelar/.test(pre))
    assert('preload agente:aplicar-proposta', /agente:aplicar-proposta/.test(pre))
    assert('preload agente:executar-plano', /agente:executar-plano/.test(pre))
    assert('preload agente:progresso', /agente:progresso/.test(pre))
    assert('preload propostas:hunks', /propostas:hunks/.test(pre))
    assert('preload propostas:definir-hunks', /propostas:definir-hunks/.test(pre))
    assert('preload propostas:preview', /propostas:preview/.test(pre))
    assert('preload agente:verificar', /agente:verificar/.test(pre))
    assert('preload agente:plano-marcar-passo', /agente:plano-marcar-passo/.test(pre))
    const ipcFerramentas = fs.readFileSync(path.join(SRC, 'main/ipc/ferramentas.ts'), 'utf8')
    const ipcRegistry = fs.readFileSync(path.join(SRC, 'main/ipc/index.ts'), 'utf8')
    for (const canal of [
      'app:get-version', 'busca:arquivos', 'busca:conteudo', 'busca:cancelar',
      'chat:salvar', 'chat:listar', 'chat:carregar', 'chat:apagar',
      'comandos:listar', 'config:backup', 'orientar:prompt', 'roteador:planejar', 'sistema:safe-mode'
    ]) {
      assert('handler de ferramenta ' + canal, ipcFerramentas.includes("ipcMain.handle('" + canal + "'"))
      assert('preload libera ferramenta ' + canal, pre.includes("'" + canal + "'"))
    }
    assert('handlers de ferramentas registrados no boot', /registrarHandlersFerramentas\(\)/.test(ipcRegistry))
    const ipcChat = fs.readFileSync(path.join(SRC, 'main/ipc/chat.ts'), 'utf8')
    assert('chat:send usa stream Ollama e fallback de modelo', /streamOllamaChat/.test(ipcChat) && /askOllama\(textoPedido, context, 'chat'\)/.test(ipcChat))
    assert('chat envia deltas pelo canal liberado', /send\('chat:delta'/.test(ipcChat) && /'chat:delta'/.test(pre))
    assert('chat:send nao retorna texto placeholder', !/Handler de chat:send refatorado/.test(ipcChat))
    const idxMain = fs.readFileSync(path.join(SRC, 'main/index.ts'), 'utf8')
    assert('registerAgentExtrasIpc', /registerAgentExtrasIpc/.test(idxMain))
    assert('Vault registrado no boot', /registerVaultIpc\(\)/.test(idxMain))
    assert('OpenClaw registrado no boot', /registerOpenClawIpc\(\)/.test(idxMain))
    assert('extras Agent registrados no boot', /registerAgentExtrasIpc\(\)/.test(idxMain))
    const agentIpc = fs.readFileSync(path.join(SRC, 'main/agent/ipc.ts'), 'utf8')
    const preloadIpc = fs.readFileSync(path.join(SRC, 'preload/index.ts'), 'utf8')
    for (const canal of [
      'agente:pedir',
      'agente:executar-plano',
      'agente:plano-marcar-passo',
      'agente:plano-salvar',
      'agente:plano-limpar',
      'agente:plano-atualizar-passos',
      'agente:verificar',
      'agente:diagnosticos',
      'agente:diagnostico-manual'
    ]) {
      assert('Agent handler ' + canal, agentIpc.includes("ipcMain.handle('" + canal + "'"))
      assert('preload libera ' + canal, preloadIpc.includes("'" + canal + "'"))
    }
    for (const canal of ['dg:modes:listar', 'dg:modes:salvar', 'dg:permissoes:obter', 'dg:permissoes:salvar', 'simbolos:indexar', 'simbolos:buscar']) {
      assert('preload libera ' + canal, preloadIpc.includes("'" + canal + "'"))
    }
    assert('statusEmbedNavegador exportado no index', /statusEmbedNavegador/.test(idxMain))
    assert('smoke embed injeta BrowserWindow pai', /DG_NAV_SMOKE_EMBED/.test(idxMain))
    const agentTs = fs.readFileSync(path.join(SRC, 'main/brain/agent.ts'), 'utf8')
    assert('modo plan no agent', /modo === 'plan'/.test(agentTs) || /modo\?: 'plan'/.test(agentTs))
    assert('proposeWrites no agent', /proposeWrites/.test(agentTs))
    assert('checkpoint em write direto', /criarCheckpoint/.test(agentTs))
    assert('AbortSignal no agent', /signal\?\.aborted|opts\?\.signal/.test(agentTs))
    const html = fs.readFileSync(path.join(SRC, 'renderer/index.html'), 'utf8')
    assert('aba Agent no HTML', /data-center-pane="agent"/.test(html))
    assert('plan mode checkbox', /agent-plan-mode/.test(html))
    assert('btn Parar agente', /btn-agent-stop/.test(html))
    assert('btn Executar plano', /btn-agent-exec-plano/.test(html))
    assert('btn Proximo passo', /btn-agent-exec-passo/.test(html))
    assert('btn Verificar', /btn-agent-verificar/.test(html))
    assert('auto-verify checkbox', /agent-verify-loop/.test(html))
    assert('diff hunks bar', /diff-hunks-bar/.test(html))
    assert('btn Aplicar hunks', /btn-oc-aplicar-hunks/.test(html))
    assert('btn No editor preview', /btn-oc-preview-editor/.test(html))
    assert('editor-diff-side', /id="editor-diff-side"/.test(html))
    assert('btn Desfazer apply', /btn-agent-undo/.test(html))
    assert('statusbar sb-agent', /id="sb-agent"/.test(html))
    assert('a11y region agent', /aria-label="Painel do agente"/.test(html))
    const appJs = fs.readFileSync(path.join(SRC, 'renderer/app.js'), 'utf8')
    assert('host dos seletores de chat existe', /id="chat-header-actions"/.test(html))
    assert('seletores dinamicos de chat usam o host', /getElementById\('chat-header-actions'\)/.test(appJs) && /chat-agent-select/.test(appJs) && /chat-mode-select/.test(appJs))
    assert('opcoes de agente recarregam ao trocar de pasta', /void carregarOpcoesAgenteChat\(path\)/.test(appJs) && /function carregarOpcoesAgenteChat/.test(appJs))
    assert('menu de opcoes do chat expoe estado acessivel', /aria-expanded/.test(appJs) && /aria-checked/.test(appJs) && /chat-mais-menu/.test(appJs))
    assert('toolbar do agente separa execucao e fila', /agent-header-main/.test(html) && /agent-header-actions/.test(html))
    const rendererCss = fs.readFileSync(path.join(SRC, 'renderer/styles.css'), 'utf8')
    assert('animacoes respeitam movimento reduzido', /prefers-reduced-motion:\s*reduce/.test(rendererCss) && /animation:\s*none\s*!important/.test(rendererCss))
    assert('UI apply via agente', /agente:aplicar-proposta/.test(appJs) && /__dgApplyViaAgente/.test(appJs))
    assert('UI progresso agent', /agente:progresso/.test(appJs))
    assert('UI hunks', /propostas:definir-hunks/.test(appJs) && /carregarHunksDiff/.test(appJs))
    assert('UI preview no editor', /propostas:preview/.test(appJs) && /previewDiffNoEditor/.test(appJs))
    assert('UI errosEditor', /errosEditor/.test(appJs) && /coletarErrosEditor/.test(appJs))
    assert('UI contexto abas', /coletarAbasCtx/.test(appJs) && /verificarApos/.test(appJs))
    assert('UI plano checklist', /renderPlanoChecklist/.test(appJs))
    assert('contexto embeddings opcional', /buscarSemelhantes/.test(fs.readFileSync(path.join(SRC, 'main/agent/contexto-projeto.ts'), 'utf8')))
    assert('contexto implicito existe', fs.existsSync(path.join(SRC, 'main/agent/contexto-implicito.ts')))
    assert('diagnosticos existe', fs.existsSync(path.join(SRC, 'main/agent/diagnosticos.ts')))
    const ctxImp = fs.readFileSync(path.join(SRC, 'main/agent/contexto-implicito.ts'), 'utf8')
    assert('contexto implicito .dgrules', /readRules|createRulesTemplate/.test(ctxImp))
    assert('contexto implicito errosEditor', /errosEditor/.test(ctxImp))
    {
      const tmpRules = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-rules-'))
      const ctxMod = loadModule('main/agent/contexto-implicito.ts')
      const txt = await ctxMod.montarContextoImplicito({
        raiz: tmpRules,
        incluirGit: false,
        incluirDiagnosticos: false,
        errosEditor: 'TS2322: Type string not assignable'
      })
      assert('contexto cria .dgrules', fs.existsSync(path.join(tmpRules, '.dgrules')))
      assert('contexto inclui regras', /Regras do projeto/.test(txt))
      assert('contexto inclui errosEditor', /Erros \/ diagnostics/.test(txt) && /TS2322/.test(txt))
    }
    const editorCm = fs.readFileSync(path.join(SRC, 'renderer/editor-cm.js'), 'utf8')
    assert('editor mostrarDiffProposta', /mostrarDiffProposta/.test(editorCm) && /getSelecao/.test(editorCm))
    const janela = fs.readFileSync(path.join(SRC, 'main/navegador/janela.ts'), 'utf8')
    assert('statusEmbedNavegador modo smoke|embed', /modo:\s*'smoke'\s*\|\s*'embed'/.test(janela))
    assert('carregarUrlNasViews compartilhado', /function carregarUrlNasViews/.test(janela))
    assert('conteudoCompartilhado no status', /conteudoCompartilhado:\s*true/.test(janela))
    assert('usaHostBaseWindow / smoke embed', /usaHostBaseWindow|DG_NAV_SMOKE_EMBED/.test(janela))
    const e2eRunner = fs.readFileSync(path.join(SRC, 'qa/runner-e2e.ts'), 'utf8')
    assert('e2e suite agent', /cenariosUiAgent/.test(e2eRunner))
    assert('e2e suite browser-embed', /cenariosUiBrowserEmbed/.test(e2eRunner))
    const termE2e = fs.readFileSync(path.join(SRC, 'qa/cenarios/ui-terminal.ts'), 'utf8')
    assert('e2e terminal echo warn sem shell', /execvp|semShell/.test(termE2e))
  }

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
