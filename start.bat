@echo off
rem DEVELOPMENT ONLY - launches the local backend and frontend on this machine.
rem It is never deployed: Render runs "npm start" in /server and Vercel builds the frontend.
rem Needs server\.env with DATABASE_URL pointing at your Neon dev branch (see server\.env.example).

if not exist "%~dp0server\.env" (
  echo server\.env is missing. Copy server\.env.example to server\.env and set DATABASE_URL first.
  pause
  exit /b 1
)

echo Starting Rhabit (development)...
start "Rhabit Server" cmd /k "cd /d %~dp0server && npm run migrate && npm run dev"
timeout /t 3 /nobreak > nul
start "Rhabit Frontend" cmd /k "cd /d %~dp0 && npm run dev"
timeout /t 3 /nobreak > nul
start "" "http://localhost:5173"
echo Rhabit is running! You can close this window.
