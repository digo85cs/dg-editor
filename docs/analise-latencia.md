# Latência da análise — decisão registrada em 03/11/2026

## Hardware medido
- GPU: NVIDIA GeForce GT 710, 2 GB VRAM, driver 475.14, CUDA 11.4
- Ollama executa modelos > 2 GB integralmente em CPU nesta máquina
- Modelos instalados: qwen2.5-coder:14b (9 GB), 7b (4.7 GB), 3b (1.9 GB), 1.5b (986 MB)

## Medições da análise por escopo
- Análise rápida, primeira execução: 162.155 ms, context.length=13.462, 42% de 8192 tokens
- Análise rápida, segunda execução (cache): 6 ms internos / 112 ms com IPC
- Análise completa, primeira execução: timeout em 180.000 ms, context.length=19.000, 59% de 8192 tokens

## Diagnóstico
O contexto foi reduzido de 29.834 para 13.462 caracteres (42%). O modelo selecionado é a 3b.
A latência permanece alta porque a inferência em CPU na GT 710 produz ~2-3 tokens/s. Uma saída
de 300-400 tokens leva 150-200 s independentemente do tamanho do contexto.

## Decisão
A análise por escopo foi adotada (modo rápido padrão e completo sob demanda). O cache por escopo
elimina o custo recorrente em todas as execuções subsequentes. A lentidão da primeira execução é
aceita como característica do hardware, não como defeito.

## Caminhos não escolhidos
- Streaming com progresso: melhora a percepção, não reduz o tempo. Complexidade alta.
- Análise por diretório selecionado: reduz contexto adicionalmente; não implementado nesta rodada.
- Trocar para modelos menores que 3b: reduz tempo, degrada qualidade estrutural do relatório.

## Bundle do renderer — investigado e encerrado em 03/11/2026

Investigacao: o build emite warning de chunking com assets/index-*.js em
1.814,90 kB. Foi tentado manualChunks em electron-vite.config.ts apontando
para monaco-editor, xterm, openai, anthropic e google. Nenhum desses pacotes
existe no projeto. O manualChunks nao criou chunk algum e o bundle nao caiu.
O commit resultante (142deb7) foi revertido (8eb78c8).

Diagnostico real: o peso e @codemirror/* com 15 modulos, incluindo 7
gramaticas de linguagem (javascript, json, html, css, markdown, python, xml).
Em src/renderer/app.js linha 2, criarEditor e importado estaticamente de
./editor-cm.js, que por sua vez importa todo @codemirror no topo. Como o
app.js roda no boot do renderer, o CodeMirror entra no bundle inicial.

Decisao: nenhuma alteracao de build nesta rodada. Chunking sem dynamic
import apenas distribui o bundle em arquivos, mantendo todos no boot.
O ganho real exigiria dynamic import de ./editor-cm.js, o que muda o fluxo
de inicializacao e nao o build. Como o Editor e a tela principal do app,
o CodeMirror carregaria de qualquer forma logo apos o boot, tornando o
ganho imperceptivel na pratica.

Caminho registrado para o futuro: se o boot of DG Editor virar problema
percebido, a acao e dynamic import de ./editor-cm.js dentro da funcao que
cria o editor, nao manualChunks.

Warning of build: aceito como esperado. Nao e regressao.
