@echo off
rem Startet das Browser Survival Studio (Karten-Editor als Programm). Erster Start installiert Electron (~100 MB).
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Installiere Abhaengigkeiten ...
  call npm install
)
call npm run studio
