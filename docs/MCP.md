# MCP — DG Editor

## Visão geral

O DG Editor expõe dois servidores MCP, com propósito e escopo distintos:

| Servidor | Protocolo | Exposição | Leitura/Escrita | Autenticação |
|----------|-----------|-----------|-----------------|--------------|
| `server.ts` (stdio) | stdin/stdout | Apenas local (processo pai) | Leitura + escrita | Nenhuma (confiança local) |
| `http-server.ts` (HTTP) | Streamable HTTP | `127.0.0.1:7331/mcp` | **Somente leitura** | `DG_MCP_TOKEN` (Bearer) |

O servidor stdio **não deve** ser exposto por rede, nem ter ferramentas destrutivas adicionadas.

## Servidor HTTP (Read-only)

**Arquivo:** `src/main/mcp/http-server.ts`  
**Endpoint:** `http://127.0.0.1:7331/mcp`  
**Bind:** `127.0.0.1` apenas (não aceita conexões externas)  
**Token:** variável de ambiente `DG_MCP_TOKEN`, enviada no header `Authorization: Bearer <token>`  
**Início sem token:** imprime `DG_MCP_TOKEN ausente` e sai com código 1

### Iniciar

```bash
set DG_MCP_TOKEN=<seu-token>
npm run mcp:http
```

### Ferramentas expostas (11, somente leitura)

| Ferramenta | Descrição |
|------------|-----------|
| `dossie_read` | Lê o dossie atual (`.dg-editor/dossie.txt`) |
| `dossie_snapshot` | Snapshot estruturado do dossie |
| `vault_list` | Lista arquivos do vault (`.dg-editor/`) |
| `vault_read` | Lê conteúdo de um arquivo do vault |
| `projeto_arvore` | Árvore de arquivos do projeto (respeita .gitignore básico) |
| `codigo_buscar` | Busca símbolos no índice de código |
| `codigo_ler` | Lê símbolo pelo nome ou arquivo por caminho relativo |
| `git_status` | Status git do workspace (branch + porcelain) |
| `git_diff` | Diff git do workspace ou de um caminho relativo |
| `qualidade_checar` | Checagens leves de qualidade (encoding/sintaxe) |
| `resultado_avaliar` | Avalia se a resposta final atende o pedido |

### Proteções

- Arquivos protegidos (`.env`, `.pem`, `.key`, chaves SSH, `.netrc`, `.npmrc`, `.git-credentials`, `mcp-config.json`, `dg-config.json`, `nav-token`) são recusados
- Qualquer caminho com segmento contendo `credencial`, `credentials` ou `secret` é bloqueado
- Path traversal (`..`) bloqueado
- Log de chamadas não inclui o token
- Ferramentas destrutivas (`terminal_exec`, `ftp_deploy`, `codigo_editar`, etc.) **não** estão expostas

## Isolamento de repositório

O servidor HTTP usa `obterRaizWorkspace()` (ou `DG_ROOT` env) como raiz base, nunca `resolverRaizProjeto()` que aponta para o diretório do próprio DG Editor. Isso garante que operações de git, busca de código, árvore de projeto e vault sejam escopadas ao workspace ativo do usuário, não ao diretório da aplicação.

## Diferença para o servidor stdio

O servidor stdio (`server.ts`) é usado localmente pelo próprio DG Editor e pode expor ferramentas de gravação. Não compartilha código com o servidor HTTP; cada um tem seu próprio tsconfig e ponto de entrada.
