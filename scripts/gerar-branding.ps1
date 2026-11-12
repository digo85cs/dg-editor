param(
  [string]$Source = (Join-Path $PSScriptRoot '..\resources\branding\logo-source.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $Source)) {
  $alt = Join-Path $PSScriptRoot '..\resources\branding\logo-source.jpeg'
  if (Test-Path -LiteralPath $alt) { $Source = $alt }
}

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$resourceDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\resources'))
$brandingDir = Join-Path $resourceDir 'branding'
New-Item -ItemType Directory -Force -Path $brandingDir | Out-Null

$ext = [System.IO.Path]::GetExtension($sourcePath).ToLowerInvariant()
$canonicalSource = Join-Path $brandingDir ('logo-source' + $(if ($ext) { $ext } else { '.png' }))
if ($sourcePath -ne $canonicalSource) {
  Copy-Item -LiteralPath $sourcePath -Destination $canonicalSource -Force
}
# Espelho PNG canonico para pipelines que esperam jpeg legado
if ($ext -eq '.png') {
  Copy-Item -LiteralPath $canonicalSource -Destination (Join-Path $brandingDir 'logo-source.jpeg') -Force
}

$sourceImage = [System.Drawing.Image]::FromFile($canonicalSource)
$sizes = @(16, 24, 32, 48, 64, 128, 256, 512, 1024)
$frames = @{}
try {
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $attributes = New-Object System.Drawing.Imaging.ImageAttributes
    $stream = New-Object System.IO.MemoryStream
    try {
      # Fundo do canvas = tom do logo (#1a1d21) para bordas ao redimensionar
      $graphics.Clear([System.Drawing.Color]::FromArgb(26, 29, 33))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $scale = [Math]::Min($size / $sourceImage.Width, $size / $sourceImage.Height)
      $width = [int][Math]::Round($sourceImage.Width * $scale)
      $height = [int][Math]::Round($sourceImage.Height * $scale)
      $rect = New-Object System.Drawing.Rectangle ([int](($size - $width) / 2)), ([int](($size - $height) / 2)), $width, $height
      $graphics.DrawImage($sourceImage, $rect, 0, 0, $sourceImage.Width, $sourceImage.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $frames[$size] = $stream.ToArray()
      [System.IO.File]::WriteAllBytes((Join-Path $resourceDir "dg-editor-$size.png"), $frames[$size])
      # aliases icon-* removidos — canônico é dg-editor-*.png
    } finally {
      $graphics.Dispose()
      $attributes.Dispose()
      $stream.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $sourceImage.Dispose()
}

[System.IO.File]::WriteAllBytes((Join-Path $resourceDir 'dg-editor.png'), $frames[256])
[System.IO.File]::WriteAllBytes((Join-Path $resourceDir 'logo.png'), $frames[1024])

$iconSizes = @(16, 24, 32, 48, 64, 128, 256)
$iconStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $iconStream
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$iconSizes.Count)
  $offset = 6 + 16 * $iconSizes.Count
  foreach ($size in $iconSizes) {
    $dimension = if ($size -eq 256) { 0 } else { $size }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frames[$size].Length)
    $writer.Write([uint32]$offset)
    $offset += $frames[$size].Length
  }
  foreach ($size in $iconSizes) { $writer.Write([byte[]]$frames[$size]) }
  $writer.Flush()
  $iconBytes = $iconStream.ToArray()
  [System.IO.File]::WriteAllBytes((Join-Path $resourceDir 'dg-editor.ico'), $iconBytes)
  [System.IO.File]::WriteAllBytes((Join-Path $resourceDir 'dg-studio.ico'), $iconBytes)
} finally {
  $writer.Dispose()
  $iconStream.Dispose()
}

$data = [Convert]::ToBase64String($frames[1024])
$svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024"><title>DG Editor</title><image width="1024" height="1024" xlink:href="data:image/png;base64,' + $data + '"/></svg>'
$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($relative in @('icon.svg', 'logo.svg', 'branding\dg-editor.svg')) {
  [System.IO.File]::WriteAllText((Join-Path $resourceDir $relative), $svg, $utf8)
}

Write-Output ('Logo original: ' + $canonicalSource)


# Wordmark horizontal (logo canonico UI)
$wideSrc = Join-Path $brandingDir 'logo-wide.png'
if (Test-Path $wideSrc) {
  $wide = [System.Drawing.Image]::FromFile($wideSrc)
  try {
    foreach ($pair in @(@{n='logo-wide-tb.png'; h=44}, @{n='logo-wide-lg.png'; h=64})) {
      $hh = [int]$pair.h
      $ww = [int][Math]::Round($wide.Width * ($hh / $wide.Height))
      $bm = New-Object System.Drawing.Bitmap $ww, $hh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $gr = [System.Drawing.Graphics]::FromImage($bm)
      try {
        $gr.Clear([System.Drawing.Color]::Transparent)
        $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $gr.DrawImage($wide, 0, 0, $ww, $hh)
        $ms = New-Object System.IO.MemoryStream
        $bm.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        [System.IO.File]::WriteAllBytes((Join-Path $resourceDir $pair.n), $ms.ToArray())
        $ms.Dispose()
      } finally { $gr.Dispose(); $bm.Dispose() }
    }
    Copy-Item -LiteralPath $wideSrc -Destination (Join-Path $resourceDir 'logo-wide.png') -Force
    Write-Output 'Wordmark: logo-wide + tb/lg'
  } finally { $wide.Dispose() }
}

Write-Output ('PNG: ' + ($sizes -join ', ') + ' px; ICO: ' + ($iconSizes -join ', ') + ' px')
