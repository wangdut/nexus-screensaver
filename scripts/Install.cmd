@echo off
chcp 65001 >nul
title NEXUS - Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
if errorlevel 1 pause
