---
description: Regras do DG Editor para Electron, testes, automações e instaladores.
applyTo: "**/*.js, **/*.ts, **/*.tsx, **/*.json"
---

# DG Editor

- Leia `README.md`, `.dgrules` e `docs/TESTES.md` antes de alterar fluxos do agente, navegador ou terminal integrado.
- Preserve o funcionamento local do Electron e o mecanismo de revisão/aplicação de propostas; não abra, instale ou encerre processos do app sem necessidade.
- Respeite a ordem documentada dos testes. Smoke de navegador deve ser isolado; não o execute junto com `npm test` ou outro Electron.
- Não gere instaladores, execute faxinas, altere atalhos nem rode scripts com efeitos no sistema sem autorização explícita.
