@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (py -3 launch.py & goto end)
where python >nul 2>nul
if not errorlevel 1 (python launch.py & goto end)
start "" index.html
:end
pause
