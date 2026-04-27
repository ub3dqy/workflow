@echo off
setlocal enableextensions

set "BIN=%APPDATA%\npm"
if not exist "%BIN%" mkdir "%BIN%"

set "TARGET=%BIN%\clauder.cmd"
(
  echo @echo off
  echo node "%~dp0scripts\claude-mailbox.mjs" %%*
) > "%TARGET%"

set "MAILBOX_TARGET=%BIN%\workflow-mailbox.cmd"
(
  echo @echo off
  echo node "%~dp0scripts\mailbox.mjs" %%*
) > "%MAILBOX_TARGET%"

set "CHANNEL_TARGET=%BIN%\workflow-mailbox-channel.cmd"
(
  echo @echo off
  echo node "%~dp0scripts\mailbox-channel.mjs" %%*
) > "%CHANNEL_TARGET%"

set "REGISTER_TARGET=%BIN%\workflow-mailbox-session-register.cmd"
(
  echo @echo off
  echo node "%~dp0scripts\mailbox-session-register.mjs" %%*
) > "%REGISTER_TARGET%"

set "STATUS_TARGET=%BIN%\workflow-mailbox-status.cmd"
(
  echo @echo off
  echo node "%~dp0scripts\mailbox-status.mjs" %%*
) > "%STATUS_TARGET%"

set "BASH_BIN=%USERPROFILE%\bin"
if not exist "%BASH_BIN%" mkdir "%BASH_BIN%"

set "BASH_TARGET=%BASH_BIN%\clauder"
(
  echo #!/usr/bin/env sh
  echo exec node "%~dp0scripts/claude-mailbox.mjs" "$@"
) > "%BASH_TARGET%"

set "BASH_MAILBOX_TARGET=%BASH_BIN%\workflow-mailbox"
(
  echo #!/usr/bin/env sh
  echo exec node "%~dp0scripts/mailbox.mjs" "$@"
) > "%BASH_MAILBOX_TARGET%"

set "BASH_CHANNEL_TARGET=%BASH_BIN%\workflow-mailbox-channel"
(
  echo #!/usr/bin/env sh
  echo exec node "%~dp0scripts/mailbox-channel.mjs" "$@"
) > "%BASH_CHANNEL_TARGET%"

set "BASH_REGISTER_TARGET=%BASH_BIN%\workflow-mailbox-session-register"
(
  echo #!/usr/bin/env sh
  echo exec node "%~dp0scripts/mailbox-session-register.mjs" "$@"
) > "%BASH_REGISTER_TARGET%"

set "BASH_STATUS_TARGET=%BASH_BIN%\workflow-mailbox-status"
(
  echo #!/usr/bin/env sh
  echo exec node "%~dp0scripts/mailbox-status.mjs" "$@"
) > "%BASH_STATUS_TARGET%"

echo Installed: %TARGET%
echo Installed: %MAILBOX_TARGET%
echo Installed: %CHANNEL_TARGET%
echo Installed: %REGISTER_TARGET%
echo Installed: %STATUS_TARGET%
echo Installed: %BASH_TARGET%
echo Installed: %BASH_MAILBOX_TARGET%
echo Installed: %BASH_CHANNEL_TARGET%
echo Installed: %BASH_REGISTER_TARGET%
echo Installed: %BASH_STATUS_TARGET%
echo.
echo Now open a new terminal and run:
echo   clauder
echo.
if /i not "%~1"=="--quiet" pause
