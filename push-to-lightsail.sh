#!/bin/bash

# Quick script to build and push feeder service to ECR for Lightsail
# Your Lightsail service: feederservice.f199m4bz801f2.us-east-2.cs.amazonlightsail.com

set -e

# Configuration
REGION="us-east-2"
REPO_NAME="fly-overhead-feeder-service"
IMAGE_NAME="fly-overhead-feeder-service"
AWS_ACCOUNT_ID="013227987032"  # Your AWS account ID

# ECR URI
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

echo "=========================================="
echo "Building and Pushing to ECR for Lightsail"
echo "=========================================="
echo ""
echo "ECR Repository: $ECR_URI"
echo "Lightsail Service: feederservice.f199m4bz801f2.us-east-2.cs.amazonlightsail.com"
echo ""

# Step 1: Build Docker image
echo "Step 1: Building Docker image..."
docker build \
    --platform linux/amd64 \
    -t "$IMAGE_NAME:latest" \
    .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"
echo ""

# Step 2: Create ECR repository if it doesn't exist
echo "Step 2: Checking ECR repository..."
if aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" &> /dev/null; then
    echo "✅ Repository exists"
else
    echo "Creating ECR repository..."
    aws ecr create-repository \
        --repository-name "$REPO_NAME" \
        --region "$REGION" \
        --image-scanning-configuration scanOnPush=true \
        --image-tag-mutability MUTABLE
    
    if [ $? -eq 0 ]; then
        echo "✅ Repository created"
    else
        echo "❌ Failed to create repository"
        exit 1
    fi
fi
echo ""

# Step 3: Login to ECR
echo "Step 3: Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "$ECR_URI"

if [ $? -ne 0 ]; then
    echo "❌ ECR login failed"
    exit 1
fi
echo "✅ Logged in to ECR"
echo ""

# Step 4: Tag image
echo "Step 4: Tagging image..."
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
docker tag "$IMAGE_NAME:latest" "$ECR_URI:latest"
docker tag "$IMAGE_NAME:latest" "$ECR_URI:$TIMESTAMP"
echo "✅ Images tagged"
echo "  - $ECR_URI:latest"
echo "  - $ECR_URI:$TIMESTAMP"
echo ""

# Step 5: Push images
echo "Step 5: Pushing images to ECR..."
echo "(This may take a few minutes...)"
echo ""
docker push "$ECR_URI:latest"
docker push "$ECR_URI:$TIMESTAMP"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Images pushed successfully!"
    echo "=========================================="
    echo ""
    echo "ECR Image URI:"
    echo "  $ECR_URI:latest"
    echo ""
    echo "Next Steps:"
    echo "1. Go to AWS Lightsail Console"
    echo "2. Navigate to Container Services → feederservice"
    echo "3. Go to Deployments tab"
    echo "4. Click 'Modify and redeploy' or 'Create deployment'"
    echo "5. Set Image: $ECR_URI:latest"
    echo "6. Configure environment variables (see LIGHTSAIL_CONTAINER_DEPLOYMENT.md)"
    echo "7. Set Port: 3006 (HTTP, public endpoint enabled)"
    echo "8. Click 'Save and deploy'"
    echo ""
    echo "Your Lightsail service will pull from this ECR image automatically."
    echo ""
else
    echo "❌ Push failed"
    exit 1
fi

