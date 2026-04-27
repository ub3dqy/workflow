@echo off
setlocal enableextensions

node "%~dp0scripts\codex-remote-project.mjs" %*
if errorlevel 1 pause
