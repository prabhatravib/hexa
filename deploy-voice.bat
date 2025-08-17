@echo off
echo 🚀 Deploying Hexa Voice Worker to Cloudflare...

REM Build the application
echo 📦 Building application...
call npm run build

REM Build the worker
echo 🔧 Building worker...
call npm run build:worker

REM Deploy to Cloudflare Workers
echo ☁️ Deploying to Cloudflare Workers...
call wrangler deploy

echo ✅ Deployment complete!
echo 🌐 Your voice-enabled hexagon should now be available at your Cloudflare Workers URL
echo 🎤 Make sure to update your OpenAI API key in wrangler.jsonc before deploying!
pause
