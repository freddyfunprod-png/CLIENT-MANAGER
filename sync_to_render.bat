@echo off
:: Sincroniza tu DB local con Render
:: Uso: sync_to_render.bat [RENDER_URL]
:: Ejemplo: sync_to_render.bat https://client-manager-uusn.onrender.com

set RENDER_URL=%1
if "%RENDER_URL%"=="" set RENDER_URL=https://client-manager-uusn.onrender.com

echo [1/2] Exportando DB local...
curl -s http://localhost:8000/api/backup/export -o crm_backup.json
if errorlevel 1 (
    echo ERROR: No se pudo conectar al backend local. Asegurate que este corriendo.
    pause
    exit /b 1
)
echo OK - crm_backup.json generado

echo [2/2] Importando en Render...
curl -s -X POST "%RENDER_URL%/api/backup/import" ^
     -H "Content-Type: application/json" ^
     -d @crm_backup.json
echo.
echo Listo! Verifica en %RENDER_URL%/docs
pause
