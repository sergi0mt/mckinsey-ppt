@echo off
REM ============================================================
REM MECE PPT — Launcher
REM Abre backend (puerto 8000) y frontend (puerto 3000)
REM en ventanas separadas. Cierra las ventanas para detener.
REM ============================================================

setlocal

cd /d "%~dp0"

echo.
echo ==========================================
echo  MECE PPT
echo ==========================================
echo.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:3000
echo.
echo  Para detener: cierra las ventanas (o ejecuta stop.bat)
echo ==========================================
echo.

if not exist ".env" (
    echo [ERROR] No se encontro .env
    echo Crea el archivo .env con:
    echo   OPENROUTER_API_KEY=...
    echo   TAVILY_API_KEY=...
    echo   BRAVE_API_KEY=...
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [INFO] Instalando dependencias frontend...
    cd frontend
    call npm install
    cd ..
)

echo [INFO] Liberando puertos 8000 y 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [INFO] Iniciando backend...
start "MECE PPT Backend" cmd /k "cd /d %~dp0 && python -m uvicorn backend.main:app --reload --port 8000 --timeout-keep-alive 120 --limit-concurrency 10"

timeout /t 3 /nobreak >nul

echo [INFO] Iniciando frontend...
start "MECE PPT Frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

timeout /t 5 /nobreak >nul

echo [INFO] Abriendo navegador...
start http://localhost:3000

echo.
echo [OK] App lanzada. Cierra esta ventana o cualquier ventana del servidor para detener.
echo.

endlocal
