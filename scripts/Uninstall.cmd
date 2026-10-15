@echo off
chcp 65001 >nul
title NEXUS - Uninstall
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall.ps1"
pause
