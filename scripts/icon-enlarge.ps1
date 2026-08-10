# Enlarge the app icon art: measure the opaque bounding box of the current
# 1024x1024 source, crop to it, and scale back to 1024x1024 so the logo fills
# the whole canvas (bilibili-style full-bleed icon).
Add-Type -AssemblyName System.Drawing

$src = "$PSScriptRoot\..\src-tauri\icons\icon-source.png"
$dst = "$PSScriptRoot\..\src-tauri\icons\icon-source-full.png"

$bmp = [System.Drawing.Bitmap]::FromFile($src)
$w = $bmp.Width; $h = $bmp.Height

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)

$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $data.Stride
    for ($x = 0; $x -lt $w; $x++) {
        if ($bytes[$row + $x * 4 + 3] -gt 8) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Output "Opaque bounding box: ($minX,$minY)-($maxX,$maxY)  size $($maxX-$minX+1)x$($maxY-$minY+1)"

# Crop the bounding box and scale it to fill the full 1024x1024 canvas.
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
$out = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($out)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, 1024, 1024), $minX, $minY, $cropW, $cropH, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$out.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
$bmp.Dispose()
Write-Output "Wrote $dst"
