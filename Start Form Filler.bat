@echo off
title Form Filler
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Please install it from https://nodejs.org and try again. & pause & exit /b)
if not exist node_modules (
  echo Installing components for the first time...
  call npm install
)
rem Open the browser a moment after the server starts.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:3456"
node server.js
pause
