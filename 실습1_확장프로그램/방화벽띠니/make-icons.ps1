Add-Type -AssemblyName System.Drawing
$iconRoot = Join-Path $PSScriptRoot 'icons'
foreach ($size in @(16, 32, 48, 128)) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform(($size / 128.0), ($size / 128.0))
  $graphics.Clear([System.Drawing.Color]::FromArgb(48, 49, 54))
  $fur = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 241, 229))
  $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, 49, 54))
  $graphics.FillPolygon($fur, [System.Drawing.Point[]]@([System.Drawing.Point]::new(22,57), [System.Drawing.Point]::new(20,17), [System.Drawing.Point]::new(54,40)))
  $graphics.FillPolygon($fur, [System.Drawing.Point[]]@([System.Drawing.Point]::new(74,40), [System.Drawing.Point]::new(108,17), [System.Drawing.Point]::new(106,57)))
  $graphics.FillEllipse($fur, 19, 34, 90, 77)
  $graphics.FillEllipse($ink, 39, 59, 10, 15)
  $graphics.FillEllipse($ink, 79, 59, 10, 15)
  $graphics.FillEllipse($ink, 58, 79, 12, 7)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(48,49,54), 3)
  $graphics.DrawArc($pen, 47, 79, 34, 19, 0, 180)
  $bitmap.Save((Join-Path $iconRoot "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose(); $fur.Dispose(); $ink.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
