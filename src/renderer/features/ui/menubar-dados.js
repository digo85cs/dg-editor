// menubar-dados.js — definição dos menus da barra de título (dados puros).
// Extraído de app.js (bloco "Menubar").

export const MENUS_BARRA = {
  arquivo: [
    { id: 'assistente-novo', label: 'Novo…', accel: 'Ctrl+N' },
    { id: 'abrir-pasta', label: 'Abrir pasta de trabalho…', accel: 'Ctrl+O' },
    { id: 'abrir-vault', label: 'Abrir vault Markdown…' },
    { sep: true },
    { id: 'salvar', label: 'Salvar', accel: 'Ctrl+S' },
    { id: 'fechar-aba', label: 'Fechar aba', accel: 'Ctrl+W' },
    { sep: true },
    { id: 'navegador', label: 'Navegador…', accel: 'Ctrl+Shift+N' },
    { sep: true },
    { id: 'sair', label: 'Sair', accel: 'Alt+F4' }
  ],
  editar: [
    { id: 'edit-undo', label: 'Desfazer', accel: 'Ctrl+Z', edit: 'undo' },
    { id: 'edit-redo', label: 'Refazer', accel: 'Ctrl+Y', edit: 'redo' },
    { sep: true },
    { id: 'edit-cut', label: 'Recortar', accel: 'Ctrl+X', edit: 'cut' },
    { id: 'edit-copy', label: 'Copiar', accel: 'Ctrl+C', edit: 'copy' },
    { id: 'edit-paste', label: 'Colar', accel: 'Ctrl+V', edit: 'paste' },
    { id: 'edit-selectAll', label: 'Selecionar tudo', accel: 'Ctrl+A', edit: 'selectAll' },
    { sep: true },
    { id: 'formatar', label: 'Formatar documento', accel: 'Shift+Alt+F' }
  ],
  ver: [
    { id: 'recarregar', label: 'Recarregar', accel: 'Ctrl+R' },
    { id: 'forcar-recarregar', label: 'Forçar recarregamento', accel: 'Ctrl+Shift+R' },
    { sep: true },
    { id: 'zoom-in', label: 'Zoom: aumentar', accel: 'Ctrl+=' },
    { id: 'zoom-out', label: 'Zoom: diminuir', accel: 'Ctrl+-' },
    { id: 'zoom-reset', label: 'Zoom: padrão', accel: 'Ctrl+0' },
    { sep: true },
    { id: 'toggle-sidebar', label: 'Alternar Explorer', accel: 'Ctrl+B' },
    { id: 'toggle-right', label: 'Alternar painel direito', accel: 'Ctrl+Alt+B' },
    { id: 'toggle-terminal', label: 'Alternar terminal', accel: 'Ctrl+`' },
    { id: 'tema', label: 'Alternar tema' },
    { id: 'tema-escuro', label: 'Tema escuro' },
    { id: 'tema-claro', label: 'Tema claro' },
    { sep: true },
    { id: 'tela-cheia', label: 'Tela cheia', accel: 'F11' },
    { sep: true },
    { id: 'orientar-prompt', label: 'Assistente de prompt', accel: 'Ctrl+Alt+P' },
    { id: 'agent-panel', label: 'Painel Agente' }
  ],
  sistemas: [
    { id: 'paleta-comandos', label: 'Paleta de comandos', accel: 'Ctrl+Shift+P' },
    { id: 'quick-open', label: 'Quick Open', accel: 'Ctrl+P' },
    { sep: true },
    { id: 'contas', label: 'Contas e saúde' },
    { id: 'config', label: 'Configurações' },
    { id: 'analisar', label: 'Análise do sistema' },
    { id: 'auditar', label: 'Auto auditoria' },
    { id: 'regras-projeto', label: 'Regras do projeto (.dgrules)' },
    { sep: true },
    { id: 'estudio-midia', label: 'Estúdio de mídia' },
    { id: 'navegador', label: 'Navegador embutido', accel: 'Ctrl+Shift+N' }
  ],
  ajuda: [{ id: 'sobre', label: 'Sobre o DG Editor' }]
}
