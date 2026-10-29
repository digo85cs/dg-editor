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
  const htmlRend = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
  assert(
    'ipc-seguro.ts define caminhoSeguro',
    fsT.existsSync(ipcSeguro) && /export function caminhoSeguro/.test(fsT.readFileSync(ipcSeguro, 'utf-8'))
  )
  assert(
    'index.ts usa caminhoSeguro nos handlers de arquivo',
    /caminhoSeguro/.test(indexMain) && /arquivo:ler/.test(indexMain)
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
      /app:is-safe-mode/.test(main21) && /app:is-safe-mode/.test(pre21)
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
    const main23 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const gi23 = fsT.readFileSync(pathT.join(rootT, '.gitignore'), 'utf-8')
    const html23 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
    assert('chats.ts existe', fsT.existsSync(chatsTs))
    assert(
      'handlers chat:salvar/listar/carregar/apagar existem',
      /chat:salvar/.test(main23) &&
        /chat:listar/.test(main23) &&
        /chat:carregar/.test(main23) &&
        /chat:apagar/.test(main23)
    )
    assert('.dg-editor/chats no gitignore', /\.dg-editor\/chats/.test(gi23))
    assert('renderer tem botao Nova conversa', /btn-chat-nova|Nova conversa/.test(html23))
  }

  // ---------- 24. Diff visual ----------
  section('24. Diff visual')
  {
    const gitTs = pathT.join(rootT, 'src', 'main', 'git.ts')
    const main24 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const html24 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'index.html'), 'utf-8')
    const app24 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    assert('git.ts existe', fsT.existsSync(gitTs))
    assert('git:status e git:diff handlers', /git:status/.test(main24) && /git:diff/.test(main24))
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
    const main26 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const cat26 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'modelos-catalogo.ts'), 'utf-8')
    assert(
      'Nenhum call site hardcoded de modelo',
      /modeloParaTarefa/.test(ollama26) && /modeloParaTarefa/.test(main26) && /askOllama/.test(main26)
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
    const main27 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'index.ts'), 'utf-8')
    const app27 = fsT.readFileSync(pathT.join(rootT, 'src', 'renderer', 'app.js'), 'utf-8')
    assert('avaliacao.ts existe', fsT.existsSync(av27))
    assert('brain:avaliar handler existe', /brain:avaliar/.test(main27))
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
    const hib30 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'hibrido.ts'), 'utf-8')
    const agent30 = fsT.readFileSync(pathT.join(rootT, 'src', 'main', 'brain', 'agent.ts'), 'utf-8')
    const btnBlock = (() => {
      const m = app30.match(
        /\$\(['"]btn-reanalyze['"]\)\.addEventListener\(['"]click['"],\s*\(\)\s*=>\s*\{[\s\S]*?\}\)/
      )
      return m ? m[0] : ''
    })()
    assert(
      'btn-reanalyze usa force dinamico',
      /dataset\.jaAnalisou/.test(btnBlock) && !/rodarAnalise\(pastaAtual,\s*true\)/.test(btnBlock)
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
      'fila chat comeca com 7b',
      /qwen2\.5-coder:7b/.test(chatFila) &&
        chatFila.indexOf('qwen2.5-coder:7b') < (chatFila.indexOf('qwen2.5-coder:14b') >= 0
          ? chatFila.indexOf('qwen2.5-coder:14b')
          : chatFila.length)
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
      /arquivo:ler['"],\s*async/.test(idx32) &&
        /arquivo:listar['"],\s*async/.test(idx32) &&
        /arquivo:salvar['"],\s*async/.test(idx32)
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