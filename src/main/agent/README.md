# Modulo Agent - DG Editor

> **Agentes Autonomos com IA Local**
> Versao: 0.2.0 | Status: Ativo

## Visao Geral

O modulo **Agent** implementa um sistema de **agentes autonomos** que executam tarefas no DG Editor usando **IA local (Ollama)**. Os agentes sao projetados para:

- **Analisar codigo** e sugerir melhorias
- **Gerar codigo** a partir de descricoes
- **Refatorar** codigo existente
- **Corrigir erros** automaticamente
- **Executar planos** multi-etapas
- **Orquestrar** multiplos agentes em sequencia

## Estrutura

```
agent/
├── ipc.ts              # Handlers IPC para o painel Agent
├── checkpoint.ts       # Sistema de checkpoint (undo/redo)
├── contexto-implicito.ts # Contexto implicito (selecao, git, etc.)
├── contexto-projeto.ts # Contexto do projeto para agentes
├── diagnosticos.ts     # Diagnosticos de tipo (TypeScript)
├── fila.ts             # Fila de execucao de agentes
├── mencoes.ts          # Processamento de mencoes (@projeto, @arquivo, etc.)
├── orquestrador.ts     # Orquestrador de multiplos agentes
├── plano.ts            # Planejamento e execucao de planos
└── propostas.ts        # Sistema de propostas com diffs
```

## Agentes Disponiveis

| Agente | ID | Descricao | Modelo Padrao |
|--------|-----|-------------|----------------|
| **Free Coder** | `free-coder` | Gera codigo livremente | qwen2.5-coder:1.5b |
| **Revisor** | `revisor` | Revisa e corrige codigo | qwen2.5-coder:3b |
| **Engenheiro** | `engenheiro` | Projeta solucoes complexas | qwen2.5-coder:3b |
| **Orquestrador** | `orquestrador` | Coordena multiplos agentes | - |
| **Arquiteto** | `arquiteto` | Projeta arquitetura | qwen2.5-coder:3b |
| **Debugger** | `debugger` | Identifica e corrige bugs | qwen2.5-coder:3b |

## Uso

### 1. Executar um Agente

```typescript
import { executarAgente } from './brain/agent';

const resultado = await executarAgente(
  raizProjeto,          // Caminho do projeto
  'Adicione validacao ao formulario de login',
  {
    agente: 'free-coder',
    modo: 'agent',        // 'agent' | 'plan'
    modeloForcado: 'qwen2.5-coder:1.5b',
    contextoExtra: 'Use TypeScript e React Hook Form'
  }
);

console.log(resultado.texto); // Resposta do agente
console.log(resultado.passos); // Passos executados (se em modo plan)
console.log(resultado.duracaoMs); // Tempo de execucao
```

### 2. Modo Plan (Apenas Planejamento)

```typescript
const plano = await executarAgente(
  raizProjeto,
  'Refatore todo o modulo de autenticacao',
  {
    agente: 'engenheiro',
    modo: 'plan'  // Nao executa, apenas planeja
  }
);

// Salvar o plano para execucao posterior
import { salvarPlano } from './agent/plano';
await salvarPlano(raizProjeto, plano);
```

### 3. Executar um Plano Salvo

```typescript
import { executarPlano } from './agent/plano';

const resultado = await executarPlano(raizProjeto);
```

## Arquiteto de Software

O agente **Arquiteto** e especializado em projetar arquiteturas de software:

```typescript
// Solicitar arquitetura para um novo modulo
const resultado = await executarAgente(
  raizProjeto,
  'Projete a arquitetura de um modulo de pagamentos com:
  - Integracao com Stripe e MercadoPago
  - Suporte a pagamentos recorentes
  - Webhooks para notificacoes
  - Persistencia de transacoes',
  {
    agente: 'arquiteto',
    modeloForcado: 'qwen2.5-coder:3b'
  }
);

// O agente ira gerar:
// - Estrutura de diretorios
// - Diagramas de arquitetura
// - Interfaces TypeScript
// - Esquema do banco de dados
// - Documentacao
```

## Debugger

O agente **Debugger** analisa e corrige bugs:

```typescript
// Descrever o problema
const resultado = await executarAgente(
  raizProjeto,
  `Estou com um erro ao autenticar usuarios:
  - O erro e: "Cannot read properties of undefined (reading 'email')"
  - Ocorre em: src/services/auth.ts:45
  - O usuario esta logado mas nao esta sendo reconhecido`,
  {
    agente: 'debugger'
  }
);

// O agente pode:
// - Analisar o codigo na linha 45
// - Identificar a causa raiz
// - Suggest fixes com trechos de codigo
// - Gerar testes para prevenir regressao
```

## Orquestrador de Agentes

Orquestra multiplos agentes para tarefas complexas:

```typescript
import { orquestrarAgentes } from './agent/orquestrador';

const resultado = await orquestrarAgentes(
  raizProjeto,
  'Crie um novo modulo de usuario com CRUD completo',
  {
    etapas: [
      { agente: 'arquiteto', pedido: 'Projete a arquitetura do modulo de usuario' },
      { agente: 'engenheiro', pedido: 'Implemente as interfaces e tipos TypeScript' },
      { agente: 'free-coder', pedido: 'Crie os componentes React' },
      { agente: 'revisor', pedido: 'Revise e aprimore o codigo gerado' }
    ]
  }
);
```

## Recursos Avanados

### Contexto Implicito

O sistema entende contexto implicitamente:

- **@projeto**: Referencia todo o projeto
- **@src**: Referencia o diretorio src
- **@arquivo:caminho**: Referencia arquivo especifico
- **@git**: Status do git
- **@selecao**: Conteudo selecionado no editor

```typescript
// O usuario pode pedir:
'Refatore @arquivo:src/services/user.ts para usar a nova API'

// E o agente entende que deve:
// 1. Ler o arquivo src/services/user.ts
// 2. Analisar o codigo atual
// 3. Aplicar as mudancas da nova API
```

### Checkpoints

Sistema de checkpoint permite undo/redo de operacoes:

```typescript
import { checkpoint } from './agent/checkpoint';

// Antes de executar uma mudanca
checkpoint.criar(raizProjeto, 'Adicionando validação de email');

// Executar as mudancas...

// Se algo der errado, reverter
checkpoint.undo(raizProjeto);
```

### Fila de Execucao

Agentes sao executados em fila para evitar conflitos:

```typescript
import { filaAgentes } from './agent/fila';

// Adicionar tarefa a fila
filaAgentes.adicionar({
  raiz: raizProjeto,
  pedido: 'Gerar documentacao do modulo',
  agente: 'engenheiro'
});

// Processar fila
filaAgentes.processar();
```

### Propostas

Agentes podem gerar propostas com diffs:

```typescript
import { gerarPropostas } from './agent/propostas';

const propostas = await gerarPropostas(
  raizProjeto,
  'Melhorar a performance do carrossel de produtos'
);

// Propostas contem:
// - Descricao da mudanca
// - Diff do codigo
// - Impacto estimado
// - Risco

// O usuario pode:
// - Aceitar todas
// - Aceitar selecionadas
// - Rejeitar todas
// - Modificar manualmente
```

## Integracao com Outros Modulos

### Com o Navegador

```typescript
// Abrir navegador para pesquisa
ipcMain.handle('agente:abrir-navegador', async (_e, url) => {
  // Abrir navegador com contexto do agente
});
```

### Com o Terminal

```typescript
// Executar comandos no terminal
import { writeTerminal } from './terminal';

writeTerminal('terminal-1', 'npm install');
```

### Com o Chat

```typescript
// Enviar mensagens para o chat
import { appendChat } from './chatstore';

appendChat(raizProjeto, {
  role: 'assistant',
  content: resultado.texto,
  at: Date.now(),
  provider: 'agente'
});
```

### Com o Brain

```typescript
// Usar o brain para analises complexas
import { askOllama } from './brain/ollama';

const resposta = await askOllama(prompt, contexto);
```

## Configuracao

### Modelos Disponiveis

```typescript
// Configurar modelos para agentes
export const AGENTE_MODELOS = {
  'free-coder': 'qwen2.5-coder:1.5b',
  'revisor': 'qwen2.5-coder:3b',
  'engenheiro': 'qwen2.5-coder:3b',
  'arquiteto': 'qwen2.5-coder:3b',
  'debugger': 'qwen2.5-coder:3b'
};
```

### Limites de Execucao

```typescript
export const AGENTE_LIMITES = {
  maxTokens: 8192,
  timeoutMs: 300000, // 5 minutos
  maxIteracoes: 10
};
```

## API IPC

### Handlers IPC

| Canal | Descricao | Retorno |
|-------|-----------|---------|
| `agente:executar` | Executa um agente | `{ ok, texto, modelo, passos, duracaoMs }` |
| `agente:modelo` | Obtem modelo do agente | `{ ok, modelo }` |
| `agente:historico` | Obtem historico | `{ ok, mensagens }` |
| `agente:listar` | Lista agentes disponiveis | `{ ok, agentes }` |
| `agente:status` | Status da execucao | `{ ok, executando, fila }` |

### Eventos IPC

| Evento | Descricao | Payload |
|--------|-----------|---------|
| `agente:progresso` | Progresso da execucao | `{ progresso, mensagem, passos }` |
| `agente:completo` | Execucao concluida | `{ resultado }` |
| `agente:erro` | Erro durante execucao | `{ erro }` |

## Seguranca

- Todos os caminhos sao validados para prevenir path traversal
- Operacoes de escritao exigem confirmacao do usuario
- Limites de tokens e timeout para prevenir uso excessivo
- Log de todas as operacoes para auditoria

## Depuracao

### Logs

```bash
# Ver logs de agentes
cat /c/Users/digo8/OneDrive/CURSOR/DG\)
```

### Debug Mode

```typescript
// Ativar modo debug
process.env.AGENTE_DEBUG = '1';

// Mais logs detalhados
process.env.AGENTE_VERBOSE = '1';
```

## Testes

### Teste Basico

```typescript
import { executarAgente } from './brain/agent';

const resultado = await executarAgente(
  '/path/to/project',
  'Crie uma funcao que soma dois numeros',
  { agente: 'free-coder' }
);

console.assert(resultado.ok, 'Execucao falhou');
console.assert(resultado.texto.includes('function'), 'Nao gerou funcao');
```

### Teste de Planejamento

```typescript
const plano = await executarAgente(
  '/path/to/project',
  'Crie um modulo completo de autenticacao',
  { agente: 'engenheiro', modo: 'plan' }
);

console.assert(plano.passos.length > 0, 'Nao gerou passos');
```

## Roadmap

- [x] Agente Free Coder
- [x] Agente Revisor
- [x] Agente Engenheiro
- [x] Agente Orquestrador
- [x] Agente Arquiteto
- [x] Agente Debugger
- [ ] Agente Documentador
- [ ] Agente Tester (geracao de testes)
- [ ] Agente Refatorador (refatoracao automatica)
- [ ] Integracao com GitHub Copilot

## Contribuindo

Para adicionar um novo agente:

1. Crie um arquivo no diretorio `agent/` (ex: `novo-agente.ts`)
2. Implemente a funcao de execucao
3. Adicione a configuracao em `AGENTE_MODELOS`
4. Registre o agente no `orquestrador.ts`
5. Adicione testes

## Versao

- **Versao**: 0.2.0
- **Data**: Novembro de 2024
- **Autor**: Rodrigo Soares
- **Licenca**: MIT
