@echo off
setlocal

echo Stopping workflow dashboard...
call npx --yes kill-port 3003 9119
echo Done.
