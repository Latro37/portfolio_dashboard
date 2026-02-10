@echo off
title Composer Portfolio Visualizer
echo.
echo ==================================================
echo   Composer Portfolio Visualizer
echo ==================================================
echo.

:: Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in your PATH.
    echo.
    echo Download Python from: https://www.python.org/downloads/
    echo IMPORTANT: Check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: Run the launcher
python "%~dp0start.py"

:: Keep window open if something went wrong
if %errorlevel% neq 0 (
    echo.
    echo Something went wrong. See the error messages above.
    pause
)
