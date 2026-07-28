$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$resourceDir = Join-Path $projectRoot 'resources\ai'
$downloadDir = Join-Path ([System.IO.Path]::GetTempPath()) 'devicelifeline-qwen3'
$modelFile = 'Qwen3-0.6B-Q8_0.gguf'
$modelUrl = 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf?download=true'
# Keep in sync with LLAMA_RUNTIME_DOWNLOAD_URL in src-tauri/src/diagnosis/llm.rs
$runtimeUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b10092/llama-b10092-bin-win-cpu-x64.zip'

# Prefer a volume with ≥1.5 GB free (model + runtime). Fall back to resources/ai.
function Get-FreeBytes([string]$Path) {
  try {
    $root = [System.IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue).Path)
    if (-not $root) { $root = [System.IO.Path]::GetPathRoot($Path) }
    $drive = Get-PSDrive -Name $root.TrimEnd('\').TrimEnd(':') -ErrorAction SilentlyContinue
    if ($drive) { return [int64]$drive.Free }
  } catch {}
  return [int64]0
}

$minFree = [int64](1.5 * 1024 * 1024 * 1024)
$candidates = @($resourceDir)
foreach ($letter in @('D', 'E', 'F', 'C')) {
  $cand = "${letter}:\DeviceLifeline\ai"
  if ($candidates -notcontains $cand) { $candidates += $cand }
}

$installDir = $null
foreach ($cand in $candidates) {
  $parent = Split-Path -Parent $cand
  if (-not (Test-Path -LiteralPath $parent)) {
    try { New-Item -ItemType Directory -Force -Path $parent | Out-Null } catch { continue }
  }
  if (-not (Test-Path -LiteralPath $cand)) {
    try { New-Item -ItemType Directory -Force -Path $cand | Out-Null } catch { continue }
  }
  if ((Get-FreeBytes $cand) -ge $minFree) {
    $installDir = $cand
    break
  }
}
if (-not $installDir) {
  throw "Need ~1.5 GB free disk space for Qwen3 + llama-server. Free space or set DEVICELIFELINE_AI_DIR."
}

New-Item -ItemType Directory -Force -Path $installDir, $downloadDir | Out-Null
Write-Host "Install directory: $installDir"

$runtimeZip = Join-Path $downloadDir 'llama-runtime.zip'
$runtimeExtract = Join-Path $downloadDir 'runtime'
$modelPath = Join-Path $installDir $modelFile

Write-Host 'Downloading the pinned llama.cpp Windows CPU runtime...'
Invoke-WebRequest -Uri $runtimeUrl -OutFile $runtimeZip
if ((Get-Item -LiteralPath $runtimeZip).Length -lt 1000000) {
  throw "Runtime download looks incomplete."
}
if (Test-Path $runtimeExtract) {
  Remove-Item -LiteralPath $runtimeExtract -Recurse -Force
}
Expand-Archive -LiteralPath $runtimeZip -DestinationPath $runtimeExtract -Force

$server = Get-ChildItem -LiteralPath $runtimeExtract -Filter 'llama-server.exe' -Recurse | Select-Object -First 1
if (-not $server) {
  throw 'llama-server.exe was not found after extracting the runtime.'
}
# Promote stub + companion DLLs next to each other (flat install dir).
$srcDir = $server.Directory.FullName
Get-ChildItem -LiteralPath $srcDir -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $installDir $_.Name) -Force
}

Write-Host 'Downloading Qwen3-0.6B Q8_0 (approximately 639 MB)...'
Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
if ((Get-Item -LiteralPath $modelPath).Length -lt 100000000) {
  throw 'Qwen3 model download looks incomplete.'
}

$installedServer = Join-Path $installDir 'llama-server.exe'
$impl = Join-Path $installDir 'llama-server-impl.dll'
if (-not (Test-Path -LiteralPath $installedServer) -or -not (Test-Path -LiteralPath $impl)) {
  throw 'Runtime files missing after copy (llama-server.exe / llama-server-impl.dll).'
}

# Mirror into repo resources/ai when that path has room (dev convenience).
if ($installDir -ne $resourceDir) {
  $resFree = Get-FreeBytes $resourceDir
  if ($resFree -ge $minFree) {
    New-Item -ItemType Directory -Force -Path $resourceDir | Out-Null
    Copy-Item -Path (Join-Path $installDir '*') -Destination $resourceDir -Recurse -Force
    Write-Host "Also mirrored into $resourceDir"
  } else {
    Write-Host "Skipped mirror to $resourceDir (only $([math]::Round($resFree/1GB,2)) GB free)."
    Write-Host "Set DEVICELIFELINE_AI_DIR=$installDir for the app to find this install."
  }
}

Write-Host "Local AI resources are ready in $installDir"
