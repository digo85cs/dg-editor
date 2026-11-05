# Módulo Agent - DG Editor

> **Agentes Autônomos com IA Local**
> Versão: 0.2.0 | Status: 🟢 Ativo

## 🎯 Visão Geral

O módulo **Agent** implementa um sistema de **agentes autônomos** que executam tarefas no DG Editor usando **IA local (Ollama)**. Os agentes são projetados para:

- **Analisar código** e sugerir melhorias
- **Gerar código** a partir de descrições
- **Refatorar** código existente
- **Corrigir erros** automaticamente
- **Executar planos** multi-etapas
- **Orquestrar** múltiplos agentes em sequência

## 📁 Estrutura

```
agent/
├── ipc.ts              # Handlers IPC para o painel Agent
├── checkpoint.ts       # Sistema de checkpoint (undo/redo)
├── contexto-implicito.ts # Contexto implícito (seleção, git, etc.)
├── contexto-projeto.ts # Contexto do projeto para agentes
├── diagnosticos.ts     # Diagnósticos de tipo (TypeScript)
├── fila.ts             # Fila de execução de agentes
├── mencoes.ts          # Processamento de menções (@projeto, @arquivo, etc.)
├── orquestrador.ts     # Orquestrador de múltiplos agentes
├── plano.ts            # Planejamento e execução de planos
└── propostas.ts        # Sistema de propostas com diffs
```

## 🎭 Agentes Disponíveis

| Agente | ID | Descrição | Modelo Padrão |
|--------|-----|-------------|----------------|
| **Free Coder** | `free-coder` | Gera código livremente | qwen2.5-coder:1.5b |
| **Revisor** | `revisor` | Revisa e corrige código | qwen2.5-coder:3b |
| **Engenheiro** | `engenheiro` | Projeta soluções complexas | qwen2.5-coder:3b |
| **Orquestrador** | `orquestrador` | Coordena múltiplos agentes | - |
| **Arquiteto** | `arquiteto` | Projeta arquitetura | qwen2.5-coder:3b |
| **Debugger** | `debugger` | Identifica e corrige bugs | qwen2.5-coder:3b |

## 🚀 Uso

### 1. Executar um Agente

```typescript
import { executarAgente } from './brain/agent';

const resultado = await executarAgente(
  raizProjeto,          // Caminho do projeto
  'Adicione validação ao formulário de login',
  {
    agente: 'free-coder',
    modo: 'agent',        // 'agent' | 'plan'
    modeloForcado: 'qwen2.5-coder:1.5b',
    contextoExtra: 'Use TypeScript e React Hook Form'
  }
);

console.log(resultado.texto); // Resposta do agente
console.log(resultado.passos); // Passos executados (se em modo plan)
console.log(resultado.duracaoMs); // Tempo de execução
```

### 2. Modo Plan (Apenas Planejamento)

```typescript
const plano = await executarAgente(
  raizProjeto,
  'Refatore todo o módulo de autenticação',
  {
    agente: 'engenheiro',
    modo: 'plan'  // Não executa, apenas planeja
  }
);

// Salvar o plano para execução posterior
import { salvarPlano } from './agent/plano';
await salvarPlano(raizProjeto, plano);
```

### 3. Executar um Plano Salvo

```typescript
import { executarPlano } from './agent/plano';

const resultado = await executarPlano(raizProjeto);
```

### 4. Orquestrar Múltiplos Agentes

```typescript
import { orquestrarAgentes } from './agent/orquestrador';

const resultado = await orquestrarAgentes(
  raizProjeto,
  'Crie um novo módulo de usuário com CRUD completo',
  {
    rota: ['arquiteto', 'engenheiro', 'revisor'],
    parallel: false  // Sequencial (padrão)
  }
);
```

## 📥 IPC Handlers

O módulo expõe os seguintes handlers IPC:

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `agente:executar` | `{root, pergunta, opcoes}` | `{ok, texto, modelo, passos, duracaoMs, modo}` | Executa um agente |
| `agente:modelo` | - | `{ok, modelo}` | Obtém modelo padrão |
| `agente:historico` | `{root}` | `{ok, mensagens}` | Obtém histórico |
| `agente:listar` | - | `{ok, agentes}` | Lista agentes disponíveis |
| `agente:fila-status` | - | `{ok, fila, executando}` | Status da fila |
| `agente:cancelar` | - | `{ok}` | Cancela execução atual |

### Handlers de Propostas

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `agente:propostas` | `{root}` | `{ok, propostas}` | Lista propostas pendentes |
| `agente:aplicar-proposta` | `{propostaId, pastas}` | `{ok, aplicada, checkpoint}` | Aplica uma proposta |
| `agente:rejeitar-proposta` | `{propostaId}` | `{ok}` | Rejeita uma proposta |

### Handlers de Checkpoint

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `agente:checkpoint-criar` | - | `{ok, checkpointId}` | Cria um checkpoint |
| `agente:checkpoint-listar` | - | `{ok, checkpoints}` | Lista checkpoints |
| `agente:checkpoint-restaurar` | `{checkpointId}` | `{ok, restaurado}` | Restaura um checkpoint |
| `agente:checkpoint-desfazer` | - | `{ok}` | Desfaz o último checkpoint |

### Handlers de Plano

| Canal | Payload | Resultado | Descrição |
|-------|---------|-----------|-----------|
| `agente:plano-salvar` | `{plano}` | `{ok, planoId}` | Salva um plano |
| `agente:plano-ler` | `{planoId}` | `{ok, plano}` | Carrega um plano |
| `agente:plano-limpar` | - | `{ok}` | Limpa plano atual |
| `agente:executar-plano` | - | `{ok, resultado}` | Executa plano salvo |
| `agente:plano-marcar-passo` | `{passoIndex, concluid` | `{ok}` | Marca passo como concluído |

## 🎛️ Configurações

### Agentes Padrão

Os agentes são definidos em `src/main/brain/agentes.ts`:

```typescript
const AGENTES = {
  'free-coder': {
    id: 'free-coder',
    nome: 'Free Coder',
    descricao: 'Gera código livremente',
    modelo: 'qwen2.5-coder:1.5b',
    prompt: 'Você é um gerador de código...'
  },
  // ...
};
```

### Personalização

Para adicionar um novo agente:

1. Adicione a configuração em `agentes.ts`
2. Implemente o handler específico (opcional)
3. Registre no orquestrador

## 📊 Fluxo de Execução

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT EXECUTION FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. VALIDAÇÃO              2. CONTEXTO                        │
│  ├── Safe Mode?           ├── Carregar .dgrules               │
│  ├── Payload válido?      ├── Análise cached                  │
│  └── Pastas permitidas?   ├── Git status                     │
│                              └── Diagnósticos TypeScript      │
│                                                               │
│  3. ROTEAMENTO            4. EXECUÇÃO                         │
│  ├── Escolher agente       ├── Enviar prompt para Ollama      │
│  ├── Validar modelo        ├── Processar resposta              │
│  └── Decidir modo          └── Gerar propostas (se agent)     │
│                              (ou plano, se plan mode)          │
│                                                               │
│  5. PÓS-PROCESSAMENTO      6. RESULTADO                        │
│  ├── Validar propostas     ├── Retornar texto                  │
│  ├── Gerar diffs           ├── Retornar propostas              │
│  ├── Criar checkpoint      └── Retornar checkpoint            │
│  └── Indexar memória       (se aplicável)                      │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 Contexto Implícito

Os agentes têm acesso ao seguinte **contexto implícito**:

1. **Seleção Atual**: Texto selecionado no editor (`@selecao`)
2. **Arquivo Atual**: Conteúdo do arquivo aberto (`@arquivo:path`)
3. **Projeto**: Estrutura do projeto, .dgrules, package.json
4. **Git**: Status do repositório, diffs
5. **Diagnósticos**: Erros TypeScript, warnings
6. **Memória**: Fatos aceitos em conversas anteriores

### Menções

| Menção | Exemplo | Descrição |
|--------|---------|-----------|
| `@projeto` | `@projeto` | Informações sobre o projeto |
| `@arquivo` | `@arquivo:src/main/index.ts` | Conteúdo de um arquivo específico |
| `@nota` | `@nota:Requisitos` | Conteúdo de uma nota do vault |
| `@selecao` | `@selecao` | Texto selecionado no editor |

## 🎯 Roteador de Agentes

O **roteador** (`agent-router.ts`) determina qual agente usar com base no pedido:

```typescript
import { resolverRotaChat } from './agent-router';

const rota = resolverRotaChat('auto', 'Crie um componente React');
// { kind: 'agente', agente: 'free-coder', tarefa: 'codigo' }

const rota2 = resolverRotaChat('auto', 'Explique como funciona o React');
// { kind: 'chat', agente: null, tarefa: 'chat' }
```

### Rotas Padrão

| Tipo de Pedido | Agente | Modo |
|----------------|--------|------|
| Criar código | `free-coder` | `agent` |
| Refatorar | `engenheiro` | `agent` |
| Corrigir bug | `debugger` | `agent` |
| Explicar | `chat` | `chat` |
| Analisar | `arquiteto` | `agent` |

## 💡 Propostas e Diffs

Quando um agente sugere mudanças no código:

1. **Gera diffs** entre o código atual e a sugestão
2. **Exibe propostas** no painel de diff
3. **Permite revisão** por hunk (parte do diff)
4. **Aplica automaticamente** ou com aprovação humana

### Fluxo de Propostas

```
┌─────────────────────────────────────────────────────────────┐
│                    PROPOSTAS FLOW                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. AGENTE GERA PROPOSTA                                      │
│     ├── Analisa código atual                                  │
│     ├── Gera nova versão                                       │
│     └── Cria diff entre versões                                │
│                                                               │
│  2. SISTEMA PROCESSA                                           │
│     ├── Valida diff                                            │
│     ├── Separa em hunks                                        │
│     └── Salva na fila de propostas                             │
│                                                               │
│  3. UI EXIBE PROPOSTAS                                         │
│     ├── Mostra diff side-by-side                               │
│     ├── Permite aceitar/rejeitar por hunk                      │
│     └── Mostra preview no editor                               │
│                                                               │
│  4. USUÁRIO DECIDE                                             │
│     ├── Aceitar tudo                                           │
│     ├── Aceitar hunks específicos                              │
│     ├── Rejeitar tudo                                          │
│     └── Modificar manualmente                                  │
│                                                               │
│  5. APLICAÇÃO                                                  │
│     ├── Cria checkpoint                                        │
│     ├── Aplica mudanças                                        │
│     ├── Verifica se compila                                    │
│     └── Salva arquivo                                          │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Checkpoint System

O sistema de **checkpoints** permite:

- **Desfazer** aplicações de propostas
- **Restaurar** estado anterior
- **Gerenciar** histórico de mudanças

### Como Funciona

1. Antes de aplicar propostas, um **checkpoint** é criado
2. O checkpoint armazena:
   - Hash dos arquivos modificados
   - Estado do Git
   - Lista de propostas aplicadas
3. Se algo der errado, o checkpoint pode ser restaurado

```typescript
import { criarCheckpoint, restaurarCheckpoint, listarCheckpoints } from './agent/checkpoint';

// Criar checkpoint
await criarCheckpoint('Antes de aplicar propostas do agente');

// Aplicar propostas...

// Se der errado, restaurar
await restaurarCheckpoint(checkpointId);
```

## 🎯 Fila de Execução

Os agentes executam em uma **fila serial** para evitar:

- Conflitos de escrita em arquivos
- Sobrecarga do Ollama
- Race conditions

```typescript
import { enfileirarAgente } from './agent/fila';

// Adiciona à fila
await enfileirarAgente(async () => {
  // Execução do agente
});
```

## 🛡️ Segurança

### Safe Mode

Em **safe mode**, os agentes são desativados:

```typescript
import { emSafeMode } from '../safe-mode';

if (emSafeMode()) {
  return { ok: false, erro: 'safe-mode' };
}
```

### Validação de Caminhos

Todos os caminhos são validados para prevenir:

- **Path traversal** (acesso a arquivos fora da raiz)
- **Acesso não autorizado** (arquivos do sistema)
- **Operações perigosas** (delete, move)

```typescript
import { caminhoSeguro } from '../ipc-seguro';

const seg = caminhoSeguro(caminho, raizProjeto);
if (!seg.ok) {
  return { ok: false, erro: seg.erro };
}
```

### Auto-verify

Quando ativado, o sistema:

1. Executa o agente
2. Aplica propostas
3. **Executa typecheck** automaticamente
4. Se falhar, **corrige automaticamente** ou pede intervenção

```typescript
// No frontend
ipcRenderer.invoke('agente:executar', raiz, pedido, {
  autoVerify: true
});
```

## 📊 Métricas

| Métrica | Valor |
|---------|-------|
| Agentes disponíveis | 7 |
| Handlers IPC | 15+ |
| Propostas por execução | 1-N |
| Tempo médio de execução | 5-30 segundos |
| Tamanho do módulo | ~2.500 linhas |

## 🎯 Roadmap

### 🟢 Concluído
- [x] Sistema de agentes autônomos
- [x] Roteador de agentes
- [x] Orquestrador de múltiplos agentes
- [x] Sistema de propostas com diffs
- [x] Checkpoint system
- [x] Fila de execução
- [x] Contexto implícito
- [x] Modo plan (apenas planejamento)

### 🟡 Em Desenvolvimento
- [ ] Auto-verify com correção automática
- [ ] Integração com OpenClaw
- [ ] Skills específicas por agente
- [ ] Memória por agente

### 🔴 Planejado
- [ ] Agentes customizáveis pelo usuário
- [ ] Marketplace de agentes
- [ ] Agentes remotos (via API)
- [ ] Treinamento de agentes específicos

## 📚 Documentação Relacionada

- [Brain Module](../brain/README.md) - Módulo de IA
- [MCP Client](../mcp/client.ts) - Integração MCP
- [IPC Handlers](../ipc/README.md) - Handlers IPC
- [ DESIGN.md](../../../DESIGN.md) - Design System

## 🔗 Links Úteis

- [Ollama](https://ollama.ai) - IA local
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP
- [TypeScript](https://www.typescriptlang.org/) - Tipagem estática
