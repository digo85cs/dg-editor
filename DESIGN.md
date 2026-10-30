# DG Editor — Design System (Opção B / IDE)

**Idioma padrão: pt-BR.** UI, docs, commits e respostas ao usuário em português do Brasil.

## Paleta (hexes preservados)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-principal` | `#f7f7f7` | `#1a1a1a` |
| `--bg-sidebar` | `#f2f2f2` | `#151515` |
| `--bg-painel` | `#ffffff` | `#1f1f1f` |
| `--bg-ativo` | `#a8e0d0` | `#2d5a4d` |
| `--bg-hover` | `#e8e8e8` | `#2a2a2a` |
| `--texto-primario` | `#222222` | `#f2f2f2` |
| `--texto-secundario` | `#6b6b6b` | `#bdbdbd` |
| `--texto-fraco` | `#aaaaaa` | `#a0a0a0` |
| `--verde-status` | `#00a884` | `#2dd4a0` |
| `--vermelho-erro` | `#d9534f` | `#d9534f` |
| `--borda` / tenue | `#d8d8d8` / `#e4e4e4` | `#333333` / `#2a2a2a` |

Marca: `#00b894`. Close: `#d13438`. Espelhos `--dg-*` apontam para os legados.

Contraste AA: em light, `--texto-fraco` (#aaaaaa) falha 4.5:1; só `--dg-text-faint` usa `--texto-secundario`. Hex legado intacto.

## Tipografia e espaço

- UI: system / Segoe UI · Mono: Cascadia Code + Consolas
- Escala: 11 / 12 / 13 / 15 / 18 (`--dg-fs-*`)
- Espaço base 4px (`--dg-space-1`…`8`) · raios 6 / 8 / 12

## Layout IDE

Activity 56px · Sidebar 260px (200–500) · Editor flex · Painel 380px (320–600).  
Titlebar 38px. Abas 36px. Divisores 4px, persistidos em `dg-layout`.

**Fio de corrente:** barra de acento 2px na activity bar (ícone ativo) e no topo da aba ativa — mesma cor (`--dg-accent`) e espessura.

## Editor: CodeMirror 6

Escolhido em vez de Monaco: ESM nativo, offline, sem workers extras sob `contextIsolation` no Electron 33; electron-vite empacota os módulos; bundle menor. Monaco exigiria config de workers/AMD e risco de falha no preload isolado.

Suporta highlight, gutters, dirty, Ctrl+S/F, busca (`@codemirror/search`).

## Regras de uso

1. Não alterar hexes dark/light legados.  
2. Preferir `--dg-*` em CSS novo.  
3. Acento = `--verde-status` + marca `#00b894`.  
4. Sem CDN, sem React/Vue/Tailwind.  
5. IPC de arquivo só com validação `relative` + `isAbsolute`.
