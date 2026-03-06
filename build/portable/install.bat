@echo off
chcp 65001 >nul 2>&1
title Selltkey Scraper - 초기 설정
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
