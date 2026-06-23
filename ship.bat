@echo off
cd /d "%~dp0"
where bash >nul 2>nul || ( echo Git Bash not found. & pause & exit /b 1 )
bash ship.sh %*
pause
