@echo off
rem Starts Shop Ledger on this computer. Your data stays in the "data" folder.
cd /d "%~dp0"
start "Shop Ledger API" /min cmd /k ".venv\Scripts\python -m uvicorn app.api:app --port 8001"
cd web
start "Shop Ledger Web" /min cmd /k "set API_URL=http://localhost:8001&& npm start"
echo Starting... the browser opens in a few seconds.
timeout /t 10 >nul
start http://localhost:3000
