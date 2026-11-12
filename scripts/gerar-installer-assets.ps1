# Gera BMP lateral do wizard NSIS (164x314) no tema DG Editor.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$out = Join-Path $raiz 'resources\installer-sidebar.bmp'
$logoCandidates = @(
  (Join-Path $raiz 'resources\logo-wide.png'),
  (Join-Path $raiz 'resources\dg-editor-128.png'),
  (Join-Path $raiz 'resources\dg-editor-64.png')
)

$w = 164
$h = 314
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
  $g.Clear([System.Drawing.Color]::FromArgb(18, 18, 20))
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0, 128, 255))
  $g.FillRectangle($accent, 0, 0, $w, 4)
  $accent.Dispose()

  $logoPath = $logoCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($logoPath) {
    $img = [System.Drawing.Image]::FromFile($logoPath)
    try {
      $maxW = 132
      $maxH = 72
      $scale = [Math]::Min($maxW / $img.Width, $maxH / $img.Height)
      $dw = [int][Math]::Round($img.Width * $scale)
      $dh = [int][Math]::Round($img.Height * $scale)
      $dx = [int](($w - $dw) / 2)
      $dy = 36
      $g.DrawImage($img, $dx, $dy, $dw, $dh)
    } finally {
      $img.Dispose()
    }
  }

  $fontTitle = New-Object System.Drawing.Font 'Segoe UI Semibold', 11, ([System.Drawing.FontStyle]::Bold)
  $fontSub = New-Object System.Drawing.Font 'Segoe UI', 8
  $brushText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 245, 245))
  $brushMuted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 168, 180))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString('DG Editor', $fontTitle, $brushText, (New-Object System.Drawing.RectangleF 8, 120, ($w - 16), 28), $sf)
  $g.DrawString('IA local · sistemas', $fontSub, $brushMuted, (New-Object System.Drawing.RectangleF 8, 148, ($w - 16), 40), $sf)
  $g.DrawString('Instalacao', $fontSub, $brushMuted, (New-Object System.Drawing.RectangleF 8, 270, ($w - 16), 24), $sf)

  $fontTitle.Dispose(); $fontSub.Dispose(); $brushText.Dispose(); $brushMuted.Dispose(); $sf.Dispose()

  # BMP 24bpp sem compressao (NSIS MUI)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
  Write-Host ('[ok] ' + $out)
} finally {
  $g.Dispose()
  $bmp.Dispose()
}
