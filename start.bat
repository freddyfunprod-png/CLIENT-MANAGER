@echo off
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       Unified CRM - Iniciando...     ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "H:\---CLAUDE---\AI PRODUCER STUDIO\APPS\propias\client-manager-v2"

:: Verificar que el frontend esté buildeado
if not exist "frontend\dist\index.html" (
    echo [!] El frontend no está compilado. Ejecuta build.bat primero.
    echo.
    pause
    exit /b 1
)

:: Iniciar backend en ventana separada
echo [+] Iniciando backend en puerto 8000...
start "Unified CRM - Backend" "C:/Users/Fredd/.production-agent-venv/Scripts/python.exe" backend/main.py

:: Esperar a que arranque
timeout /t 3 /nobreak >nul

:: Abrir browser
echo [+] Abriendo http://localhost:8000
start "" http://localhost:8000

echo.
echo  App corriendo en http://localhost:8000
echo  Cierra la ventana "Backend" para detenerla.
echo.
