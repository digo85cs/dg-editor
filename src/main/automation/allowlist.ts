/**
 * Allow-list declarativa (Etapa 1) — LISTA FECHADA.
 * Nenhum comando fora daqui é executável pelo guard.
 */
export type DominioAutomacao = 'office' | 'windows' | 'browser' | 'dg-editor'
export type RiscoAutomacao = 'baixo' | 'medio' | 'alto'
export type NivelAprovacao = 'automatico' | 'simples' | 'forte'

export interface SchemaArgs {
  type: 'object'
  properties?: Record<string, { type: string; description?: string; enum?: string[]; pattern?: string }>
  required?: string[]
  additionalProperties?: boolean
}

export interface ComandoAutomacao {
  id: string
  dominio: DominioAutomacao
  descricao: string
  schemaArgs: SchemaArgs
  risco: RiscoAutomacao
  requerAprovacao: boolean
  nivelAprovacao: NivelAprovacao
}

const OBJ = (properties: SchemaArgs['properties'] = {}, required: string[] = [], additionalProperties = false): SchemaArgs => ({
  type: 'object',
  properties,
  required,
  additionalProperties
})

export const ALLOWLIST: readonly ComandoAutomacao[] = Object.freeze([
  // OFFICE — Excel
  { id: 'excel.abrir', dominio: 'office', descricao: 'Abre Excel (novo ou arquivo).', schemaArgs: OBJ({ caminho: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'excel.celula.ler', dominio: 'office', descricao: 'Lê valor de célula.', schemaArgs: OBJ({ planilha: { type: 'string' }, celula: { type: 'string' } }, ['celula']), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'excel.celula.escrever', dominio: 'office', descricao: 'Escreve valor em célula.', schemaArgs: OBJ({ planilha: { type: 'string' }, celula: { type: 'string' }, valor: { type: 'string' } }, ['celula', 'valor']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'excel.range.ler', dominio: 'office', descricao: 'Lê intervalo de células.', schemaArgs: OBJ({ planilha: { type: 'string' }, range: { type: 'string' } }, ['range']), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'excel.range.escrever', dominio: 'office', descricao: 'Escreve matriz em intervalo.', schemaArgs: OBJ({ planilha: { type: 'string' }, range: { type: 'string' }, valores: { type: 'array' } }, ['range', 'valores']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'excel.salvar', dominio: 'office', descricao: 'Salva pasta de trabalho.', schemaArgs: OBJ({ caminho: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'excel.fechar', dominio: 'office', descricao: 'Fecha pasta de trabalho/Excel.', schemaArgs: OBJ({ salvar: { type: 'boolean' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'excel.criar-planilha', dominio: 'office', descricao: 'Cria nova planilha na pasta ativa.', schemaArgs: OBJ({ nome: { type: 'string' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'simples' },
  // OFFICE — Word
  { id: 'word.abrir', dominio: 'office', descricao: 'Abre Word (novo ou arquivo).', schemaArgs: OBJ({ caminho: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'word.texto.ler', dominio: 'office', descricao: 'Lê texto do documento.', schemaArgs: OBJ({}), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'word.texto.escrever', dominio: 'office', descricao: 'Insere texto no documento.', schemaArgs: OBJ({ texto: { type: 'string' }, posicao: { type: 'string' } }, ['texto']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'word.salvar', dominio: 'office', descricao: 'Salva documento.', schemaArgs: OBJ({ caminho: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'word.fechar', dominio: 'office', descricao: 'Fecha documento/Word.', schemaArgs: OBJ({ salvar: { type: 'boolean' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'simples' },
  // OFFICE — PowerPoint
  { id: 'powerpoint.abrir', dominio: 'office', descricao: 'Abre PowerPoint (novo ou arquivo).', schemaArgs: OBJ({ caminho: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'powerpoint.slide.criar', dominio: 'office', descricao: 'Cria slide.', schemaArgs: OBJ({ layout: { type: 'string' }, indice: { type: 'number' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'powerpoint.texto.escrever', dominio: 'office', descricao: 'Escreve texto em shape do slide.', schemaArgs: OBJ({ slide: { type: 'number' }, shape: { type: 'number' }, texto: { type: 'string' } }, ['slide', 'texto']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'powerpoint.salvar', dominio: 'office', descricao: 'Salva apresentação.', schemaArgs: OBJ({ caminho: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'powerpoint.fechar', dominio: 'office', descricao: 'Fecha apresentação/PowerPoint.', schemaArgs: OBJ({ salvar: { type: 'boolean' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'simples' },
  // WINDOWS
  { id: 'windows.processo.listar', dominio: 'windows', descricao: 'Lista processos (leitura).', schemaArgs: OBJ({ filtro: { type: 'string' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'windows.processo.iniciar', dominio: 'windows', descricao: 'Inicia processo permitido.', schemaArgs: OBJ({ programa: { type: 'string' }, argumentos: { type: 'array' }, diretorio: { type: 'string' } }, ['programa']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.processo.encerrar', dominio: 'windows', descricao: 'Encerra processo por PID/nome.', schemaArgs: OBJ({ pid: { type: 'number' }, nome: { type: 'string' } }), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.janela.listar', dominio: 'windows', descricao: 'Lista janelas (leitura).', schemaArgs: OBJ({}), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'windows.janela.ativar', dominio: 'windows', descricao: 'Ativa janela por título/PID.', schemaArgs: OBJ({ titulo: { type: 'string' }, pid: { type: 'number' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'windows.janela.fechar', dominio: 'windows', descricao: 'Fecha janela por título/PID.', schemaArgs: OBJ({ titulo: { type: 'string' }, pid: { type: 'number' } }), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.servico.status', dominio: 'windows', descricao: 'Consulta status de serviço (leitura).', schemaArgs: OBJ({ nome: { type: 'string' } }, ['nome']), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'windows.servico.iniciar', dominio: 'windows', descricao: 'Inicia serviço (pode exigir admin).', schemaArgs: OBJ({ nome: { type: 'string' } }, ['nome']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.servico.parar', dominio: 'windows', descricao: 'Para serviço (pode exigir admin).', schemaArgs: OBJ({ nome: { type: 'string' } }, ['nome']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.arquivo.ler', dominio: 'windows', descricao: 'Lê arquivo (fora de System32).', schemaArgs: OBJ({ caminho: { type: 'string' } }, ['caminho']), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'windows.arquivo.escrever', dominio: 'windows', descricao: 'Escreve arquivo (somente D:\ e C:\Users\<user>).', schemaArgs: OBJ({ caminho: { type: 'string' }, conteudo: { type: 'string' } }, ['caminho', 'conteudo']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.arquivo.listar', dominio: 'windows', descricao: 'Lista diretório (leitura).', schemaArgs: OBJ({ caminho: { type: 'string' } }, ['caminho']), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'windows.arquivo.mover', dominio: 'windows', descricao: 'Move arquivo em paths permitidos.', schemaArgs: OBJ({ origem: { type: 'string' }, destino: { type: 'string' } }, ['origem', 'destino']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'windows.arquivo.copiar', dominio: 'windows', descricao: 'Copia arquivo em paths permitidos.', schemaArgs: OBJ({ origem: { type: 'string' }, destino: { type: 'string' } }, ['origem', 'destino']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'windows.sistema.info', dominio: 'windows', descricao: 'Info de sistema (memória/disco/CPU/uptime).', schemaArgs: OBJ({}), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  // BROWSER
  { id: 'browser.abrir', dominio: 'browser', descricao: 'Abre Chrome/Edge com CDP 9222.', schemaArgs: OBJ({ navegador: { type: 'string', enum: ['chrome', 'edge'] }, url: { type: 'string' } }, ['navegador']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'browser.navegar', dominio: 'browser', descricao: 'Navega para URL.', schemaArgs: OBJ({ url: { type: 'string' } }, ['url']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'browser.obterDom', dominio: 'browser', descricao: 'Obtém DOM estruturado.', schemaArgs: OBJ({ seletor: { type: 'string' }, profundidade: { type: 'number' } }), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  { id: 'browser.executarJs', dominio: 'browser', descricao: 'Executa JS na página (restrito).', schemaArgs: OBJ({ script: { type: 'string' } }, ['script']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'browser.fechar', dominio: 'browser', descricao: 'Fecha aba/navegador controlado.', schemaArgs: OBJ({ alvo: { type: 'string' } }), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'browser.listarAbas', dominio: 'browser', descricao: 'Lista abas CDP.', schemaArgs: OBJ({}), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' },
  // DG-EDITOR
  { id: 'dg.arquivo.abrir', dominio: 'dg-editor', descricao: 'Abre arquivo no DG Editor.', schemaArgs: OBJ({ caminho: { type: 'string' } }, ['caminho']), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'dg.arquivo.salvar', dominio: 'dg-editor', descricao: 'Salva arquivo via DG Editor.', schemaArgs: OBJ({ caminho: { type: 'string' } }, ['caminho']), risco: 'medio', requerAprovacao: true, nivelAprovacao: 'simples' },
  { id: 'dg.terminal.executar', dominio: 'dg-editor', descricao: 'Executa no terminal do DG (reutiliza handler).', schemaArgs: OBJ({ comando: { type: 'string' }, cwd: { type: 'string' } }, ['comando']), risco: 'alto', requerAprovacao: true, nivelAprovacao: 'forte' },
  { id: 'dg.projeto.info', dominio: 'dg-editor', descricao: 'Info do projeto atual (leitura).', schemaArgs: OBJ({}), risco: 'baixo', requerAprovacao: true, nivelAprovacao: 'automatico' }
])

const mapa = new Map(ALLOWLIST.map((c) => [c.id, c]))
export function obterComando(id: string): ComandoAutomacao | undefined { return mapa.get(id) }
export function listarComandos(): ComandoAutomacao[] { return [...ALLOWLIST] }

// Palavras/paths proibidos (defesa em profundidade além da allow-list)
export const PADROES_PROIBIDOS: RegExp[] = [
  /\bformat\b/i, /\bdiskpart\b/i, /\bbcdedit\b/i, /\breg\s+delete\b/i,
  /\bshutdown\b/i, /\brestart-computer\b/i, /\bstop-computer\b/i, /\blogoff\b/i,
  /\brm\s+-rf\b/i, /\bdel\s+\/[fFsSqQaA]/, /remove-item\b.*-recurse\b.*-force\b/i,
  /C:\\Windows\\System32/i
]

export function contemPadraoProibido(texto: string): string | null {
  for (const rx of PADROES_PROIBIDOS) {
    if (rx.test(texto)) return rx.source
  }
  return null
}
