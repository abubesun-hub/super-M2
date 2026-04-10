@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-live-preview.ps1"
echo.
echo Frontend local: http://localhost:4174
echo Backend local:  http://localhost:4001/api
echo.
pause