param(
  [string]$OutDir = "D:\20533\deskbox\fangwork\Groma\src-tauri\icons",
  [string]$Preview = "D:\20533\deskbox\fangwork\Groma\assets\brand\groma-icon-1024.png"
)

Add-Type -AssemblyName System.Drawing

$Yellow = [System.Drawing.ColorTranslator]::FromHtml('#F2B705')
$Ink    = [System.Drawing.ColorTranslator]::FromHtml('#221C00')

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Get-GlyphPath([string]$text, $family, [single]$em) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fmt = [System.Drawing.StringFormat]::GenericTypographic
  $p.AddString($text, $family, [int][System.Drawing.FontStyle]::Bold, $em, [System.Drawing.PointF]::new(0,0), $fmt)
  return $p
}

function Draw-Groma([int]$n) {
  $bmp = New-Object System.Drawing.Bitmap $n, $n, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $s = [single]$n
  $radius = 0.30 * $s
  $border = [Math]::Max(1.0, 0.0375 * $s)
  $inset  = $border / 2.0
  $rect   = New-Object System.Drawing.RectangleF $inset, $inset, ($s - $border), ($s - $border)
  $path   = New-RoundedPath $rect.X $rect.Y $rect.Width $rect.Height $radius

  $fill = New-Object System.Drawing.SolidBrush $Yellow
  $g.FillPath($fill, $path)
  $pen = New-Object System.Drawing.Pen $Ink, $border
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($pen, $path)

  $familyName = 'Segoe UI Black'
  $installed = (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }
  if ($installed -notcontains $familyName) { $familyName = 'Arial Black' }
  if ($installed -notcontains $familyName) { $familyName = 'Microsoft YaHei UI' }
  $family = New-Object System.Drawing.FontFamily $familyName

  # 用字形轮廓量真实墨迹边界（不含行高与侧边距），再按安全区缩放
  $gpProbe = Get-GlyphPath 'G' $family 1000.0
  $rpProbe = Get-GlyphPath 'R' $family 1000.0
  $gbProbe = $gpProbe.GetBounds()
  $rbProbe = $rpProbe.GetBounds()
  $probeGap = 60.0
  $probeW = $gbProbe.Width + $probeGap + $rbProbe.Width
  $probeH = [Math]::Max($gbProbe.Height, $rbProbe.Height)
  $k = [Math]::Min((0.66 * $s) / $probeW, (0.33 * $s) / $probeH)
  $em = 1000.0 * $k
  $gpProbe.Dispose(); $rpProbe.Dispose()

  $gp = Get-GlyphPath 'G' $family $em
  $rp = Get-GlyphPath 'R' $family $em
  $gb = $gp.GetBounds()
  $rb = $rp.GetBounds()
  $gap = 0.06 * $em
  $textW = $gb.Width + $gap + $rb.Width
  $textH = [Math]::Max($gb.Height, $rb.Height)
  $left = ($s - $textW) / 2.0
  # 字块略下移，给上方两道小竖条留呼吸
  $top  = ($s - $textH) / 2.0 + 0.045 * $s

  $brush = New-Object System.Drawing.SolidBrush $Ink
  $st1 = $g.Save()
  [void]$g.TranslateTransform($left - $gb.X, $top - $gb.Y)
  $g.FillPath($brush, $gp)
  [void]$g.Restore($st1)
  $st2 = $g.Save()
  [void]$g.TranslateTransform($left + $gb.Width + $gap - $rb.X, $top - $rb.Y)
  $g.FillPath($brush, $rp)
  [void]$g.Restore($st2)

  # 第二字母上方两道小竖条（小方眼睛）：短、细、贴近 R
  $barW = [Math]::Max(1.0, 0.032 * $s)
  $barH = [Math]::Max(2.0, 0.085 * $s)
  $barGap = [Math]::Max(1.0, 0.030 * $s)
  $rCenterX = $left + $gb.Width + $gap + $rb.Width / 2.0
  $barY = [Math]::Max($border + 0.05 * $s, $top - 0.045 * $s - $barH)
  $barsW = $barW * 2 + $barGap
  $bx = $rCenterX - $barsW / 2.0
  $barPen = New-Object System.Drawing.Pen $Ink, $barW
  $barPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $barPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($barPen, [single]($bx + $barW/2), [single]$barY, [single]($bx + $barW/2), [single]($barY + $barH))
  $g.DrawLine($barPen, [single]($bx + $barW + $barGap + $barW/2), [single]$barY, [single]($bx + $barW + $barGap + $barW/2), [single]($barY + $barH))

  $g.Dispose()
  $fill.Dispose(); $pen.Dispose(); $brush.Dispose(); $barPen.Dispose(); $path.Dispose()
  $gp.Dispose(); $rp.Dispose(); $family.Dispose()
  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Write-Ico([int[]]$sizes, [string]$path) {
  $pngs = @()
  foreach ($sz in $sizes) {
    $b = Draw-Groma $sz
    $ms = New-Object System.IO.MemoryStream
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += ,$ms.ToArray()
    $b.Dispose(); $ms.Dispose()
  }
  $count = $sizes.Count
  $offset = 6 + 16 * $count
  $bytes = New-Object System.Collections.Generic.List[byte]
  $bytes.Add(0); $bytes.Add(0); $bytes.Add(1); $bytes.Add(0)
  $bytes.Add([byte]($count -band 0xFF)); $bytes.Add(0)
  foreach ($i in 0..($count-1)) {
    $sz = $sizes[$i]; $data = $pngs[$i]
    $wb = if ($sz -ge 256) { 0 } else { $sz }
    $bytes.Add([byte]$wb); $bytes.Add([byte]$wb)
    $bytes.Add(0); $bytes.Add(0)
    $bytes.Add(1); $bytes.Add(0); $bytes.Add(32); $bytes.Add(0)
    $bytes.AddRange([BitConverter]::GetBytes([uint32]$data.Length))
    $bytes.AddRange([BitConverter]::GetBytes([uint32]$offset))
    $offset += $data.Length
  }
  foreach ($data in $pngs) { $bytes.AddRange($data) }
  [System.IO.File]::WriteAllBytes($path, $bytes.ToArray())
}

$brandDir = Split-Path -Parent $Preview
if (-not (Test-Path $brandDir)) { New-Item -ItemType Directory -Force -Path $brandDir | Out-Null }
Save-Png (Draw-Groma 1024) $Preview
Save-Png (Draw-Groma 32)  (Join-Path $OutDir '32x32.png')
Save-Png (Draw-Groma 128) (Join-Path $OutDir '128x128.png')
Save-Png (Draw-Groma 256) (Join-Path $OutDir '128x128@2x.png')
Save-Png (Draw-Groma 512) (Join-Path $OutDir 'icon.png')
Write-Ico @(16,24,32,48,64,128,256) (Join-Path $OutDir 'icon.ico')

Write-Output "OK: $Preview"
Get-ChildItem -LiteralPath $OutDir -File | Select-Object Name, Length | Format-Table -AutoSize
