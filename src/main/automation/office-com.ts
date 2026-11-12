/**
 * Office COM (Excel/Word/PowerPoint) via PowerShell — opcional.
 * Preferência documentada: abrir no Editor / planilha UI / CSV quando bastar.
 */
import { existsSync } from 'fs'
import { resolve, extname, normalize } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'

function pathEscritaOk(caminho: string): boolean {
  const abs = normalize(resolve(String(caminho || '')))
  const lower = abs.toLowerCase()
  const user = (process.env.USERPROFILE || homedir()).toLowerCase()
  if (lower.startsWith(user)) return true
  if (/^[a-z]:\\users\\/i.test(abs)) return true
  if (lower.startsWith('d:\\')) return true
  if (lower.startsWith('c:\\dev\\')) return true
  return false
}

function preferirEditor(caminho: string): boolean {
  const ext = extname(caminho).toLowerCase()
  return ['.csv', '.tsv', '.txt', '.md', '.json', '.xml', '.html', '.htm'].includes(ext)
}

function runPs(script: string, timeoutMs = 45_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolvePs) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let out = ''
    let err = ''
    const t = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* */
      }
      resolvePs({ code: -1, out, err: err + '\ntimeout' })
    }, timeoutMs)
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('error', (e) => {
      clearTimeout(t)
      resolvePs({ code: -2, out, err: String(e) })
    })
    child.on('close', (code) => {
      clearTimeout(t)
      resolvePs({ code: code ?? -3, out, err })
    })
  })
}

function escapePsLiteral(s: string): string {
  return "'" + String(s).replace(/'/g, "''") + "'"
}

async function excelAbrir(caminho?: string): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  if (caminho && preferirEditor(caminho)) {
    return {
      ok: true,
      dados: {
        preferiu: 'editor',
        mensagem:
          'Arquivo texto/CSV — abra no Editor (Bloco central) ou use a planilha do DG. COM Excel nao e necessario.',
        caminho
      }
    }
  }
  const openLine = caminho
    ? `$wb = $xl.Workbooks.Open(${escapePsLiteral(resolve(caminho))})`
    : '$wb = $xl.Workbooks.Add()'
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
} catch {
  $xl = New-Object -ComObject Excel.Application
}
$xl.Visible = $true
${openLine}
Write-Output ('OK|' + $wb.FullName)
`
  const r = await runPs(script)
  if (r.code !== 0 || !/^OK\|/m.test(r.out)) {
    return {
      ok: false,
      erro:
        'Excel COM indisponivel. Abra o arquivo no Editor/planilha do DG ou instale o Microsoft Excel. ' +
        (r.err || r.out).slice(0, 200)
    }
  }
  return { ok: true, dados: { via: 'com', caminho: r.out.replace(/^OK\|/m, '').trim() } }
}

async function excelCelula(
  op: 'ler' | 'escrever',
  args: Record<string, unknown>
): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  const celula = String(args.celula || '').trim()
  if (!celula) return { ok: false, erro: 'celula obrigatoria (ex.: A1)' }
  const planilha = String(args.planilha || '').trim()
  const valor = args.valor
  const sheetLine = planilha
    ? `$ws = $wb.Worksheets.Item(${escapePsLiteral(planilha)})`
    : '$ws = $wb.ActiveSheet'
  const body =
    op === 'ler'
      ? `Write-Output ('OK|' + [string]$ws.Range(${escapePsLiteral(celula)}).Text)`
      : `$ws.Range(${escapePsLiteral(celula)}).Value2 = ${escapePsLiteral(String(valor ?? ''))}; Write-Output 'OK|escrito'`
  const script = `
$ErrorActionPreference = 'Stop'
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $xl.ActiveWorkbook
if (-not $wb) { throw 'Nenhuma pasta ativa no Excel' }
${sheetLine}
${body}
`
  const r = await runPs(script)
  if (r.code !== 0 || !/^OK\|/m.test(r.out)) {
    return { ok: false, erro: (r.err || r.out || 'falha COM').slice(0, 240) }
  }
  const payload = r.out.match(/^OK\|(.*)$/m)?.[1] ?? ''
  return { ok: true, dados: { celula, valor: payload, via: 'com' } }
}

async function wordAbrir(caminho?: string): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  if (caminho && preferirEditor(caminho)) {
    return {
      ok: true,
      dados: {
        preferiu: 'editor',
        mensagem: 'Documento texto — prefira o Editor do DG (Bloco central).',
        caminho
      }
    }
  }
  const openLine = caminho
    ? `$doc = $wd.Documents.Open(${escapePsLiteral(resolve(caminho))})`
    : '$doc = $wd.Documents.Add()'
  const script = `
$ErrorActionPreference = 'Stop'
try { $wd = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application') }
catch { $wd = New-Object -ComObject Word.Application }
$wd.Visible = $true
${openLine}
Write-Output ('OK|' + $doc.FullName)
`
  const r = await runPs(script)
  if (r.code !== 0 || !/^OK\|/m.test(r.out)) {
    return {
      ok: false,
      erro:
        'Word COM indisponivel. Abra no Editor do DG. ' + (r.err || r.out).slice(0, 200)
    }
  }
  return { ok: true, dados: { via: 'com', caminho: r.out.replace(/^OK\|/m, '').trim() } }
}

async function pptAbrir(caminho?: string): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  const openLine = caminho
    ? `$p = $pp.Presentations.Open(${escapePsLiteral(resolve(caminho))})`
    : '$p = $pp.Presentations.Add()'
  const script = `
$ErrorActionPreference = 'Stop'
try { $pp = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') }
catch { $pp = New-Object -ComObject PowerPoint.Application }
$pp.Visible = $true
${openLine}
Write-Output ('OK|' + $p.FullName)
`
  const r = await runPs(script)
  if (r.code !== 0 || !/^OK\|/m.test(r.out)) {
    return {
      ok: false,
      erro: 'PowerPoint COM indisponivel. ' + (r.err || r.out).slice(0, 200)
    }
  }
  return { ok: true, dados: { via: 'com', caminho: r.out.replace(/^OK\|/m, '').trim() } }
}

export async function executarOffice(
  id: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; dados?: unknown; erro?: string; comandoExecutado: string }> {
  const caminho = args.caminho ? String(args.caminho) : undefined
  if (caminho && !existsSync(resolve(caminho)) && /abrir|salvar/.test(id) && !id.endsWith('.abrir')) {
    /* salvar pode criar */
  }
  if (caminho && id.includes('salvar') && !pathEscritaOk(caminho)) {
    return { ok: false, erro: 'caminho de escrita nao permitido', comandoExecutado: id }
  }

  try {
    if (id === 'excel.abrir') {
      const r = await excelAbrir(caminho)
      return { ...r, comandoExecutado: id }
    }
    if (id === 'excel.celula.ler') {
      const r = await excelCelula('ler', args)
      return { ...r, comandoExecutado: id }
    }
    if (id === 'excel.celula.escrever') {
      const r = await excelCelula('escrever', args)
      return { ...r, comandoExecutado: id }
    }
    if (id === 'excel.fechar' || id === 'excel.salvar') {
      const save = id === 'excel.salvar' || args.salvar === true
      const pathSave = caminho ? ` $wb.SaveAs(${escapePsLiteral(resolve(caminho))})` : save ? ' $wb.Save()' : ''
      const close = id === 'excel.fechar' ? ' $wb.Close($false); if ($xl.Workbooks.Count -eq 0) { $xl.Quit() }' : ''
      const script = `
$ErrorActionPreference = 'Stop'
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $xl.ActiveWorkbook
if (-not $wb) { throw 'Nenhuma pasta ativa' }
${pathSave}
${close}
Write-Output 'OK'
`
      const r = await runPs(script)
      if (r.code !== 0) return { ok: false, erro: (r.err || r.out).slice(0, 200), comandoExecutado: id }
      return { ok: true, dados: { via: 'com' }, comandoExecutado: id }
    }
    if (id === 'word.abrir') {
      const r = await wordAbrir(caminho)
      return { ...r, comandoExecutado: id }
    }
    if (id === 'word.texto.ler') {
      const script = `
$ErrorActionPreference = 'Stop'
$wd = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
$doc = $wd.ActiveDocument
if (-not $doc) { throw 'Nenhum documento ativo' }
$t = $doc.Content.Text
if ($t.Length -gt 200000) { $t = $t.Substring(0,200000) }
Write-Output ('OK|' + $t)
`
      const r = await runPs(script)
      if (r.code !== 0 || !/^OK\|/m.test(r.out)) {
        return { ok: false, erro: (r.err || r.out).slice(0, 200), comandoExecutado: id }
      }
      return {
        ok: true,
        dados: { texto: r.out.replace(/^OK\|/m, ''), via: 'com' },
        comandoExecutado: id
      }
    }
    if (id === 'word.texto.escrever') {
      const texto = String(args.texto ?? '')
      const script = `
$ErrorActionPreference = 'Stop'
$wd = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
$doc = $wd.ActiveDocument
if (-not $doc) { throw 'Nenhum documento ativo' }
$doc.Content.InsertAfter(${escapePsLiteral(texto)})
Write-Output 'OK'
`
      const r = await runPs(script)
      if (r.code !== 0) return { ok: false, erro: (r.err || r.out).slice(0, 200), comandoExecutado: id }
      return { ok: true, dados: { via: 'com' }, comandoExecutado: id }
    }
    if (id === 'powerpoint.abrir') {
      const r = await pptAbrir(caminho)
      return { ...r, comandoExecutado: id }
    }

    return {
      ok: true,
      comandoExecutado: id,
      dados: {
        preferiu: 'editor-bloco3',
        mensagem:
          'Comando Office parcial. Prefira Editor/planilha do DG; COM cobre abrir/ler/escrever basico. id=' +
          id,
        args
      }
    }
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message || e), comandoExecutado: id }
  }
}
