/** Metadados de comandos da paleta (sem fn — execução no renderer). */
export interface ComandoMeta {
  id: string
  titulo: string
  atalho?: string
  area: 'navegacao' | 'terminal' | 'chat' | 'sistema' | 'busca'
}

export const COMANDOS_META: ComandoMeta[] = [
  { id: 'abrir-pasta', titulo: 'Abrir pasta de trabalho', atalho: 'Ctrl+O', area: 'sistema' },
  { id: 'quick-open', titulo: 'Quick Open (arquivo)', atalho: 'Ctrl+P', area: 'busca' },
  { id: 'busca-global', titulo: 'Busca no projeto', atalho: 'Ctrl+Shift+F', area: 'busca' },
  { id: 'paleta-comandos', titulo: 'Paleta de comandos', atalho: 'Ctrl+Shift+P', area: 'busca' },
  { id: 'salvar', titulo: 'Salvar arquivo ativo', atalho: 'Ctrl+S', area: 'sistema' },
  { id: 'fechar-aba', titulo: 'Fechar aba ativa', atalho: 'Ctrl+W', area: 'sistema' },
  { id: 'toggle-sidebar', titulo: 'Alternar Explorer', atalho: 'Ctrl+B', area: 'navegacao' },
  { id: 'toggle-right', titulo: 'Alternar painel direito', atalho: 'Ctrl+Alt+B', area: 'chat' },
  { id: 'orientar-prompt', titulo: 'Orientar prompt do chat', atalho: 'Ctrl+Alt+P', area: 'chat' },
  { id: 'toggle-terminal', titulo: 'Alternar terminal', atalho: 'Ctrl+`', area: 'terminal' },
  { id: 'analisar', titulo: 'Analisar sistema aberto', area: 'chat' },
  { id: 'limpar-chat', titulo: 'Limpar chat desta pasta', area: 'chat' },
  { id: 'navegador', titulo: 'Abrir navegador embutido', atalho: 'Ctrl+Shift+N', area: 'navegacao' },
  { id: 'tema', titulo: 'Alternar tema', area: 'sistema' }
]

export function listarComandosMeta(): ComandoMeta[] {
  return COMANDOS_META.slice()
}
