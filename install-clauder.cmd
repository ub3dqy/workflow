@echo off
setlocal enableextensions

set "BIN=%APPDATA%\npm"
if not exist "%BIN%" mkdir "%BIN%"

set "TARGET=%BIN%\clauder.cmd"
(
  echo @echo off
  echo call "%~dp0clauder.cmd" %%*
) > "%TARGET%"

set "BASH_BIN=%USERPROFILE%\bin"
if not exist "%BASH_BIN%" mkdir "%BASH_BIN%"

set "BASH_TARGET=%BASH_BIN%\clauder"
(
  echo #!/usr/bin/env sh
  echo exec node "%~dp0scripts/claude-mailbox.mjs" "$@"
) > "%BASH_TARGET%"

echo Installed: %TARGET%
echo Installed: %BASH_TARGET%
echo.
echo Now open a new terminal and run:
echo   clauder
echo.
if /i not "%~1"=="--quiet" pause
