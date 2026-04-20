@echo off
setlocal enableextensions enabledelayedexpansion

rem Launcher: dashboard в Codex-режиме (реальный CodexAdapter через WSL).
rem Двойной клик запускает и API, и UI в одном окне.
rem Для mock-режима (обычный день) используй start-workflow.cmd.

set "DASHBOARD_ADAPTER=codex"

call "%~dp0start-workflow.cmd"
