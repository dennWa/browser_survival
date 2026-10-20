@echo off
rem Startet den lokalen Spielserver und öffnet danach das Spiel im Browser.
cd /d "%~dp0"
if not exist node_modules (
  echo Installiere Abhaengigkeiten ...
  call npm install
)
rem Browser nach 3 Sekunden öffnen (Server braucht kurz zum Hochfahren)
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8080"
echo Server laeuft – Fenster schliessen oder Strg+C zum Beenden.
call npm start
pause
