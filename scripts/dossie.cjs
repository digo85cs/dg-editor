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
  'agente autônomo com skills, vault com grafo de notas e mapa mental, captura de área de transferência em Markdown,',
  'estúdio de mídia (imagem, vídeo, áudio, voz, música), pipeline de apps (Android APK + instalador Windows) e servidor',
  'MCP para integração externa. Nenhuma chave paga é necessária.',
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
add('### Editor de vídeo/áudio (linha do tempo embutido)', '')
add(
  '- `src/main/midia/editor.ts`: monta um MP4 juntando imagens (com duração), vídeos e áudios (faixa sobre fundo preto) na ordem escolhida.',
  '- Cada clipe aceita recorte (`inicio`/`fim`), volume 0–2, fade in/out e mudo; tudo é normalizado para a mesma resolução/fps (`scale`+`pad`+`setsar`) e concatenado sem reencode desnecessário.',
  '- No final: fade global de entrada/saída e música de fundo repetida com `amix` (volume ajustável); forma de onda em PNG via `showwavespic` para prévia.',
  '- Canais `midia:linha-tempo-analisar`, `midia:linha-tempo-exportar`, `midia:onda` + evento `midia:linha-tempo-progresso`; MCP `midia_linha_tempo` (analisar/exportar/onda); UI na seção "Editor de vídeo/áudio (linha do tempo)".',
  ''
)
add('### Qualidade de vídeo e imagem (ffmpeg)', '')
add(
  '- Vídeo: estabilização em 2 passadas (`vidstabdetect`/`vidstabtransform`), denoise (`hqdn3d`), nitidez (`unsharp`), correção de cor (`eq`), escala Lanczos, fps, re-render H.264 com CRF/preset e áudio normalizado (EBU R128).',
  '- Imagem: denoise, nitidez, brilho/contraste/saturação/gamma, reescala Lanczos 1–4× e conversão PNG/JPG.',
  '- Análise de vídeo: resolução, fps, duração, codec, bitrate, áudio e dicas automáticas de ajuste.',
  '- Canais: `midia:video-analisar`, `midia:video-melhorar`, `midia:imagem-qualidade`; MCP: `midia_video_qualidade`, `midia_imagem_qualidade`.',
  ''
)
add('### Efeitos de vídeo (estilo Topaz / PowerDirector / Filmora)', '')
add(
  '- `src/main/midia/efeitos.ts`: 16 efeitos ffmpeg puros — aprimorar (upscale Lanczos + `hqdn3d` + `unsharp` + grão), interpolar (minterpolate mci/blend + slow motion sincronizado), velocidade (`setpts` + cadeia `atempo`), boomerang, transição (`xfade`/`acrossfade`), PiP com posição, chroma key, título (`drawtext` com `textfile`), color grading (7 presets + `lenscorrection`), reenquadrar 9:16 com fundo desfocado, delogo, esconder região (split/crop/boxblur), proxy, GIF com paleta e extração de áudio.',
  '- 11 transições (fade, wipe, slide, radial, circle…) e 7 presets de cor (cinema, quente, frio, P&B, vintage, vivo, suave); tudo mapeado em `CATALOGO_EFEITOS`/`PRESETS_COR`.',
  '- Detecção de cenas por `select=gt(scene,…)` + `showinfo`, com miniaturas JPG e manifesto JSON em `.dg-editor/<pasta-de-mídia>/cenas-*` para montar destaques.',
  '- Canais `midia:video-efeitos`, `midia:video-efeito`, `midia:cenas`; MCP `midia_video_efeito` (listar/aplicar/cenas); UI na caixa "Efeitos de vídeo" do Estúdio de mídia com campos dinâmicos e seletor de segundo arquivo.',
  '- Testes: `__tests__/efeitos.test.ts` (construtores de filtros) e `__tests__/efeitos-integracao.test.ts` (ffmpeg real: 2×, upscale, P&B+título, GIF+MP3, transição/PiP/chroma, boomerang, 1080×1920, cenas) ativado por `DG_TEST_MIDIA=1`.',
  ''
)
add('### Efeitos de voz (estilo RealVoice / PowerDirector)', '')
add(
  '- `src/main/midia/voz-efeitos.ts`: 13 presets — original, grave, agudo, criança, idoso, monstro, robô, telefone, rádio, caverna, megafone, sussurro e coro — com `rubberband` (pitch/formant), bandas EQ, `aecho`, `chorus`, `aphaser` e `acompressor`.',
  '- Limpeza embutida: `afftdn` (denoise), `deesser`, corte de silêncios (`silenceremove`+`areverse`) e `loudnorm` final; intensidade 0–1 modula pitch/efeitos sem tocar no resto da cadeia.',
  '- Saída mp3/wav/m4a/ogg. Canais `midia:voz-presets`, `midia:voz-efeito`; MCP `midia_voz_efeito` (listar/aplicar); UI na caixa "Efeitos de voz" com prévia de opções e checkbox de limpeza.',
  '- Testes: `__tests__/voz-efeitos.test.ts` (cadeias por preset) e caso real de voz grave + telefone na suíte de integração.',
  ''
)
add('### Portabilidade (instalar em PC novo)', '')
add(
  '- O instalador embute `ffmpeg.exe`/`ffprobe.exe` (GPL, com vidstab/loudnorm/rubberband) em `resources/bin/win32-x64` via `extraResources`.',
  '- Python portátil (CPython 3.12) com edge-tts, faster-whisper, kokoro-onnx, piper-tts e supertonic em `resources/python` — vozes e transcrição funcionam sem instalar Python no PC.',
  '- `npm run ferramentas` baixa/verifica tudo antes do build; `dist:win`, `dist:all` e `publish:github` já chamam esse passo.',
  '- Diagnóstico em Execução → Ferramentas → "Portabilidade do PC" (canal `diag:portabilidade`, MCP `portabilidade_status`) lista o que está pronto e o que é opcional (Ollama, SDK Android, ComfyUI).',
  '- Provisionamento automático (`src/main/provisionamento`): no primeiro boot o app consulta `resources/ferramentas.json` (matriz de plataformas/versões), baixa o ffmpeg do build mais recente quando o remoto é mais novo que o embutido, instala Python 3.12 portátil se faltar e roda `pip --upgrade` dos pacotes gratuitos em `%LOCALAPPDATA%\\dg-editor\\ferramentas` (gravável sem admin, prioritário sobre o embutido).',
  '- Canais `prov:status`, `prov:executar`, `prov:preferencias` + evento `prov:progresso`; MCP `provisionamento_status`/`provisionamento_atualizar`; UI em "Ferramentas automáticas (download no PC novo)" com toggle, log e botão de forçar atualização. Falha de rede recua por 6h e a checagem periódica é diária.',
  '- Agentes externos gratuitos: `agente:externos` / MCP `agentes_externos_status` detectam QCoder (qwen2.5-coder + qc-cli), OpenDevin/OpenHands (WSL) e Trae Agent, com o comando de instalação quando faltam.',
  ''
)
add('### Gravação de tela (estilo OBS)', '')
add(
  '- `desktopCapturer` no processo principal lista telas e janelas com miniatura; o renderer captura via `getUserMedia` com as restrições legadas de desktop e grava em WebM (VP9 com fallback VP8, timeslice de 2 s).',
  '- Áudio do sistema e microfone são mixados num `AudioContext` (ganho por fonte) antes do `MediaRecorder`; o usuário escolhe fonte, fps, bitrate e quais áudios entram.',
  '- Chunks vão ao main por `gravacao:chunk` e são escritos em fluxo em `.dg-editor/gravacoes/<nome>.webm`; ao finalizar o arquivo aparece com caminho relativo ao projeto.',
  '- Conversão para MP4 com `ffmpeg` (libx264 CRF 23, aac 160k, `+faststart`), escala opcional Lanczos; listagem ordenada por data e botão para abrir a pasta.',
  '- Canais `gravacao:fontes`, `gravacao:iniciar`, `gravacao:chunk`, `gravacao:finalizar`, `gravacao:cancelar`, `gravacao:listar`, `gravacao:converter`, `gravacao:abrir-pasta`; MCP `tela_gravacoes` (listar/converter); UI no modal `.gravador-modal`; QA `ui.gravacao.captura` e `ui.gravacao.modal`.',
  ''
)
add('### Compartilhamento local (estilo AirDrop)', '')
add(
  '- Servidor HTTP em `0.0.0.0` com porta aleatória e token aleatório comparado com `timingSafeEqual`; página HTML de upload usa `fetch PUT` direto do celular na mesma rede.',
  '- Upload em streaming com `pipeline`, limite de 1 GB por arquivo, nomes únicos e destino `.dg-editor/recebidos`; a UI mostra URL, QR-friendly, lista de recebidos e status (ativo/porta/IP).',
  '- Canais `compartilhar:iniciar`, `compartilhar:parar`, `compartilhar:status`, `compartilhar:listar`, `compartilhar:abrir-pasta`; MCP `receber_lan`; UI no modal `.share-modal`; QA `ui.compartilhar.ipc` e `ui.compartilhar.ui`.',
  ''
)
add('### Imagens de instalação e pendrive inicializável (estilo Rufus)', '')
add(
  '- Análise própria de ISO 9660 + Joliet + UDF e El Torito (BIOS e UEFI), sem ferramentas externas: rótulo, tamanho, sistema (Windows/Linux/macOS), distro, presença de boot, MBR/GPT e amostra da raiz. IMG/RAW são classificados por assinatura (FAT32/NTFS/MBR/GPT) e DMG pelo trailer `koly`.',
  '- Personalização com pycdlib (Python gratuito embutido em `resources/python`): lista o conteúdo completo, extrai para o projeto, injeta uma pasta *overlay* e reconstrói a ISO preservando as entradas El Torito de BIOS e UEFI (catálogos `BOOT.CAT` de cada plataforma).',
  '- Instalação sem supervisão: gera `autounattend.xml` (idioma, EULA, OOBE, nome do PC) e `sources/ei.cfg` (edição/canal) direto na pasta de personalização, prontos para a reconstrução.',
  '- Presets: salva a pasta de personalização em `.dg-editor/midia/imagens/presets/<id>` e aplica de volta no overlay (mescla), com nomes validados contra traversal.',
  '- Gravação de pendrive: enumera discos USB/SD/MMC via `Get-Disk`, recusa discos fixos e do sistema, exige confirmação digitando o token derivado do serial e opcionalmente verifica a leitura de volta. Escrita crua em `\\\\.\\PhysicalDriveN` com `CreateFileW`, trava e desmonta o volume, blocos de 1 MB e alinhamento em 2048 bytes.',
  '- Gravação: mostra progresso com ETA, permite cancelar o processo e calcula SHA-256 da imagem em streaming antes de gravar; a UI avisa quando o app não está elevado (sem administrador o Windows recusa a escrita crua).',
  '- Guardrails: o renderer nunca informa dados confiáveis da unidade — o main reenumera e casa disco + serial; a gravação exige `podeGravar` e token. O MCP **não** expõe escrita em USB (só análise, listagem, extração, reconstrução e `usb-listar`).',
  '- Canais: `imagens:escolher-imagem`, `imagens:analisar`, `imagens:listar-conteudo`, `imagens:extrair`, `imagens:reconstruir`, `imagens:overlay-pasta`, `imagens:abrir-overlay`, `imagens:suporte`, `imagens:instalar-suporte`, `imagens:usb-listar`, `imagens:usb-gravar`, `imagens:usb-cancelar`, `imagens:usb-admin`, `imagens:hash`, `imagens:unattend`, `imagens:presets-listar/salvar/aplicar`, `imagens:usb-progresso` (evento). MCP `imagens_iso` (inclui `hash` e `presets`; nunca grava USB). UI no quadro "Imagens e ISO (estilo Rufus)" do Estúdio de mídia.',
  '- Código: `src/main/imagens/iso.ts` (parser), `personalizar.ts` (pycdlib, autounattend e presets), `usb.ts` (gravação, hash, elevação e cancelamento), `src/main/ipc/imagens.ts` (IPC). Testes: `iso.test.ts` (10), `usb.test.ts` (14), `unattend-presets.test.ts` (10), `personalizar-integracao.test.ts` (4, com pycdlib real); QA `ui.midia.imagens`.',
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

add('## 6. Engenharia reversa local (REA)', '')
add(
  '- Inspirado no REA (github.com/morluto/rea), reimplementado 100% local e gratuito: só analisa arquivos do próprio usuário ou autorizados via diálogo, e não contorna DRM/proteções.',
  '- **Binários**: detecta PE (cabeçalhos COFF/opcional, seções, imports/exports, entropia por seção, indícios de packer, metadados .NET), ELF e Mach-O por assinatura; extrai strings ASCII e UTF-16LE categorizadas (URLs, caminhos, domínios, IPs, e-mails).',
  '- **Apps Electron**: lê o header do ASAR (offset/size por arquivo), extrai conteúdo, e coleta evidências de `package.json`, canais IPC, preload, `nodeIntegration` e `contextIsolation`.',
  '- **Web**: inspeciona URL http(s) — headers, scripts, metas, formulários e frameworks detectados.',
  '- Cada análise gera relatório Markdown com evidências e limitações em `.dg-editor/reversa/<slug>/relatorio.md` (escrita atômica).',
  '- Canais `reversa:status`, `reversa:analisar`, `reversa:strings`, `reversa:asar`, `reversa:relatorios`, `reversa:escolher`, `reversa:abrir-pasta`; MCP `reversa_status`, `reversa_analisar`, `reversa_strings`, `reversa_asar`; UI no modal `.reversa-modal` com aviso de uso autorizado.',
  '- Guardrails: `alvoValido` aceita apenas caminhos dentro do workspace ou adicionados pela caixa de diálogo de autorização; URLs restritas a http/https.',
  '- Testes: `src/main/reversa/__tests__/reversa.test.ts` (detecção de tipo, PE sintético, strings, ASAR, entropia, relatório); QA `ui.reversa.*`.',
  ''
)

add('## 7. Produtividade e anotações', '')
add(
  '- **Grafo do vault (estilo Obsidian)**: `vault:grafo` devolve notas, grau e arestas resolvidas por wiki links (sem auto-link/duplicatas); layout de forças (Fruchterman–Reingold) em canvas com pan, zoom, arraste, filtro de busca e abertura de nota ao clicar. Módulo: `src/renderer/grafo-vault.js`; núcleo: `grafoVault` em `src/main/vault/indice.ts`.',
  '- **Mapa mental (estilo MindNode)**: outline Markdown indentado vira SVG em árvore horizontal com quebra de linha, nós coloridos por profundidade e exportação PNG. Persistência em `.dg-editor/mapas/<nome>.md`. IPC `mapas:listar/carregar/salvar/excluir/svg`; MCP `notas_mapa_mental` (renderizar, salvar, carregar, listar); UI pelo botão "Mapa" no cabeçalho do vault.',
  '- **Colar como Markdown (estilo Notion)**: converte HTML rico da área de transferência (tabelas GFM, listas, tarefas, links, ênfase, imagens) em Markdown limpo via turndown + plugin GFM; insere no editor ativo ou abre prévia com "Copiar Markdown". Canal `clipboard:colar-markdown` e `clipboard:gravar`; atalho Ctrl+Shift+V e comando na paleta.',
  '- Testes: `src/main/vault/__tests__/grafo.test.ts`, `src/main/mapas/__tests__/mapas.test.ts`, `src/main/clipboard/__tests__/markdown.test.ts`.',
  ''
)

add('## 8. Apps (Android + Windows)', '')
add(
  '- `npm run apps:setup` instala SDK/JDK/Gradle e dependências; `apps:status` mostra o estado.',
  '- `npm run apps:apk` gera APK debug validado com aapt2; `apps:win` gera instalador/portátil; `apps` faz tudo.',
  '- Artefatos também são copiados para `C:\\\\Users\\\\digo8\\\\OneDrive\\\\APP`.',
  ''
)
const art = artefatos('dist-apps')
if (art.length) add('Artefatos locais em `dist-apps/`:', '', ...art, '')

add('## 9. MCP', '')
add(`- **${ferramentasMcp.length}** ferramentas registradas em \`src/main/mcp/server.ts\`.`, `- Build: \`npm run build:mcp\` → \`.dg-editor/bin/main/mcp/server.js\`; HTTP: \`npm run mcp:http\`.`, '- Despacho por prefixo cobre `midia_`, `apps_`, `reversa_` e as ferramentas `imagens_iso`, `notas_mapa_mental`, `tela_gravacoes` e `receber_lan`. A ferramenta `imagens_iso` é somente leitura: não grava pendrive.', '')
add('<details><summary>Ferramentas</summary>', '')
add(ferramentasMcp.map((n) => '`' + n + '`').join(', '))
add('', '</details>', '')

add('## 10. Skills e agentes', '')
add(
  `- Skills embutidas: **${skills.length}** — ${skills.join(', ')}.`,
  `- Agentes: **${agentes.length}** — ${agentes.join(', ')}.`,
  ''
)

add('## 11. Comandos npm', '')
add('<details><summary>Lista completa</summary>', '')
for (const [nome, cmd] of scripts) add(`- \`npm run ${nome}\` — \`${cmd}\``)
add('', '</details>', '')

add('## 12. Qualidade (QA)', '')
add(
  `- Cenários Playwright em \`src/qa/cenarios\`: **${cenarios.length} arquivos**, **${idsQa.length} verificações**.`,
  '- Suites: `qa:ipc`, `qa:e2e`, `qa:perf`, `qa:visual`; relatório: `qa:report`; autocorreção assistida: `qa:ia`.',
  '- Verificações estáticas no build: encoding, sintaxe e contraste.',
  ''
)

add('## 13. Limites e decisões', '')
add(
  '- Somente ferramentas gratuitas; nenhuma chave paga configurada.',
  '- GPU do ambiente (GT 710, 2 GB) não suporta CUDA — geração local pesada fica desativada; TTS e Whisper rodam em CPU.',
  '- Músicas: o catálogo é royalty-free com atribuição; o banco local não baixa nada sem ação explícita do usuário.',
  '- Editores completos de PDF/DOC não são incorporados; vídeo/áudio contam com um editor de linha do tempo embutido (ffmpeg) e o Estúdio cobre utilitários leves (imagem, áudio, vídeo, HTML → imagem).',
  ''
)

add('## 14. Histórico recente', '')
add(log || '- sem histórico', '')

add('## 15. Como atualizar este dossiê', '')
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
