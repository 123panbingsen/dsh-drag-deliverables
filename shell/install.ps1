# 安装：解包 app.asar → 打补丁 → 换包 → 重启 DSH
#
# 适用于「干净安装」（只有 app.asar）和「已解包」（已有 resources\app）两种情况。
# 全程可回滚：失败时自动把原版 app.asar 放回并重新打开 DSH。
param(
  [string]$ExeDir = '',
  [int]$GraceSeconds = 3,
  [string]$LogPath = ''

)
$ErrorActionPreference = 'Continue'
# Repo root is the parent of this script's directory; $PSScriptRoot is reliable
# even when the script is launched through a .bat via -File.
$RepoRoot = Split-Path -Parent $PSScriptRoot

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
  $candidates += 'C:\Program Files\DeepSeek Harness'
  foreach ($dir in $candidates) {
    if (Test-Path (Join-Path $dir 'resources')) { return $dir }
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

function Stop-AllDsh([string]$exe) {
  foreach ($proc in @(Get-DshProcesses $exe)) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (@(Get-DshProcesses $exe).Count -eq 0) { break }
  }
  foreach ($proc in @(Get-DshProcesses $exe)) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

function Start-Dsh([string]$exe, [string[]]$args) {
  if ($args.Count -gt 0) { Start-Process -FilePath $exe -ArgumentList $args | Out-Null }
  else { Start-Process -FilePath $exe | Out-Null }
}

function Wait-Window([string]$exe, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    Start-Sleep -Seconds 1
    $win = Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $path = $null
      try { $path = $_.Path } catch {}
      ($null -ne $path) -and ($path -ieq $exe) -and ($_.MainWindowTitle -ne '')
    } | Select-Object -First 1
    if ($win) { return $true }
  }
  return $false
}

function Add-Patch([string]$file, [string]$patchFile, [string]$marker) {
  if (-not (Test-Path $file)) { throw "missing target file: $file" }
  if (-not (Test-Path $patchFile)) { throw "missing patch file: $patchFile" }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $text = [System.IO.File]::ReadAllText($file, $utf8)
  if ($text.Contains($marker)) { return 'already' }
  $patch = [System.IO.File]::ReadAllText($patchFile, $utf8)
  [System.IO.File]::WriteAllText($file, $text.TrimEnd() + "`n" + $patch, $utf8)
  return 'applied'
}

Log '=============================================='
Log '  DSH 交付文件拖拽 — 安装'
Log '=============================================='

if ([string]::IsNullOrWhiteSpace($ExeDir)) { $ExeDir = Find-DshExeDir }
$exe = Join-Path $ExeDir 'DeepSeek Harness.exe'
if (-not (Test-Path $exe)) { Log "FATAL 找不到 DSH：$exe"; exit 1 }
Log "DSH: $ExeDir"

$res = Join-Path $ExeDir 'resources'
$asar = Join-Path $res 'app.asar'
$bak = Join-Path $res 'app.asar.dragbak'
$appDir = Join-Path $res 'app'
$unpacked = Join-Path $res 'app.asar.unpacked'

# --- 1. 关闭 DSH（换包必须没有进程占用 app.asar）-----------------------
Start-Sleep -Seconds $GraceSeconds
Log '正在关闭 DSH…'
Stop-AllDsh $exe
if (@(Get-DshProcesses $exe).Count -gt 0) { Log 'FATAL 无法关闭 DSH，请手动退出后重试'; exit 2 }
Log 'DSH 已关闭'

# --- 2. 若只有 app.asar，先解包成 resources\app ------------------------
if (-not (Test-Path (Join-Path $appDir 'lib\main.js'))) {
  if (-not (Test-Path $asar)) { Log 'FATAL 既没有 resources\app 也没有 app.asar，安装可能已损坏'; exit 3 }
  Log '检测到未解包的 app.asar，正在解包（约 400MB，稍等）…'
  $extractor = Join-Path $RepoRoot 'tools\extract-asar.mjs'
  if (-not (Test-Path $extractor)) { Log "FATAL 缺少解包脚本：$extractor"; exit 3 }
  $node = 'node'
  & $node $extractor $asar $appDir --force 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $appDir 'lib\main.js'))) {
    Log 'FATAL 解包失败'
    exit 3
  }
  Log '解包完成'
} else {
  Log 'resources\app 已存在，跳过解包'
}

# --- 3. 打补丁 ---------------------------------------------------------
$main = Join-Path $appDir 'lib\main.js'
$preload = Join-Path $appDir 'lib\preload-app.cjs'
try {
  $r1 = Add-Patch $main (Join-Path $RepoRoot 'patch\main.patch.js') 'dsh-drag-deliverable:start'
  $r2 = Add-Patch $preload (Join-Path $RepoRoot 'patch\preload.patch.cjs') 'dshDragDeliverable'
  Log "main.js: $r1 / preload: $r2"
} catch {
  Log "FATAL 打补丁失败：$_"
  exit 4
}
if (-not (Select-String -Path $main -Pattern 'dsh-drag-deliverable:start' -Quiet) -or
    -not (Select-String -Path $preload -Pattern 'dshDragDeliverable' -Quiet)) {
  Log 'FATAL 补丁写入后校验不通过'
  exit 4
}
Log '补丁校验通过'

# --- 4. 换包：asar -> asar.dragbak -------------------------------------
if (Test-Path $bak) {
  Log 'found existing app.asar.dragbak; restoring it first'
  try { Move-Item -LiteralPath $bak -Destination $asar -Force } catch { Log "restore-before-swap failed: $_" }
}
if (Test-Path $asar) {
  $swapped = $false
  for ($i = 0; $i -lt 40; $i++) {
    try { Move-Item -LiteralPath $asar -Destination $bak -Force; $swapped = $true; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $swapped) { Log 'FATAL 无法移动 app.asar（仍被占用）'; exit 5 }
  Log 'app.asar -> app.asar.dragbak（改用打过补丁的 resources\app）'
} else {
  Log 'app.asar 已不在，直接使用 resources\app'
}
if (-not (Test-Path $unpacked)) { Log 'WARN 缺少 app.asar.unpacked，原生模块可能无法加载' }

# --- 5. 启动并确认 -----------------------------------------------------
Log '正在启动 DSH…'
Start-Dsh $exe @()
if (Wait-Window $exe 180) {
  Log '安装成功：DSH 已用补丁模式启动'
  Log '用法：交付文件卡片右侧的小图标，按住拖到桌面或文件夹。'
  exit 0
}

Log '启动超时，正在回滚…'
Stop-AllDsh $exe
if (Test-Path $bak) { try { Move-Item -LiteralPath $bak -Destination $asar -Force } catch { Log "回滚失败：$_" } }
Start-Dsh $exe @()
Log '已还原原版并重新打开 DSH'
exit 6
