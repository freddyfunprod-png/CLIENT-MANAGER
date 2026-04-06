#!/usr/bin/env bash
set -e

echo "==> Instalando dependencias Python..."
pip install -r requirements.txt

echo "==> Instalando Chromium para Playwright..."
# Non-fatal: Playwright/Chromium puede fallar en Render free tier (falta de librerías del sistema)
# El CRM funciona igual — solo el WhatsApp bulk requiere Chromium
playwright install chromium || echo "⚠️  Playwright install falló — WhatsApp bulk no disponible en este entorno"

echo "==> Build completado OK"
