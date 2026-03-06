param(
  [string]$ProjectPath = ".",
  [string]$Time = "03:00",
  [int]$KeepDays = 14,
  [string]$TaskName = "DiscordBotDataBackup"
)

$ErrorActionPreference = "Stop"

$resolvedProjectPath = (Resolve-Path $ProjectPath).Path
$backupScriptPath = Join-Path $resolvedProjectPath "backup-data.ps1"

if (-not (Test-Path $backupScriptPath)) {
  throw "backup-data.ps1 not found at: $backupScriptPath"
}

$taskCommand = "powershell.exe"
$taskArgs = "-ExecutionPolicy Bypass -File `"$backupScriptPath`" -ProjectPath `"$resolvedProjectPath`" -KeepDays $KeepDays"

$action = New-ScheduledTaskAction -Execute $taskCommand -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

Write-Output "Scheduled task '$TaskName' created/updated."
Write-Output "Runs daily at $Time"
Write-Output "Command: $taskCommand $taskArgs"
