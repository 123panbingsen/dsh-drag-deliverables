@echo off
chcp 65001 >nul
title DSH - 安装交付文件拖拽
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
