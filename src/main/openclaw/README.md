# Módulo OpenClaw - DG Editor

> **Integração com OpenClaw para Diffs e Aprovação Humana**
> Versão: 0.2.0 | Status: 🟢 Ativo

## 🎯 Visão Geral

O módulo **OpenClaw** implementa a integração do DG Editor com o **OpenClaw**, um sistema de **diffs e aprovação humana** para mudanças de código geradas por IA.

**Propósito:**
- Permitir que **humanos revisem** mudanças propostas por agentes de IA
- Fornecer um **fluxo de aprovação** seguro
- Integrar com o **ecossistema OpenClaw** (Gateway, HTTP, MCP)

## 📁 Estrutura

```
openclaw/
├── ipc.ts              # Handlers IPC para OpenClaw
├── audit.ts            # Auditoria de mudanças
├── cliente.ts          # Cliente HTTP para OpenClaw Gateway
├── contexto.ts         # Contexto para requisições OpenClaw
├── diffs.ts            # Sistema de diffs
├── hunks.ts            # Gerenciamento de hunks (partes de diffs)
└── secrets.ts          # Gerenciamento de tokens e segredos
```

## 🎭 Conceitos

### 1. OpenClaw Gateway

O **OpenClaw Gateway** é um serviço que:
- Recebe **diffs** do DG Editor
- Armazena para **revisão humana**
- Permite **aprovação/rejeição** via interface web
- Retorna o resultado para o DG Editor

### 2. Diffs

Um **diff** representa uma mudança proposta:
- **Arquivo**: Caminho do arquivo a ser modificado
- **Conteúdo atual**: Versão atual do arquivo
- **Conteúdo proposto**: Versão sugerida pelo agente
- **Hunks**: Partes específicas da mudança
- **Status**: `pendente`, `aprovado`, `rejeitado`

### 3. Hunks

Um **hunk** é uma parte de um diff:
- Representa uma **mudança atômica**
- pode ser **aceito/rejeitado individualmente**
- Faz parte de um diff maior

### 4. Fluxo de Aprovação

```
┌─────────────────────────────────────────────────────────────┐
│                 OPENCLAW APPROVAL FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. AGENTE PROPÕE MUDANÇA                                      │
│     ├── Gera diff entre código atual e proposto               │
│     └── Envia para fila de propostas                           │
│                                                               │
│  2. USUÁRIO REVISA                                             │
│     ├── Visualiza diff no painel OpenClaw                      │
│     ├── Analisa hunks individualmente                          │
│     └── Decide: aprovar, rejeitar ou modificar                 │
│                                                               │
│  3. SISTEMA APLICA                                             │
│     ├── Se aprovado: aplica todas as mudanças                  │
│     ├── Se parcialmente: aplica apenas hunks aprovados        │
│     └── Se rejeitado: descarta todas as mudanças               │
│                                                               │
│  4. CHECKPOINT                                                 │
│     ├── Cria checkpoint antes de aplicar                      │
│     └── Permite desfazer se algo der errado                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Uso

### 1. Configuração

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
OC_MODEL=openclaw/default
OC_TOKEN=seu-token-bearer
```

### 2. Enviar Diff para OpenClaw

```typescript
import { enviarParaOpenClaw } from './openclaw/cliente';

const resposta = await enviarParaOpenClaw({
  diffs: [
    {
      arquivo: 'src/main/index.ts',
      atual: 'código atual...',
      proposto: 'código proposto...',
      hunks: [
        {
          inicio: 10,
          linhas: 5,
          tipo: 'modificado',
          conteudoAtual: 'linhas atuais...',
          conteudoProposto: 'linhas propostas...'
        }
      ]
    }
  ],
  contexto: {
    pedido: 'Adicione validação ao formulário',
    agente: 'free-coder',
    modelo: 'qwen2.5-coder:1.5b'
  }
});

console.log(resposta.id); // ID da requisição no OpenClaw
console.log(resposta.status); // 'pendente' | 'aprovado' | 'rejeitado'
```

### 3. Verificar Status

```typescript
import { verificarStatus } from './openclaw/cliente';

const status = await verificarStatus('id-da-requisicao');
console.log(status.status); // 'aprovado'
console.log(status.aprovadoPor); // 'usuario@email.com'
console.log(status.aprovadoEm); // '2024-01-01T12:00:00Z'
```

### 4. Listar Propostas Pendentes

```typescript
import { listarPendentes } from './openclaw/ipc';

const pendentes = await listarPendentes();
console.log(pendentes.length); // 3
console.log(pendentes[0].id); // 'req_123'
console.log(pendentes[0].arquivos); // ['src/main/index.ts']
```

### 5. Aplicar Proposta Aprovada

```typescript
import { aplicarProposta } from './openclaw/ipc';

const resultado = await aplicarProposta('req_123');
console.log(resultado.ok); // true
console.log(resultado.aplicados); // ['src/main/index.ts']
console.log(resultado.checkpointId); // 'chk_456'
```

### 6. Rejeitar Proposta

```typescript
import { rejeitarProposta } from './openclaw/ipc';

const resultado = await rejeitarProposta('req_123', 'Mudança não compatível');
console.log(resultado.ok); // true
```

## 📥 Handlers IPC

### Configuração

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `openclaw:config-get` | - | `{endpoint, model, hasToken}` | Obtém configuração |
| `openclaw:config-set` | `{endpoint, model, token}` | `{ok}` | Define configuração |

### Token

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `openclaw:token-set` | `{token}` | `{ok}` | Define token |
| `openclaw:token-clear` | - | `{ok}` | Limpa token |
| `openclaw:token-status` | - | `{hasToken, endpoint}` | Status do token |

### Diff

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `openclaw:pedir` | `{diffs, contexto}` | `{ok, id, status}` | Envia diff para OpenClaw |
| `openclaw:pendentes` | - | `{ok, propostas}` | Lista propostas pendentes |
| `openclaw:aplicar` | `{id}` | `{ok, aplicados, checkpointId}` | Aplica uma proposta |
| `openclaw:rejeitar` | `{id, motivo}` | `{ok}` | Rejeita uma proposta |

### Auditoria

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `openclaw:auditoria-listar` | - | `{ok, auditorias}` | Lista auditorias |

## 🎯 Integração com Agentes

Os agentes do DG Editor podem usar OpenClaw para **aprovação humana**:

```typescript
import { executarAgente } from './brain/agent';
import { enviarParaOpenClaw } from './openclaw/cliente';

// 1. Agente gera propostas
const resultado = await executarAgente(
  raizProjeto,
  'Refatore o módulo de autenticação',
  {
    agente: 'engenheiro',
    proposeWrites: true
  }
);

// 2. Enviar propostas para OpenClaw
if (resultado.propostas && resultado.propostas.length > 0) {
  const resposta = await enviarParaOpenClaw({
    diffs: resultado.propostas,
    contexto: {
      pedido: 'Refatore o módulo de autenticação',
      agente: 'engenheiro',
      modelo: resultado.modelo
    }
  });
  
  // 3. Aguardar aprovação
  const status = await aguardarAprovacao(resposta.id);
  
  // 4. Aplicar se aprovado
  if (status.aprovado) {
    await aplicarProposta(resposta.id);
  }
}
```

## 🔄 Fluxo de Integração

```
┌─────────────────────────────────────────────────────────────┐
│              DG EDITOR + OPENCLAW INTEGRATION                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  DG EDITOR                          OPENCLAW GATEWAY            │
│  ───────────                          ───────────────            │
│                                                               │
│  1. AGENTE EXECUTA                                             │
│     [Agent Module]─────┐                                       │
│                         │                                       │
│                         ▼                                       │
│  2. PROPOSTAS GERADAS                                          │
│     [Propostas Module]──┐                                      │
│                         │                                       │
│                         ▼                                       │
│  3. ENVIAR PARA OPENCLAW                                       │
│     [OpenClaw Client]───HTTP POST──▶ [Gateway]                  │
│                         │              │                         │
│                         │              ▼                         │
│  4. SALVAR E NOTIFICAR                                         │
│     [Gateway]──────────┐              │                         │
│                         │              │                         │
│                         ▼              ▼                         │
│  5. USUÁRIO REVISA       [BD OpenClaw] ◄──────── [Gateway]      │
│     [Interface Web]─────────────────────────────────────────▶│
│                         │                                       │
│                         ▼                                       │
│  6. DECISÃO (Aprovar/Rejeitar)                                  │
│     [Interface Web]─────┐                                       │
│                         │                                       │
│                         ▼                                       │
│  7. NOTIFICAR DG EDITOR                                        │
│     [Gateway]──────────HTTP GET──▶ [OpenClaw Client]           │
│                         │                                       │
│                         ▼                                       │
│  8. APLICAR MUDANÇAS                                            │
│     [OpenClaw IPC]──────▶ [Propostas Module]                    │
│                         │                                       │
│                         ▼                                       │
│  9. CHECKPOINT                                                  │
│     [Checkpoint Module]───────────────────────────────────────│
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🛡️ Segurança

### 1. Validação de Diffs

Todos os diffs são validados antes de serem enviados:

```typescript
function validarDiff(diff: Diff): boolean {
  // Verificar se arquivo existe
  if (!fs.existsSync(diff.arquivo)) {
    throw new Error(`Arquivo não existe: ${diff.arquivo}`);
  }
  
  // Verificar se caminho é seguro
  const seg = caminhoSeguro(diff.arquivo, raizProjeto);
  if (!seg.ok) {
    throw new Error(`Caminho inválido: ${diff.arquivo}`);
  }
  
  // Verificar se conteúdo é válido
  if (diff.atual.length === 0 || diff.proposto.length === 0) {
    throw new Error('Conteúdo vazio');
  }
  
  return true;
}
```

### 2. Token Management

O token é armazenado de forma segura:

```typescript
import { salvarToken, lerToken, limparToken } from './openclaw/secrets';

// Salvar token (criptografado)
await salvarToken(token, 'openclaw');

// Ler token
await lerToken('openclaw');

// Limpar token
await limparToken('openclaw');
```

**Observação:** No momento, o token é armazenado em texto plano em `localStorage` do renderer. Para produção, deve ser usado um **keystore** seguro.

### 3. HTTPS Recomendado

Para produção, **sempre use HTTPS**:

```typescript
const endpoint = process.env.NODE_ENV === 'production'
  ? 'https://gateway.openclaw.ai'
  : 'http://127.0.0.1:18789';
```

## 📊 Métricas

| Métrica | Valor |
|---------|-------|
| Handlers IPC | 8 |
| Endpoints HTTP | 4 |
| Tamanho do módulo | ~1.500 linhas |
| Tempo médio de resposta | 500ms-2s |

## 🎯 Integração com MCP

O OpenClaw pode ser usado via **MCP (Model Context Protocol)**:

```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client';

const client = new McpClient({
  name: 'openclaw-mcp',
  url: 'http://127.0.0.1:18789/mcp'
});

// Chamar tool do OpenClaw
await client.callTool('openclaw.pedir', {
  diffs: [...],
  contexto: {...}
});
```

## 📚 Documentação Relacionada

- [Agent Module](../agent/README.md) - Agentes Autônomos
- [IPC Handlers](../ipc/README.md) - Handlers IPC
- [Brain Module](../brain/README.md) - Módulo de IA

## 🔗 Links Úteis

- [OpenClaw](https://openclaw.ai) - Sistema de aprovação humana
- [OpenClaw Gateway](https://github.com/openclaw-ai/gateway) - Gateway HTTP
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP
