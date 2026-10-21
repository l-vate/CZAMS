
@echo off
setlocal
title CZAMS Setup and Launcher
cd /d "%~dp0"

echo.
echo ==========================================
echo       CZAMS - Cooling Zone Aircon
echo       Maintenance Services
echo ==========================================
echo.

REM Check Node.js and npm
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo Install Node.js LTS from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found.
    pause
    exit /b 1
)

REM Verify project files
if not exist "package.json" (
    echo ERROR: Root package.json not found.
    echo Place this BAT file in the CZAMS project root.
    pause
    exit /b 1
)

if not exist "server\package.json" (
    echo ERROR: server\package.json not found.
    pause
    exit /b 1
)

REM Install frontend dependencies
echo [1/5] Installing frontend dependencies...
call npm install
if errorlevel 1 goto :error

REM Install backend dependencies
echo.
echo [2/5] Installing backend dependencies...
pushd server
call npm install
if errorlevel 1 (
    popd
    goto :error
)
popd

REM Create environment file only if missing
echo.
echo [3/5] Checking environment configuration...

if not exist "server\.env" (
    (
        echo PORT=5000
        echo MONGO_URI=mongodb://127.0.0.1:27017/czams
        echo JWT_SECRET=replace_with_a_long_random_secret
    ) > "server\.env"

    echo Created server\.env
    echo IMPORTANT: Configure MongoDB and JWT_SECRET before use.
) else (
    echo Existing server\.env preserved.
)

REM Launch backend
echo.
echo [4/5] Starting backend...
start "CZAMS Backend" cmd /k "cd /d ""%~dp0server"" && npm start"

REM Give the backend a moment to initialize
timeout /t 3 /nobreak >nul

REM Launch frontend
echo.
echo [5/5] Starting frontend...
start "CZAMS Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo ==========================================
echo           CZAMS LAUNCH REQUESTED
echo ==========================================
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:5000
echo.
echo Check both terminal windows for errors.
echo MongoDB must be configured and running.
echo You may now close this setup window.
echo The server windows will remain open.
echo.
pause
exit /b 0

:error
echo.
echo SETUP FAILED.
echo Check the error messages above.
echo Fix the issue and run this file again.
pause
exit /b 1