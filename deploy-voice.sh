#!/bin/bash

echo "🚀 Deploying Hexa Voice Worker to Cloudflare..."

# Build the application
echo "📦 Building application..."
npm run build

# Build the worker
echo "🔧 Building worker..."
npm run build:worker

# Deploy to Cloudflare Workers
echo "☁️ Deploying to Cloudflare Workers..."
wrangler deploy

echo "✅ Deployment complete!"
echo "🌐 Your voice-enabled hexagon should now be available at your Cloudflare Workers URL"
echo "🎤 Make sure to update your OpenAI API key in wrangler.jsonc before deploying!"
