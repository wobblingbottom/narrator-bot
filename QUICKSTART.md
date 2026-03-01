# Quick Reference - Oracle Cloud Deployment

## Initial Setup (One Time)

### 1. Create Oracle Cloud Account
- Go to: https://www.oracle.com/cloud/free/
- Register (credit card for verification, won't charge)

### 2. Create VM Instance
- **Name:** discord-rp-bot
- **Image:** Ubuntu 22.04
- **Shape:** VM.Standard.A1.Flex (ARM)
  - OCPUs: 2
  - Memory: 12 GB
- **Save SSH keys** when prompted

### 3. Connect to VM
Windows PowerShell:
```powershell
ssh -i "path\to\oracle-ssh-key.key" ubuntu@YOUR_PUBLIC_IP
```

### 4. Run Setup Script
On the VM:
```bash
# Upload setup-server.sh first, then:
chmod +x setup-server.sh
./setup-server.sh
```

Or manually:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
sudo apt install docker-compose -y
sudo systemctl enable docker
exit
# Then reconnect
```

### 5. Deploy Bot Files
From your Windows PC:
```powershell
.\deploy.ps1 -ServerIP YOUR_PUBLIC_IP -KeyPath "path\to\oracle-ssh-key.key"
```

### 6. Create .env on Server
```bash
cd ~/discord-bot
nano .env
```
Add:
```
DISCORD_TOKEN=your_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id
```

### 7. Start Bot
```bash
docker-compose up -d --build
docker logs -f discord-rp-bot
```

---

## Daily Commands

### Check Bot Status
```bash
ssh -i key ubuntu@IP "docker logs discord-rp-bot --tail 20"
```

### Restart Bot
```bash
ssh -i key ubuntu@IP "cd discord-bot && docker-compose restart"
```

### Update Bot After Code Changes
```powershell
# From Windows PC:
.\deploy.ps1 -ServerIP IP -KeyPath "key"

# Then SSH to server:
cd ~/discord-bot
docker-compose up -d --build
```

---

## Useful Commands on Server

```bash
# View logs
docker logs discord-rp-bot
docker logs -f discord-rp-bot  # Follow live

# Restart
docker-compose restart

# Stop
docker-compose down

# Rebuild after changes
docker-compose up -d --build

# Check if running
docker ps

# Check resources
docker stats
free -h
df -h

# Backup data
tar -czf backup.tar.gz data/
```

---

## Troubleshooting

### Bot not starting?
```bash
docker logs discord-rp-bot
# Check .env file, check token validity
```

### Can't SSH?
- Verify Security List allows your IP on port 22
- Check key permissions (Windows: use icacls)

### Out of memory?
```bash
free -h
docker stats
# Free tier has 12GB - plenty for this bot
```

---

## Emergency Quick Fix

If bot crashes:
```bash
ssh -i key ubuntu@IP
cd ~/discord-bot
docker-compose restart
```

---

## Cost = $0.00 Forever! ✓

Your bot runs on Oracle's Always Free Tier - no charges ever (unless you manually upgrade).
