@echo off
rem HERO one-click push launcher (logic in push.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1" %*
