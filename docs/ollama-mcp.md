# Ollama local e Cloud no MCP

O MCP do DG Editor expõe `ollama_ask` para perguntas e `ollama_script` para gerar código. Ambas usam o mesmo roteamento entre o daemon Ollama, os modelos remotos e a API do Ollama Cloud, com fallback para um modelo local instalado.

`ollama_script` retorna o código solicitado. A ferramenta não grava arquivos nem executa comandos. O contexto vem dos argumentos explícitos da chamada; nenhum arquivo do projeto é anexado automaticamente.

## Ativar

Na raiz do projeto, compile o servidor:

```powershell
npm run build:mcp
```

Para um cliente MCP externo, use a configuração de [`.dg-editor/mcp-config.json`](../.dg-editor/mcp-config.json). Ela aponta para o servidor compilado em `.dg-editor/bin/main/mcp/server.js` e define `DG_ROOT` com a raiz atual do workspace. Se mover o projeto, atualize os dois caminhos. O comando `node` precisa estar no PATH do cliente externo; após instalar Node ou mudar variáveis de ambiente, reinicie esse cliente. O cliente interno do DG Editor usa o runtime do próprio aplicativo.

Compile antes de iniciar a conexão MCP e conecte o cliente diretamente ao servidor compilado por stdio. Reinicie a conexão após recompilar para carregar o código novo.

## Autenticação e nomes de modelos

Há dois caminhos para o Cloud:

- **Pelo daemon local:** entre na conta com `ollama signin`. Use o alias conhecido pelo daemon, como `gemma4:cloud` ou o formato legado `gpt-oss:120b-cloud`. O daemon cuida da autenticação.
- **Pela API direta:** defina `OLLAMA_API_KEY` no ambiente do processo MCP. A chamada usa `https://ollama.com/api/chat` e o nome canônico anunciado por `https://ollama.com/api/tags`, como `gemma4:31b`.

A implementação preserva os aliases ao chamar o daemon. Também reconhece remotes por `remote_model` e `remote_host`, inclusive quando o nome não contém `cloud`. Para a API direta, prefere o `remote_model` anunciado pelo daemon e aceita apenas o host oficial HTTPS. A chave nunca é enviada ao daemon, a um `remote_host` arbitrário ou através de redirecionamentos.

Um seletor `familia:cloud` pode corresponder a mais de um nome no catálogo Cloud. Se não houver uma resolução única, informe o nome canônico com `backend: "cloud"`; o servidor não presume `:latest`. Consulte os formatos atuais e a diferença entre login e chave nas documentações oficiais de [Cloud](https://docs.ollama.com/cloud) e [autenticação](https://docs.ollama.com/api/authentication).

## Ambiente

Defina as variáveis no ambiente que inicia o MCP. [`.env.example`](../.env.example) contém os nomes, sem credenciais reais.

| Variável | Uso |
| --- | --- |
| `OLLAMA_URL` | URL do daemon; padrão `http://127.0.0.1:11434`. Tem precedência sobre `OLLAMA_HOST`. |
| `OLLAMA_HOST` | Alternativa para configurar o daemon, aceitando também `host:porta`. |
| `OLLAMA_API_KEY` | Chave para a API direta oficial. Não é necessária para um daemon já autenticado. |
| `OLLAMA_MODEL` | Modelo padrão quando a chamada não informa `model`. |
| `OLLAMA_FALLBACK_MODEL` | Modelo local instalado preferido como fallback. |

As URLs do daemon devem usar HTTP(S), sem usuário, senha, query ou fragmento. Se `OLLAMA_URL` apontar para `https://ollama.com`, o roteamento prefere a API direta e procura fallback no daemon padrão em `127.0.0.1:11434`.

Sem `model` nem `OLLAMA_MODEL`, o servidor tenta o modelo ativo de `.dg-editor/modelos.json` e depois um modelo local instalado, priorizando os menores. A ferramenta não baixa modelos nem instala Ollama.

## Parâmetros

| Parâmetro | Contrato |
| --- | --- |
| `prompt` | Obrigatório; texto não vazio, até 200.000 caracteres. |
| `model` | Nome local, alias cloud ou remote; até 200 caracteres. |
| `fallback_model` | Modelo local instalado preferido; até 200 caracteres. Cloud, remotes e embeddings são recusados. |
| `backend` | `auto` (padrão), `local` ou `cloud`. |
| `context` | Contexto explícito opcional; até 200.000 caracteres. |
| `system` | Instrução opcional; até 50.000 caracteres. Em `ollama_script`, complementa a instrução de gerar somente código. |
| `language` | Somente em `ollama_script`; por exemplo `powershell`, `python` ou `bash`, até 80 caracteres. |
| `temperature` | Número entre 0 e 2; padrão 0,2. |
| `num_predict` | Inteiro entre 1 e 32.768; padrão 1.024 em `ollama_ask` e 2.048 em `ollama_script`. |
| `timeout_ms` | Timeout por tentativa de geração, entre 100 e 300.000 ms; padrão 60.000 ms. |

Com `auto`, a primeira tentativa usa o daemon. Se o modelo solicitado for cloud/remote e essa tentativa falhar por indisponibilidade, o servidor tenta a API oficial quando há chave e depois procura um fallback local. Um pedido para um modelo local não muda automaticamente para Cloud.

Com `cloud`, a primeira geração usa diretamente a API oficial; o fallback local continua disponível. Com `local`, qualquer modelo identificado como cloud/remote é recusado e nenhuma geração usa Cloud.

O fallback considera, nesta ordem, `fallback_model`, `OLLAMA_FALLBACK_MODEL`, o modelo ativo do catálogo e os modelos locais instalados. Cada candidato precisa aparecer no daemon e ser confirmado por `/api/show` como local e capaz de gerar texto. São feitas no máximo três tentativas locais alternativas. Falhas de autenticação, limite, rede, timeout ou resposta vazia podem acionar o fallback; cancelamento, argumentos inválidos e erros definitivos não são mascarados por uma nova tentativa. As respostas são completas, sem streaming, para evitar misturar uma resposta cloud parcial com outra local.

## Exemplos de chamada

Alias Cloud pelo daemon, com fallback local já instalado:

```json
{
  "name": "ollama_ask",
  "arguments": {
    "prompt": "Explique as vantagens de uma fila serial de tarefas.",
    "model": "gemma4:cloud",
    "backend": "auto",
    "fallback_model": "qwen2.5-coder:3b"
  }
}
```

Geração pela API direta, usando um nome confirmado no catálogo Cloud:

```json
{
  "name": "ollama_script",
  "arguments": {
    "prompt": "Liste os arquivos .log de uma pasta recebida como argumento, sem removê-los.",
    "language": "powershell",
    "model": "gemma4:31b",
    "backend": "cloud",
    "fallback_model": "qwen2.5-coder:3b",
    "timeout_ms": 60000
  }
}
```

Para restringir uma pergunta a modelos locais, use `backend: "local"` e o nome de um modelo instalado sem metadados de remote. Os nomes dos exemplos dependem do catálogo disponível e da sua instalação.

## Retorno

O conteúdo textual da resposta MCP contém um objeto JSON com:

| Campo | Significado |
| --- | --- |
| `text` | Resposta do modelo ou código gerado. |
| `requested_model` | Modelo pedido ou resolvido como padrão. |
| `model` | Modelo que respondeu. |
| `provider` | `ollama-local` ou `ollama-cloud`. |
| `transport` | `daemon` ou `cloud`; um remote pode ter provider Cloud e transporte daemon. |
| `fallback_used` | `true` quando a resposta veio de um modelo local alternativo. |
| `attempts` | Tentativas de geração com `model`, `backend`, `ok` e, em falhas, `error`. Os backends são `local`, `daemon-cloud` e `cloud`. |
| `language` | Linguagem informada em `ollama_script`, quando presente. |

A chave de API e valores Bearer são ocultados nos erros do histórico. Se nenhuma tentativa produzir resposta, a ferramenta retorna erro MCP com o resumo das falhas; um modelo cloud nunca é tratado como fallback local.
