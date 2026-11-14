/**
 * Gravação crua de imagens em pendrive/SD (estilo Rufus) e enumeração segura
 * de unidades removíveis.
 *
 * Guardrails: só discos USB/SD/MMC, nunca o disco do sistema, confirmação pelo
 * serial/token e verificação opcional de leitura. No Windows exige executar o
 * DG Editor como administrador. A gravação é feita por um script PowerShell
 * embutido que trava/desmonta os volumes e escreve direto em \\.\PhysicalDriveN.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type UnidadeUsb = {
  disco: number
  nome: string
  serial: string
  token: string
  tamanhoBytes: number
  bus: string
  sistema: boolean
  boot: boolean
  volumes: string[]
  podeGravar: boolean
  motivo?: string
}

export type ProgressoGravacao = { escritos: number; total: number; etapa: 'gravando' | 'verificando' }

const SCRIPT_GRAVAR = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$Image,
  [int]$DiskNumber = -1,
  [string]$OutputFile = '',
  [string]$VolumesCsv = '',
  [switch]$Verify
)
$ErrorActionPreference = 'Stop'
$CHUNK = 1MB
$SECTOR = 2048
$Volumes = @($VolumesCsv -split ',' | Where-Object { $_ })

function ProgressLine([long]$written, [long]$total) {
  [Console]::Out.WriteLine("PROGRESS $written $total")
  [Console]::Out.Flush()
}
function CmpBuffers([byte[]]$a, [byte[]]$b, [int]$len) {
  for ($i = 0; $i -lt $len; $i++) { if ($a[$i] -ne $b[$i]) { return $false } }
  return $true
}

if ($DiskNumber -ge 0) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    [Console]::Out.WriteLine('ERRO reinicie o DG Editor como administrador para gravar em USB')
    exit 3
  }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DgRaw {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool DeviceIoControl(Microsoft.Win32.SafeHandles.SafeFileHandle h, uint code, IntPtr inBuf, uint inSize, IntPtr outBuf, uint outSize, out uint ret, IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool FlushFileBuffers(Microsoft.Win32.SafeHandles.SafeFileHandle h);
  public const uint GENERIC_READ = 0x80000000;
  public const uint GENERIC_WRITE = 0x40000000;
  public const uint FILE_SHARE_READ = 1;
  public const uint FILE_SHARE_WRITE = 2;
  public const uint OPEN_EXISTING = 3;
  public const uint FILE_ATTRIBUTE_NORMAL = 0x80;
  public const uint FSCTL_LOCK_VOLUME = 0x00090018;
  public const uint FSCTL_DISMOUNT_VOLUME = 0x00090020;
  public static Microsoft.Win32.SafeHandles.SafeFileHandle Open(string path) {
    var h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, IntPtr.Zero);
    if (h.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    return h;
  }
  public static void LockAndDismount(Microsoft.Win32.SafeHandles.SafeFileHandle h) {
    uint ret;
    DeviceIoControl(h, FSCTL_LOCK_VOLUME, IntPtr.Zero, 0, IntPtr.Zero, 0, out ret, IntPtr.Zero);
    DeviceIoControl(h, FSCTL_DISMOUNT_VOLUME, IntPtr.Zero, 0, IntPtr.Zero, 0, out ret, IntPtr.Zero);
  }
  public static void Flush(Microsoft.Win32.SafeHandles.SafeFileHandle h) { FlushFileBuffers(h); }
}
"@

$total = (Get-Item -LiteralPath $Image).Length
$in = [System.IO.File]::Open($Image, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
$handles = @()
$out = $null
try {
  if ($OutputFile) {
    $out = [System.IO.File]::Open($OutputFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } else {
    foreach ($letter in $Volumes) {
      try {
        $vh = [DgRaw]::Open("\\.\$letter" + ':')
        [DgRaw]::LockAndDismount($vh)
        $handles += $vh
      } catch { [Console]::Out.WriteLine("AVISO volume $letter : $($_.Exception.Message)") }
    }
    $handles += [DgRaw]::Open("\\.\PhysicalDrive$DiskNumber")
    $out = New-Object System.IO.FileStream (New-Object Microsoft.Win32.SafeHandles.SafeFileHandle($handles[-1].DangerousGetHandle(), $false), [System.IO.FileAccess]::ReadWrite, $CHUNK, $false)
  }
  $buf = New-Object byte[] $CHUNK
  $written = [long]0
  while (($read = $in.Read($buf, 0, $CHUNK)) -gt 0) {
    $out.Write($buf, 0, $read)
    $written += $read
    if (($written % (32MB)) -eq 0 -or $written -ge $total) { ProgressLine $written $total }
  }
  if ($DiskNumber -ge 0) {
    $pad = ($SECTOR - ($written % $SECTOR)) % $SECTOR
    if ($pad -gt 0) { $out.Write((New-Object byte[] $pad), 0, $pad) }
    $out.Flush()
    [DgRaw]::Flush($handles[-1])
  } else {
    $out.Flush()
  }
  if ($Verify) {
    [Console]::Out.WriteLine('VERIFICANDO')
    $in.Position = 0
    if ($OutputFile) { $out.Position = 0 } else { if ($out) { $out.Dispose(); $out = $null } }
    $check = if ($OutputFile) { $out } else { New-Object System.IO.FileStream ((New-Object Microsoft.Win32.SafeHandles.SafeFileHandle($handles[-1].DangerousGetHandle(), $false)), [System.IO.FileAccess]::Read, $CHUNK, $false) }
    $a = New-Object byte[] (64KB); $b = New-Object byte[] (64KB)
    $pos = [long]0; $okAll = $true
    while ($pos -lt $total -and $okAll) {
      $n = $in.Read($a, 0, $a.Length); if ($n -le 0) { break }
      $got = 0
      while ($got -lt $n) { $m = $check.Read($b, $got, $n - $got); if ($m -le 0) { break }; $got += $m }
      if ($got -ne $n -or -not (CmpBuffers $a $b $n)) { $okAll = $false; break }
      $pos += $n
    }
    if (-not $OutputFile) { $check.Dispose() }
    if (-not $okAll) { [Console]::Out.WriteLine('ERRO verificacao falhou'); exit 4 }
    [Console]::Out.WriteLine('VERIFICADO')
  }
  [Console]::Out.WriteLine("OK $written")
} finally {
  if ($out) { try { $out.Dispose() } catch {} }
  foreach ($h in $handles) { try { $h.Dispose() } catch {} }
  $in.Dispose()
}
`

const SCRIPT_LISTAR = String.raw`
$ErrorActionPreference = 'Stop'
$out = @()
Get-Disk | Where-Object { $_.Size -gt 0 -and ($_.BusType -eq 'USB' -or $_.BusType -eq 'SD' -or $_.BusType -eq 'MMC') } | ForEach-Object {
  $volumes = @(Get-Partition -DiskNumber $_.Number -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object { [string]$_.DriveLetter })
  $out += [pscustomobject]@{
    disco = [int]$_.Number
    nome = [string]$_.FriendlyName
    serial = [string]$_.SerialNumber
    tamanho = [long]$_.Size
    bus = [string]$_.BusType
    sistema = [bool]$_.IsSystem
    boot = [bool]$_.IsBoot
    volumes = $volumes
  }
}
if ($out.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject @($out) -Compress -Depth 4 }
`

function pastaScript(): { dir: string; gravar: string; listar: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dg-iso-'))
  const gravar = join(dir, 'gravar.ps1')
  const listar = join(dir, 'listar.ps1')
  writeFileSync(gravar, SCRIPT_GRAVAR, 'utf8')
  writeFileSync(listar, SCRIPT_LISTAR, 'utf8')
  return { dir, gravar, listar }
}

export function limparSerial(bruto: string): string {
  return String(bruto || '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toUpperCase()
}

/** Token que o usuário precisa digitar para liberar a gravação. */
export function tokenConfirmacao(serial: string, disco: number): string {
  const limpo = limparSerial(serial)
  return limpo.length >= 4 ? limpo : 'APAGAR-' + disco
}

type RetornoProcesso = { ok: boolean; codigo: number; stdout: string; stderr: string; erro?: string }

function executarPowerShell(arquivo: string, args: string[], timeoutMs: number, onLinha?: (linha: string) => void): Promise<RetornoProcesso> {
  return new Promise((finalizar) => {
    if (process.platform !== 'win32') {
      finalizar({ ok: false, codigo: -1, stdout: '', stderr: '', erro: 'gravação USB disponível apenas no Windows' })
      return
    }
    const filho = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', arquivo, ...args], {
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    let pendente = ''
    const limite = setTimeout(() => {
      try {
        filho.kill()
      } catch {
        /* processo já encerrado */
      }
      stderr += '\ntempo esgotado ao executar PowerShell'
    }, timeoutMs)
    filho.stdout.on('data', (d: Buffer) => {
      const txt = d.toString('utf8')
      stdout += txt
      pendente += txt
      const linhas = pendente.split(/\r?\n/)
      pendente = linhas.pop() || ''
      for (const l of linhas) if (l.trim()) onLinha?.(l.trim())
    })
    filho.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    filho.on('error', (e) => {
      clearTimeout(limite)
      finalizar({ ok: false, codigo: -1, stdout, stderr, erro: String(e.message || e) })
    })
    filho.on('close', (codigo) => {
      clearTimeout(limite)
      if (pendente.trim()) onLinha?.(pendente.trim())
      finalizar({ ok: codigo === 0, codigo: codigo ?? -1, stdout, stderr })
    })
  })
}

export async function listarUnidadesUsb(): Promise<{ ok: boolean; unidades: UnidadeUsb[]; erro?: string }> {
  if (process.platform !== 'win32') return { ok: false, unidades: [], erro: 'enumeração de USB disponível apenas no Windows' }
  const { listar } = pastaScript()
  const r = await executarPowerShell(listar, [], 60_000)
  if (!r.ok) return { ok: false, unidades: [], erro: (r.erro || r.stderr || 'falha ao listar discos').slice(0, 300) }
  let bruto: unknown
  try {
    bruto = JSON.parse(r.stdout.trim() || '[]')
  } catch {
    return { ok: false, unidades: [], erro: 'saída inválida ao listar discos' }
  }
  const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : []
  const unidades: UnidadeUsb[] = lista.map((item) => {
    const o = item as Record<string, unknown>
    const disco = Number(o.disco)
    const serial = String(o.serial || '')
    const sistema = o.sistema === true
    const boot = o.boot === true
    const bus = String(o.bus || '')
    const tamanhoBytes = Number(o.tamanho) || 0
    const volumes = Array.isArray(o.volumes) ? (o.volumes as unknown[]).map((v) => String(v)) : []
    let motivo: string | undefined
    if (sistema || boot) motivo = 'disco do sistema — nunca será gravado'
    else if (!/^(USB|SD|MMC)$/i.test(bus)) motivo = 'não é unidade removível'
    const unidade: UnidadeUsb = {
      disco,
      nome: String(o.nome || 'Disco ' + disco),
      serial,
      token: tokenConfirmacao(serial, disco),
      tamanhoBytes,
      bus,
      sistema,
      boot,
      volumes,
      podeGravar: !motivo && tamanhoBytes > 0,
      motivo
    }
    return unidade
  })
  return { ok: true, unidades }
}

export function validarGravacao(unidade: UnidadeUsb | undefined, imagemBytes: number): string | null {
  if (!unidade) return 'selecione a unidade de destino'
  if (unidade.sistema || unidade.boot) return 'recusado: o destino é o disco do sistema'
  if (!/^(USB|SD|MMC)$/i.test(unidade.bus)) return 'recusado: o destino não é uma unidade removível (USB/SD)'
  if (!(unidade.tamanhoBytes > 0)) return 'recusado: unidade sem mídia ou tamanho desconhecido'
  if (!(imagemBytes > 0)) return 'imagem vazia ou ilegível'
  if (imagemBytes > unidade.tamanhoBytes) {
    return 'a imagem (' + Math.ceil(imagemBytes / 1048576) + ' MB) não cabe na unidade (' + Math.ceil(unidade.tamanhoBytes / 1048576) + ' MB)'
  }
  return null
}

export function confirmacaoConfere(unidade: UnidadeUsb, confirmacao: string): boolean {
  const alvo = unidade.token.trim().toUpperCase()
  return String(confirmacao || '').trim().toUpperCase() === alvo
}

async function rodarGravador(
  imagem: string,
  args: string[],
  timeoutMs: number,
  onProgresso?: (p: ProgressoGravacao) => void
): Promise<RetornoProcesso> {
  const { gravar } = pastaScript()
  let etapa: 'gravando' | 'verificando' = 'gravando'
  const r = await executarPowerShell(gravar, ['-Image', imagem, ...args], timeoutMs, (linha) => {
    if (linha === 'VERIFICANDO') {
      etapa = 'verificando'
      onProgresso?.({ escritos: 0, total: 0, etapa })
      return
    }
    const m = linha.match(/^PROGRESS (\d+) (\d+)$/)
    if (m) onProgresso?.({ escritos: Number(m[1]), total: Number(m[2]), etapa })
  })
  if (!r.ok) {
    const erroLinha = r.stdout.split(/\r?\n/).reverse().find((l) => l.startsWith('ERRO '))
    return { ...r, erro: erroLinha ? erroLinha.slice(5) : r.erro || (r.stderr || 'falha na gravação').slice(0, 400) }
  }
  return r
}

export async function gravarEmUsb(
  unidade: UnidadeUsb,
  opts: { imagem: string; confirmacao: string; verificar?: boolean },
  onProgresso?: (p: ProgressoGravacao) => void
): Promise<{ ok: boolean; bytes?: number; duracaoSeg?: number; verificado?: boolean; erro?: string }> {
  let bytes = 0
  try {
    bytes = statSync(opts.imagem).size
  } catch {
    return { ok: false, erro: 'imagem não encontrada: ' + opts.imagem }
  }
  const bloqueio = validarGravacao(unidade, bytes)
  if (bloqueio) return { ok: false, erro: bloqueio }
  if (!confirmacaoConfere(unidade, opts.confirmacao)) {
    return { ok: false, erro: 'confirmação incorreta — digite exatamente ' + unidade.token + ' para apagar a unidade' }
  }
  const inicio = Date.now()
  const args = ['-DiskNumber', String(unidade.disco), '-VolumesCsv', unidade.volumes.join(',')]
  if (opts.verificar !== false) args.push('-Verify')
  const r = await rodarGravador(opts.imagem, args, 3 * 60 * 60 * 1000, onProgresso)
  if (!r.ok) return { ok: false, erro: r.erro || 'a gravação falhou' }
  return {
    ok: true,
    bytes,
    duracaoSeg: Math.round((Date.now() - inicio) / 1000),
    verificado: opts.verificar !== false && /VERIFICADO/.test(r.stdout)
  }
}

/** Gravação em arquivo comum — usada pelos testes de integração (sem hardware). */
export async function gravarFluxo(
  imagem: string,
  destino: string,
  opts: { verificar?: boolean } = {},
  onProgresso?: (p: ProgressoGravacao) => void
): Promise<{ ok: boolean; bytes?: number; erro?: string }> {
  let bytes = 0
  try {
    bytes = statSync(imagem).size
  } catch {
    return { ok: false, erro: 'imagem não encontrada: ' + imagem }
  }
  const args = ['-OutputFile', destino]
  if (opts.verificar !== false) args.push('-Verify')
  const r = await rodarGravador(imagem, args, 2 * 60 * 60 * 1000, onProgresso)
  if (!r.ok) return { ok: false, erro: r.erro || 'falha ao copiar a imagem' }
  return { ok: true, bytes }
}
