@echo off
rem Updates this copy from GitHub and starts the BAR Builder. Double-click to run.
cd /d "%~dp0"
echo Getting the latest version...
git pull
echo Installing anything new...
call npm install
echo Starting the BAR Builder. Leave this window open; close it to stop.
call npm run dev:bar
pause
