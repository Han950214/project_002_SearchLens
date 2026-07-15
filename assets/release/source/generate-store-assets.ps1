param(
  [string]$ChromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
  [switch]$EdgeLogoOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$publicIcons = Join-Path $projectRoot 'public\icons'
$screenshots = Join-Path $projectRoot 'assets\release\screenshots'
$promo = Join-Path $projectRoot 'assets\release\promo'
$edge = Join-Path $projectRoot 'assets\release\edge'
New-Item -ItemType Directory -Force -Path $publicIcons, $screenshots, $promo, $edge | Out-Null

function New-RoundedRectanglePath {
  param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-SearchLensIcon {
  param([int]$Size, [string]$OutputPath)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 128.0
  $backgroundPath = New-RoundedRectanglePath (16 * $scale) (16 * $scale) (96 * $scale) (96 * $scale) (24 * $scale)
  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#4f46e5'))
  $graphics.FillPath($background, $backgroundPath)

  $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [Math]::Max(1.4, 9 * $scale))
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawEllipse($whitePen, 33 * $scale, 31 * $scale, 50 * $scale, 50 * $scale)
  $graphics.DrawLine($whitePen, 77 * $scale, 75 * $scale, 94 * $scale, 92 * $scale)

  $mint = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#5eead4'))
  $graphics.FillEllipse($mint, 42 * $scale, 40 * $scale, 14 * $scale, 14 * $scale)

  if ($Size -ge 32) {
    $font = [System.Drawing.Font]::new('Segoe UI', [Math]::Max(6, 13 * $scale), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString('SL', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(34 * $scale, 43 * $scale, 48 * $scale, 34 * $scale), $format)
    $format.Dispose()
    $font.Dispose()
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $mint.Dispose()
  $whitePen.Dispose()
  $background.Dispose()
  $backgroundPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-SearchLensIcon -Size 300 -OutputPath (Join-Path $edge 'searchlens-edge-logo-300x300.png')
if ($EdgeLogoOnly) {
  return
}

foreach ($size in 16, 32, 48, 128) {
  New-SearchLensIcon -Size $size -OutputPath (Join-Path $publicIcons "searchlens-$size.png")
}

if (-not (Test-Path -LiteralPath $ChromePath)) {
  throw "Chrome not found: $ChromePath"
}

$profile = Join-Path $env:TEMP ("searchlens-store-assets-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $profile | Out-Null

function Convert-ToFileUrl {
  param([string]$Path, [string]$Fragment = '')
  $uri = [Uri]::new((Resolve-Path $Path).Path)
  return $uri.AbsoluteUri + $Fragment
}

function Save-PageScreenshot {
  param([string]$Source, [string]$Destination, [int]$Width, [int]$Height, [string]$Fragment = '')
  $arguments = @(
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    "--window-size=$Width,$Height",
    '--virtual-time-budget=1000',
    "--user-data-dir=$profile",
    "--screenshot=$Destination",
    (Convert-ToFileUrl -Path $Source -Fragment $Fragment)
  )
  $process = Start-Process -FilePath $ChromePath -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $Destination)) {
    throw "Chrome screenshot failed: $Source"
  }
}

try {
  $panelSource = Join-Path $PSScriptRoot 'store-screenshot-template.html'
  Save-PageScreenshot -Source $panelSource -Destination (Join-Path $screenshots '01-trust-reference.png') -Width 1280 -Height 800
  Save-PageScreenshot -Source $panelSource -Destination (Join-Path $screenshots '02-reason-details.png') -Width 1280 -Height 800 -Fragment '#reasons'
  Save-PageScreenshot -Source (Join-Path $PSScriptRoot 'options-store-screenshot.html') -Destination (Join-Path $screenshots '03-local-preferences.png') -Width 1280 -Height 800
  Save-PageScreenshot -Source (Join-Path $PSScriptRoot 'small-promo.html') -Destination (Join-Path $promo 'searchlens-small-promo-440x280.png') -Width 440 -Height 280
}
finally {
  if (Test-Path -LiteralPath $profile) {
    Remove-Item -LiteralPath $profile -Recurse -Force
  }
}
