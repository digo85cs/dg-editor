# brain/indice.ts — índice de símbolos

## O que é

`src/main/brain/indice.ts` monta um índice de símbolos do código do projeto
via **TypeScript Compiler API** (funções, classes, interfaces, types, consts e
referências). Não é código morto e **não** deve ser removido nem movido.

## Quem importa

- `src/main/mcp/server.ts` — importa `buscarSimbolos` e `lerSimbolo` de
  `../brain/indice` e expõe tools MCP de busca/leitura de símbolos.

Verificação rápida:

```bash
rg "buscarSimbolos|lerSimbolo|brain/indice" src/main/mcp/server.ts
```

## Quem consome

| Consumidor | Uso |
|------------|-----|
| MCP server (`src/main/mcp/server.ts`) | Busca e leitura de símbolos em runtime |
| `scripts/gerar-indice.cjs` | Compila o módulo e gera o artefato JSON |

## Pipeline (fora do electron-vite)

O índice **não** entra no bundle `out/main/` do electron-vite. Isso é esperado.

Ele é compilado pelo pipeline **`build:mcp`** (`tsconfig` separado em
`src/main/mcp/`), que emite para `.dg-editor/bin/main/brain/indice.js`.

## Artefato

- Arquivo gerado: `.dg-editor/indice-codigo.json`
- Regenerar: `npm run indice` (chama `scripts/gerar-indice.cjs`)

## Como verificar que está vivo

1. Confirmar o import no MCP: `src/main/mcp/server.ts` linha com
   `from '../brain/indice'`.
2. Rodar `npm run build:mcp` e `npm run indice` sem erro.
3. Confirmar existência de `.dg-editor/indice-codigo.json` após `npm run indice`.
