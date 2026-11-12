@echo off
cd /d "%~dp0"
title Cleanup - Removing sensitive data

echo.
echo  ============================================
echo   Cleaning up before sharing
echo  ============================================
echo.

echo  Deleting .env ...
if exist ".env" del /f ".env" && echo   [OK]

echo  Deleting credentials.json ...
if exist "credentials.json" del /f "credentials.json" && echo   [OK]

echo  Deleting client_secret files ...
del /f client_secret_*.json 2>nul

echo  Clearing tokens folder ...
if exist "tokens" del /f /q "tokens\*" 2>nul
echo   [OK]

echo  Clearing playwright-data folder ...
if exist "playwright-data" rmdir /s /q "playwright-data" 2>nul
mkdir "playwright-data" 2>nul
echo   [OK]

echo  Clearing output folder ...
if exist "output" del /f /q "output\*" 2>nul
echo   [OK]

echo  Deleting node_modules (may take a moment) ...
if exist "node_modules" rmdir /s /q "node_modules"
echo   [OK]

echo  Deleting package-lock.json ...
if exist "package-lock.json" del /f "package-lock.json" && echo   [OK]

echo  Deleting old setup guides ...
if exist "SETUP-GUIDE-FOR-ALEX-v3.pdf" del /f "SETUP-GUIDE-FOR-ALEX-v3.pdf"
if exist "SETUP-GUIDE-FOR-ALEX-v4.docx" del /f "SETUP-GUIDE-FOR-ALEX-v4.docx"
if exist "SETUP-GUIDE-v4.docx" del /f "SETUP-GUIDE-v4.docx"

echo  Deleting test files ...
if exist "test-output.html" del /f "test-output.html"
if exist "test-output.txt" del /f "test-output.txt"

echo.
echo  ============================================
echo   DONE! Folder is safe to share.
echo  ============================================
echo.
echo  Press any key to close this window...
pause >nul
