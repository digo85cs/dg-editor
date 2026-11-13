#!/usr/bin/env node
/* Gera DOSSIE.md com o estado completo do sistema. Roda no postbuild e via `npm run dossie`. */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')
const { execSync } = require('child_process')

const RAIZ = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'))

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function ler(rel) {
  const p = join(RAIZ, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

function unicos(texto, regex) {
  return [...new Set([...texto.matchAll(regex)].map((m) => m[1]))].sort()
}

function listarArquivos(dir, profundidade = 1) {
  const base = join(RAIZ, dir)
  if (!existsSync(base)) return []
  const saida = []
  for (const nome of readdirSync(base)) {
    const abs = join(base, nome)
    const rel = relative(RAIZ, abs).replace(/\\/g, '/')
    if (statSync(abs).isDirectory()) {
      if (profundidade > 1) for (const sub of listarArquivos(rel, profundidade - 1)) saida.push(sub)
    } else if (/\.(ts|js|tsx|jsx|json|md|cjs|mjs)$/.test(nome)) {
      saida.push(rel)
    }
  }
  return saida.sort()
}

const branch = sh('git rev-parse --abbrev-ref HEAD') || 'desconhecida'
const commit = sh('git log -1 --pretty=format:"%h %ad %s" --date=short')
const log = sh('git log -10 --pretty=format:"- %h %ad %s" --date=short')
const sujo = sh('git status --porcelain').split('\n').filter(Boolean).length

const ipcMain = ler('src/main/ipc-main.ts')
const canais = unicos(
  listarArquivos('src/main', 3)
    .filter((f) => f.endsWith('.ts') && !f.includes('__tests__'))
    .map((f) => ler(f))
    .join('\n'),
  /ipcMain\.handle\(\s*'([^']+)'/g
)

const preload = ler('src/preload/index.ts')
const canaisExpostos = unicos(preload, /'([a-z0-9-]+:[a-z0-9-]+)'/gi)

const mcp = ler('src/main/mcp/server.ts')
const ferramentasMcp = unicos(mcp, /name:\s*'([a-z0-9_]+)'/g)

const skillsTxt = ler('src/main/brain/skills.ts')
const skills = [...skillsTxt.matchAll(/^\s{6}nome:\s*'([^']+)'/gm)].map((m) => m[1])
const agentesTxt = ler('src/main/brain/agentes.ts')
const agentes = [...agentesTxt.matchAll(/^nome:\s*(.+)$/gm)].map((m) => m[1].trim())

const arqsMidia = listarArquivos('src/main/midia', 2)
const canaisMidia = canais.filter((c) => c.startsWith('midia:'))

const cenarios = listarArquivos('src/qa/cenarios', 1)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ arquivo: f, texto: ler(f) }))
const idsQa = cenarios.flatMap(({ texto }) => [...texto.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]))

const scripts = Object.entries(pkg.scripts || {}).sort(([a], [b]) => a.localeCompare(b))

const catalogo = ler('src/main/midia/musicas-livres.ts')
const estilos = [...catalogo.matchAll(/id:\s*'(alegre|epica|tensa|calma|misterio|infantil|jazz|eletronica|triste|corporativo)'/g)].map((m) => m[1])
const faixas = [...catalogo.matchAll(/^\s*faixa\(/gm)].length

function artefatos(dir) {
  const base = join(RAIZ, dir)
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((n) => /\.(apk|exe|AppImage|deb)$/.test(n))
    .map((n) => {
      const kb = Math.round(statSync(join(base, n)).size / 1024)
      return `  - ${n} (${kb.toLocaleString('pt-BR')} KB)`
    })
}

const linhas = []
const add = (...xs) => linhas.push(...xs)

add('# Dossiê completo do DG Editor', '')
add(
  `> Gerado automaticamente em **${new Date().toLocaleString('pt-BR')}** por \`npm run dossie\` (também roda no \`postbuild\`).`,
  `> Versão **${pkg.version}** · branch \`${branch}\` · último commit: ${commit || 'sem commit'}`,
  sujo ? `> Alterações locais não commitadas: ${sujo} arquivo(s).` : '> Árvore de trabalho limpa.',
  ''
)

add('## 1. O que é', '')
add(
  'DG Editor é um editor de código/sistemas com IA local (Ollama e provedores gratuitos), terminal, navegador embutido,',
  'agente autônomo com skills, estúdio de mídia (imagem, vídeo, áudio, voz, música), pipeline de apps (Android APK +',
  'instalador Windows) e servidor MCP para integração externa. Nenhuma chave paga é necessária.',
  ''
)

add('## 2. Stack e requisitos', '')
add(
  '- Electron 33 + electron-vite (main/preload/renderer), TypeScript 5, CodeMirror 6, xterm.js, node-pty.',
  `- Node.js ${process.version} (desenvolvimento), Windows x64 como alvo principal; builds Linux opcionais.`,
  '- MCP SDK (@modelcontextprotocol/sdk) com servidor stdio e HTTP read-only.',
  '- Mídia: ffmpeg/ffprobe locais, Pollinations (imagem), mermaid.ink (diagramas), TTS local (Supertonic/Kokoro/Piper) com edge-tts como fallback.',
  '- Apps: Capacitor 7 + Android SDK 35 + JDK 21 (Temurin baixado automaticamente), Gradle 8.11, electron-builder NSIS/portable.',
  ''
)

add('## 3. Arquitetura', '')
add(
  '- `src/main` — processo principal: IPC, agente/LLM, MCP, mídia, apps, memória, automação, auto-update.',
  '- `src/preload` — ponte sandbox com allowlist de canais (`invokeChannels`).',
  '- `src/renderer` — UI (HTML/CSS/JS + painéis), sem acesso direto ao Node.',
  '- `src/shared` — tipos compartilhados; `src/qa` — cenários Playwright de validação.',
  `- Módulos em \`src/main\`: ${readdirSync(join(RAIZ, 'src/main')).filter((n) => statSync(join(RAIZ, 'src/main', n)).isDirectory()).join(', ')}.`,
  ''
)

add('## 4. IPC', '')
add(`- Canais registrados no main: **${canais.length}**.`, `- Canais expostos pelo preload: **${canaisExpostos.length}**.`, '')
add('<details><summary>Canais de mídia</summary>', '')
for (const c of canaisMidia) add(`- \`${c}\``)
add('', '</details>', '')

add('## 5. Estúdio de mídia', '')
add(`Módulos: ${arqsMidia.map((f) => '`' + f.replace('src/main/midia/', '') + '`').join(', ')}.`, '')
add('### Biblioteca de músicas livres (por estilo)', '')
add(
  `- Catálogo CC BY 4.0 (Incompetech/Kevin MacLeod), **${faixas} faixas** em **${estilos.length} estilos**: ${estilos.join(', ')}.`,
  '- Download sob demanda com validação por ffprobe; créditos gravados em `CREDITOS.json` na pasta de músicas.',
  '- Canais: `midia:musicas-catalogo`, `midia:musicas-baixar`; MCP: `midia_musicas_livres`, `midia_musica_baixar`.',
  ''
)
add('### Ferramentas de áudio (ffmpeg)', '')
add(
  '- Normalização (`loudnorm I=-16 TP=-1.5 LRA=11`), EQ (graves/agudos), compressor, ganho, fade in/out, corte e conversão (mp3/wav/m4a/ogg).',
  '- Análise de volume via `volumedetect` (média/pico) com sugestão de ganho.',
  '- Canais: `midia:audio-analisar`, `midia:audio-processar`; MCP: `midia_audio`.',
  ''
)
add('### Demais recursos', '')
add(
  '- Imagem: geração (Pollinations), melhoria, meme, HTML → imagem (captura offscreen).',
  '- Vídeo: foto → vídeo (ComfyUI e variantes), juntar, cortar, capa, legendas, narração.',
  '- Voz: biblioteca pt-BR local, prévia, download de modelos, padrão configurável.',
  '- Música: banco local em `musicas/`, mixagem em vídeo, atualizações de componentes.',
  ''
)

add('## 6. Apps (Android + Windows)', '')
add(
  '- `npm run apps:setup` instala SDK/JDK/Gradle e dependências; `apps:status` mostra o estado.',
  '- `npm run apps:apk` gera APK debug validado com aapt2; `apps:win` gera instalador/portátil; `apps` faz tudo.',
  '- Artefatos também são copiados para `C:\\\\Users\\\\digo8\\\\OneDrive\\\\APP`.',
  ''
)
const art = artefatos('dist-apps')
if (art.length) add('Artefatos locais em `dist-apps/`:', '', ...art, '')

add('## 7. MCP', '')
add(`- **${ferramentasMcp.length}** ferramentas registradas em \`src/main/mcp/server.ts\`.`, `- Build: \`npm run build:mcp\` → \`.dg-editor/bin/main/mcp/server.js\`; HTTP: \`npm run mcp:http\`.`, '')
add('<details><summary>Ferramentas</summary>', '')
add(ferramentasMcp.map((n) => '`' + n + '`').join(', '))
add('', '</details>', '')

add('## 8. Skills e agentes', '')
add(
  `- Skills embutidas: **${skills.length}** — ${skills.join(', ')}.`,
  `- Agentes: **${agentes.length}** — ${agentes.join(', ')}.`,
  ''
)

add('## 9. Comandos npm', '')
add('<details><summary>Lista completa</summary>', '')
for (const [nome, cmd] of scripts) add(`- \`npm run ${nome}\` — \`${cmd}\``)
add('', '</details>', '')

add('## 10. Qualidade (QA)', '')
add(
  `- Cenários Playwright em \`src/qa/cenarios\`: **${cenarios.length} arquivos**, **${idsQa.length} verificações**.`,
  '- Suites: `qa:ipc`, `qa:e2e`, `qa:perf`, `qa:visual`; relatório: `qa:report`; autocorreção assistida: `qa:ia`.',
  '- Verificações estáticas no build: encoding, sintaxe e contraste.',
  ''
)

add('## 11. Limites e decisões', '')
add(
  '- Somente ferramentas gratuitas; nenhuma chave paga configurada.',
  '- GPU do ambiente (GT 710, 2 GB) não suporta CUDA — geração local pesada fica desativada; TTS e Whisper rodam em CPU.',
  '- Músicas: o catálogo é royalty-free com atribuição; o banco local não baixa nada sem ação explícita do usuário.',
  '- Editores completos de PDF/DOC/vídeo não são incorporados; o Estúdio cobre utilitários leves (imagem, áudio, vídeo, HTML → imagem).',
  ''
)

add('## 12. Histórico recente', '')
add(log || '- sem histórico', '')

add('## 13. Como atualizar este dossiê', '')
add(
  '```bash',
  'npm run dossie     # regenera DOSSIE.md',
  'npm run build      # roda automaticamente via postbuild',
  'npm run apps       # gera artefatos e também atualiza o dossiê',
  '```',
  ''
)

writeFileSync(join(RAIZ, 'DOSSIE.md'), linhas.join('\n'), 'utf8')
console.log(`[dossie] DOSSIE.md atualizado (v${pkg.version}, ${canais.length} canais IPC, ${ferramentasMcp.length} ferramentas MCP)`)
