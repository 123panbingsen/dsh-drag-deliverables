@echo off
chcp 65001 >nul
title DSH - 卸载交付文件拖拽
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
echo.
pause
