@echo off
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     Unified CRM - Dev Mode           ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "H:\---CLAUDE---\AI PRODUCER STUDIO\APPS\propias\client-manager"

:: Backend en ventana separada
echo [+] Iniciando backend (puerto 8000)...
start "Unified CRM - Backend" "C:/Users/Fredd/.production-agent-venv/Scripts/python.exe" backend/main.py

:: Esperar a que arranque
timeout /t 2 /nobreak >nul

:: Frontend Vite dev server en ventana separada
echo [+] Iniciando Vite dev server (puerto 5173)...
cd frontend
start "Unified CRM - Frontend" cmd /k "npm run dev"
cd ..

:: Esperar y abrir browser
timeout /t 3 /nobreak >nul
echo [+] Abriendo http://localhost:5173
start "" http://localhost:5173

echo.
echo  Dev mode corriendo:
echo    Frontend: http://localhost:5173  (hot reload)
echo    Backend:  http://localhost:8000
echo.
echo  Cierra las ventanas para detener.
echo.
