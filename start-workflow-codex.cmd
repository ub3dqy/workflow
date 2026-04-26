@echo off
setlocal enableextensions enabledelayedexpansion

rem Launcher: dashboard в Codex-режиме (реальный CodexAdapter через WSL).
rem По умолчанию уходит в hidden-relay через start-workflow.cmd.
rem Для видимого debug-запуска используй start-workflow.cmd --visible.

set "DASHBOARD_ADAPTER=codex"

call "%~dp0start-workflow.cmd"
