@echo off
echo Starting Rhabit...
start "Rhabit Server" cmd /k "cd /d %~dp0server && node index.js"
timeout /t 2 /nobreak > nul
start "Rhabit Frontend" cmd /k "cd /d %~dp0 && npm run dev"
timeout /t 3 /nobreak > nul
start "" "http://localhost:5173"
echo Rhabit is running! You can close this window.