# IPC Handlers do DG Editor

Este diretorio contem todos os **handlers IPC (Inter-Process Communication)** do DG Editor, responsaveis pela comunicacao entre o **main process** (backend Electron) e o **renderer process** (frontend).

## Estrutura

```
ipc/
├── types.ts           # Interfaces TypeScript para todos os payloads e resultados IPC
├── utils.ts           # Utilitarios: validacao, error handling, logging
├── index.ts           # Registrador central de todos os handlers
├── arquivos.ts        # Handlers para operacoes de arquivo (ler, salvar, listar)
├── terminal.ts        # Handlers para terminal embutido
├── navegador.ts       # Handlers para navegador web embutido
├── agent.ts           # Handlers para agentes de IA
├── brain.ts           # Handlers para brain (Ollama, IA)
├── git.ts             # Handlers para Git
├── chat.ts            # Handlers para chat
├── analise.ts         # Handlers para analise de codigo
├── folder.ts          # Handlers para pasta (scan, format-summary, select)
├── app.ts             # Handlers para aplicacao (raiz-projeto, quit)
├── app-extra.ts       # Handlers para aplicacao (is-safe-mode)
├── system.ts          # Handlers para sistema (get-profile, profile-strength)
├── auth.ts            # Handlers para autenticacao (get-state, ensure-identity, logout)
├── accounts.ts        # Handlers para contas
├── guardian.ts        # Handlers para guardian (snapshot, resumo)
├── tema.ts            # Handlers para tema (get, set)
├── dossie.ts          # Handlers para dossie (ler, gravar, snapshot, caminho)
├── adapta.ts          # Handlers para Adapta (status, gerar, ler-continuidade, abrir)
├── diagnostico.ts     # Handlers para diagnostico (rodar)
├── janela.ts          # Handlers para janela (minimizar, maximizar, fechar, etc.)
├── auditoria.ts       # Handlers para auditoria (rodar, periodica)
├── hibrido.ts         # Handlers para hibrido (analisar, executar)
├── mcp.ts             # Handlers para MCP (tools, status)
├── editor.ts          # Handlers para editor (completar)
├── memoria.ts         # Handlers para memoria (listar, propor, decidir, status, indexar)
├── skills.ts          # Handlers para skills (listar)
├── qa.ts              # Handlers para QA (run)
├── modelos.ts         # Handlers para modelos (listar, recarregar, para-tarefa, versoes-remotas)
├── indice.ts          # Handlers para indice (iniciar, criar, listar, status)
├── regras-gerais.ts   # Handlers para regras gerais
├── chat-extra.ts      # Handlers para chat (send)
└── README.md           # Este arquivo de documentacao
```

## Visao Geral

O sistema IPC do DG Editor foi **refatorado** para:

1. **Modularizacao**: Cada dominio (arquivos, terminal, navegador, etc.) tem seu proprio arquivo de handlers
2. **Tipagem Estrita**: Todos os payloads e resultados sao tipados via `types.ts`
3. **Error Handling Padronizado**: Utilitarios em `utils.ts` garantem tratamento consistente de erros
4. **Registro Centralizado**: `index.ts` registra todos os handlers de forma organizada

## Arquivos

### `types.ts`

Centraliza **todas as interfaces TypeScript** usadas nos handlers IPC:

- **Payloads**: Objetos de entrada para cada handler (ex: `ArquivoLerPayload`, `TerminalCreatePayload`)
- **Resultados**: Objetos de saida padronizados (ex: `IpcResult<T>`, `ArquivoLerResult`)
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

Fornece **utilitarios** para os handlers:

- **`safeIpcHandler`**: Wrapper que garante error handling padronizado
- **`validarArquivoPayload`**: Valida e normaliza payloads de arquivo
- **`caminhoSeguro`**: Valida caminhos para prevenir path traversal
- **`criarRegistrador`**: Factory para criar registradores de handlers
- **`getRegistrador`**: Singleton para o registrador global

**Exemplo:**
```typescript
// Handler com error handling automatico
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

1. Importa todos os modulos de handlers
2. Chama `registrarHandlersX()` para cada dominio
3. Registra handlers adicionais que nao puderam ser extraidos
4. Fornece `setMainWindow()` para compartilhar a janela principal

**Exemplo de uso no `index.ts` principal:**
```typescript
import { registrarTodosHandlers, setMainWindow } from './ipc/index';

// No whenReady()
setMainWindow(mainWindow);
registrarTodosHandlers();
```

### Arquivos de Handlers por Dominio

Cada arquivo segue o padrao:

```typescript
// ==========================================================================
// HANDLERS DE [DOMINIO]
// ==========================================================================

export async function handle[Dominio][Acao](...): Promise<IpcResult> {
  // Validacao de payloads
  // Chamada para funcoes do dominio
  // Retorno padronizado
}

// ==========================================================================
// FUNCAO DE REGISTRO
// ==========================================================================

export function registrarHandlers[Dominio](): void {
  ipcMain.handle('dominio:acao1', handle[Dominio]Acao1);
  ipcMain.handle('dominio:acao2', handle[Dominio]Acao2);
}
```

## Handlers por Dominio

### Arquivos (`arquivos.ts`)

- `arquivo:ler` - Le arquivo com validacao de caminho
- `arquivo:ler-base64` - Le arquivo em base64
- `arquivo:salvar` - Salva arquivo com validacao
- `arquivo:listar` - Lista diretorios
- `arquivo:existe` - Verifica existencia de arquivo

### Terminal (`terminal.ts`)

- `terminal:create` - Cria novo terminal
- `terminal:write` - Escreve no terminal
- `terminal:resize` - Redimensiona terminal
- `terminal:kill` - Fecha terminal
- `terminal:shell` - Obtem shell ativo
- `terminal:shells` - Lista shells disponiveis
- `terminal:getShellPadrao` - Obtem shell padrao
- `terminal:setShellPadrao` - Define shell padrao

### Navegador (`navegador.ts`)

- `navegador:abrir` - Abre navegador embutido
- `navegador:embed-status` - Status do navegador embutido
- `navegador:fechar` - Fecha navegador
- `navegador:bounds` - Define bounds do navegador
- `navegador:mostrar` - Mostra/oculta navegador

### Agente (`agent.ts`)

- `agente:executar` - Executa agente de IA
- `agente:modelo` - Obtem modelo do agente
- `agente:historico` - Obtem historico do agente

### Brain (`brain.ts`)

- `brain:ask` - Pergunta ao brain
- `brain:providers` - Lista providers disponiveis
- `brain:ollama-status` - Status do Ollama
- `brain:models` - Lista modelos ativos
- `brain:avaliar` - Avalia modelo

### Git (`git.ts`)

- `git:status` - Status do repositorio Git
- `git:diff` - Diff entre arquivos
- `git:repos` - Lista repositorios Git

### Chat (`chat.ts`)

- `chat:load` - Carrega historico de chat
- `chat:clear` - Limpa chat
- `chat:anexar` - Anexa arquivo ao chat

### Analise (`analise.ts`)

- `analysis:run` - Executa analise de codigo
- `analysis:choose-scope` - Escolhe escopo de analise (dialog)
- `analysis:cached` - Obtem analise cached
- `analysis:invalidar` - Invalida cache de analise
- `whereis:ask` - Busca onde uma funcao/variavel esta definida
- `rules:exists` - Verifica existencia de regras
- `rules:read` - Le regras
- `rules:create-template` - Cria template de regras
- `rules:write` - Escreve regras

## Padroes de Seguranca

Todos os handlers seguem os padroes de seguranca:

1. **Validacao de entrada**: Todos os payloads sao validados com `exigirString`, `exigirBoolean`, etc.
2. **Validacao de caminhos**: Todos os caminhos sao validados com `caminhoSeguro` para prevenir path traversal
3. **Error handling**: Todos os handlers tem try/catch e retornam erros padronizados
4. **Logging**: Todos os erros sao logados com `dglog`

## Exemplo de Handler

```typescript
import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

export async function handleArquivoLer(
  _event: Electron.IpcMainInvokeEvent,
  caminho: unknown,
  pastas: unknown
): Promise<IpcResult & { conteudo?: string }> {
  // 1. Validar entrada
  const c = exigirString(caminho, 'caminho');
  if (isErroPayload(c)) return { ok: false, erro: c.erro };

  const p = exigirArrayStrings(pastas, 'pastas');
  if (isErroPayload(p)) return { ok: false, erro: p.erro };

  // 2. Validar caminho
  const seg = caminhoSeguro(c, p);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  // 3. Executar operacao
  try {
    const { lerArquivo } = await import('../arquivos');
    const result = await lerArquivo(seg.abs, p);
    return { ok: true, conteudo: result.conteudo };
  } catch (e) {
    dglog(`[arquivo:ler] erro: ${String(e)}`);
    return { ok: false, erro: String(e) };
  }
}
```

## Registro de Handlers

Os handlers sao registrados no `index.ts` principal do main process:

```typescript
import { registrarTodosHandlers, setMainWindow } from './ipc/index';

app.whenReady().then(() => {
  createWindow();
  
  // Registrar todos os handlers IPC
  setMainWindow(mainWindow);
  registrarTodosHandlers();
});
```

## Versao

Este documento se refere a versao refatorada do sistema IPC.
- **Versao**: 0.2.1
- **Data**: Novembro de 2024
- **Status**: Em desenvolvimento
