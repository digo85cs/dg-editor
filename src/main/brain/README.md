# Módulo Brain - DG Editor

> **Cérebro de IA Local do DG Editor**
> Versão: 0.2.0 | Status: 🟢 Ativo

## 🎯 Visão Geral

O módulo **Brain** é o **cérebro** do DG Editor, responsável por:

- **Integração com Ollama** (IA local)
- **Análise de código** com IA
- **Geração de código** inteligente
- **Híbrido (Fase 1 + Fase 2)** - Análise preditiva + geração
- **Gerenciamento de modelos** de IA
- **Avaliação de modelos**
- **Memória generativa** (embeddings)
- **Skills** (habilidades específicas)

## 📁 Estrutura

```
brain/
├── module.ts            # Módulo principal (fábrica)
├── agent.ts             # Execução de agentes
├── agentes.ts           # Definição dos agentes
├── avaliacao.ts         # Avaliação de modelos
├── editar.ts            # Edição com IA
├── hibrido.ts           # Sistema híbrido (análise + geração)
├── indice.ts            # Indexação de código
├── modelos-catalogo.ts  # Catálogo de modelos Ollama
├── ollama.ts            # Integração com Ollama
├── providers.ts         # Providers de IA (Ollama, OpenAI)
├── registry.ts          # Registro de models e providers
└── skills.ts            # Sistema de skills
```

## 🧠 Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      BRAIN ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐     ┌─────────────────┐                  │
│  │   PROVIDERS     │     │     MODELS      │                  │
│  │                 │     │                 │                  │
│  │ • Ollama        │     │ • qwen2.5-      │                  │
│  │ • OpenAI        │     │   coder:1.5b   │                  │
│  │                 │     │ • qwen2.5-      │                  │
│  └────────┬────────┘     │   coder:3b      │                  │
│           │               └────────┬────────┘                  │
│           │                        │                           │
│           ▼                        ▼                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    REGISTRY                        │    │
│  │  • Gerencia providers e modelos                    │    │
│  │  • Roteamento inteligente                         │    │
│  │  • Health checks                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                   │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    BRAIN MODULE                     │    │
│  │  • ask() - Perguntas gerais                        │    │
│  │  • analyze() - Análise de código                    │    │
│  │  • generate() - Geração de código                  │    │
│  │  • executeAgent() - Executa agentes                │    │
│  └────────────┬────────────────────────┬────────────────┘    │
│                │                            │                       │
│                ▼                            ▼                       │
│  ┌─────────────────────┐    ┌─────────────────────┐          │
│  │    HIBRIDO          │    │      AGENTS          │          │
│  │  • Fase 1: Análise │    │  • free-coder        │          │
│  │  • Fase 2: Geração │    │  • revisor           │          │
│  │  • Briefing         │    │  • engenheiro       │          │
│  │  • Predição         │    │  • arquiteto         │          │
│  └─────────────────────┘    └─────────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Uso

### 1. Inicialização

```typescript
import { getBrain } from './brain/module';

const brain = getBrain();
```

### 2. Perguntar ao Brain

```typescript
const response = await brain.ask(
  'Explique como funciona o React Hook useEffect',
  'Contexto: projeto React TypeScript'
);

console.log(response.text); // Resposta em pt-BR
console.log(response.provider); // 'ollama'
console.log(response.model); // 'qwen2.5-coder:3b'
```

### 3. Análise de Código

```typescript
const analysis = await brain.analyze(
  raizProjeto,
  'rapida' // 'rapida' | 'completa'
);

console.log(analysis.oQueE); // 'Aplicação Electron...'
console.log(analysis.stack); // 'Electron, TypeScript...'
console.log(analysis.problemas); // ['...']
```

### 4. Geração de Código

```typescript
const code = await brain.generate(
  'Crie um componente React para lista de usuários',
  {
    language: 'typescript',
    framework: 'react',
    style: 'tailwind'
  }
);

console.log(code.generated); // Código gerado
console.log(code.model); // Modelo usado
```

### 5. Híbrido (Análise + Geração)

```typescript
import { executarHibrido } from './brain/hibrido';

const result = await executarHibrido(
  raizProjeto,
  'Adicione autenticação JWT ao backend',
  {
    force: true,
    modeloForcado: 'qwen2.5-coder:3b'
  }
);

console.log(result.texto); // Resultado final
console.log(result.briefing); // Briefing da análise
console.log(result.passos); // Passos executados
```

## 📥 Providers

### Ollama (Padrão)

O **Ollama** é o provider padrão para IA local:

```typescript
import { getOllamaConfig } from '../config';

const config = getOllamaConfig();
console.log(config.url); // 'http://127.0.0.1:11434'
console.log(config.fastModel); // 'qwen2.5-coder:1.5b'
console.log(config.chatModel); // 'qwen2.5-coder:3b'
```

### OpenAI (Opcional)

Para usar OpenAI, configure as variáveis de ambiente:

```bash
OPENROUTER_API_KEY=sua_chave
```

## 🎯 Modelos

### Catálogo de Modelos

O sistema mantém um **catálogo** de modelos disponíveis:

```typescript
import { detectarModelosLocais, lerCatalogo } from './brain/modelos-catalogo';

// Detectar modelos instalados localmente
const catalogo = await detectarModelosLocais(raizProjeto);

console.log(catalogo.ativo); // Modelo ativo
console.log(catalogo.modelos); // Lista de modelos
console.log(catalogo.problemas); // Problemas de validação
```

### Modelos Padrão

| Modelo | Tarefa | Tamanho | Descrição |
|--------|--------|---------|-----------|
| `qwen2.5-coder:1.5b` | Código rápido | 1.5B | Geração de código rápida |
| `qwen2.5-coder:3b` | Código | 3B | Geração de código balanceada |
| `qwen2.5-coder:7b` | Código complexo | 7B | Geração de código avançada |
| `llama3:8b` | Chat | 8B | Conversação geral |

### Seleção de Modelo por Tarefa

```typescript
import { modeloParaTarefa } from './brain/modelos-catalogo';

const modelo = modeloParaTarefa(raizProjeto, 'chat'); // 'qwen2.5-coder:3b'
const modeloCod = modeloParaTarefa(raizProjeto, 'codigo'); // 'qwen2.5-coder:1.5b'
const modeloAnalise = modeloParaTarefa(raizProjeto, 'analise'); // 'qwen2.5-coder:3b'
```

## 🔄 Sistema Híbrido

O **sistema híbrido** combina **análise** (Fase 1) e **geração** (Fase 2):

### Fase 1: Análise Preditiva

- Analisa o código **sem gerar mudancas**
- Identifica **problemas** e **oportunidades**
- Gera **briefing** para a Fase 2

### Fase 2: Geração

- Recebe o **briefing** da Fase 1
- Gera **código** ou **soluções**
- Aplica **mudanças** se solicitado

### Exemplo de Briefing

```typescript
import { prepararBriefing } from './brain/hibrido';

const briefing = await prepararBriefing(
  raizProjeto,
  'Adicione validação ao formulário',
  pastaAberta
);

console.log(briefing.problema); // 'Falta validação...'
console.log(briefing.contexto); // 'Arquivos: src/components/...'
console.log(briefing.sugestao); // 'Usar React Hook Form...'
```

### Predição de Impacto

```typescript
import { predizerImpacto } from './brain/hibrido';

const predicao = predizerImpacto(
  pedido,
  analiseWorkspace(raizProjeto)
);

console.log(predicao.risco); // 'baixo' | 'médio' | 'alto'
console.log(predicao.rota); // 'código' | 'chat'
console.log(predicao.tempoEstimadoMs); // 5000
```

## 🎭 Agentes

O módulo Brain integra com o módulo **Agent**:

```typescript
import { executarAgente } from './brain/agent';

const resultado = await executarAgente(
  raizProjeto,
  'Refatore o módulo de autenticação',
  {
    agente: 'engenheiro',
    modo: 'agent',
    proposeWrites: true
  }
);
```

## 🧠 Memória Generativa

O sistema de **memória generativa** usa **embeddings** para:

- Indexar **turnos de conversa**
- Recuperar **contexto relevante**
- Manter **fatos aceitos**

### Indexação

```typescript
import { indexarTurno } from './memory/embeddings';

// Indexar um turno de conversa
await indexarTurno(
  raizProjeto,
  'user',
  'Lembre que o usuário prefere TypeScript'
);
```

### Recuperação de Contexto

```typescript
import { buscarContextoRelevante } from './memory/embeddings';

const contexto = await buscarContextoRelevante(
  raizProjeto,
  'Qual a preferência de linguagem do usuário?',
  5 // Top 5 resultados
);

console.log(contexto[0].texto); // 'O usuário prefere TypeScript'
console.log(contexto[0].similaridade); // 0.95
```

## 🎯 Skills

**Skills** são **habilidades específicas** que os agentes podem usar:

| Skill | Gatilho | Descrição |
|-------|---------|-----------|
| `analisar-sistema` | `/analisar` | Analisa o sistema atual |
| `gerar-tests` | `/test` | Gera testes automatizados |
| `documentar` | `/doc` | Gera documentação |
| `refatorar` | `/refator` | Refatora código |
| `debugger` | `/debug` | Identifica bugs |

### Uso de Skills

```typescript
import { listarSkills } from './brain/skills';

const skills = listarSkills(raizProjeto);
console.log(skills[0].id); // 'analisar-sistema'
console.log(skills[0].titulo); // 'Analisar Sistema'
console.log(skills[0].gatilho); // '/analisar'
```

## 📊 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                    BRAIN DATA FLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. ENTRADA                                                    │
│     ├── Prompt do usuário                                      │
│     ├── Contexto do projeto                                    │
│     └── Configurações                                         │
│                                                               │
│  2. PRÉ-PROCESSAMENTO                                          │
│     ├── Validação do prompt                                    │
│     ├── Normalização                                           │
│     └── Enriquecimento de contexto                             │
│                                                               │
│  3. ANÁLISE (Fase 1)                                           │
│     ├── Tokenização                                            │
│     ├── Embeddings (opcional)                                  │
│     ├── Busca em índice                                         │
│     └── Geração de briefing                                    │
│                                                               │
│  4. GERAÇÃO (Fase 2)                                            │
│     ├── Seleção do modelo                                       │
│     ├── Construção do prompt                                   │
│     ├── Chamada ao provider (Ollama/OpenAI)                    │
│     └── Pós-processamento da resposta                           │
│                                                               │
│  5. SAÍDA                                                      │
│     ├── Texto gerado                                            │
│     ├── Propostas de código                                     │
│     └── Metadados (modelo, tokens, tempo)                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🛡️ Segurança

### Validação de Entrada

Todos os prompts são validados:

```typescript
// Validação de prompt
if (!prompt || prompt.trim().length === 0) {
  return { ok: false, erro: 'Prompt vazio' };
}

if (prompt.length > MAX_PROMPT_LENGTH) {
  return { ok: false, erro: 'Prompt muito longo' };
}
```

### Safe Mode

Em **safe mode**, o Brain opera com restrições:

```typescript
import { emSafeMode } from '../safe-mode';

if (emSafeMode()) {
  // Desativa recursos que consomem muitos recursos
  config.timeoutMs = 30000; // 30 segundos
  config.maxTokens = 1024;
}
```

### Resource Limiter

O sistema monitora uso de recursos:

```typescript
import { getResourceLimits } from '../config';

const limits = getResourceLimits();
if (memoryUsage > limits.memory.critical) {
  throw new Error('Memória insuficiente para executar IA');
}
```

## 📈 Métricas

| Métrica | Valor |
|---------|-------|
| Providers disponíveis | 2 (Ollama, OpenAI) |
| Modelos gerenciados | 10+ |
| Skills disponíveis | 8 |
| Tempo médio de resposta | 2-10 segundos |
| Tokens por resposta | 512-2048 |
| Tamanho do módulo | ~5.000 linhas |

## 🎯 Integrações

### Com Módulo Agent
- Execução de agentes
- Roteamento inteligente
- Orquestração

### Com Módulo MCP
- Servidor MCP para integração com Maestro
- Tools para leitura de arquivos
- Tools para busca

### Com Módulo Memory
- Indexação de turnos
- Busca semântica
- Memória de longo prazo

## 📚 Documentação Relacionada

- [Agent Module](../agent/README.md) - Agentes Autônomos
- [MCP Server](../mcp/server.ts) - Servidor MCP
- [Memory Module](../memory/README.md) - Memória Generativa
- [IPC Handlers](../ipc/README.md) - Handlers IPC

## 🔗 Links Úteis

- [Ollama](https://ollama.ai) - IA local
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP
- [Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-Coder) - Modelos usados
- [TypeScript](https://www.typescriptlang.org/) - Tipagem estática
