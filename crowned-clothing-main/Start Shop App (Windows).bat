@echo off
title Textile Shop Manager
cd /d "%~dp0"

if not exist node_modules (
    echo First-time setup - installing dependencies, this may take a minute...
    call npm install
    if errorlevel 1 (
        echo.
        echo Something went wrong during install. Make sure Node.js is installed
        echo from https://nodejs.org and try again.
        pause
        exit /b 1
    )
)

echo Building the app...
call npm run build
if errorlevel 1 (
    echo.
    echo Build failed. See the messages above.
    pause
    exit /b 1
)

echo Starting the shop app server...
start "Textile Shop Manager - server (keep this window open)" cmd /c "npm run start"

timeout /t 3 /nobreak >nul
start "" http://localhost:4000

echo.
echo The app should now be open in your browser.
echo A second window titled "Textile Shop Manager - server" is running the app -
echo keep that window open while you use the app. Closing it will stop the app.
echo.
echo First time only: sign in as Admin / PIN 0000, then set a real PIN
echo and add your team under the Users tab.
echo.
pause
