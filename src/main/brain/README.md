# Modulo Brain - DG Editor

> **Cerebro de IA Local do DG Editor**
> Versao: 0.2.0 | Status: Ativo

## Visao Geral

O modulo **Brain** e o **cerebro** do DG Editor, responsavel por:

- **Integracao com Ollama** (IA local)
- **Analise de codigo** com IA
- **Geracao de codigo** inteligente
- **Hibrido (Fase 1 + Fase 2)** - Analise preditiva + geracao
- **Gerenciamento de modelos** de IA
- **Avaliacao de modelos**
- **Memoria generativa** (embeddings)
- **Skills** (habilidades especificas)

## Estrutura

```
brain/
├── module.ts            # Modulo principal (fabrica)
├── agent.ts             # Execucao de agentes
├── agentes.ts           # Definicao dos agentes
├── avaliacao.ts         # Avaliacao de modelos
├── editar.ts            # Edicao com IA
├── hibrido.ts           # Sistema hibrido (analise + geracao)
├── indice.ts            # Indexacao de codigo
├── modelos-catalogo.ts  # Catalogo de modelos Ollama
├── ollama.ts            # Integracao com Ollama
├── providers.ts         # Providers de IA (Ollama, OpenAI)
├── registry.ts          # Registro de models e providers
└── skills.ts            # Sistema de skills
```

## Arquitetura

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
│  │  • analyze() - Analise de codigo                    │    │
│  │  • generate() - Geracao de codigo                  │    │
│  │  • executeAgent() - Executa agentes                │    │
│  └────────────┬────────────────────────┬────────────────┘    │
│                │                            │                       │
│                ▼                            ▼                       │
│  ┌─────────────────────┐    ┌─────────────────────┐          │
│  │    HIBRIDO          │    │      AGENTS          │          │
│  │  • Fase 1: Analise │    │  • free-coder        │          │
│  │  • Fase 2: Geracao │    │  • revisor           │          │
│  │  • Briefing         │    │  • engenheiro       │          │
│  │  • Predicao         │    │  • arquiteto         │          │
│  └─────────────────────┘    └─────────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Uso

### 1. Inicializacao

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
console.log(response.model); // 'qwen2.5-coder:1.5b'
```

### 3. Analisar Codigo

```typescript
const analysis = await brain.analyze(
  '/path/to/project',
  'Identifique problemas de performance'
);

console.log(analysis.resumo);
console.log(analysis.problemas);
console.log(analysis.sugestoes);
```

### 4. Gerar Codigo

```typescript
const code = await brain.generate(
  '/path/to/project',
  'Crie uma funcao utilitaria para formatar datas',
  {
    language: 'typescript',
    context: 'Projeto React com Date-fns'
  }
);

console.log(code.texto);
```

### 5. Executar Agente

```typescript
const result = await brain.executeAgent(
  '/path/to/project',
  'Refatore este componente para usar hooks',
  {
    agente: 'revisor',
    modelo: 'qwen2.5-coder:3b'
  }
);

console.log(result.texto);
console.log(result.passos);
```

## Providers de IA

### Ollama

O provider Ollama e a integracao principal para IA local:

```typescript
import { OllamaProvider } from './brain/providers';

const provider = new OllamaProvider({
  url: 'http://127.0.0.1:11434',
  timeout: 120000,
  maxTokens: 8192
});

// Perguntar
const response = await provider.ask(prompt, context);

// Gerar codigo
const code = await provider.generate(prompt, options);

// Stream
const stream = await provider.askStream(prompt, context);
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### OpenAI (Futuro)

```typescript
import { OpenAIProvider } from './brain/providers';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  timeout: 60000
});
```

### Registry

O registry gerencia todos os providers e modelos:

```typescript
import { registry } from './brain/registry';

// Listar providers
registry.listProviders();

// Listar modelos
registry.listModels();

// Obter provider padrao
const defaultProvider = registry.getDefaultProvider();

// Obter modelo padrao
const defaultModel = registry.getDefaultModel();
```

## Sistema Hibrido

O sistema hibrido combina analise e geracao em duas fases:

### Fase 1: Analise

```typescript
import { prepararBriefing } from './brain/hibrido';

const briefing = await prepararBriefing(
  '/path/to/project',
  'Crie um novo modulo de autenticacao'
);

// briefing contem:
// - oQueE: tipo do projeto
// - stack: tecnologias usadas
// - contexto: arquivos relevantes
// - sugestao: modelo recomendado
```

### Fase 2: Geracao

```typescript
import { executarHibrido } from './brain/hibrido';

const resultado = await executarHibrido(
  '/path/to/project',
  'Crie um novo modulo de autenticacao',
  {
    briefing: briefing, // Do passo anterior
    force: true,
    modeloForcado: 'qwen2.5-coder:3b'
  }
);

// resultado contem:
// - ok: boolean
// - texto: resposta do modelo
// - modelo: modelo usado
// - passos: passos executados
// - briefing: briefing gerado
```

## Gerenciamento de Modelos

### Catalogo de Modelos

```typescript
import { lerCatalogo, detectarModelosLocais, validarCatalogo } from './brain/modelos-catalogo';

// Ler catalogo
const catalogo = lerCatalogo('/path/to/project');

// Detectar modelos locais
const modelos = await detectarModelosLocais('/path/to/project');

// Validar catalogo
const { ok, problemas } = validarCatalogo(catalogo);

// Salvar catalogo
salvarCatalogo('/path/to/project', catalogo);
```

### Health Check

```typescript
import { healthCheckModelos, iniciarHealthPeriodico } from './brain/modelos-catalogo';

// Check pontual
const status = await healthCheckModelos('/path/to/project');

// Check periodico
iniciarHealthPeriodico('/path/to/project', 120000); // 2 minutos
```

### Escolha de Modelo

```typescript
import { escolherModelo, modeloParaTarefa } from './brain/agent';

// Escolher modelo automaticamente
const modelo = await escolherModelo();

// Escolher modelo para tarefa especifica
const modelo = modeloParaTarefa('/path/to/project', 'gerar documentacao');
```

## Avaliacao de Modelos

```typescript
import { rodarAvaliacao } from './brain/avaliacao';

const resultado = await rodarAvaliacao(
  '/path/to/project',
  'qwen2.5-coder:3b'
);

// resultado contem:
// - modelo: modelo avaliado
// - pontuacao: 0-10
// - testeCode: resultado do teste de geracao de codigo
// - testeAnalise: resultado do teste de analise
// - testeRefactor: resultado do teste de refatoracao
// - recomendacoes: sugestoes de melhoria
```

## Skills

O sistema de skills permite executar tarefas especificas:

```typescript
import { listarSkills, executarSkill } from './brain/skills';

// Listar skills disponiveis
const skills = listarSkills('/path/to/project');

// Executar skill
const resultado = await executarSkill(
  '/path/to/project',
  'skill-refatorar-funcoes-longe'
);
```

### Skills Disponiveis

| Skill | ID | Descricao |
|-------|-----|-----------|
| Refatorar | `skill-refatorar-funcoes-longe` | Refatora funcoes muito longas |
| Documentar | `skill-documentar-modulo` | Gera documentacao do modulo |
| Testar | `skill-gerar-testes` | Gera testes unitarios |
| Otimizar | `skill-otimizar-imports` | Otimiza imports |
| Tipar | `skill-adicionar-tipos` | Adiciona tipos TypeScript |

## Indice de Codigo

Indexacao de codigo para busca e analise:

```typescript
import { iniciarIndice, carregarIndice, buscarNoIndice } from './brain/indice';

// Iniciar indexacao
await iniciarIndice('/path/to/project');

// Carregar indice
const indice = carregarIndice('/path/to/project');

// Buscar no indice
const resultados = buscarNoIndice(indice, 'funcao de validação');
```

## Integracao com Ollama

### ensureOllama

Garante que o Ollama esta rodando:

```typescript
import { ensureOllama } from './ollama-keeper';

await ensureOllama();
```

### Status do Ollama

```typescript
import { getOllamaStatus } from './brain/ollama';

const status = await getOllamaStatus();
console.log(status.ativo); // true/false
console.log(status.url); // 'http://127.0.0.1:11434'
console.log(status.modelos); // ['qwen2.5-coder:1.5b', ...]
```

## Edicao com IA

```typescript
import { editarComIA } from './brain/editar';

const resultado = await editarComIA(
  '/path/to/file.ts',
  'Adicione validacao de email',
  {
    startLine: 10,
    endLine: 20
  }
);

// resultado contem:
// - ok: boolean
// - novoConteudo: codigo editado
// - diff: diff entre antigo e novo
// - erro: erro se houver
```

## Memoria Generativa

Memoria baseada em embeddings para contexto:

```typescript
import { indexarTurno, buscarMemoria } from './memory/embeddings';

// Indexar conversa
await indexarTurno('/path/to/project', 'user', 'Como usar o useEffect?');
await indexarTurno('/path/to/project', 'assistant', 'O useEffect e um hook do React...');

// Buscar na memoria
const resultados = await buscarMemoria('/path/to/project', 'useEffect');
```

## API IPC

### Handlers

| Canal | Descricao | Retorno |
|-------|-----------|---------|
| `brain:ask` | Pergunta ao brain | `{ ok, text, provider, modelo }` |
| `brain:providers` | Lista providers | `{ ok, providers }` |
| `brain:ollama-status` | Status do Ollama | `{ ok, ativo, url, modelos }` |
| `brain:models` | Lista modelos | `{ ok, modelos }` |
| `brain:avaliar` | Avalia modelo | `{ ok, avaliacao }` |

## Configuracao

### Configuracoes do Brain

```typescript
export const BRAIN_CONFIG = {
  defaultProvider: 'ollama',
  defaultModel: 'qwen2.5-coder:1.5b',
  fastModel: 'qwen2.5-coder:1.5b',
  chatModel: 'qwen2.5-coder:3b',
  maxTokens: 8192,
  timeoutMs: 120000,
  keepAlive: '30s'
};
```

### Modelos Recomendados

```typescript
export const MODELOS_RECOMENDADOS = {
  // Rapidos (1-2B parametros)
  rapidos: ['qwen2.5-coder:1.5b', 'llama3.2:1b'],
  
  // Balanceados (3-7B parametros)
  balanceados: ['qwen2.5-coder:3b', 'llama3.2:3b', 'mistral:7b'],
  
  // Potentes (7B+ parametros)
  potentes: ['qwen2.5-coder:7b', 'llama3.2:11b', 'mistral:7b'],
  
  // Especializados
  especializados: {
    codigo: ['qwen2.5-coder:3b', 'codeqwen:7b'],
    analise: ['qwen2.5-coder:3b', 'mistral:7b'],
    geracao: ['qwen2.5-coder:7b', 'llama3.2:11b']
  }
};
```

## Depuracao

### Logs

```bash
# Ver logs do brain
cat /path/to/.dg-editor/logs/brain.log
```

### Debug Mode

```typescript
process.env.BRAIN_DEBUG = '1';
process.env.BRAIN_VERBOSE = '1';
```

## Testes

### Teste Basico

```typescript
import { getBrain } from './brain/module';

const brain = getBrain();
const response = await brain.ask('Qual e 2+2?', '');

console.assert(response.ok, 'Pergunta falhou');
console.assert(response.text.includes('4'), 'Resposta incorreta');
```

### Teste de Analise

```typescript
const analysis = await brain.analyze('/path/to/project', 'Analise este projeto');

console.assert(analysis.ok, 'Analise falhou');
console.assert(analysis.resumo, 'Nao gerou resumo');
```

## Roadmap

- [x] Integracao com Ollama
- [x] Sistema de providers
- [x] Registry de modelos
- [x] Sistema hibrido
- [x] Avaliacao de modelos
- [x] Skills
- [x] Indice de codigo
- [x] Memoria generativa
- [ ] Integracao com OpenAI
- [ ] Integracao com Anthropic
- [ ] Fine-tuning de modelos
- [ ] Multi-provider load balancing

## Contribuindo

Para adicionar um novo provider:

1. Implemente a interface `Provider`
2. Adicione ao registry
3. Adicione testes

## Versao

- **Versao**: 0.2.0
- **Data**: Novembro de 2024
- **Autor**: Rodrigo Soares
- **Licenca**: MIT
