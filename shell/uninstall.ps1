# 卸载：还原原版 app.asar → 重启 DSH
param(
  [string]$ExeDir = '',
  [string]$LogPath = ''
)
$ErrorActionPreference = 'Continue'
if ([string]::IsNullOrWhiteSpace($LogPath)) { $LogPath = Join-Path $env:TEMP 'dsh-drag-install.log' }

function Log([string]$message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch {}
  Write-Host $line
}

function Find-DshExeDir {
  $candidates = @()
  foreach ($proc in Get-Process -ErrorAction SilentlyContinue) {
    $path = $null
    try { $path = $proc.Path } catch {}
    if ($null -eq $path) { continue }
    if ([System.IO.Path]::GetFileName($path) -ine 'DeepSeek Harness.exe') { continue }
    $dir = [System.IO.Path]::GetDirectoryName($path)
    if ($null -ne $dir) { $candidates += $dir }
  }
  $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness')
  foreach ($dir in $candidates) {
    if ((Test-Path (Join-Path $dir 'resources\app.asar.dragbak')) -or (Test-Path (Join-Path $dir 'resources\app.asar'))) { return $dir }
  }
  return $candidates[0]
}

function Get-DshProcesses([string]$exe) {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $path = $null
    try { $path = $_.Path } catch {}
    ($null -ne $path) -and ($path -ieq $exe)
  }
}

Log '=============================================='
Log '  DSH 交付文件拖拽 — 卸载 / 还原'
Log '=============================================='

if ([string]::IsNullOrWhiteSpace($ExeDir)) { $ExeDir = Find-DshExeDir }
$exe = Join-Path $ExeDir 'DeepSeek Harness.exe'
if (-not (Test-Path $exe)) { Log "FATAL 找不到 DSH：$exe"; exit 1 }

$res = Join-Path $ExeDir 'resources'
$asar = Join-Path $res 'app.asar'
$bak = Join-Path $res 'app.asar.dragbak'

Log '正在关闭 DSH…'
foreach ($proc in @(Get-DshProcesses $exe)) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  if (@(Get-DshProcesses $exe).Count -eq 0) { break }
}
foreach ($proc in @(Get-DshProcesses $exe)) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
Log 'DSH 已关闭'

if (Test-Path $bak) {
  $restored = $false
  for ($i = 0; $i -lt 40; $i++) {
    try { Move-Item -LiteralPath $bak -Destination $asar -Force; $restored = $true; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $restored) { Log 'FATAL 无法还原 app.asar'; exit 2 }
  Log 'app.asar.dragbak -> app.asar（原版已恢复）'
} elseif (Test-Path $asar) {
  Log '当前已是原版，无需还原'
} else {
  Log 'FATAL 既没有 app.asar 也没有备份，请重新安装 DSH'
  exit 3
}

Start-Process -FilePath $exe | Out-Null
Log 'DSH 已重新打开（原版模式）'
exit 0
