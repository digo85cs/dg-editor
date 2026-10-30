---
titulo: Navegador embutido
gatilho: navegador, painel web, login site, baixar pagina, abrir site, navegar
---

# Navegador embutido

## Quando usar
Pedidos que exigem abrir um site, fazer login, ler pagina externa ou baixar arquivo da web sem sair do DG Editor.

## Procedimento
1. Abra a aba Browser no painel direito (Arquivo > Navegador, ou icone da barra). As tools navegador_* operam sobre essa aba.
2. Navegar: `navegador_abrir` com a URL. O painel mostra a pagina e o status do embed.
3. Ler: `navegador_ler` devolve o texto da pagina atual. Use antes de clicar ou preencher, para confirmar que carregou o que voce espera.
4. Interagir: `navegador_clicar` com seletor CSS ou texto do elemento; `navegador_preencher` com seletor e valor.
5. Baixar: `navegador_baixar` guarda o arquivo em `.dg-editor/downloads` e devolve o caminho local.
6. Login e sempre MANUAL: o usuario digita a senha no painel Navegador. A sessao e persistida em `persist:dgnav` e reaproveitada nas proximas aberturas.

## Criterio de sucesso
- A acao pedida aconteceu no painel (pagina mudou, campo preenchido, arquivo baixado) e o resultado foi confirmado lendo a pagina ou o caminho retornado.
- Nenhuma credencial foi solicitada no chat.

## O que NAO fazer
- Nunca pedir senha, token ou cookie no chat: o login e feito pelo usuario no painel.
- Nunca afirmar que clicou ou preencheu sem conferir o retorno da tool.
- Se o controle nao responder, nao insistir em loop: pedir para abrir Arquivo > Navegador no DG Editor.