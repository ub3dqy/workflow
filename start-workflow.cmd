@echo off
setlocal enableextensions enabledelayedexpansion

cd /d "%~dp0dashboard"

rem Skip npm install when package-lock.json matches snapshot from last install
set "STAMP=node_modules\.package-lock.snapshot"
set "NEED_INSTALL=0"

if not exist node_modules (
  set "NEED_INSTALL=1"
) else if not exist "%STAMP%" (
  set "NEED_INSTALL=1"
) else (
  fc /b package-lock.json "%STAMP%" >nul 2>&1
  if errorlevel 1 set "NEED_INSTALL=1"
)

if "!NEED_INSTALL!"=="1" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 exit /b 1
  copy /y package-lock.json "%STAMP%" >nul
)

call npm run dev
