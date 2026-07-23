$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$resourceDir = Join-Path $projectRoot 'resources\ai'
$downloadDir = Join-Path ([System.IO.Path]::GetTempPath()) 'devicelifeline-qwen3'
$modelFile = 'Qwen3-0.6B-Q8_0.gguf'
$modelUrl = 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf?download=true'
$runtimeUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b10075/llama-b10075-bin-win-cpu-x64.zip'

New-Item -ItemType Directory -Force -Path $resourceDir, $downloadDir | Out-Null

$runtimeZip = Join-Path $downloadDir 'llama-runtime.zip'
$runtimeExtract = Join-Path $downloadDir 'runtime'
$modelPath = Join-Path $resourceDir $modelFile

Write-Host 'Downloading the pinned llama.cpp Windows CPU runtime...'
Invoke-WebRequest -Uri $runtimeUrl -OutFile $runtimeZip
if (Test-Path $runtimeExtract) {
  Remove-Item -LiteralPath $runtimeExtract -Recurse -Force
}
Expand-Archive -LiteralPath $runtimeZip -DestinationPath $runtimeExtract -Force
Copy-Item -Path (Join-Path $runtimeExtract '*') -Destination $resourceDir -Recurse -Force

Write-Host 'Downloading Qwen3-0.6B Q8_0 (approximately 639 MB)...'
Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath

$server = Get-ChildItem -LiteralPath $resourceDir -Filter 'llama-server.exe' -Recurse | Select-Object -First 1
if (-not $server) {
  throw 'llama-server.exe was not found after extracting the runtime.'
}
if (-not (Test-Path -LiteralPath $modelPath)) {
  throw 'Qwen3 model download did not produce the expected file.'
}

Write-Host "Local AI resources are ready in $resourceDir"
