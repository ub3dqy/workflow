@echo off
setlocal enableextensions

cd /d "%~dp0"
node scripts\claude-mailbox.mjs %*
if errorlevel 1 pause
