/**
 * PDF (pypdf) e Planilhas (openpyxl) via Python portátil.
 * PDF: mesclar, dividir, info, extrair texto, preencher formulário.
 * Planilha: criar/ler xlsx, csv <-> xlsx.
 */
import { existsSync, statSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  previewDe,
  pythonBin,
  rodar,
  type RespostaMidia
} from './core'

const SCRIPT_PDF = `import sys, json
from pypdf import PdfReader, PdfWriter
acao = sys.argv[1]
if acao == 'info':
    r = PdfReader(sys.argv[2])
    print(json.dumps({'paginas': len(r.pages), 'metadados': {k: str(v) for k, v in (r.metadata or {}).items() if v}, 'campos': list((r.get_fields() or {}).keys())}))
elif acao == 'mesclar':
    w = PdfWriter()
    for p in sys.argv[2].split('|'):
        for pg in PdfReader(p).pages: w.add_page(pg)
    w.write(sys.argv[3]); print('ok')
elif acao == 'dividir':
    r = PdfReader(sys.argv[2]); ini, fim = int(sys.argv[3]), int(sys.argv[4])
    w = PdfWriter()
    for i in range(ini - 1, min(fim, len(r.pages))): w.add_page(r.pages[i])
    w.write(sys.argv[5]); print('ok')
elif acao == 'texto':
    r = PdfReader(sys.argv[2]); txt = '\\n\\n'.join((p.extract_text() or '') for p in r.pages)
    open(sys.argv[3], 'w', encoding='utf-8').write(txt); print('ok')
elif acao == 'formulario':
    r = PdfReader(sys.argv[2]); w = PdfWriter(); w.append(r)
    campos = json.loads(sys.argv[3])
    for k, v in campos.items():
        try: w.update_page_form_field_values(w.pages[0], {k: str(v)})
        except Exception: pass
    w.write(sys.argv[4]); print('ok')
`

const SCRIPT_PLANILHA = `import sys, json, csv
from openpyxl import Workbook, load_workbook
def out_json(o): print(json.dumps(o, ensure_ascii=False))
acao, entrada, saida = sys.argv[1], sys.argv[2], sys.argv[3]
if acao == 'ler':
    wb = load_workbook(entrada, data_only=True)
    dados = {}
    for ws in wb.worksheets:
        linhas = []
        for row in ws.iter_rows(values_only=True):
            if any(c is not None for c in row): linhas.append([str(c) if c is not None else '' for c in row])
        dados[ws.title] = linhas[:500]
    out_json({'abas': list(wb.sheetnames), 'linhas': {k: len(v) for k, v in dados.items()}, 'dados': dados})
elif acao == 'csv-para-xlsx':
    wb = Workbook(); ws = wb.active; ws.title = 'Dados'
    with open(entrada, newline='', encoding='utf-8-sig') as f:
        for row in csv.reader(f): ws.append(row)
    wb.save(saida); out_json({'ok': True})
elif acao == 'xlsx-para-csv':
    wb = load_workbook(entrada, data_only=True); ws = wb.active
    with open(saida, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        for row in ws.iter_rows(values_only=True): w.writerow(['' if c is None else c for c in row])
    out_json({'ok': True})
elif acao == 'criar':
    cfg = json.loads(sys.argv[4])
    wb = Workbook(); ws = wb.active; ws.title = cfg.get('aba', 'Dados')
    for linha in cfg.get('linhas', []): ws.append(linha)
    wb.save(saida); out_json({'ok': True})
`

const EXTS_PDF = new Set(['.pdf'])
const EXTS_XLSX = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm'])
const EXTS_CSV = new Set(['.csv', '.tsv', '.txt'])

function scriptTemp(nome: string, codigo: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-doc-'))
  const p = join(dir, nome)
  writeFileSync(p, codigo, 'utf8')
  return p
}

function checarPy(): string | null {
  const py = pythonBin()
  if (!existsSync(py)) {
    return 'Python portátil não instalado. Rode o provisionamento de ferramentas.'
  }
  return null
}

function resolverArquivo(raiz: string, caminho: string, exts: Set<string>): { abs: string } | { erro: string } {
  const entrada = String(caminho || '').trim()
  if (!entrada) return { erro: 'informe o caminho do arquivo' }
  const abs = resolve(raiz, entrada)
  if (!existsSync(abs) || !statSync(abs).isFile()) return { erro: 'arquivo não encontrado: ' + entrada }
  const ext = extname(abs).toLowerCase()
  if (!exts.has(ext)) return { erro: 'formato não suportado (' + ext + ')' }
  return { abs }
}

function okArquivo(raiz: string, destino: string, acao: string, detalhe: string, mime?: string): RespostaMidia {
  const bytes = statSync(destino).size
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime: mime || (destino.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
    previewBase64: previewDe(destino),
    detalhes: { motor: 'pypdf', acao, ...(detalhe ? { detalhe } : {}) },
    aviso: 'PDF ' + acao + ' via pypdf (local, gratuito).'
  }
}

// ---------------------------------------------------------------- PDF

export async function pdfOperar(
  raiz: string,
  opts: {
    acao: 'info' | 'mesclar' | 'dividir' | 'texto' | 'formulario'
    entrada?: string
    entradas?: string[]
    inicio?: number
    fim?: number
    campos?: Record<string, string>
    saida?: string
  }
): Promise<RespostaMidia> {
  const erroPy = checarPy()
  if (erroPy) return { ok: false, erro: erroPy }
  const script = scriptTemp('dg-pdf.py', SCRIPT_PDF)

  if (opts.acao === 'info') {
    const r0 = resolverArquivo(raiz, String(opts.entrada || ''), EXTS_PDF)
    if ('erro' in r0) return { ok: false, erro: r0.erro }
    const r = await rodar(pythonBin(), [script, 'info', r0.abs], 60_000)
    if (!r.stdout.trim()) {
      return { ok: false, erro: 'falha ao ler PDF: ' + (r.stderr || 'sem saída').slice(0, 300) }
    }
    try {
      const info = JSON.parse(r.stdout.trim().split('\n').pop() || '{}') as Record<string, unknown>
      return {
        ok: true,
        caminho: r0.abs,
        caminhoRel: caminhoRelativo(raiz, r0.abs),
        bytes: statSync(r0.abs).size,
        mime: 'application/pdf',
        detalhes: { motor: 'pypdf', acao: 'info', paginas: info.paginas, campos: info.campos, metadados: info.metadados },
        aviso: 'PDF info: ' + info.paginas + ' páginas, ' + ((info.campos as string[]) || []).length + ' campos de formulário.'
      }
    } catch {
      return { ok: false, erro: 'resposta inesperada do pypdf' }
    }
  }

  if (opts.acao === 'mesclar') {
    const entradas = (opts.entradas || []).map((e) => resolverArquivo(raiz, e, EXTS_PDF))
    if (entradas.length < 2) return { ok: false, erro: 'informe pelo menos 2 PDFs em "entradas"' }
    for (const e of entradas) {
      if ('erro' in e) return { ok: false, erro: e.erro }
    }
    const absList = entradas.map((e) => (e as { abs: string }).abs)
    const destino = destinoArquivo(raiz, nomeArquivo('pdfs-mesclados', '.pdf'), opts.saida)
    const r = await rodar(pythonBin(), [script, 'mesclar', absList.join('|'), destino], 120_000)
    if (!r.ok || !existsSync(destino)) {
      return { ok: false, erro: 'falha ao mesclar: ' + (r.stderr || r.stdout || 'erro').slice(0, 300) }
    }
    return okArquivo(raiz, destino, 'mesclar', absList.length + ' PDFs')
  }

  const r0 = resolverArquivo(raiz, String(opts.entrada || ''), EXTS_PDF)
  if ('erro' in r0) return { ok: false, erro: r0.erro }
  const abs = r0.abs

  if (opts.acao === 'dividir') {
    const ini = Math.max(1, Math.floor(opts.inicio || 1))
    const fim = Math.floor(opts.fim || ini)
    const destino = destinoArquivo(raiz, nomeArquivo('pdf-parte', '.pdf'), opts.saida)
    const r = await rodar(pythonBin(), [script, 'dividir', abs, String(ini), String(fim), destino], 120_000)
    if (!r.ok || !existsSync(destino)) {
      return { ok: false, erro: 'falha ao dividir: ' + (r.stderr || r.stdout || 'erro').slice(0, 300) }
    }
    return okArquivo(raiz, destino, 'dividir', 'páginas ' + ini + '-' + fim)
  }

  if (opts.acao === 'texto') {
    const destino = destinoArquivo(raiz, nomeArquivo('pdf-texto', '.txt'), opts.saida)
    const r = await rodar(pythonBin(), [script, 'texto', abs, destino], 120_000)
    if (!r.ok || !existsSync(destino)) {
      return {
        ok: false,
        erro: 'falha ao extrair texto (PDF escaneado/imagem não tem camada de texto): ' + (r.stderr || '').slice(0, 300)
      }
    }
    const bytes = statSync(destino).size
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes,
      mime: 'text/plain',
      detalhes: { motor: 'pypdf', acao: 'extrair-texto' },
      aviso: 'Texto extraído do PDF.'
    }
  }

  // formulario
  const campos = opts.campos && typeof opts.campos === 'object' ? opts.campos : {}
  if (!Object.keys(campos).length) {
    return { ok: false, erro: 'informe "campos" {nomeCampo: valor} para preencher o formulário' }
  }
  const destino = destinoArquivo(raiz, nomeArquivo('pdf-preenchido', '.pdf'), opts.saida)
  const r = await rodar(pythonBin(), [script, 'formulario', abs, JSON.stringify(campos), destino], 120_000)
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'falha ao preencher formulário: ' + (r.stderr || r.stdout || 'erro').slice(0, 300) }
  }
  return okArquivo(raiz, destino, 'preencher-formulario', Object.keys(campos).length + ' campos')
}

// ---------------------------------------------------------------- Planilhas

export async function planilhaOperar(
  raiz: string,
  opts: {
    acao: 'ler' | 'criar' | 'csv-para-xlsx' | 'xlsx-para-csv'
    entrada?: string
    saida?: string
    aba?: string
    linhas?: (string | number)[][]
  }
): Promise<RespostaMidia> {
  const erroPy = checarPy()
  if (erroPy) return { ok: false, erro: erroPy }
  const script = scriptTemp('dg-planilha.py', SCRIPT_PLANILHA)

  if (opts.acao === 'ler') {
    const r0 = resolverArquivo(raiz, String(opts.entrada || ''), EXTS_XLSX)
    if ('erro' in r0) return { ok: false, erro: r0.erro }
    const r = await rodar(pythonBin(), [script, 'ler', r0.abs, ''], 120_000)
    if (!r.stdout.trim()) {
      return { ok: false, erro: 'falha ao ler planilha: ' + (r.stderr || 'sem saída').slice(0, 300) }
    }
    try {
      const dados = JSON.parse(r.stdout.trim().split('\n').pop() || '{}') as {
        abas?: string[]
        linhas?: Record<string, number>
        dados?: Record<string, string[][]>
      }
      return {
        ok: true,
        caminho: r0.abs,
        caminhoRel: caminhoRelativo(raiz, r0.abs),
        bytes: statSync(r0.abs).size,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        detalhes: {
          motor: 'openpyxl',
          acao: 'ler',
          abas: dados.abas,
          linhasPorAba: dados.linhas,
          dados: dados.dados
        },
        aviso: 'Planilha lida: ' + (dados.abas || []).join(', ') + '. Dados em detalhes.dados (máx. 500 linhas/aba).'
      }
    } catch {
      return { ok: false, erro: 'resposta inesperada do openpyxl' }
    }
  }

  let entrada = ''
  let saida = ''
  let extra = ''
  if (opts.acao === 'criar') {
    const linhas = Array.isArray(opts.linhas) ? opts.linhas.slice(0, 10_000) : []
    if (!linhas.length) {
      return { ok: false, erro: 'informe "linhas" (array de arrays) para criar a planilha' }
    }
    saida = destinoArquivo(raiz, nomeArquivo('planilha', '.xlsx'), opts.saida)
    if (!saida.toLowerCase().endsWith('.xlsx')) saida += '.xlsx'
    extra = JSON.stringify({ aba: opts.aba || 'Dados', linhas })
  } else {
    const exts = opts.acao === 'csv-para-xlsx' ? EXTS_CSV : EXTS_XLSX
    const r0 = resolverArquivo(raiz, String(opts.entrada || ''), exts)
    if ('erro' in r0) return { ok: false, erro: r0.erro }
    entrada = r0.abs
    saida = destinoArquivo(
      raiz,
      nomeArquivo(opts.acao === 'csv-para-xlsx' ? 'planilha' : 'csv', opts.acao === 'csv-para-xlsx' ? '.xlsx' : '.csv'),
      opts.saida
    )
    if (opts.acao === 'csv-para-xlsx' && !saida.toLowerCase().endsWith('.xlsx')) saida += '.xlsx'
    if (opts.acao === 'xlsx-para-csv' && !saida.toLowerCase().endsWith('.csv')) saida += '.csv'
  }

  const r = await rodar(pythonBin(), [script, opts.acao, entrada, saida, extra], 120_000)
  if (!r.ok || !existsSync(saida)) {
    return { ok: false, erro: 'openpyxl falhou: ' + (r.stderr || r.stdout || 'erro').slice(0, 300) }
  }
  const bytes = statSync(saida).size
  return {
    ok: true,
    caminho: saida,
    caminhoRel: caminhoRelativo(raiz, saida),
    bytes,
    mime:
      saida.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv',
    detalhes: { motor: 'openpyxl', acao: opts.acao },
    aviso: 'Planilha ' + opts.acao + ' via openpyxl (local, gratuito).'
  }
}
