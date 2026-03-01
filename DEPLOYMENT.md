# Oracle Cloud Deployment Guide

This guide will help you deploy your Discord RP bot to Oracle Cloud's **Always Free Tier** for 24/7 hosting.

---

## Step 1: Create Oracle Cloud Account

1. Go to https://www.oracle.com/cloud/free/
2. Click **Start for free**
3. Fill in your details (email, country, etc.)
4. **Credit card required for verification** but won't be charged
5. Complete email verification

---

## Step 2: Create a VM Instance

### 2.1 Access Compute Instances
1. Log into Oracle Cloud Console
2. Click **☰ Menu** → **Compute** → **Instances**
3. Click **Create Instance**

### 2.2 Configure Instance
**Name:** `discord-rp-bot`

**Image and Shape:**
- Click **Edit** next to "Image and shape"
- **Image:** Ubuntu 22.04 (recommended)
- **Shape:** 
  - Click **Change Shape**
  - Select **Ampere (ARM)** 
  - Choose **VM.Standard.A1.Flex**
  - Set **OCPUs:** 2, **Memory:** 12 GB (all free!)
  - Click **Select Shape**

**Networking:**
- Use default VCN and subnet (auto-created)
- **Assign a public IPv4 address:** ✓ Checked

**Add SSH Keys:**
- Select **Generate SSH key pair**
- Click **Save Private Key** (save as `oracle-ssh-key.key`)
- Click **Save Public Key** (optional, for backup)

**Boot Volume:**
- Leave default (50GB is plenty)

Click **Create** and wait 1-2 minutes for provisioning.

### 2.3 Note Your Public IP
Once created, copy the **Public IP address** (e.g., `123.45.67.89`)

---

## Step 3: Configure Firewall (Security List)

Oracle blocks most ports by default. We don't need to open any ports for Discord bots.

**Optional:** If you want SSH access from home only:
1. In your instance details, click your **Subnet** link
2. Click your **Security List**
3. Click **Add Ingress Rules**
   - **Source CIDR:** Your home IP (find at https://whatismyip.com) + `/32`
   - **Destination Port:** 22
   - Click **Add Ingress Rules**

---

## Step 4: Connect to Your VM

### Windows (PowerShell):
```powershell
# Fix key permissions first
icacls "path\to\oracle-ssh-key.key" /inheritance:r
icacls "path\to\oracle-ssh-key.key" /grant:r "$($env:USERNAME):(R)"

# Connect
ssh -i "path\to\oracle-ssh-key.key" ubuntu@YOUR_PUBLIC_IP
```

### Linux/Mac:
```bash
chmod 400 oracle-ssh-key.key
ssh -i oracle-ssh-key.key ubuntu@YOUR_PUBLIC_IP
```

Type `yes` when asked about fingerprint.

---

## Step 5: Install Docker on VM

Once connected via SSH:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (no sudo needed)
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo apt install docker-compose -y

# Logout and login again for group to take effect
exit
```

Then reconnect with SSH.

Verify Docker works:
```bash
docker --version
docker-compose --version
```

---

## Step 6: Upload Bot Files

### Option A: Using SCP (from your Windows PC)

```powershell
# In PowerShell on your PC (not in SSH)
cd C:\Users\crazy\Downloads\discord-bot

# Upload entire directory
scp -i "path\to\oracle-ssh-key.key" -r * ubuntu@YOUR_PUBLIC_IP:~/discord-bot/
```

### Option B: Using Git (if you have a private repo)

```bash
# On the Oracle VM
git clone https://github.com/yourusername/your-private-repo.git discord-bot
cd discord-bot
```

### Option C: Manual (small files)

```bash
# On Oracle VM, create directory
mkdir -p ~/discord-bot
cd ~/discord-bot

# Create files manually
nano bot.js        # Copy-paste bot.js content
nano Dockerfile    # Copy-paste Dockerfile
nano docker-compose.yml
nano package.json
nano .env          # IMPORTANT: Add your tokens!

# Create directories
mkdir -p config data
nano config/characters.json    # Copy your characters
```

---

## Step 7: Create .env File

**IMPORTANT:** Create your `.env` file with your Discord tokens:

```bash
cd ~/discord-bot
nano .env
```

Add your credentials:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
NODE_TLS_REJECT_UNAUTHORIZED=0
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

---

## Step 8: Start the Bot

```bash
cd ~/discord-bot

# Build and start
docker-compose up -d --build

# Check if running
docker ps

# View logs
docker logs discord-rp-bot

# Follow logs in real-time
docker logs -f discord-rp-bot
```

You should see: `Logged in as YourBot#1234`

---

## Step 9: Set Up Auto-Restart on Boot

Make sure bot starts automatically if VM reboots:

```bash
# Enable Docker to start on boot
sudo systemctl enable docker

# Your docker-compose.yml already has "restart: unless-stopped"
# So the container will auto-start with Docker
```

Test it:
```bash
# Reboot VM
sudo reboot

# Reconnect after 30 seconds and check
ssh -i "path\to\oracle-ssh-key.key" ubuntu@YOUR_PUBLIC_IP
docker ps
docker logs discord-rp-bot
```

---

## Useful Commands

### Managing the Bot:
```bash
# View logs
docker logs discord-rp-bot
docker logs -f discord-rp-bot  # Follow in real-time

# Restart bot
docker-compose restart

# Stop bot
docker-compose down

# Stop and rebuild
docker-compose down
docker-compose up -d --build

# Update bot code (after uploading new files)
docker-compose up -d --build
```

### System Monitoring:
```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check Docker stats
docker stats

# System resources
htop  # (install with: sudo apt install htop)
```

### Managing Data:
```bash
# Your data persists in ./data folder
cd ~/discord-bot/data
ls -la

# Backup data
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Download backup to your PC (from Windows PowerShell)
scp -i "path\to\oracle-ssh-key.key" ubuntu@YOUR_PUBLIC_IP:~/discord-bot/backup-*.tar.gz .
```

---

## Troubleshooting

### Bot won't start:
```bash
docker logs discord-rp-bot
# Check for errors in .env file or missing dependencies
```

### Out of memory:
```bash
free -h
# Free tier has 12GB, plenty for this bot
# If needed, restart: docker-compose restart
```

### Can't connect via SSH:
- Check Security List allows your IP on port 22
- Verify key permissions (Windows: use icacls command above)
- Try: `ssh -v -i key ubuntu@IP` for verbose debugging

### Bot disconnects randomly:
```bash
# Check if container died
docker ps -a

# If it exited, check logs
docker logs discord-rp-bot

# Restart
docker-compose up -d
```

---

## Security Best Practices

1. **Keep system updated:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Never commit .env to Git** (already in .gitignore)

3. **Regular backups:**
   ```bash
   # Weekly backup script
   tar -czf ~/backups/discord-bot-$(date +%Y%m%d).tar.gz ~/discord-bot/data/
   ```

4. **Monitor logs regularly:**
   ```bash
   docker logs discord-rp-bot --tail 100
   ```

---

## Updating Your Bot

When you make code changes on your PC:

### Method 1: SCP Upload
```powershell
# From your PC
scp -i "path\to\oracle-ssh-key.key" C:\Users\crazy\Downloads\discord-bot\bot.js ubuntu@YOUR_PUBLIC_IP:~/discord-bot/
```

Then on VM:
```bash
docker-compose up -d --build
```

### Method 2: Git (if using repo)
```bash
# On VM
cd ~/discord-bot
git pull
docker-compose up -d --build
```

---

## Cost Monitoring

Even though it's free, set up budget alerts:

1. Go to **☰ Menu** → **Billing & Cost Management** → **Budgets**
2. Create budget: $0.01 threshold
3. Get email if charges occur (shouldn't happen on free tier)

---

## Your Bot is Now Live 24/7! 🎉

- **No maintenance needed** - runs automatically
- **Survives reboots** - auto-restarts
- **Free forever** - Oracle Cloud Always Free Tier
- **Scalable** - upgrade anytime if needed

Check status anytime:
```bash
ssh -i key ubuntu@YOUR_PUBLIC_IP "docker logs discord-rp-bot --tail 20"
```
