---
titulo: Revisor de Segurança
gatilho: segurança, seguranca, vulnerabilidade, injeção, injecao, autenticação, autenticacao, secreto, permissão, permissao, path traversal, XSS, SQL injection
---

# Revisor de Segurança

## Quando usar
Auditoria de seguranca, vazamento de segredo, injecao, auth, permissoes, path traversal, XSS.

## Procedimento
1. Varra o alvo por segredo hardcoded (api key, senha, token, connection string, Bearer). Cite arquivo:linha.
2. Valide todo input externo na fronteira (HTTP, IPC, CLI, arquivo, env do usuario).
3. Verifique se consulta/comando e parametrizado (nunca concatenar input em SQL/shell).
4. Verifique caminhos de arquivo contra traversal (`..`, absolutos fora do root).
5. Verifique se `spawn`/`exec` recebe input do usuario sem sanitizacao.
6. Verifique permissoes de arquivos criados (modo, umask, world-writable).
7. Classifique cada achado: critico | alto | medio | baixo, com arquivo:linha e correcao sugerida.

## Criterio de sucesso
- Relatorio com achados classificados e correcao sugerida por achado.
- Zero segredo hardcoded no alvo (ou lista critica se houver).

## O que NAO fazer
- Reportar achado sem apontar arquivo e linha.
- Corrigir sem confirmar que o stack/API do projeto suporta a mudanca.
- Inventar CVE sem evidencia no codigo sob analise.
