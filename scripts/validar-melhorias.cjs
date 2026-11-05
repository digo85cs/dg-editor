'use strict'
/**
 * Valida roteamento, aprovacao, anexos e gravacao de .dgrules
 * sem subir o Electron e sem carregar modelo na RAM.
 */
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
const falhas = []

function assert(nome, cond) {
  if (!cond) {
    falhas.push(nome)
    console.log('FALHA  ' + nome)
  } else {
    console.log('OK     ' + nome)
  }
}

async function testesLogica() {
  const outfile = path.join(os.tmpdir(), 'dg-validar-melhorias.cjs')
  await esbuild.build({
    absWorkingDir: ROOT,
    stdin: {
      contents: `
        import { resolverRotaChat, decidirAutoAprovacao, detectarIntencao } from './src/main/agent-router.ts'
        import { blocoAnexos, textoDeAnexo } from './src/main/anexos-chat.ts'
        import { writeRules, readRules } from './src/main/dgrules.ts'
        import { checarIntegracaoFerramentas } from './src/main/auditoria-integracao.ts'
        import { proporMemoria, decidirMemoria, textoMemoriasAceitas, listarMemorias } from './src/main/memorias.ts'
        import { regrasParaContexto } from './src/main/regras-escopo.ts'
        import { mapaCompacto } from './src/main/mapa-projeto.ts'
        import fs from 'fs'
        import os from 'os'
        import path from 'path'
        const out = []
        const ok = (n, c) => out.push({ n, c: !!c })
        const chat = resolverRotaChat('auto', 'bom dia')
        ok('auto geral e chat', chat.kind === 'chat' && chat.tarefa === 'chat')
        const cod = resolverRotaChat('auto', 'implementar o botao de salvar')
        ok('auto codigo e free-coder', cod.kind === 'agente' && cod.agente === 'free-coder' && cod.tarefa === 'codigo')
        const man = resolverRotaChat('free-reviewer', 'oi')
        ok('agente manual permanece', man.kind === 'agente' && man.agente === 'free-reviewer')
        ok('intencao codigo', detectarIntencao('corrigir bug') === 'codigo')
        ok('auto baixo', decidirAutoAprovacao('baixo', 'somente_leitura', 1).ok === true)
        ok('auto edicao curta', decidirAutoAprovacao('medio', 'edicao_localizada', 1).ok === true)
        ok('auto alto bloqueia', decidirAutoAprovacao('alto', 'terminal_com_confirmacao', 1).ok === false)
        ok('auto amplo bloqueia', decidirAutoAprovacao('baixo', 'edicao_localizada', 5).ok === false)
        ok('auto terminal bloqueia', decidirAutoAprovacao('medio', 'terminal_com_confirmacao', 1).ok === false)
        const b64 = Buffer.from('linha um\\nlinha dois', 'utf8').toString('base64')
        const txt = textoDeAnexo('nota.md', b64)
        ok('anexo texto', txt.binario === false && txt.texto.includes('linha um'))
        const png = textoDeAnexo('foto.png', Buffer.from([0, 1, 2, 3]).toString('base64'))
        ok('anexo binario nao entra', png.binario === true && !png.texto.includes('linha'))
        const bloco = blocoAnexos([{ nome: 'nota.md', data: b64 }])
        ok('bloco de anexo', bloco.includes('nota.md') && bloco.includes('linha dois'))
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-rules-'))
        const wr = writeRules(dir, '# teste\\n- regra')
        ok('writeRules', wr.ok === true && readRules(dir).includes('regra'))
        fs.rmSync(dir, { recursive: true, force: true })
        const achados = checarIntegracaoFerramentas(process.cwd())
        const erros = achados.filter((a) => a.severidade === 'erro')
        ok('integracao sem erro', erros.length === 0)
        if (erros.length) ok(erros.map((e) => e.id + ' ' + (e.detalhe || '')).join(' || '), false)
        const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-mem-'))
        const prop = proporMemoria(dirM, 'o botao salvar fica no canto')
        ok('memoria pendente fora do prompt', prop.ok === true && textoMemoriasAceitas(dirM) === '')
        decidirMemoria(dirM, prop.id || '', true)
        ok('memoria aceita entra', textoMemoriasAceitas(dirM).includes('salvar'))
        decidirMemoria(dirM, prop.id || '', false)
        ok('memoria apagada', listarMemorias(dirM).length === 0)
        fs.rmSync(dirM, { recursive: true, force: true })
        const regras = regrasParaContexto(process.cwd(), ['src/main/index.ts'], 'oi', 4000)
        ok('regras do dgrules', regras.includes('.dgrules'))
        ok('regra por glob typescript', regras.includes('REGRA typescript'))
        const semArquivo = regrasParaContexto(process.cwd(), [], 'oi', 4000)
        ok('glob nao entra sem arquivo', !semArquivo.includes('REGRA typescript'))
        const mapa = mapaCompacto(process.cwd(), 2200)
        ok('mapa compacto', mapa.length > 20 && mapa.length <= 2200 && !mapa.includes('function executar'))
        process.stdout.write(JSON.stringify(out))
      `,
      resolveDir: ROOT,
      sourcefile: 'validar-entry.ts',
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  const { execFileSync } = require('child_process')
  const raw = execFileSync(process.execPath, [outfile], { encoding: 'utf8' })
  fs.rmSync(outfile, { force: true })
  const rows = JSON.parse(raw)
  for (const r of rows) assert(r.n, r.c)
}

function auditarDisco() {
  const agentesDir = path.join(ROOT, '.dg-editor', 'agentes')
  const skillsDir = path.join(ROOT, '.dg-editor', 'skills')
  const agentes = fs.existsSync(agentesDir)
    ? fs.readdirSync(agentesDir).filter((f) => f.endsWith('.md'))
    : []
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'))
    : []
  assert('agentes no disco', agentes.length > 0)
  assert('free-coder presente', agentes.includes('free-coder.md'))
  assert('skills no disco', skills.length > 0)
  const coder = fs.readFileSync(path.join(agentesDir, 'free-coder.md'), 'utf8')
  const citados = (coder.match(/skills:\s*(.+)/i) || ['', ''])[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const id of citados) {
    assert('skill do free-coder: ' + id, skills.includes(id + '.md'))
  }
  const mcp = path.join(ROOT, '.dg-editor', 'bin', 'main', 'mcp', 'server.js')
  assert('MCP compilado', fs.existsSync(mcp))
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, '.dg-editor', 'modelos.default.json'), 'utf8'))
  assert('chat aponta modelo pequeno', cat.modelosPorTarefa.chat === 'qwen2.5-coder:3b')
  assert('codigo aponta 7b', cat.modelosPorTarefa.codigo === 'qwen2.5-coder:7b')
  const reg = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'registry.ts'), 'utf8')
  const chatFila = (reg.match(/if\s*\(\s*t\s*===\s*['"]chat['"]\s*\)\s*\{[\s\S]*?return\s*\[[\s\S]*?\]/) || [''])[0]
  assert(
    'fila chat 3b antes de 14b',
    chatFila.includes('qwen2.5-coder:3b') && chatFila.indexOf('qwen2.5-coder:3b') < chatFila.indexOf('qwen2.5-coder:14b')
  )
  const idx = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf8')
  assert('chat usa fila serial', idx.includes('enfileirarAgente'))
  assert('chat usa roteador', idx.includes('resolverRotaChat'))
  assert('chat decide auto-aprovacao', idx.includes('decidirAutoAprovacao'))
  assert('chat injeta anexos', idx.includes('blocoAnexos'))
  assert('IPC grava regras', idx.includes("ipcMain.handle('rules:write'"))
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'index.ts'), 'utf8')
  assert('preload libera rules:write', preload.includes("'rules:write'"))
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8')
  for (const nome of ['Automações', 'Artefatos', 'Skills', 'Conectores', 'Memória']) {
    assert('botao ' + nome, html.includes('>' + nome + '<'))
  }
  const ferr = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'ferramentas-ui.js'), 'utf8')
  const canais = [...ferr.matchAll(/seguro\('([^']+)'/g)].map((m) => m[1])
  assert('ferramentas chamam canais reais', canais.length >= 8)
  for (const canal of canais) {
    assert('preload libera ' + canal, preload.includes("'" + canal + "'"))
  }
  assert('skills:listar no main', idx.includes("ipcMain.handle('skills:listar'"))
  assert('plano-ler no agente', fs.readFileSync(path.join(ROOT, 'src', 'main', 'agent', 'ipc.ts'), 'utf8').includes("ipcMain.handle('agente:plano-ler'"))
  assert('preload libera editor:completar', preload.includes("'editor:completar'"))
  assert('fila espera o guardiao', fs.readFileSync(path.join(ROOT, 'src', 'main', 'agent', 'fila.ts'), 'utf8').includes('aguardarRecursos'))
  assert('agente emite texto-delta', fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'agent.ts'), 'utf8').includes("tipo: 'texto-delta'"))
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'regras-ui.js'), 'utf8')
  assert('UI salva via rules:write', ui.includes("invoke('rules:write'"))
  const ollama = fs.readFileSync(path.join(ROOT, 'src', 'main', 'brain', 'ollama.ts'), 'utf8')
  assert('chat nao sobe 7b/14b', ollama.includes('modelo grande bloqueado nesta tarefa'))
  console.log('AGENTES ' + agentes.length + ': ' + agentes.map((a) => a.replace(/\.md$/, '')).join(', '))
  console.log('SKILLS  ' + skills.length + ': ' + skills.map((a) => a.replace(/\.md$/, '')).join(', '))
  const idsSkills = new Set(skills.map((s) => s.replace(/\.md$/, '')))
  for (const arq of agentes) {
    const corpo = fs.readFileSync(path.join(agentesDir, arq), 'utf8')
    const linha = (corpo.match(/skills:\s*(.+)/i) || ['', ''])[1]
    for (const id of linha.split(',').map((s) => s.trim()).filter(Boolean)) {
      assert('agente ' + arq.replace(/\.md$/, '') + ' -> skill ' + id, idsSkills.has(id))
    }
  }
  const mcpSrc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'mcp', 'server.ts'), 'utf8')
  const tools = []
  const reTool = /name:\s*'([^']+)'/g
  let m
  while ((m = reTool.exec(mcpSrc))) tools.push(m[1])
  assert('MCP tem tools', tools.length >= 8)
  console.log('MCP TOOLS ' + tools.length + ': ' + tools.join(', '))
  const fila = fs.readFileSync(path.join(ROOT, 'src', 'main', 'agent', 'fila.ts'), 'utf8')
  assert('fila serial sem paralelismo', fila.includes('if (rodando) return') && fila.includes('while (fila.length)'))
}

function ollamaTags() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 4000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(body)
          const nomes = (j.models || []).map((m) => m.name)
          console.log('OLLAMA  ' + (nomes.length ? nomes.join(', ') : 'sem modelos'))
          assert('ollama respondeu /api/tags', res.statusCode === 200)
          assert('modelo de chat 3b instalado', nomes.some((n) => n.startsWith('qwen2.5-coder:3b')))
          assert('modelo de codigo 7b instalado', nomes.some((n) => n.startsWith('qwen2.5-coder:7b')))
        } catch (e) {
          assert('ollama json', false)
          console.log('OLLAMA  resposta invalida')
        }
        resolve()
      })
    })
    req.on('error', () => {
      assert('ollama no ar', false)
      console.log('OLLAMA  indisponivel em 127.0.0.1:11434')
      resolve()
    })
    req.on('timeout', () => {
      req.destroy()
      assert('ollama no ar', false)
      resolve()
    })
  })
}

async function main() {
  console.log('--- logica ---')
  await testesLogica()
  console.log('--- disco e integracao ---')
  auditarDisco()
  console.log('--- ollama (so lista, nao carrega modelo) ---')
  await ollamaTags()
  console.log('')
  if (falhas.length) {
    console.log('FALHAS ' + falhas.length + ': ' + falhas.join(' | '))
    process.exit(1)
  }
  console.log('VALIDACAO OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
