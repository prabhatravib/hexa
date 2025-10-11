@echo off
setlocal
echo 🚀 Deploying Hexa Voice Worker to Cloudflare...

REM Build the application
echo 📦 Building application...
call npm run build
if errorlevel 1 goto :error

REM Build the worker
echo 🔧 Building worker...
call npm run build:worker
if errorlevel 1 goto :error

REM Deploy to Cloudflare Workers
echo ☁️ Deploying to Cloudflare Workers...
call wrangler deploy
if errorlevel 1 goto :error

goto :success

:error
echo ❌ Deployment aborted due to an earlier error.
exit /b %ERRORLEVEL%

:success
echo ✅ Deployment complete!
echo 🌐 Your voice-enabled hexagon should now be available at your Cloudflare Workers URL
echo 🎤 Make sure to update your OpenAI API key in wrangler.jsonc before deploying!
echo.
echo 🔊 Playing completion sound...
echo ✅ Deployment completed at %date% %time%

powershell -c "[console]::beep(800,500)"
echo 🎉 Deployment finished successfully!

exit /b 0