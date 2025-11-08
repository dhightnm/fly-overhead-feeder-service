#!/bin/bash
# Quick deployment script for AWS Lightsail
# Usage: ./deploy-lightsail.sh [lightsail-instance-ip]

set -e

INSTANCE_IP="${1:-}"
INSTANCE_USER="${INSTANCE_USER:-ubuntu}"

if [ -z "$INSTANCE_IP" ]; then
    echo "Usage: $0 <lightsail-instance-ip>"
    echo "Example: $0 54.123.45.67"
    exit 1
fi

echo "🚀 Deploying Fly Overhead Feeder Service to Lightsail"
echo "   Instance: $INSTANCE_USER@$INSTANCE_IP"
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "⚠️  Warning: .env.production not found"
    echo "   Creating from example..."
    cp .env.production.example .env.production
    echo "   Please edit .env.production with your production values before deploying!"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📦 Building Docker image locally..."
docker build -t fly-overhead-feeder:latest .

echo "💾 Saving Docker image..."
docker save fly-overhead-feeder:latest | gzip > feeder-service-image.tar.gz

echo "📤 Uploading to Lightsail instance..."
scp feeder-service-image.tar.gz $INSTANCE_USER@$INSTANCE_IP:/tmp/

echo "📤 Uploading configuration files..."
scp docker-compose.prod.yml $INSTANCE_USER@$INSTANCE_IP:~/fly-overhead-feeder-service/
scp .env.production $INSTANCE_USER@$INSTANCE_IP:~/fly-overhead-feeder-service/

echo "🔧 Setting up on Lightsail instance..."
ssh $INSTANCE_USER@$INSTANCE_IP << 'ENDSSH'
set -e

cd ~/fly-overhead-feeder-service || {
    echo "Creating directory..."
    mkdir -p ~/fly-overhead-feeder-service
    cd ~/fly-overhead-feeder-service
}

echo "Loading Docker image..."
docker load < /tmp/feeder-service-image.tar.gz

echo "Stopping existing service..."
docker-compose -f docker-compose.prod.yml down || true

echo "Starting service..."
docker-compose -f docker-compose.prod.yml up -d

echo "Waiting for service to start..."
sleep 5

echo "Checking service health..."
curl -f http://localhost:3006/health || {
    echo "⚠️  Service health check failed!"
    echo "Checking logs..."
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
}

echo "✅ Service deployed successfully!"
echo ""
echo "Service status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "View logs with: docker-compose -f docker-compose.prod.yml logs -f"
ENDSSH

echo ""
echo "🧹 Cleaning up..."
rm -f feeder-service-image.tar.gz

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. SSH to instance: ssh $INSTANCE_USER@$INSTANCE_IP"
echo "  2. Check logs: cd ~/fly-overhead-feeder-service && docker-compose -f docker-compose.prod.yml logs -f"
echo "  3. Test health: curl http://$INSTANCE_IP:3006/health"
echo ""

