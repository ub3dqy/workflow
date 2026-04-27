@echo off
setlocal enableextensions

node "%~dp0scripts\claude-mailbox.mjs" %*
if errorlevel 1 pause
