---
name: legenda-automatica
description: Legenda automatica (Gatilhos: legenda, srt, transcricao, subtitulo)
---

# Legenda automatica

## Quando usar
Pedido de legenda, transcricao, arquivo .srt ou subtitulo para video/audio.

## Procedimento
1. Transcreva com a tool de transcricao (faster-whisper local ou provider configurado).
2. Revise nomes proprios, numeros e termos tecnicos — corrija erros evidentes de transcricao.
3. Quebre as falas em linhas de ate 2 por tela, com duracao legivel (minimo ~1s por legenda).
4. Posicione a legenda abaixo da area segura (sem cobrir rostos nem legendas queimadas existentes).
5. Preserve o audio original do video.
6. Entregue o arquivo .srt (e o video legendado, se pedido) com os caminhos reais.

## Criterio de sucesso
- O .srt existe, esta sincronizado com o audio e abre em players comuns.
- A legagem queimada (se feita) fica na area segura e legivel.

## O que NAO fazer
- Nao entregar transcricao crua sem revisao de nomes proprios.
- Nao queimar legenda por cima de texto existente sem avisar.
- Nao prometer precisao perfeita — indique trechos incertos para revisao.
