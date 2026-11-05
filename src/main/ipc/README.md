# IPC Handlers do DG Editor

Este diretório contém todos os **handlers IPC (Inter-Process Communication)** do DG Editor, responsáveis pela comunicação entre o **main process** (backend Electron) e o **renderer process** (frontend).

## 📁 Estrutura

```
ipc/
├── types.ts          # Interfaces TypeScript para todos os payloads e resultados IPC
├── utils.ts          # Utilitários: validação, error handling, logging
├── index.ts          # Registrador central de todos os handlers
├── arquivos.ts       # Handlers para operações de arquivo (ler, salvar, listar)
├── terminal.ts       # Handlers para terminal embutido
├── navegador.ts      # Handlers para navegador web embutido
├── agent.ts          # Handlers para agentes de IA
├── brain.ts          # Handlers para brain (Ollama, IA)
├── git.ts            # Handlers para Git
├── chat.ts           # Handlers para chat
└── analise.ts        # Handlers para análise de código
```

## 🎯 Visão Geral

O sistema IPC do DG Editor foi **refatorado** para:

1. **Modularização**: Cada domínio (arquivos, terminal, navegador, etc.) tem seu próprio arquivo de handlers
2. **Tipagem Estrita**: Todos os payloads e resultados são tipados via `types.ts`
3. **Error Handling Padronizado**: Utilitários em `utils.ts` garantem tratamento consistente de erros
4. **Registro Centralizado**: `index.ts` registra todos os handlers de forma organizada

## 📋 Arquivos

### `types.ts`

Centraliza **todas as interfaces TypeScript** usadas nos handlers IPC:

- **Payloads**: Objetos de entrada para cada handler (ex: `ArquivoLerPayload`, `TerminalCreatePayload`)
- **Resultados**: Objetos de saída padronizados (ex: `IpcResult<T>`, `ArquivoLerResult`)
- **Eventos**: Tipos para eventos IPC (ex: `TerminalDataEvent`, `ChatDeltaEvent`)

**Exemplo:**
```typescript
// Payload para ler arquivo
interface ArquivoLerPayload {
  caminho: string;
  pastas: string[];
}

// Resultado da leitura
interface ArquivoLerResult extends IpcResult {
  conteudo?: string;
  erro?: string;
}
```

### `utils.ts`

Fornece **utilitários** para os handlers:

- **`safeIpcHandler`**: Wrapper que garante error handling padronizado
- **`validarArquivoPayload`**: Valida e normaliza payloads de arquivo
- **`caminhoSeguro`**: Valida caminhos para prevenir path traversal
- **`criarRegistrador`**: Factory para criar registradores de handlers
- **`getRegistrador`**: Singleton para o registrador global

**Exemplo:**
```typescript
// Handler com error handling automático
export const handleArquivoLer = safeIpcHandler(
  async (caminho: string, pastas: string[]) => {
    const seg = caminhoSeguro(caminho, pastas);
    return await lerArquivo(seg.abs, pastas);
  },
  'arquivo:ler'
);
```

### `index.ts`

**Registrador central** que:

1. Importa todos os módulos de handlers
2. Chamadas `registrarHandlersX()` para cada domínio
3. registra handlers adicionais que não puderam ser extraídos
4. Fornece `setMainWindow()` para compartilhar a janela principal

**Exemplo de uso no `index.ts` principal:**
```typescript
import { registrarTodosHandlers, setMainWindow } from './ipc/index';

// No whenReady()
setMainWindow(mainWindow);
registrarTodosHandlers();
```

### Arquivos de Handlers por Domínio

Cada arquivo segue o padrão:

```typescript
/**
 * Handlers IPC para [domínio]
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// --- Handlers ---
export async function handle[Operacao](
  event: IpcMainInvokeEvent,
  ...args: unknown[]
): Promise<IpcResult> {
  // Validação de args
  // Chamada da função de negócios
  // Error handling
  // Logging
}

// --- Registro ---
export function registrarHandlers[Dominio](): void {
  ipcMain.handle('[canal]', handle[Operacao]);
  dglog('[ipc:[dominio]] handlers registrados');
}
```

## 🔧 Canais IPC

### Arquivos (`arquivos.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `arquivo:ler` | `{caminho, pastas}` | `{ok, conteudo, erro}` | Lê um arquivo |
| `arquivo:ler-base64` | `{caminho, pastas}` | `{ok, conteudo, erro}` | Lê arquivo em base64 |
| `arquivo:salvar` | `{caminho, conteudo, pastas}` | `{ok, erro}` | Salva um arquivo |
| `arquivo:listar` | `{caminho, pastas}` | `{ok, arquivos, erro}` | Lista diretório |
| `arquivo:existe` | `{caminho, pastas}` | `{ok, existe, erro}` | Verifica se arquivo existe |

### Terminal (`terminal.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `terminal:create` | `{id, opts}` | `{ok, id, erro}` | Cria um terminal |
| `terminal:write` | `{id, data}` | `{ok, erro}` | Escreve no terminal |
| `terminal:resize` | `{id, cols, rows}` | `{ok, erro}` | Redimensiona terminal |
| `terminal:kill` | `{id}` | `{ok, erro}` | Mata um terminal |
| `terminal:shell` | - | `{ok, shell, erro}` | Obtém shell ativo |
| `terminal:shells` | - | `{ok, shells, erro}` | Lista shells disponíveis |
| `terminal:getShellPadrao` | - | `{ok, shell, erro}` | Obtém shell padrão |
| `terminal:setShellPadrao` | `{id}` | `{ok, erro}` | Define shell padrão |

**Eventos:**
- `terminal:data` - Dados do terminal `{id, data}`
- `terminal:exit` - Saída do terminal `{id, code}`

### Navegador (`navegador.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `navegador:abrir` | `{url}` | `{ok, erro}` | Abre navegador |
| `navegador:fechar` | - | `{ok, erro}` | Fechar navegador |
| `navegador:embed-status` | - | `{ok, ...status}` | Status do navegador embutido |

**Eventos:**
- `navegador:aberto` - Navegador foi aberto
- `navegador:fechado` - Navegador foi fechado

**Handlers de evento (on):**
- `navegador:bounds` - Define bounds do navegador
- `navegador:mostrar` - Mostra/oculta navegador

### Agente (`agent.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `agente:executar` | `{root, pergunta, opcoes}` | `{ok, texto, modelo, passos, duracaoMs, erro}` | Executa um agente |
| `agente:modelo` | - | `{ok, modelo, erro}` | Obtém modelo do agente |
| `agente:historico` | `{root}` | `{ok, mensagens, erro}` | Obtém histórico do agente |

### Brain (IA) (`brain.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `brain:ask` | `{prompt, context}` | `{ok, text, provider, modelo, erro}` | Pergunta ao brain |
| `brain:providers` | - | `{ok, providers, erro}` | Lista providers disponíveis |
| `brain:ollama-status` | - | `{ok, ativo, url, modelos, erro}` | Status do Ollama |
| `brain:models` | - | `{ok, modelos, erro}` | Lista modelos ativos |
| `brain:avaliar` | `{modeloId}` | `{ok, avaliacao, erro}` | Avalia um modelo |

### Git (`git.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `git:status` | `{raiz}` | `{ok, status, erro}` | Status do Git |
| `git:diff` | `{raiz, caminho}` | `{ok, diff, erro}` | Diff do Git |
| `git:repos` | `{pastas}` | `{ok, repos, erro}` | Lista repositórios |

### Chat (`chat.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `chat:load` | `{root}` | `{ok, mensagens, erro}` | Carrega chat |
| `chat:clear` | `{root}` | `{ok, erro}` | Limpa chat |
| `chat:anexar` | `{payload}` | `{ok, anexo, erro}` | Anexa arquivo ao chat |

**Eventos:**
- `chat:delta` - Delta do chat `{delta, reset}`

### Análise (`analise.ts`)

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `analysis:run` | `{root, force, escopo}` | `{ok, result, erro}` | Executa análise |
| `analysis:choose-scope` | `{mode}` | `{ok, response, erro}` | Dialog de escopo |
| `analysis:cached` | `{root}` | `{ok, result, erro}` | Análise cached |
| `analysis:invalidar` | `{root}` | `{ok, erro}` | Invalida cache |
| `whereis:ask` | `{root, query}` | `{ok, result, formatted, erro}` | Busca whereis |

### Regras

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `rules:exists` | `{root}` | `{ok, existe, erro}` | Verifica se .dgrules existe |
| `rules:read` | `{root}` | `{ok, texto, erro}` | Lê .dgrules |
| `rules:create-template` | `{root}` | `{ok, erro}` | Cria template de regras |
| `rules:write` | `{root, texto}` | `{ok, erro}` | Escreve .dgrules |

## 🛡️ Segurança

### Validação de Payloads

Todos os handlers validam seus payloads usando:

1. **`exigirString`** - Garante que um valor é string não vazio
2. **`exigirArrayStrings`** - Garante que um valor é array de strings
3. **`caminhoSeguro`** - Previne path traversal e garante que caminhos estão dentro da raiz permitida

### Error Handling

O wrapper `safeIpcHandler` garante que:

1. Erros são catchados e não propagam para o renderer
2. Mensagens de erro são padronizadas
3. Erros são logados via `dglog`
4. O resultado sempre tem a estrutura `{ok: boolean, erro?: string, dados?: T}`

### Safe Mode

Em **safe mode**, os handlers que podem executar código perigoso (agentes, MCP) são desativados:

```typescript
if (SAFE_MODE || emSafeMode()) {
  return { ok: false, erro: 'safe-mode' };
}
```

## 📊 Métricas

### Antes da Refatoração
- **`index.ts`**: ~1.590 linhas
- **Complexidade**: Alta (múltiplas responsabilidades)
- **Manutenção**: Difícil (hard to trace, debug difícil)

### Depois da Refatoração
- **`ipc/`**: 11 arquivos, ~700-2.300 linhas cada
- **`index.ts` (novo)**: ~450 linhas (apenas boot e orquestração)
- **Complexidade**: Baixa (separação por domínio)
- **Manutenção**: Fácil (cada arquivo tem uma responsabilidade clara)

## 🔄 Migração

Para usar os novos handlers:

1. **Mantenha** o `index.ts` original como backup
2. **Renomeie** `index-new.ts` para `index.ts`
3. **Teste** todas as funcionalidades
4. **Corrija** quaisquer problemas

## 📝 Notas

- Os handlers foram extraídos do `index.ts` original **sem alterar a lógica de negócios**
- A refatoração focou em **organização de código**, não em mudança de funcionalidade
- Alguns handlers complexos (ex: `chat:send`) ainda precisam ser extraídos completamente
- O sistema de tipos foi **expanso** para cobrir todos os payloads IPC

## 🎯 Próximos Passos

1. **Completar extração**: Mover `chat:send` e outros handlers complexos
2. **Tipagem estrita**: Adicionar mais tipos específicos para cada handler
3. **Testes**: Criar testes unitários para cada módulo de handlers
4. **Documentação**: Adicionar JSDoc para todas as funções públicas
