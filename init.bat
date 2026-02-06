@echo off
REM init.bat - Sparks Hospitality Development Environment Setup (Windows)
REM This script initializes the development environment for the Meraki Captive Portal project

echo ==========================================
echo Sparks Hospitality - Development Setup
echo ==========================================
echo.

REM Check Node.js version
echo Checking Node.js version...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js 22+ from https://nodejs.org/
    exit /b 1
)

for /f "tokens=1 delims=v" %%i in ('node -v') do set NODE_VERSION=%%i
echo Node.js %NODE_VERSION% detected
echo.

REM Check Firebase CLI
echo Checking Firebase CLI...
where firebase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Firebase CLI not found. Installing...
    call npm install -g firebase-tools
)
echo Firebase CLI detected
echo.

REM Check if .env file exists
if not exist ".env" (
    echo Warning: .env file not found
    if exist ".env.template" (
        echo Creating .env from .env.template...
        copy .env.template .env
        echo Please configure .env with your credentials
    ) else (
        echo Error: .env.template not found
    )
    echo.
)

REM Install dependencies
echo Installing dependencies...
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
) else (
    echo Root dependencies already installed
)
echo.

REM Install Cloud Functions dependencies
if exist "functions" (
    echo Installing Cloud Functions dependencies...
    cd functions
    if not exist "node_modules" (
        call npm install
    ) else (
        echo Functions dependencies already installed
    )
    cd ..
) else (
    echo Warning: functions directory not found
)
echo.

REM Check Firebase project
echo Checking Firebase project configuration...
if exist ".firebaserc" (
    echo Firebase project configured
) else (
    echo Error: .firebaserc not found
    echo Please run: firebase init
    exit /b 1
)
echo.

REM Start Firebase Emulators
echo Starting Firebase Emulators...
echo This will start:
echo   - Firebase Functions Emulator (port 5001)
echo   - Firebase Realtime Database Emulator (port 9000)
echo   - Firebase Hosting Emulator (port 5000)
echo   - Firebase Firestore Emulator (port 8080)
echo   - Firebase Storage Emulator (port 9199)
echo.
echo Press Ctrl+C to stop the emulators
echo.

REM Check if port 5000 is already in use
netstat -ano | findstr :5000 | findstr LISTENING >nul
if %ERRORLEVEL% EQU 0 (
    echo Warning: Port 5000 already in use. Attempting to stop...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
    timeout /t 2 /nobreak >nul
)

REM Start emulators with UI
firebase emulators:start --import=./firebase-export --export-on-exit

REM Note: The script will stay running while emulators are active
REM On exit (Ctrl+C), Firebase will auto-export data to ./firebase-export
