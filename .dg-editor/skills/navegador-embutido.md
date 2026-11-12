---
titulo: Navegador embutido
gatilho: navegador, painel web, login site, baixar pagina, abrir site, navegar
---

# Navegador embutido

## Quando usar
Abrir site, fazer login, ler pagina externa ou baixar arquivo da web sem sair do DG Editor.

## Procedimento
1. Abra a aba Browser no painel direito (Arquivo > Navegador). As tools navegador_* operam sobre ela.
2. Navegar: `navegador_abrir` com a URL. O painel mostra a pagina e o status do embed.
3. Ler: `navegador_ler` devolve o texto da pagina. Use antes de clicar, para confirmar que carregou.
4. Interagir: `navegador_clicar` com seletor ou texto; `navegador_preencher` com seletor e valor.
5. Baixar: `navegador_baixar` guarda em `.dg-editor/downloads` e devolve o caminho.
6. Login e MANUAL: o usuario digita a senha no painel. A sessao persiste em `persist:dgnav`.

## Criterio de sucesso
- A acao aconteceu no painel e foi confirmada lendo a pagina ou o caminho retornado.
- Nenhuma credencial foi solicitada no chat.

## O que NAO fazer
- Nunca pedir senha, token ou cookie no chat.
- Nunca afirmar que clicou sem conferir o retorno da tool.
- Se o controle nao responder, pedir para abrir Arquivo > Navegador no DG Editor.