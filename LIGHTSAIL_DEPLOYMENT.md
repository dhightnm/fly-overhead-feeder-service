# AWS Lightsail Deployment Guide

This guide walks you through deploying the Fly Overhead Feeder Service to AWS Lightsail.

## Prerequisites

- AWS Account
- AWS CLI installed and configured (`aws configure`)
- Docker and Docker Compose installed on your local machine
- SSH access to your Lightsail instance
- Domain name (optional, for custom domain)

## Step 1: Create Lightsail Instance

1. **Go to AWS Lightsail Console**: https://lightsail.aws.amazon.com/
2. **Create Instance**:
   - Choose "Linux/Unix" platform
   - Choose "Ubuntu 22.04 LTS" or "Amazon Linux 2023"
   - Choose instance size (recommended: **$10/month** - 2GB RAM, 1 vCPU)
   - Name your instance: `fly-overhead-feeder`
   - Click "Create instance"

3. **Wait for instance to be running** (2-3 minutes)

## Step 2: Configure Lightsail Instance

### 2.1 Connect via SSH

```bash
# Get your instance IP from Lightsail console
# Or use Lightsail browser-based SSH
```

### 2.2 Update System

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 2.3 Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (replace 'ubuntu' with your username)
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
exit
```

### 2.4 Install Git

```bash
sudo apt-get install -y git
```

## Step 3: Set Up Database Connection

You have two options:

### Option A: Use Existing PostgreSQL Database

If you already have a PostgreSQL database (on another Lightsail instance, RDS, etc.):

1. Note your database connection string:
   ```
   postgresql://username:password@host:port/database
   ```

2. Update `.env.production` with your database URL (see Step 4)

### Option B: Create New PostgreSQL Database on Lightsail

1. **Create Database in Lightsail**:
   - Go to Lightsail Console → Databases
   - Click "Create database"
   - Choose PostgreSQL
   - Choose instance size (recommended: **$15/month** - 1GB RAM)
   - Name: `fly-overhead-db`
   - Master database name: `fly_overhead`
   - Master username: `postgres`
   - Master password: **Generate a strong password and save it!**

2. **Note the endpoint** (e.g., `fly-overhead-db.xxxxx.us-east-1.rds.amazonaws.com:5432`)

3. **Update firewall rules**:
   - In Lightsail Database → Networking
   - Add your Lightsail instance IP to allowed IPs
   - Or add `0.0.0.0/0` for testing (not recommended for production)

## Step 4: Clone and Configure Repository

### 4.1 Clone Repository

```bash
cd ~
git clone https://github.com/dhightnm/fly-overhead-feeder-service.git
cd fly-overhead-feeder-service
```

### 4.2 Create Production Environment File

```bash
# Copy example file
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Important variables to update:**

```bash
# Database connection (from Step 3)
POSTGRES_URL=postgresql://postgres:YOUR_PASSWORD@your-db-endpoint:5432/fly_overhead

# Security (generate a random secret)
API_KEY_SECRET=$(openssl rand -hex 32)
# Add this to .env.production

# Main service URL (if running on same instance or different)
MAIN_SERVICE_URL=http://localhost:3005
# Or if on different instance:
# MAIN_SERVICE_URL=http://your-main-service-ip:3005

# Public URL for setup script
SETUP_URL=https://api.fly-overhead.com
```

### 4.3 Run Database Migrations

```bash
# Make sure your database is accessible
# Run migrations
docker-compose -f docker-compose.prod.yml run --rm feeder-ingestion npm run migrate
```

**Note**: If migrations fail, you may need to create a temporary container with database access:

```bash
# Create a migration container
docker run -it --rm \
  --env-file .env.production \
  -v $(pwd):/app \
  -w /app \
  node:18-alpine sh -c "npm install && npm run migrate"
```

## Step 5: Build and Start Services

### 5.1 Create Docker Network (if not exists)

```bash
# Check if network exists (from main service)
docker network ls | grep fly-overhead-network

# If it doesn't exist, create it
docker network create fly-overhead-network
```

### 5.2 Build and Start

```bash
# Build and start the service
docker-compose -f docker-compose.prod.yml up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 5.3 Verify Service is Running

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# Check health endpoint
curl http://localhost:3006/health

# Should return:
# {"status":"ok","timestamp":"...","uptime":...,"checks":{"database":"connected"}}
```

## Step 6: Configure Firewall (Lightsail Networking)

1. **Go to Lightsail Console** → Your Instance → Networking
2. **Add Firewall Rule**:
   - Application: Custom
   - Protocol: TCP
   - Port: 3006
   - Source: Anywhere (0.0.0.0/0) or specific IPs
   - Click "Save"

## Step 7: Set Up Domain and SSL (Optional)

### 7.1 Point Domain to Lightsail Instance

1. **Get Static IP** (if not already):
   - Lightsail Console → Networking → Create static IP
   - Attach to your instance

2. **Update DNS**:
   - Go to your DNS provider (Route53, Cloudflare, etc.)
   - Create A record: `api.fly-overhead.com` → Your Lightsail Static IP

### 7.2 Set Up SSL with Nginx and Let's Encrypt

```bash
# Install Nginx
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/fly-overhead-feeder
```

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name api.fly-overhead.com;

    location / {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/fly-overhead-feeder /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d api.fly-overhead.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### 7.3 Update Environment Variables

```bash
# Update SETUP_URL in .env.production
SETUP_URL=https://api.fly-overhead.com

# Restart service
docker-compose -f docker-compose.prod.yml restart
```

## Step 8: Set Up Auto-Start on Reboot

### 8.1 Enable Docker Compose Auto-Start

```bash
# Create systemd service
sudo nano /etc/systemd/system/fly-overhead-feeder.service
```

**Service File:**

```ini
[Unit]
Description=Fly Overhead Feeder Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/fly-overhead-feeder-service
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable fly-overhead-feeder
sudo systemctl start fly-overhead-feeder
```

## Step 9: Monitoring and Maintenance

### 9.1 View Logs

```bash
# Service logs
docker-compose -f docker-compose.prod.yml logs -f

# Application logs
tail -f logs/combined-*.log
tail -f logs/error-*.log
```

### 9.2 Check Service Health

```bash
# Health check
curl http://localhost:3006/health

# Service status
docker-compose -f docker-compose.prod.yml ps
```

### 9.3 Update Service

```bash
cd ~/fly-overhead-feeder-service

# Pull latest changes
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations if needed
docker-compose -f docker-compose.prod.yml run --rm feeder-ingestion npm run migrate
```

### 9.4 Backup

```bash
# Backup logs (if needed)
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/

# Database backups should be handled by Lightsail Database automated backups
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Check container status
docker ps -a

# Check environment variables
docker-compose -f docker-compose.prod.yml config
```

### Database Connection Issues

```bash
# Test database connection from container
docker-compose -f docker-compose.prod.yml run --rm feeder-ingestion sh -c "node -e \"const pgp = require('pg-promise')(); const db = pgp(process.env.POSTGRES_URL); db.query('SELECT NOW()').then(r => console.log(r)).catch(e => console.error(e)).finally(() => process.exit())\""
```

### Port Already in Use

```bash
# Check what's using port 3006
sudo lsof -i :3006

# Kill process if needed
sudo kill -9 <PID>
```

### Out of Memory

```bash
# Check memory usage
free -h
docker stats

# Consider upgrading Lightsail instance size
```

## Cost Estimate

- **Lightsail Instance** (2GB RAM, 1 vCPU): ~$10/month
- **Lightsail Database** (1GB RAM, PostgreSQL): ~$15/month
- **Static IP**: Free (if attached to instance)
- **Data Transfer**: First 1TB free, then $0.09/GB

**Total**: ~$25/month for basic setup

## Security Checklist

- [ ] Changed `API_KEY_SECRET` to a strong random value
- [ ] Changed database password
- [ ] Set up firewall rules (restrict port 3006 if possible)
- [ ] Enabled SSL/HTTPS
- [ ] Set up automated backups
- [ ] Limited database access to specific IPs
- [ ] Regularly update system packages
- [ ] Monitor logs for suspicious activity

## Next Steps

1. Test the setup script: `curl -fsSL https://api.fly-overhead.com/setup.sh | bash`
2. Register a test feeder
3. Monitor logs to ensure data is flowing
4. Set up monitoring/alerting (CloudWatch, etc.)

## Support

For issues or questions, check:
- GitHub Issues: https://github.com/dhightnm/fly-overhead-feeder-service/issues
- Documentation: README.md

