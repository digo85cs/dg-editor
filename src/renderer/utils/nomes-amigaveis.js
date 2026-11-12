/** Nomes amigáveis para arquivos técnicos (Quick Open + árvore). */
export const NOMES_AMIGAVEIS = {
  '.dgrules': 'Regras do projeto',
  '.env': 'Variáveis de ambiente',
  '.env.example': 'Exemplo de variáveis',
  '.env.local': 'Variáveis locais',
  'package.json': 'Pacote do projeto',
  'package-lock.json': 'Trava de dependências',
  'tsconfig.json': 'Configuração TypeScript',
  'README.md': 'Leia-me',
  'readme.md': 'Leia-me',
  LICENSE: 'Licença',
  'abrir-dg-editor.bat': 'Atalho para abrir (Windows)',
  'abrir-dg-editor.vbs': 'Atalho silencioso (Windows)',
  'AGENTS.md': 'Guia de agentes',
  'index.html': 'Página principal',
  'styles.css': 'Estilos da interface',
  'app.js': 'Lógica da interface',
  'vite.config.ts': 'Configuração Vite',
  'electron.vite.config.ts': 'Configuração Electron-Vite',
  '.gitignore': 'Arquivos ignorados no Git',
  'CONTROLE.md': 'Controle do projeto'
}

/**
 * @param {string} nome
 * @param {string} [rel]
 */
export function nomeAmigavelArquivo(nome, rel) {
  const n = String(nome || '')
  if (NOMES_AMIGAVEIS[n]) return NOMES_AMIGAVEIS[n]
  if (/^\d+$/.test(n)) return 'Arquivo ' + n
  return n || String(rel || 'arquivo')
}

/**
 * Rótulo de pasta/repo na UI (Bloco 1/2).
 * Ex.: pasta "DGEditor" → "DG Editor".
 * @param {string} nomeOuCaminho
 */
export function formatNomePastaUi(nomeOuCaminho) {
  const raw = String(nomeOuCaminho || '').replace(/\//g, '\\')
  const base = raw.includes('\\') ? raw.slice(raw.lastIndexOf('\\') + 1) : raw
  if (!base) return ''
  if (/^dg[\s._-]*editor$/i.test(base) || /^dgeditor$/i.test(base)) return 'DG Editor'
  // CamelCase com prefixo DG: DGEditor → DG Editor, DGStudio → DG Studio
  const m = base.match(/^(DG)([A-Z][a-zA-Z0-9]+)$/)
  if (m) return m[1] + ' ' + m[2]
  return base
}
