# PowerShell Deployment Script
# Run this from your Windows PC to deploy to Oracle Cloud

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerIP,
    
    [Parameter(Mandatory=$true)]
    [string]$KeyPath
)

Write-Host "=================================="
Write-Host "Discord RP Bot - Deployment Script"
Write-Host "=================================="
Write-Host ""

# Check if key file exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "❌ SSH key not found at: $KeyPath" -ForegroundColor Red
    exit 1
}

# Get current directory
$BotDir = Get-Location

Write-Host "[1/4] Preparing files..." -ForegroundColor Cyan
$FilesToUpload = @(
    "bot.js",
    "package.json",
    "docker-compose.yml",
    "Dockerfile",
    ".dockerignore",
    "config/characters.json"
)

# Check if all files exist
$MissingFiles = @()
foreach ($file in $FilesToUpload) {
    if (-not (Test-Path $file)) {
        $MissingFiles += $file
    }
}

if ($MissingFiles.Count -gt 0) {
    Write-Host "❌ Missing files:" -ForegroundColor Red
    $MissingFiles | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "✓ All required files found" -ForegroundColor Green
Write-Host ""

Write-Host "[2/4] Creating remote directory..." -ForegroundColor Cyan
ssh -i $KeyPath ubuntu@$ServerIP "mkdir -p ~/discord-bot/config ~/discord-bot/data"

Write-Host "[3/4] Uploading files..." -ForegroundColor Cyan
foreach ($file in $FilesToUpload) {
    Write-Host "   Uploading $file..."
    $RemotePath = $file -replace '\\', '/'
    $RemoteDir = Split-Path $RemotePath -Parent
    
    if ($RemoteDir) {
        scp -i $KeyPath $file "ubuntu@${ServerIP}:~/discord-bot/$RemotePath"
    } else {
        scp -i $KeyPath $file "ubuntu@${ServerIP}:~/discord-bot/"
    }
}

Write-Host "✓ Files uploaded successfully" -ForegroundColor Green
Write-Host ""

Write-Host "[4/4] Checking for .env file..." -ForegroundColor Cyan
if (Test-Path ".env") {
    Write-Host "⚠️  Found .env file. Do you want to upload it? (contains sensitive tokens)" -ForegroundColor Yellow
    $confirm = Read-Host "Upload .env? (y/n)"
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        scp -i $KeyPath .env "ubuntu@${ServerIP}:~/discord-bot/"
        Write-Host "✓ .env uploaded" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Skipped .env upload. You'll need to create it manually on the server." -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  No .env file found. You'll need to create it on the server." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=================================="
Write-Host "✓ Deployment complete!" -ForegroundColor Green
Write-Host "=================================="
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. SSH into your server:"
Write-Host "   ssh -i $KeyPath ubuntu@$ServerIP"
Write-Host ""
Write-Host "2. If you didn't upload .env, create it:"
Write-Host "   cd ~/discord-bot && nano .env"
Write-Host ""
Write-Host "3. Start the bot:"
Write-Host "   docker-compose up -d --build"
Write-Host ""
Write-Host "4. Check logs:"
Write-Host "   docker logs -f discord-rp-bot"
Write-Host ""
