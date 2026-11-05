param(
  [string]$Source = (Join-Path $PSScriptRoot '..\resources\branding\logo-source.jpeg')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$resourceDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\resources'))
$brandingDir = Join-Path $resourceDir 'branding'
New-Item -ItemType Directory -Force -Path $brandingDir | Out-Null
$canonicalSource = Join-Path $brandingDir 'logo-source.jpeg'
if ($sourcePath -ne $canonicalSource) {
  Copy-Item -LiteralPath $sourcePath -Destination $canonicalSource -Force
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
      $graphics.Clear([System.Drawing.Color]::FromArgb(38, 41, 44))
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
      [System.IO.File]::WriteAllBytes((Join-Path $resourceDir "icon-$size.png"), $frames[$size])
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

# ICO com imagens PNG de 32 bits, incluindo o tamanho 256 para o Windows.
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

# Os nomes SVG legados continuam resolvendo para a mesma imagem, sem redesenhar o logo.
$data = [Convert]::ToBase64String($frames[1024])
$svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024"><title>DG Editor</title><image width="1024" height="1024" xlink:href="data:image/png;base64,' + $data + '"/></svg>'
$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($relative in @('icon.svg', 'logo.svg', 'branding\dg-editor.svg')) {
  [System.IO.File]::WriteAllText((Join-Path $resourceDir $relative), $svg, $utf8)
}

Write-Output ('Logo original: ' + $canonicalSource)
Write-Output ('PNG: ' + ($sizes -join ', ') + ' px; ICO: ' + ($iconSizes -join ', ') + ' px')
