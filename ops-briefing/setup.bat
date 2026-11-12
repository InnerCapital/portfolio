@echo off
cd /d "%~dp0"
title Daily Briefing System

REM Ensure PATH includes common Node.js locations
set "PATH=%PATH%;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;%ProgramFiles%\nodejs"

echo.
echo  ============================================
echo   Daily Briefing System - Setup
echo  ============================================
echo.

REM ---- Check Node.js ----
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!!] Node.js not found. Installing...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>nul
    ) else (
        echo  Downloading Node.js...
        powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs.msi'" 2>nul
        if exist "%TEMP%\nodejs.msi" msiexec /i "%TEMP%\nodejs.msi" /qn
    )
    echo  [OK] Node.js installed. Please CLOSE and re-run setup.bat.
    pause
    exit /b 0
)
echo  [OK] Node.js found

echo.
echo  Installing dependencies...
call npm install --silent 2>nul
echo  [OK] Dependencies ready

echo.
echo  Checking browser...
if exist "node_modules\playwright" (
    call npx playwright install chromium 2>nul
)
echo  [OK] Browser ready

if not exist "tokens" mkdir tokens
if not exist "output" mkdir output
if not exist "playwright-data" mkdir playwright-data
echo  [OK] Folders ready

if not exist ".env" (
    if exist ".env.alex" ( copy .env.alex .env >nul ) else if exist ".env.example" ( copy .env.example .env >nul )
    echo  [NOTE] Created .env - add your API key
)

echo.
echo  ---- Status ----
if exist "credentials.json" (echo  [OK] Google credentials) else (echo  [!!] Missing credentials.json)
if exist ".env" (echo  [OK] Environment file) else (echo  [!!] Missing .env)

echo.
echo  ============================================
echo   Starting server...
echo  ============================================
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3001"
node server.js
pause
