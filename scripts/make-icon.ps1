$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(7,17,26))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120,229,224)),4
$softPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(55,119,140)),2
$points = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF 128,32),(New-Object System.Drawing.PointF 211,80),(New-Object System.Drawing.PointF 211,176),(New-Object System.Drawing.PointF 128,224),(New-Object System.Drawing.PointF 45,176),(New-Object System.Drawing.PointF 45,80))
$graphics.DrawPolygon($pen,$points)
$graphics.TranslateTransform(128,128)
$graphics.RotateTransform(-32)
$graphics.DrawEllipse($softPen,-95,-32,190,64)
$graphics.RotateTransform(85)
$graphics.DrawEllipse($softPen,-91,-35,182,70)
$graphics.ResetTransform()
$graphics.DrawEllipse($pen,81,81,94,94)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(164,245,239))
$graphics.FillEllipse($brush,117,117,22,22)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
$png = $stream.ToArray()
$iconStream = [System.IO.File]::Create((Join-Path (Split-Path $PSScriptRoot -Parent) 'src\nexus.ico'))
$writer = New-Object System.IO.BinaryWriter $iconStream
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
$writer.Dispose(); $iconStream.Dispose(); $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $pen.Dispose(); $softPen.Dispose(); $brush.Dispose()
