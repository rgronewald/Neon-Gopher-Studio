@echo off
setlocal
cd /d "%~dp0"
title Neon Gopher Studio v1.1
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing Neon Gopher Studio dependencies...
  call npm install
  if errorlevel 1 (
    echo Installation failed.
    pause
    exit /b 1
  )
)
start "" http://localhost:3210
node server.js
pause
