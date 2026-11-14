# Dossiê completo do DG Editor

> Gerado automaticamente em **13/11/2026, 21:37:53** por `npm run dossie` (também roda no `postbuild`).
> Versão **0.4.0** · branch `integra-13-11` · último commit: 98fe284 2026-11-13 release: v0.3.6
> Alterações locais não commitadas: 7 arquivo(s).

## 1. O que é

DG Editor é um editor de código/sistemas com IA local (Ollama e provedores gratuitos), terminal, navegador embutido,
agente autônomo com skills, vault com grafo de notas e mapa mental, captura de área de transferência em Markdown,
estúdio de mídia (imagem, vídeo, áudio, voz, música), pipeline de apps (Android APK + instalador Windows) e servidor
MCP para integração externa. Nenhuma chave paga é necessária.

## 2. Stack e requisitos

- Electron 33 + electron-vite (main/preload/renderer), TypeScript 5, CodeMirror 6, xterm.js, node-pty.
- Node.js v26.13.1 (desenvolvimento), Windows x64 como alvo principal; builds Linux opcionais.
- MCP SDK (@modelcontextprotocol/sdk) com servidor stdio e HTTP read-only.
- Mídia: ffmpeg/ffprobe locais, Pollinations (imagem), mermaid.ink (diagramas), TTS local (Supertonic/Kokoro/Piper) com edge-tts como fallback.
- Apps: Capacitor 7 + Android SDK 35 + JDK 21 (Temurin baixado automaticamente), Gradle 8.11, electron-builder NSIS/portable.

## 3. Arquitetura

- `src/main` — processo principal: IPC, agente/LLM, MCP, mídia, apps, memória, automação, auto-update.
- `src/preload` — ponte sandbox com allowlist de canais (`invokeChannels`).
- `src/renderer` — UI (HTML/CSS/JS + painéis), sem acesso direto ao Node.
- `src/shared` — tipos compartilhados; `src/qa` — cenários Playwright de validação.
- Módulos em `src/main`: agent, apps, auth, auto-improvement, automation, brain, clipboard, compartilhar, deploy, gravacao, ipc, mapas, mcp, memory, midia, navegador, onboarding, openclaw, provisionamento, radar, reversa, vault, __tests__.

## 4. IPC

- Canais registrados no main: **347**.
- Canais expostos pelo preload: **327**.

<details><summary>Canais de mídia</summary>

- `midia:abrir-pasta`
- `midia:atualizacoes`
- `midia:atualizacoes-aplicar`
- `midia:atualizacoes-prefs`
- `midia:audio-analisar`
- `midia:audio-processar`
- `midia:cenas`
- `midia:comfy-instalacao`
- `midia:comfy-instalar`
- `midia:comfy-pre`
- `midia:diagrama`
- `midia:escolher-arquivos`
- `midia:escolher-pasta`
- `midia:foto-video`
- `midia:fotos-video`
- `midia:hardware`
- `midia:html-imagem`
- `midia:imagem`
- `midia:imagem-melhorar`
- `midia:imagem-qualidade`
- `midia:legendas`
- `midia:linha-tempo-analisar`
- `midia:linha-tempo-exportar`
- `midia:listar`
- `midia:meme`
- `midia:memes`
- `midia:memes-pasta`
- `midia:memes-sincronizar`
- `midia:musica-mixar`
- `midia:musicas`
- `midia:musicas-baixar`
- `midia:musicas-catalogo`
- `midia:musicas-pasta`
- `midia:narrar`
- `midia:onda`
- `midia:status`
- `midia:transcrever`
- `midia:video-analisar`
- `midia:video-capa`
- `midia:video-cortar`
- `midia:video-efeito`
- `midia:video-efeitos`
- `midia:video-juntar`
- `midia:video-melhorar`
- `midia:voz-efeito`
- `midia:voz-padrao`
- `midia:voz-presets`
- `midia:voz-previa`
- `midia:vozes`
- `midia:vozes-baixar`

</details>

## 5. Estúdio de mídia

Módulos: `__tests__/atualizacoes.test.ts`, `__tests__/audio.test.ts`, `__tests__/core.test.ts`, `__tests__/editor.test.ts`, `__tests__/efeitos-integracao.test.ts`, `__tests__/efeitos.test.ts`, `__tests__/hardware.test.ts`, `__tests__/memes.test.ts`, `__tests__/midia-integracao.test.ts`, `__tests__/musicas-livres.test.ts`, `__tests__/musicas.test.ts`, `__tests__/qualidade-integracao.test.ts`, `__tests__/qualidade.test.ts`, `__tests__/voz-efeitos.test.ts`, `__tests__/vozes-integracao.test.ts`, `__tests__/vozes.test.ts`, `atualizacoes.ts`, `audio.ts`, `comfyui-install.ts`, `comfyui.ts`, `core.ts`, `editor.ts`, `efeitos.ts`, `hardware.ts`, `memes.ts`, `musicas-livres.ts`, `musicas.ts`, `qualidade.ts`, `voz-efeitos.ts`, `vozes.ts`.

### Biblioteca de músicas livres (por estilo)

- Catálogo CC BY 4.0 (Incompetech/Kevin MacLeod), **23 faixas** em **10 estilos**: alegre, epica, tensa, calma, misterio, infantil, jazz, eletronica, triste, corporativo.
- Download sob demanda com validação por ffprobe; créditos gravados em `CREDITOS.json` na pasta de músicas.
- Canais: `midia:musicas-catalogo`, `midia:musicas-baixar`; MCP: `midia_musicas_livres`, `midia_musica_baixar`.

### Ferramentas de áudio (ffmpeg)

- Normalização (`loudnorm I=-16 TP=-1.5 LRA=11`), EQ (graves/agudos), compressor, ganho, fade in/out, corte e conversão (mp3/wav/m4a/ogg).
- Análise de volume via `volumedetect` (média/pico) com sugestão de ganho.
- Canais: `midia:audio-analisar`, `midia:audio-processar`; MCP: `midia_audio`.

### Editor de vídeo/áudio (linha do tempo embutido)

- `src/main/midia/editor.ts`: monta um MP4 juntando imagens (com duração), vídeos e áudios (faixa sobre fundo preto) na ordem escolhida.
- Cada clipe aceita recorte (`inicio`/`fim`), volume 0–2, fade in/out e mudo; tudo é normalizado para a mesma resolução/fps (`scale`+`pad`+`setsar`) e concatenado sem reencode desnecessário.
- No final: fade global de entrada/saída e música de fundo repetida com `amix` (volume ajustável); forma de onda em PNG via `showwavespic` para prévia.
- Canais `midia:linha-tempo-analisar`, `midia:linha-tempo-exportar`, `midia:onda` + evento `midia:linha-tempo-progresso`; MCP `midia_linha_tempo` (analisar/exportar/onda); UI na seção "Editor de vídeo/áudio (linha do tempo)".

### Qualidade de vídeo e imagem (ffmpeg)

- Vídeo: estabilização em 2 passadas (`vidstabdetect`/`vidstabtransform`), denoise (`hqdn3d`), nitidez (`unsharp`), correção de cor (`eq`), escala Lanczos, fps, re-render H.264 com CRF/preset e áudio normalizado (EBU R128).
- Imagem: denoise, nitidez, brilho/contraste/saturação/gamma, reescala Lanczos 1–4× e conversão PNG/JPG.
- Análise de vídeo: resolução, fps, duração, codec, bitrate, áudio e dicas automáticas de ajuste.
- Canais: `midia:video-analisar`, `midia:video-melhorar`, `midia:imagem-qualidade`; MCP: `midia_video_qualidade`, `midia_imagem_qualidade`.

### Efeitos de vídeo (estilo Topaz / PowerDirector / Filmora)

- `src/main/midia/efeitos.ts`: 16 efeitos ffmpeg puros — aprimorar (upscale Lanczos + `hqdn3d` + `unsharp` + grão), interpolar (minterpolate mci/blend + slow motion sincronizado), velocidade (`setpts` + cadeia `atempo`), boomerang, transição (`xfade`/`acrossfade`), PiP com posição, chroma key, título (`drawtext` com `textfile`), color grading (7 presets + `lenscorrection`), reenquadrar 9:16 com fundo desfocado, delogo, esconder região (split/crop/boxblur), proxy, GIF com paleta e extração de áudio.
- 11 transições (fade, wipe, slide, radial, circle…) e 7 presets de cor (cinema, quente, frio, P&B, vintage, vivo, suave); tudo mapeado em `CATALOGO_EFEITOS`/`PRESETS_COR`.
- Detecção de cenas por `select=gt(scene,…)` + `showinfo`, com miniaturas JPG e manifesto JSON em `.dg-editor/<pasta-de-mídia>/cenas-*` para montar destaques.
- Canais `midia:video-efeitos`, `midia:video-efeito`, `midia:cenas`; MCP `midia_video_efeito` (listar/aplicar/cenas); UI na caixa "Efeitos de vídeo" do Estúdio de mídia com campos dinâmicos e seletor de segundo arquivo.
- Testes: `__tests__/efeitos.test.ts` (construtores de filtros) e `__tests__/efeitos-integracao.test.ts` (ffmpeg real: 2×, upscale, P&B+título, GIF+MP3, transição/PiP/chroma, boomerang, 1080×1920, cenas) ativado por `DG_TEST_MIDIA=1`.

### Efeitos de voz (estilo RealVoice / PowerDirector)

- `src/main/midia/voz-efeitos.ts`: 13 presets — original, grave, agudo, criança, idoso, monstro, robô, telefone, rádio, caverna, megafone, sussurro e coro — com `rubberband` (pitch/formant), bandas EQ, `aecho`, `chorus`, `aphaser` e `acompressor`.
- Limpeza embutida: `afftdn` (denoise), `deesser`, corte de silêncios (`silenceremove`+`areverse`) e `loudnorm` final; intensidade 0–1 modula pitch/efeitos sem tocar no resto da cadeia.
- Saída mp3/wav/m4a/ogg. Canais `midia:voz-presets`, `midia:voz-efeito`; MCP `midia_voz_efeito` (listar/aplicar); UI na caixa "Efeitos de voz" com prévia de opções e checkbox de limpeza.
- Testes: `__tests__/voz-efeitos.test.ts` (cadeias por preset) e caso real de voz grave + telefone na suíte de integração.

### Portabilidade (instalar em PC novo)

- O instalador embute `ffmpeg.exe`/`ffprobe.exe` (GPL, com vidstab/loudnorm/rubberband) em `resources/bin/win32-x64` via `extraResources`.
- Python portátil (CPython 3.12) com edge-tts, faster-whisper, kokoro-onnx, piper-tts e supertonic em `resources/python` — vozes e transcrição funcionam sem instalar Python no PC.
- `npm run ferramentas` baixa/verifica tudo antes do build; `dist:win`, `dist:all` e `publish:github` já chamam esse passo.
- Diagnóstico em Execução → Ferramentas → "Portabilidade do PC" (canal `diag:portabilidade`, MCP `portabilidade_status`) lista o que está pronto e o que é opcional (Ollama, SDK Android, ComfyUI).
- Provisionamento automático (`src/main/provisionamento`): no primeiro boot o app consulta `resources/ferramentas.json` (matriz de plataformas/versões), baixa o ffmpeg do build mais recente quando o remoto é mais novo que o embutido, instala Python 3.12 portátil se faltar e roda `pip --upgrade` dos pacotes gratuitos em `%LOCALAPPDATA%\dg-editor\ferramentas` (gravável sem admin, prioritário sobre o embutido).
- Canais `prov:status`, `prov:executar`, `prov:preferencias` + evento `prov:progresso`; MCP `provisionamento_status`/`provisionamento_atualizar`; UI em "Ferramentas automáticas (download no PC novo)" com toggle, log e botão de forçar atualização. Falha de rede recua por 6h e a checagem periódica é diária.
- Agentes externos gratuitos: `agente:externos` / MCP `agentes_externos_status` detectam QCoder (qwen2.5-coder + qc-cli), OpenDevin/OpenHands (WSL) e Trae Agent, com o comando de instalação quando faltam.

### Gravação de tela (estilo OBS)

- `desktopCapturer` no processo principal lista telas e janelas com miniatura; o renderer captura via `getUserMedia` com as restrições legadas de desktop e grava em WebM (VP9 com fallback VP8, timeslice de 2 s).
- Áudio do sistema e microfone são mixados num `AudioContext` (ganho por fonte) antes do `MediaRecorder`; o usuário escolhe fonte, fps, bitrate e quais áudios entram.
- Chunks vão ao main por `gravacao:chunk` e são escritos em fluxo em `.dg-editor/gravacoes/<nome>.webm`; ao finalizar o arquivo aparece com caminho relativo ao projeto.
- Conversão para MP4 com `ffmpeg` (libx264 CRF 23, aac 160k, `+faststart`), escala opcional Lanczos; listagem ordenada por data e botão para abrir a pasta.
- Canais `gravacao:fontes`, `gravacao:iniciar`, `gravacao:chunk`, `gravacao:finalizar`, `gravacao:cancelar`, `gravacao:listar`, `gravacao:converter`, `gravacao:abrir-pasta`; MCP `tela_gravacoes` (listar/converter); UI no modal `.gravador-modal`; QA `ui.gravacao.captura` e `ui.gravacao.modal`.

### Compartilhamento local (estilo AirDrop)

- Servidor HTTP em `0.0.0.0` com porta aleatória e token aleatório comparado com `timingSafeEqual`; página HTML de upload usa `fetch PUT` direto do celular na mesma rede.
- Upload em streaming com `pipeline`, limite de 1 GB por arquivo, nomes únicos e destino `.dg-editor/recebidos`; a UI mostra URL, QR-friendly, lista de recebidos e status (ativo/porta/IP).
- Canais `compartilhar:iniciar`, `compartilhar:parar`, `compartilhar:status`, `compartilhar:listar`, `compartilhar:abrir-pasta`; MCP `receber_lan`; UI no modal `.share-modal`; QA `ui.compartilhar.ipc` e `ui.compartilhar.ui`.

### Demais recursos

- Imagem: geração (Pollinations), melhoria, meme, HTML → imagem (captura offscreen).
- Vídeo: foto → vídeo (ComfyUI e variantes), juntar, cortar, capa, legendas, narração.
- Voz: biblioteca pt-BR local, prévia, download de modelos, padrão configurável.
- Música: banco local em `musicas/`, mixagem em vídeo, atualizações de componentes.

## 6. Engenharia reversa local (REA)

- Inspirado no REA (github.com/morluto/rea), reimplementado 100% local e gratuito: só analisa arquivos do próprio usuário ou autorizados via diálogo, e não contorna DRM/proteções.
- **Binários**: detecta PE (cabeçalhos COFF/opcional, seções, imports/exports, entropia por seção, indícios de packer, metadados .NET), ELF e Mach-O por assinatura; extrai strings ASCII e UTF-16LE categorizadas (URLs, caminhos, domínios, IPs, e-mails).
- **Apps Electron**: lê o header do ASAR (offset/size por arquivo), extrai conteúdo, e coleta evidências de `package.json`, canais IPC, preload, `nodeIntegration` e `contextIsolation`.
- **Web**: inspeciona URL http(s) — headers, scripts, metas, formulários e frameworks detectados.
- Cada análise gera relatório Markdown com evidências e limitações em `.dg-editor/reversa/<slug>/relatorio.md` (escrita atômica).
- Canais `reversa:status`, `reversa:analisar`, `reversa:strings`, `reversa:asar`, `reversa:relatorios`, `reversa:escolher`, `reversa:abrir-pasta`; MCP `reversa_status`, `reversa_analisar`, `reversa_strings`, `reversa_asar`; UI no modal `.reversa-modal` com aviso de uso autorizado.
- Guardrails: `alvoValido` aceita apenas caminhos dentro do workspace ou adicionados pela caixa de diálogo de autorização; URLs restritas a http/https.
- Testes: `src/main/reversa/__tests__/reversa.test.ts` (detecção de tipo, PE sintético, strings, ASAR, entropia, relatório); QA `ui.reversa.*`.

## 7. Produtividade e anotações

- **Grafo do vault (estilo Obsidian)**: `vault:grafo` devolve notas, grau e arestas resolvidas por wiki links (sem auto-link/duplicatas); layout de forças (Fruchterman–Reingold) em canvas com pan, zoom, arraste, filtro de busca e abertura de nota ao clicar. Módulo: `src/renderer/grafo-vault.js`; núcleo: `grafoVault` em `src/main/vault/indice.ts`.
- **Mapa mental (estilo MindNode)**: outline Markdown indentado vira SVG em árvore horizontal com quebra de linha, nós coloridos por profundidade e exportação PNG. Persistência em `.dg-editor/mapas/<nome>.md`. IPC `mapas:listar/carregar/salvar/excluir/svg`; MCP `notas_mapa_mental` (renderizar, salvar, carregar, listar); UI pelo botão "Mapa" no cabeçalho do vault.
- **Colar como Markdown (estilo Notion)**: converte HTML rico da área de transferência (tabelas GFM, listas, tarefas, links, ênfase, imagens) em Markdown limpo via turndown + plugin GFM; insere no editor ativo ou abre prévia com "Copiar Markdown". Canal `clipboard:colar-markdown` e `clipboard:gravar`; atalho Ctrl+Shift+V e comando na paleta.
- Testes: `src/main/vault/__tests__/grafo.test.ts`, `src/main/mapas/__tests__/mapas.test.ts`, `src/main/clipboard/__tests__/markdown.test.ts`.

## 8. Apps (Android + Windows)

- `npm run apps:setup` instala SDK/JDK/Gradle e dependências; `apps:status` mostra o estado.
- `npm run apps:apk` gera APK debug validado com aapt2; `apps:win` gera instalador/portátil; `apps` faz tudo.
- Artefatos também são copiados para `C:\\Users\\digo8\\OneDrive\\APP`.

Artefatos locais em `dist-apps/`:

  - DG-Apps-0.1.0.apk (4.167 KB)

## 9. MCP

- **82** ferramentas registradas em `src/main/mcp/server.ts`.
- Build: `npm run build:mcp` → `.dg-editor/bin/main/mcp/server.js`; HTTP: `npm run mcp:http`.
- Despacho por prefixo cobre `midia_`, `apps_`, `reversa_` e as ferramentas `notas_mapa_mental`, `tela_gravacoes` e `receber_lan`.

<details><summary>Ferramentas</summary>

`agente_executar`, `agente_invocar`, `agente_listar`, `agentes_externos_status`, `apps_build`, `apps_setup`, `apps_status`, `automacao_executar`, `automacao_listar`, `codigo_buscar`, `codigo_editar`, `codigo_ler`, `conector_listar`, `disco_buscar`, `disco_inspecionar`, `dossie_read`, `dossie_snapshot`, `dossie_write`, `ftp_deploy`, `ftp_listar`, `git_diff`, `git_status`, `midia_atualizacoes`, `midia_audio`, `midia_comfy_instalar`, `midia_comfyui_imagem`, `midia_comfyui_status`, `midia_comfyui_video`, `midia_diagrama`, `midia_foto_video`, `midia_fotos_video`, `midia_hardware`, `midia_imagem_gerar`, `midia_imagem_melhorar`, `midia_imagem_qualidade`, `midia_legendas`, `midia_linha_tempo`, `midia_meme_gerar`, `midia_memes_listar`, `midia_memes_sincronizar`, `midia_musica_baixar`, `midia_musica_mixar`, `midia_musicas`, `midia_musicas_livres`, `midia_narrar`, `midia_status`, `midia_transcrever`, `midia_video_capa`, `midia_video_cortar`, `midia_video_efeito`, `midia_video_juntar`, `midia_video_qualidade`, `midia_voz_efeito`, `midia_vozes_listar`, `navegador_abrir`, `navegador_baixar`, `navegador_clicar`, `navegador_ler`, `navegador_preencher`, `notas_mapa_mental`, `portabilidade_status`, `projeto_arvore`, `projeto_smoke`, `provisionamento_atualizar`, `provisionamento_status`, `qoder_executar`, `qualidade_checar`, `receber_lan`, `resultado_avaliar`, `reversa_analisar`, `reversa_asar`, `reversa_status`, `reversa_strings`, `skill_ler`, `skill_listar`, `tela_gravacoes`, `terminal_exec`, `testes_rodar`, `trae_executar`, `vault_list`, `vault_read`, `vault_write`

</details>

## 10. Skills e agentes

- Skills embutidas: **23** — editar-seguro.md, arvore-projeto.md, navegador-embutido.md, free-mode.md, prompt-melhorar.md, anexos.md, leitor-codigo.md, refatorador.md, testador.md, debugger.md, revisor-seguranca.md, documentador.md, analisador.md, terminal-local.md, inventario-disco.md, estilo-cursor.md, roteiro-shorts.md, thumbnail-design.md, legenda-automatica.md, publicacao-social.md, pacote-memes.md, dublagem-parodia.md, capa-video.md.
- Agentes: **19** — Revisor, Arquiteto, Seguranca, Testador, DG Engenheiro, Hibrido Core, Auto Free, Coder Free, Assist Free, Architect Free, Debugger Free, Reviewer Free, Qoder, Devin (OpenHands), Trae, Roteirista, Thumbnail, Legendas, Publicador.

## 11. Comandos npm

<details><summary>Lista completa</summary>

- `npm run apps` — `node scripts/apps/build.cjs --tipo=tudo`
- `npm run apps:apk` — `node scripts/apps/build.cjs --tipo=apk`
- `npm run apps:publicar` — `node scripts/apps/build.cjs --publicar`
- `npm run apps:setup` — `node scripts/apps/build.cjs --setup`
- `npm run apps:status` — `node scripts/apps/build.cjs --status`
- `npm run apps:win` — `node scripts/apps/build.cjs --tipo=win`
- `npm run backup:onedrive` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-onedrive.ps1`
- `npm run backup:setup` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-backup-onedrive.ps1`
- `npm run branding` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gerar-branding.ps1`
- `npm run build` — `npm run verificar:encoding && npm run verificar:sintaxe && npm run verificar:contraste && electron-vite build`
- `npm run build:mcp` — `tsc -p src/main/mcp/tsconfig.mcp.json --pretty false & node -e "require('fs').accessSync('.dg-editor/bin/main/mcp/server.js');console.log('[build:mcp] ok')"`
- `npm run certificar` — `node scripts/certificar.cjs`
- `npm run deploy` — `npm run dist:win:installer`
- `npm run dev` — `electron-vite dev`
- `npm run dist:all` — `npm run ferramentas && npm run build && electron-builder --win nsis portable --linux AppImage deb --x64`
- `npm run dist:linux` — `npm run build && electron-builder --linux AppImage deb --x64`
- `npm run dist:linux:wsl` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-linux.ps1`
- `npm run dist:win` — `npm run ferramentas && npm run build && electron-builder --win --x64 --dir -c.directories.output=tmp/dist-win`
- `npm run dist:win:installer` — `npm run ferramentas && npm run build && electron-builder --win nsis portable --x64`
- `npm run dossie` — `node scripts/dossie.cjs`
- `npm run ferramentas` — `node scripts/baixar-ferramentas.cjs && node scripts/baixar-python.cjs`
- `npm run indice` — `node scripts/gerar-indice.cjs`
- `npm run installer:assets` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gerar-installer-assets.ps1`
- `npm run limpar` — `node -e "require('fs').rmSync('out',{recursive:true,force:true});require('fs').rmSync('node_modules/.vite',{recursive:true,force:true});console.log('ok')"`
- `npm run limpeza` — `node scripts/limpeza-workspace.cjs`
- `npm run limpeza:dry` — `node scripts/limpeza-workspace.cjs --dry-run`
- `npm run limpeza:leve` — `node scripts/limpeza-workspace.cjs --leve`
- `npm run limpeza:organica` — `node scripts/limpeza-workspace.cjs --organica`
- `npm run mcp` — `npm run build:mcp && node .dg-editor/bin/main/mcp/server.js`
- `npm run mcp:http` — `tsc -p src/main/mcp/tsconfig.mcp.json && node .dg-editor/bin/main/mcp/http-server.js`
- `npm run postbuild` — `node scripts/dossie.cjs`
- `npm run postinstall` — `node scripts/patch-node-pty-spectre.cjs && node scripts/rebuild-node-pty.cjs && node scripts/garantir-launchers.cjs && node scripts/garantir-electron.cjs`
- `npm run prebuild` — `npm run build:mcp`
- `npm run predev` — `node scripts/garantir-build.cjs`
- `npm run prestart` — `node scripts/garantir-launchers.cjs`
- `npm run preview` — `electron-vite preview`
- `npm run publicar` — `node scripts/versao-publicar.cjs --build`
- `npm run publish:github` — `npm run ferramentas && npm run build && electron-builder --win nsis portable --linux AppImage deb --x64 --publish always`
- `npm run publish:release` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publicar-release.ps1`
- `npm run python-portatil` — `node scripts/baixar-python.cjs`
- `npm run qa` — `node scripts/run-qa.cjs`
- `npm run qa:baseline` — `node scripts/run-qa.cjs --suite=perf --atualizar-baseline`
- `npm run qa:e2e` — `node scripts/run-qa.cjs --suite=e2e`
- `npm run qa:ia` — `node scripts/qa-autocorrigir.cjs`
- `npm run qa:ia:dry` — `node scripts/qa-autocorrigir.cjs --dry-run`
- `npm run qa:ipc` — `node scripts/run-qa.cjs --suite=ipc`
- `npm run qa:perf` — `node scripts/run-qa.cjs --suite=perf`
- `npm run qa:report` — `node scripts/run-qa.cjs --report-only`
- `npm run qa:visual` — `node scripts/run-qa.cjs --suite=visual`
- `npm run qa:visual:baseline` — `node scripts/run-qa.cjs --suite=visual --atualizar-baseline`
- `npm run rebuild:pty` — `node scripts/rebuild-node-pty.cjs`
- `npm run smoke:disco` — `node scripts/smoke-disco.cjs`
- `npm run start` — `node scripts/iniciar-app.cjs`
- `npm run test` — `vitest run`
- `npm run test:mcp-ollama` — `npm run build:mcp && node test/ollama-mcp.cjs && node test/mcp-ollama-stdio.cjs && node test/mcp-ollama-stdio.cjs --external-config`
- `npm run test:validator` — `node test/validator.cjs`
- `npm run test:watch` — `vitest`
- `npm run testar:fila` — `node scripts/testar-fila.mjs`
- `npm run typecheck` — `tsc --noEmit`
- `npm run validar:update-atalho` — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validar-update-atalho.ps1`
- `npm run verificar:contraste` — `node scripts/verificar-contraste.mjs`
- `npm run verificar:encoding` — `node scripts/verificar-encoding.mjs`
- `npm run verificar:sintaxe` — `node scripts/verificar-sintaxe.mjs`
- `npm run versao` — `node scripts/versao-publicar.cjs`

</details>

## 12. Qualidade (QA)

- Cenários Playwright em `src/qa/cenarios`: **18 arquivos**, **180 verificações**.
- Suites: `qa:ipc`, `qa:e2e`, `qa:perf`, `qa:visual`; relatório: `qa:report`; autocorreção assistida: `qa:ia`.
- Verificações estáticas no build: encoding, sintaxe e contraste.

## 13. Limites e decisões

- Somente ferramentas gratuitas; nenhuma chave paga configurada.
- GPU do ambiente (GT 710, 2 GB) não suporta CUDA — geração local pesada fica desativada; TTS e Whisper rodam em CPU.
- Músicas: o catálogo é royalty-free com atribuição; o banco local não baixa nada sem ação explícita do usuário.
- Editores completos de PDF/DOC não são incorporados; vídeo/áudio contam com um editor de linha do tempo embutido (ffmpeg) e o Estúdio cobre utilitários leves (imagem, áudio, vídeo, HTML → imagem).

## 14. Histórico recente

- 98fe284 2026-11-13 release: v0.3.6
- 1d9922a 2026-11-13 release: v0.3.5
- a0586d6 2026-11-13 release: v0.3.4
- 8b18036 2026-11-13 release: v0.3.3
- 720d286 2026-11-13 release: v0.3.2
- d076e20 2026-11-13 release: v0.3.1
- 6471e0e 2026-11-13 fix(publicar): empacotar em pasta temporaria e copiar artefatos para OneDrive
- b635c19 2026-11-13 release: v0.3.0 — dossiê automático, músicas livres e ferramentas de áudio
- e3df21b 2026-11-13 feat(mcp-http): servidor MCP HTTP read-only + isolamento de repositorio
- 4f1ec4b 2026-11-12 fix: orquestrador e agente com fallback garantido

## 15. Como atualizar este dossiê

```bash
npm run dossie     # regenera DOSSIE.md
npm run build      # roda automaticamente via postbuild
npm run apps       # gera artefatos e também atualiza o dossiê
```
