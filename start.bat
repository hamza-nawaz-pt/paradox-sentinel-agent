@echo off
title Paradox Sentinel
color 0B
cls
echo.
echo  =========================================
echo    PARADOX SENTINEL  ^|  Google AI Seekho
echo  =========================================
echo.
echo  - Clearing any stale processes on port 3001...
echo  - Starting backend + opening app in browser...
echo  - Press Ctrl+C to stop everything.
echo.
cd /d "%~dp0"
npm run dev
echo.
echo  Stopped. Press any key to close.
pause > nul
