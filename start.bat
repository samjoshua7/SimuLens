@echo off
setlocal enabledelayedexpansion

title SimuLens Launcher

echo ===================================================================
echo     SIMULENS - Uncertainty-Aware Causal World Model Engine
echo ===================================================================

cd /d "%~dp0"

:: 1. Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Ensure .env exists
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy .env.example .env >nul
    )
)

:: 3. Check and Install Dependencies
if not exist "node_modules\" (
    echo [1/3] Installing dependencies across all workspaces...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencies verified.
)

:: 4. Build Monorepo Packages
echo [2/3] Building core packages and Next.js frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Check the errors above.
    pause
    exit /b 1
)

:: 5. Launch Fastify API Gateway in persistent terminal window
echo [3/3] Launching Fastify API Server on http://localhost:8000 ...
start "SimuLens API Gateway (Port 8000)" cmd /k "cd /d "%~dp0" && npm run dev:api"

:: Wait 3 seconds for Fastify to bind port
timeout /t 3 /nobreak >nul

:: 6. Launch Next.js Web Dashboard in persistent terminal window
echo Launching Next.js Web Dashboard on http://localhost:3000 ...
start "SimuLens Web Dashboard (Port 3000)" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo ===================================================================
echo   SimuLens services are live!
echo     - API Gateway:    http://localhost:8000
echo     - Health Probe:   http://localhost:8000/health
echo     - Web Dashboard:  http://localhost:3000
echo ===================================================================

:: Wait 4 seconds for Next.js to start, then open browser
timeout /t 4 /nobreak >nul
start http://localhost:3000
