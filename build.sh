#!/bin/bash

# RunSafe Docker Image Build Script
# Builds all required Docker images for the RunSafe bundle

set -e

echo "🚀 Building RunSafe Docker images..."

# Build Gateway
echo "📦 Building gateway image..."
docker build -t runsafe/gateway:latest ./docker/gateway/

# Build Tap
echo "📦 Building tap image..."
docker build -t runsafe/tap:latest ./docker/tap/

# Build Dashboard
echo "📦 Building dashboard image..."
docker build -t runsafe/dashboard:latest ./docker/dashboard/

echo "✅ All images built successfully!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env and configure your settings"
echo "2. Run: docker compose up -d"
echo "3. Access n8n at http://localhost:5678"
echo "4. Access dashboard at http://localhost:8081"