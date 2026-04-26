@echo off
setlocal enableextensions enabledelayedexpansion

if /i "%~1"=="--hidden-relay" (
  shift
) else if /i "%~1"=="--visible" (
  shift
) else if /i not "%WORKFLOW_LAUNCH_VISIBLE%"=="1" (
  wscript.exe //nologo "%~dp0start-workflow-hidden.vbs" "%~f0" --hidden-relay %*
  exit /b %errorlevel%
)

cd /d "%~dp0dashboard"

rem Skip npm install when package-lock.json matches snapshot from last install
set "STAMP=node_modules\.package-lock.snapshot"
set "NEED_INSTALL=0"
set "WIN_ROLLDOWN_BINDING=node_modules\@rolldown\binding-win32-x64-msvc"

if not exist node_modules (
  set "NEED_INSTALL=1"
) else if not exist "%WIN_ROLLDOWN_BINDING%" (
  rem Shared node_modules can miss the Windows-native Vite binding after WSL installs.
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
  rem Backfill Linux binding so Codex (WSL) build won't fail after Windows npm install.
  rem Uses --no-save to keep the lockfile stable; install is cross-platform optional dep.
  echo Backfilling Linux rolldown binding for WSL side...
  call npm install --no-audit --no-fund --no-save --force @rolldown/binding-linux-x64-gnu @rolldown/binding-linux-x64-musl 2>nul
)

echo Building dashboard...
call npm run build
if errorlevel 1 exit /b 1

call npm run serve
