#!/bin/bash
# Oracle Cloud VM Setup Script for Discord RP Bot
# Run this script on your fresh Ubuntu VM after connecting via SSH

set -e  # Exit on any error

echo "=================================="
echo "Discord RP Bot - Server Setup"
echo "=================================="
echo ""

# Update system
echo "[1/6] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    echo "Docker installed successfully!"
else
    echo "Docker already installed, skipping..."
fi

# Add user to docker group
echo "[3/6] Configuring Docker permissions..."
sudo usermod -aG docker ubuntu

# Install Docker Compose
echo "[4/6] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo apt install -y docker-compose
    echo "Docker Compose installed successfully!"
else
    echo "Docker Compose already installed, skipping..."
fi

# Enable Docker on boot
echo "[5/6] Enabling Docker to start on boot..."
sudo systemctl enable docker

# Create bot directory
echo "[6/6] Creating bot directory..."
mkdir -p ~/discord-bot/config
mkdir -p ~/discord-bot/data

echo ""
echo "=================================="
echo "✓ Server setup complete!"
echo "=================================="
echo ""
echo "NEXT STEPS:"
echo "1. Upload your bot files to ~/discord-bot/"
echo "2. Create .env file with your Discord tokens"
echo "3. Run: cd ~/discord-bot && docker-compose up -d --build"
echo ""
echo "⚠️  IMPORTANT: You need to logout and login again for Docker permissions to take effect!"
echo ""
echo "Run: exit"
echo "Then reconnect with SSH"
echo ""
