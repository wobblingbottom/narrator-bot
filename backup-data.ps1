param(
  [string]$ProjectPath = ".",
  [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"

$resolvedProjectPath = (Resolve-Path $ProjectPath).Path
$dataPath = Join-Path $resolvedProjectPath "data"
$backupDir = Join-Path $resolvedProjectPath "backups"

if (-not (Test-Path $dataPath)) {
  throw "Data folder not found: $dataPath"
}

if (-not (Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $backupDir "discord-bot-data-$timestamp.zip"

Compress-Archive -Path (Join-Path $dataPath "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force
Write-Output "Backup created: $zipPath"

$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem -Path $backupDir -Filter "discord-bot-data-*.zip" -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force

Write-Output "Old backups older than $KeepDays day(s) cleaned."
Write-Output "Tip: schedule this daily with Task Scheduler."
