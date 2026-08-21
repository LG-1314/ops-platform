@echo off
rem 运维全维度管理平台 · 一键打包入口（双击运行）
chcp 65001 >nul
title 运维全维度管理平台 - 一键打包
echo 正在执行一键打包，请稍候...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pack.ps1"
echo.
pause
