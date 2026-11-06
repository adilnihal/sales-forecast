@echo off
rem Copies your data file into the "backups" folder with today's date and time.
cd /d "%~dp0"
if not exist data\app.db (
  echo No data yet.
  pause
  exit /b 1
)
if not exist backups mkdir backups
powershell -NoProfile -Command "Copy-Item 'data\app.db' ('backups\app-' + (Get-Date -Format 'yyyy-MM-dd-HHmm') + '.db')"
echo Backup saved in the backups folder.
pause
