@echo off
rem One-time setup. Double-click this once.
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
)
.venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 goto fail
cd web
call npm install
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
echo.
echo Setup finished. Now double-click start.bat
pause
exit /b 0
:fail
echo.
echo Something failed. Send a screenshot of this window.
pause
exit /b 1
