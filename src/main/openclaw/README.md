# Modulo OpenClaw - DG Editor

> **Integracao com OpenClaw para Diffs e Aprovacao Humana**
> Versao: 0.2.0 | Status: Ativo

## Visao Geral

O modulo **OpenClaw** implementa a integracao do DG Editor com o **OpenClaw**, um sistema de **diffs e aprovacao humana** para mudancas de codigo geradas por IA.

**Proposito:**
- Permitir que **humanos revisem** mudancas propostas por agentes de IA
- Fornecer um **fluxo de aprovacao** seguro
- Integrar com o **ecossistema OpenClaw** (Gateway, HTTP, MCP)

## Estrutura

```
openclaw/
├── ipc.ts              # Handlers IPC para OpenClaw
├── audit.ts            # Auditoria de mudancas
├── cliente.ts          # Cliente HTTP para OpenClaw Gateway
├── contexto.ts         # Contexto para requisicoes OpenClaw
├── diffs.ts            # Sistema de diffs
├── hunks.ts            # Gerenciamento de hunks (partes de diffs)
└── secrets.ts          # Gerenciamento de tokens e segredos
```

## Conceitos

### 1. OpenClaw Gateway

O **OpenClaw Gateway** e um servico que:
- Recebe **diffs** do DG Editor
- Armazena para **revisao humana**
- Permite **aprovacao/rejeicao** via interface web
- Retorna o resultado para o DG Editor

### 2. Diffs

Um **diff** representa uma mudanca proposta:
- **Arquivo**: Caminho do arquivo a ser modificado
- **Conteudo atual**: Versao atual do arquivo
- **Conteudo proposto**: Versao sugerida pelo agente
- **Hunks**: Partes especificas da mudanca
- **Status**: `pendente`, `aprovado`, `rejeitado`

### 3. Hunks

Um **hunk** e uma parte de um diff:
- Representa uma **mudanca atomica**
- Pode ser **aceito/rejeitado individualmente**
- Faz parte de um diff maior

### 4. Fluxo de Aprovacao

```
┌─────────────────────────────────────────────────────────────┐
│                 OPENCLAW APPROVAL FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. AGENTE PROPOE MUDANCA                                      │
│     ├── Gera diff entre codigo atual e proposto               │
│     └── Envia para fila de propostas                           │
│                                                               │
│  2. USUARIO REVISA                                             │
│     ├── Visualiza diff no painel OpenClaw                      │
│     ├── Analisa hunks individualmente                          │
│     └── Decide: aprovar, rejeitar ou modificar                 │
│                                                               │
│  3. SISTEMA APLICA                                             │
│     ├── Se aprovado: aplica todas as mudancas                  │
│     ├── Se parcialmente: aplica apenas hunks aprovados        │
│     └── Se rejeitado: descarta todas as mudancas               │
│                                                               │
│  4. CHECKPOINT                                                 │
│     ├── Cria checkpoint antes de aplicar                      │
│     └── Permite desfazer se algo der errado                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Uso

### 1. Configuracao

Configure o endpoint e token do OpenClaw:

```typescript
import { configurarOpenClaw } from './openclaw/ipc';

await configurarOpenClaw({
  endpoint: 'http://127.0.0.1:18789',
  model: 'openclaw/default',
  token: 'seu-token-bearer'
});
```

Ou via ambiente:
```bash
OC_ENDPOINT=http://127.0.0.1:18789
OC_TOKEN=seu-token-bearer
OC_MODEL=openclaw/default
```

### 2. Status do Token

```typescript
import { getOpenClawTokenStatus } from './openclaw/ipc';

const status = await getOpenClawTokenStatus();
console.log(status); // { ok: true, status: 'valido' }
```

### 3. Enviar Diff para Aprovacao

```typescript
import { enviarParaAprovacao } from './openclaw/cliente';

const diff = {
  arquivo: 'src/services/user.ts',
  atual: 'export const getUser = () => {...}',
  proposto: 'export const getUser = async () => {...}',
  hunks: [
    {
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
      oldLines: ['export const getUser = () => {...}'],
      newLines: ['export const getUser = async () => {...}']
    }
  ]
};

const resultado = await enviarParaAprovacao(diff, {
  contexto: 'Adicionar async para chamadas API'
});

console.log(resultado.id); // ID da solicitacao
console.log(resultado.url); // URL para revisao
```

### 4. Verificar Status do Diff

```typescript
import { verificarStatusDiff } from './openclaw/cliente';

const status = await verificarStatusDiff(idDaSolicitacao);
console.log(status.status); // 'pendente', 'aprovado', 'rejeitado'
```

### 5. Aplicar Mudancas Aprovadas

```typescript
import { aplicarDiffAprovado } from './openclaw/diffs';

const aplicado = await aplicarDiffAprovado(idDaSolicitacao);
console.log(aplicado.ok); // true/false
```

## Handler IPC

O modulo OpenClaw expoe os seguintes handlers IPC:

| Canal | Descricao | Retorno |
|-------|-----------|---------|
| `openclaw:config` | Configura OpenClaw | `{ ok, mensaje }` |
| `openclaw:token-status` | Status do token | `{ ok, status }` |
| `openclaw:enviar-diff` | Envia diff para aprovacao | `{ ok, id, url }` |
| `openclaw:verificar-status` | Verifica status do diff | `{ ok, status }` |
| `openclaw:listar` | Lista diffs pendentes | `{ ok, diffs }` |
| `openclaw:aplicar` | Aplica diff aprovado | `{ ok, aplicado }` |

## Cliente HTTP

O cliente HTTP para OpenClaw Gateway:

```typescript
import { OpenClawClient } from './openclaw/cliente';

const client = new OpenClawClient({
  endpoint: 'http://127.0.0.1:18789',
  token: 'seu-token',
  model: 'openclaw/default'
});

// Enviar diff
const response = await client.sendDiff(diff, contexto);

// Verificar status
const status = await client.getStatus(id);

// Listar diffs
const diffs = await client.listDiffs();

// Cancelar diff
const canceled = await client.cancelDiff(id);
```

## Sistema de Diffs

Gerenciamento de diffs local:

```typescript
import { criarDiff, aplicarDiff, reverterDiff } from './openclaw/diffs';

// Criar diff
const diff = criarDiff({
  arquivo: 'src/index.ts',
  atual: conteudoAtual,
  proposto: conteudoProposto
});

// Aplicar diff
const aplicado = aplicarDiff(diff);

// Reverter diff
const revertido = reverterDiff(diff);
```

## Hunks

Trabalhando com hunks:

```typescript
import { criarHunk, aplicarHunk, reverterHunk } from './openclaw/hunks';

// Criar hunk
const hunk = criarHunk({
  oldStart: 10,
  oldCount: 5,
  newStart: 10,
  newCount: 5,
  oldLines: ['linha 10', 'linha 11', 'linha 12', 'linha 13', 'linha 14'],
  newLines: ['nova 10', 'nova 11', 'nova 12', 'nova 13', 'nova 14']
});

// Aplicar hunk
const aplicado = aplicarHunk(arquivo, hunk);

// Reverter hunk
const revertido = reverterHunk(arquivo, hunk);
```

## Contexto

Contexto para requisicoes OpenClaw:

```typescript
import { criarContexto } from './openclaw/contexto';

const contexto = criarContexto({
  raizProjeto: '/path/to/project',
  arquivoAtual: 'src/index.ts',
  linguagem: 'typescript',
  objetivo: 'Adicionar validacao de entrada',
  restricoes: ['Nao quebrar testes existentes', 'Manter compatibilidade']
});
```

## Auditoria

Auditoria de mudancas OpenClaw:

```typescript
import { auditarMudanca, registrarAprovacao } from './openclaw/audit';

// Auditar mudanca
const auditoria = auditarMudanca({
  tipo: 'diff',
  arquivo: 'src/index.ts',
  mudancas: [...],
  usuario: 'rodrigo'
});

// Registrar aprovacao
const registrada = registrarAprovacao({
  id: 'diff-123',
  status: 'aprovado',
  aprovador: 'rodrigo',
  timestamp: Date.now()
});
```

## Segredos

Gerenciamento de tokens e segredos:

```typescript
import { salvarToken, lerToken, removerToken } from './openclaw/secrets';

// Salvar token
salvarToken('openclaw', 'seu-token-bearer');

// Ler token
const token = lerToken('openclaw');

// Remover token
removerToken('openclaw');
```

## Integracao com MCP

Integracao com Model Context Protocol:

```typescript
import { registerOpenClawMcp } from './openclaw/mcp';

// Registrar tools MCP
registerOpenClawMcp({
  endpoint: 'http://127.0.0.1:18789',
  token: 'seu-token'
});
```

## Fluxo Completo de Uso

### 1. Agente Gera Mudanca

```typescript
import { executarAgente } from './brain/agent';

const { texto: codigoProposto } = await executarAgente(
  '/path/to/project',
  'Adicione validacao de email'
);
```

### 2. Criar Diff

```typescript
import { criarDiff } from './openclaw/diffs';
import { lerArquivo } from './arquivos';

const atual = await lerArquivo('src/services/user.ts');
const diff = criarDiff({
  arquivo: 'src/services/user.ts',
  atual,
  proposto: codigoProposto
});
```

### 3. Enviar para OpenClaw

```typescript
import { enviarParaAprovacao } from './openclaw/cliente';

const { id, url } = await enviarParaAprovacao(diff, {
  contexto: 'Validacao de email no servico de usuarios'
});

// Abrir navegador para revisao
import { shell } from 'electron';
await shell.openExternal(url);
```

### 4. Verificar e Aplicar

```typescript
import { verificarStatusDiff, aplicarDiffAprovado } from './openclaw/cliente';

// Polling para verificar status
let status = await verificarStatusDiff(id);
while (status.status === 'pendente') {
  await new Promise(resolve => setTimeout(resolve, 5000));
  status = await verificarStatusDiff(id);
}

// Se aprovado, aplicar
if (status.status === 'aprovado') {
  await aplicarDiffAprovado(id);
}
```

## Configuracoes

```typescript
export const OPENCLAW_CONFIG = {
  // Endpoint padrao
  endpoint: process.env.OC_ENDPOINT || 'http://127.0.0.1:18789',
  
  // Modelo padrao
  model: process.env.OC_MODEL || 'openclaw/default',
  
  // Token
  token: process.env.OC_TOKEN,
  
  // Timeout
  timeoutMs: 120000,
  
  // Retries
  maxRetries: 3
};
```

## Seguranca

- Todos os tokens sao armazenados de forma segura
- Diffs sao validados antes de serem aplicados
- Checkpoints sao criados antes de aplicar mudancas
- Log de todas as operacoes para auditoria

## Depuracao

### Logs

```bash
# Ver logs do OpenClaw
cat /path/to/.dg-editor/logs/openclaw.log
```

### Debug Mode

```typescript
process.env.OPENCLAW_DEBUG = '1';
process.env.OPENCLAW_VERBOSE = '1';
```

## Testes

### Teste Basico

```typescript
import { criarDiff, aplicarDiff } from './openclaw/diffs';

const diff = criarDiff({
  arquivo: 'teste.txt',
  atual: 'conteudo atual',
  proposto: 'conteudo proposto'
});

const aplicado = aplicarDiff(diff);
console.assert(aplicado.ok, 'Diff nao aplicado');
```

### Teste de Integracao

```typescript
import { OpenClawClient } from './openclaw/cliente';

const client = new OpenClawClient({
  endpoint: 'http://127.0.0.1:18789',
  token: 'test-token'
});

const status = await client.getStatus('test-id');
console.assert(status !== null, 'Nao retornou status');
```

## Roadmap

- [x] Cliente HTTP para OpenClaw Gateway
- [x] Sistema de diffs
- [x] Gerenciamento de hunks
- [x] Integracao IPC
- [x] Auditoria de mudancas
- [x] Gerenciamento de tokens
- [ ] Integracao MCP completa
- [ ] Interface web para revisao
- [ ] Aprovacao em lote
- [ ] Historico de mudancas

## Contribuindo

Para adicionar uma nova funcionalidade:

1. Crie um arquivo no diretorio `openclaw/`
2. Implemente a funcao
3. Adicione testes
4. Documentacao

## Versao

- **Versao**: 0.2.0
- **Data**: Novembro de 2024
- **Autor**: Rodrigo Soares
- **Licenca**: MIT
