@echo off
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     Unified CRM - Build Setup        ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "H:\---CLAUDE---\AI PRODUCER STUDIO\APPS\propias\client-manager"

:: ── 1. Python dependencies ──────────────────────────────────────────────────
echo [1/4] Instalando dependencias Python...
"C:/Users/Fredd/.production-agent-venv/Scripts/pip.exe" install -r requirements.txt
if errorlevel 1 (
    echo [!] Error instalando dependencias Python.
    pause
    exit /b 1
)
echo      OK

:: ── 2. Playwright browsers ───────────────────────────────────────────────────
echo [2/4] Instalando navegadores Playwright (Chromium)...
"C:/Users/Fredd/.production-agent-venv/Scripts/python.exe" -m playwright install chromium
if errorlevel 1 (
    echo [!] Error instalando Playwright browsers.
    pause
    exit /b 1
)
echo      OK

:: ── 3. npm install ───────────────────────────────────────────────────────────
echo [3/4] Instalando dependencias npm...
cd frontend
call npm install
if errorlevel 1 (
    echo [!] Error en npm install.
    pause
    exit /b 1
)
echo      OK

:: ── 4. Build frontend ────────────────────────────────────────────────────────
echo [4/4] Compilando frontend...
call npm run build
if errorlevel 1 (
    echo [!] Error en npm run build.
    pause
    exit /b 1
)
echo      OK

cd ..

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Build completado con exito!        ║
echo  ║   Ejecuta start.bat para iniciar.    ║
echo  ╚══════════════════════════════════════╝
echo.
pause
