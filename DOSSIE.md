# Dossiê completo do DG Editor

> Gerado automaticamente em **13/11/2026, 19:58:40** por `npm run dossie` (também roda no `postbuild`).
> Versão **0.3.2** · branch `integra-13-11` · último commit: d076e20 2026-11-13 release: v0.3.1
> Alterações locais não commitadas: 21 arquivo(s).

## 1. O que é

DG Editor é um editor de código/sistemas com IA local (Ollama e provedores gratuitos), terminal, navegador embutido,
agente autônomo com skills, estúdio de mídia (imagem, vídeo, áudio, voz, música), pipeline de apps (Android APK +
instalador Windows) e servidor MCP para integração externa. Nenhuma chave paga é necessária.

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
- Módulos em `src/main`: agent, apps, auth, auto-improvement, automation, brain, deploy, ipc, mcp, memory, midia, navegador, onboarding, openclaw, radar, vault, __tests__.

## 4. IPC

- Canais registrados no main: **308**.
- Canais expostos pelo preload: **286**.

<details><summary>Canais de mídia</summary>

- `midia:abrir-pasta`
- `midia:atualizacoes`
- `midia:atualizacoes-aplicar`
- `midia:atualizacoes-prefs`
- `midia:audio-analisar`
- `midia:audio-processar`
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
- `midia:status`
- `midia:transcrever`
- `midia:video-analisar`
- `midia:video-capa`
- `midia:video-cortar`
- `midia:video-juntar`
- `midia:video-melhorar`
- `midia:voz-padrao`
- `midia:voz-previa`
- `midia:vozes`
- `midia:vozes-baixar`

</details>

## 5. Estúdio de mídia

Módulos: `__tests__/atualizacoes.test.ts`, `__tests__/audio.test.ts`, `__tests__/core.test.ts`, `__tests__/hardware.test.ts`, `__tests__/memes.test.ts`, `__tests__/midia-integracao.test.ts`, `__tests__/musicas-livres.test.ts`, `__tests__/musicas.test.ts`, `__tests__/qualidade-integracao.test.ts`, `__tests__/qualidade.test.ts`, `__tests__/vozes-integracao.test.ts`, `__tests__/vozes.test.ts`, `atualizacoes.ts`, `audio.ts`, `comfyui-install.ts`, `comfyui.ts`, `core.ts`, `hardware.ts`, `memes.ts`, `musicas-livres.ts`, `musicas.ts`, `qualidade.ts`, `vozes.ts`.

### Biblioteca de músicas livres (por estilo)

- Catálogo CC BY 4.0 (Incompetech/Kevin MacLeod), **23 faixas** em **10 estilos**: alegre, epica, tensa, calma, misterio, infantil, jazz, eletronica, triste, corporativo.
- Download sob demanda com validação por ffprobe; créditos gravados em `CREDITOS.json` na pasta de músicas.
- Canais: `midia:musicas-catalogo`, `midia:musicas-baixar`; MCP: `midia_musicas_livres`, `midia_musica_baixar`.

### Ferramentas de áudio (ffmpeg)

- Normalização (`loudnorm I=-16 TP=-1.5 LRA=11`), EQ (graves/agudos), compressor, ganho, fade in/out, corte e conversão (mp3/wav/m4a/ogg).
- Análise de volume via `volumedetect` (média/pico) com sugestão de ganho.
- Canais: `midia:audio-analisar`, `midia:audio-processar`; MCP: `midia_audio`.

### Qualidade de vídeo e imagem (ffmpeg)

- Vídeo: estabilização em 2 passadas (`vidstabdetect`/`vidstabtransform`), denoise (`hqdn3d`), nitidez (`unsharp`), correção de cor (`eq`), escala Lanczos, fps, re-render H.264 com CRF/preset e áudio normalizado (EBU R128).
- Imagem: denoise, nitidez, brilho/contraste/saturação/gamma, reescala Lanczos 1–4× e conversão PNG/JPG.
- Análise de vídeo: resolução, fps, duração, codec, bitrate, áudio e dicas automáticas de ajuste.
- Canais: `midia:video-analisar`, `midia:video-melhorar`, `midia:imagem-qualidade`; MCP: `midia_video_qualidade`, `midia_imagem_qualidade`.

### Portabilidade (instalar em PC novo)

- O instalador embute `ffmpeg.exe`/`ffprobe.exe` (GPL, com vidstab/loudnorm/rubberband) em `resources/bin/win32-x64` via `extraResources`.
- Python portátil (CPython 3.12) com edge-tts, faster-whisper, kokoro-onnx, piper-tts e supertonic em `resources/python` — vozes e transcrição funcionam sem instalar Python no PC.
- `npm run ferramentas` baixa/verifica tudo antes do build; `dist:win`, `dist:all` e `publish:github` já chamam esse passo.
- Diagnóstico em Execução → Ferramentas → "Portabilidade do PC" (canal `diag:portabilidade`, MCP `portabilidade_status`) lista o que está pronto e o que é opcional (Ollama, SDK Android, ComfyUI).
- Agentes externos gratuitos: `agente:externos` / MCP `agentes_externos_status` detectam QCoder (qwen2.5-coder + qc-cli), OpenDevin/OpenHands (WSL) e Trae Agent, com o comando de instalação quando faltam.

### Demais recursos

- Imagem: geração (Pollinations), melhoria, meme, HTML → imagem (captura offscreen).
- Vídeo: foto → vídeo (ComfyUI e variantes), juntar, cortar, capa, legendas, narração.
- Voz: biblioteca pt-BR local, prévia, download de modelos, padrão configurável.
- Música: banco local em `musicas/`, mixagem em vídeo, atualizações de componentes.

## 6. Apps (Android + Windows)

- `npm run apps:setup` instala SDK/JDK/Gradle e dependências; `apps:status` mostra o estado.
- `npm run apps:apk` gera APK debug validado com aapt2; `apps:win` gera instalador/portátil; `apps` faz tudo.
- Artefatos também são copiados para `C:\\Users\\digo8\\OneDrive\\APP`.

Artefatos locais em `dist-apps/`:

  - DG-Apps-0.1.0.apk (4.167 KB)

## 7. MCP

- **70** ferramentas registradas em `src/main/mcp/server.ts`.
- Build: `npm run build:mcp` → `.dg-editor/bin/main/mcp/server.js`; HTTP: `npm run mcp:http`.

<details><summary>Ferramentas</summary>

`agente_executar`, `agente_invocar`, `agente_listar`, `agentes_externos_status`, `apps_build`, `apps_setup`, `apps_status`, `automacao_executar`, `automacao_listar`, `codigo_buscar`, `codigo_editar`, `codigo_ler`, `conector_listar`, `disco_buscar`, `disco_inspecionar`, `dossie_read`, `dossie_snapshot`, `dossie_write`, `ftp_deploy`, `ftp_listar`, `git_diff`, `git_status`, `midia_atualizacoes`, `midia_audio`, `midia_comfy_instalar`, `midia_comfyui_imagem`, `midia_comfyui_status`, `midia_comfyui_video`, `midia_diagrama`, `midia_foto_video`, `midia_fotos_video`, `midia_hardware`, `midia_imagem_gerar`, `midia_imagem_melhorar`, `midia_imagem_qualidade`, `midia_legendas`, `midia_meme_gerar`, `midia_memes_listar`, `midia_memes_sincronizar`, `midia_musica_baixar`, `midia_musica_mixar`, `midia_musicas`, `midia_musicas_livres`, `midia_narrar`, `midia_status`, `midia_transcrever`, `midia_video_capa`, `midia_video_cortar`, `midia_video_juntar`, `midia_video_qualidade`, `midia_vozes_listar`, `navegador_abrir`, `navegador_baixar`, `navegador_clicar`, `navegador_ler`, `navegador_preencher`, `portabilidade_status`, `projeto_arvore`, `projeto_smoke`, `qoder_executar`, `qualidade_checar`, `resultado_avaliar`, `skill_ler`, `skill_listar`, `terminal_exec`, `testes_rodar`, `trae_executar`, `vault_list`, `vault_read`, `vault_write`

</details>

## 8. Skills e agentes

- Skills embutidas: **23** — editar-seguro.md, arvore-projeto.md, navegador-embutido.md, free-mode.md, prompt-melhorar.md, anexos.md, leitor-codigo.md, refatorador.md, testador.md, debugger.md, revisor-seguranca.md, documentador.md, analisador.md, terminal-local.md, inventario-disco.md, estilo-cursor.md, roteiro-shorts.md, thumbnail-design.md, legenda-automatica.md, publicacao-social.md, pacote-memes.md, dublagem-parodia.md, capa-video.md.
- Agentes: **19** — Revisor, Arquiteto, Seguranca, Testador, DG Engenheiro, Hibrido Core, Auto Free, Coder Free, Assist Free, Architect Free, Debugger Free, Reviewer Free, Qoder, Devin (OpenHands), Trae, Roteirista, Thumbnail, Legendas, Publicador.

## 9. Comandos npm

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

## 10. Qualidade (QA)

- Cenários Playwright em `src/qa/cenarios`: **14 arquivos**, **147 verificações**.
- Suites: `qa:ipc`, `qa:e2e`, `qa:perf`, `qa:visual`; relatório: `qa:report`; autocorreção assistida: `qa:ia`.
- Verificações estáticas no build: encoding, sintaxe e contraste.

## 11. Limites e decisões

- Somente ferramentas gratuitas; nenhuma chave paga configurada.
- GPU do ambiente (GT 710, 2 GB) não suporta CUDA — geração local pesada fica desativada; TTS e Whisper rodam em CPU.
- Músicas: o catálogo é royalty-free com atribuição; o banco local não baixa nada sem ação explícita do usuário.
- Editores completos de PDF/DOC/vídeo não são incorporados; o Estúdio cobre utilitários leves (imagem, áudio, vídeo, HTML → imagem).

## 12. Histórico recente

- d076e20 2026-11-13 release: v0.3.1
- 6471e0e 2026-11-13 fix(publicar): empacotar em pasta temporaria e copiar artefatos para OneDrive
- b635c19 2026-11-13 release: v0.3.0 — dossiê automático, músicas livres e ferramentas de áudio
- e3df21b 2026-11-13 feat(mcp-http): servidor MCP HTTP read-only + isolamento de repositorio
- 4f1ec4b 2026-11-12 fix: orquestrador e agente com fallback garantido
- 85a5b9d 2026-11-12 fix: fallback de modelo leve quando Ollama rejeita imagem/visao
- cdbb319 2026-11-12 fix: fila do agent travava sem timeout; fila por workspace; unifica cache; proximoDisponivel usa todos os modelos
- 5b8cf9d 2026-11-12 feat: cache de respostas LLM, pull auto Ollama, filtro agentes invalidos e custo rastreado
- c8354ca 2026-11-12 fix: corrige testes flaky pre-existing (chat.test.ts e contratos.test.ts)
- 81fa3bd 2026-11-12 docs(radar): documenta radar diario e adiciona secao ao .dgrules

## 13. Como atualizar este dossiê

```bash
npm run dossie     # regenera DOSSIE.md
npm run build      # roda automaticamente via postbuild
npm run apps       # gera artefatos e também atualiza o dossiê
```
