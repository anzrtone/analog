# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 The Analog contributors
# Draws the Android launcher icons and splash images from assets/*.png. Run after changing the artwork:
#   powershell -ExecutionPolicy Bypass -File scripts/android-res.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
$res = Join-Path $root 'android/app/src/main/res'

function Save-Scaled($src, $dest, $size, [switch]$round) {
  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($round) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $g.SetClip($path)
  }
  $g.DrawImage($img, 0, 0, $size, $size)
  $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}

# Launcher: 48 dp legacy icons, 108 dp adaptive layers (foreground and the Android 13 themed monochrome).
$densities = @{ 'mdpi' = 1.0; 'hdpi' = 1.5; 'xhdpi' = 2.0; 'xxhdpi' = 3.0; 'xxxhdpi' = 4.0 }
foreach ($d in $densities.Keys) {
  $dir = Join-Path $res "mipmap-$d"
  $s = $densities[$d]
  Save-Scaled (Join-Path $assets 'icon.png') (Join-Path $dir 'ic_launcher.png') ([int](48 * $s))
  Save-Scaled (Join-Path $assets 'icon.png') (Join-Path $dir 'ic_launcher_round.png') ([int](48 * $s)) -round
  Save-Scaled (Join-Path $assets 'android-icon-foreground.png') (Join-Path $dir 'ic_launcher_foreground.png') ([int](108 * $s))
  Save-Scaled (Join-Path $assets 'android-icon-monochrome.png') (Join-Path $dir 'ic_launcher_monochrome.png') ([int](108 * $s))
}

# Splash (Android 11 and below): the ring centred on Carbon, a third of the short side (the artwork carries its own margin).
$ink = [System.Drawing.ColorTranslator]::FromHtml('#17181C')
$mark = [System.Drawing.Image]::FromFile((Join-Path $assets 'splash-icon.png'))
Get-ChildItem $res -Directory -Filter 'drawable*' | ForEach-Object {
  $file = Join-Path $_.FullName 'splash.png'
  if (-not (Test-Path $file)) { return }
  $old = [System.Drawing.Image]::FromFile($file)
  $w = $old.Width; $h = $old.Height
  $old.Dispose()
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear($ink)
  $size = [int]([Math]::Min($w, $h) / 3)
  $g.DrawImage($mark, [int](($w - $size) / 2), [int](($h - $size) / 2), $size, $size)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
$mark.Dispose()
Write-Output 'Android icons and splash written.'
