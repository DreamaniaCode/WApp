@echo off
title WA Manager Launcher

echo ===================================
echo       Starting WA Manager...
echo ===================================

cd /d "%~dp0"

echo Launching application in development mode...
npm run electron:dev
