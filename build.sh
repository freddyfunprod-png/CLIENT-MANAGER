#!/usr/bin/env bash
set -e

echo "==> Instalando dependencias Python..."
pip install -r requirements.txt

echo "==> Instalando Chromium para Playwright..."
playwright install chromium --with-deps

echo "==> Build completado OK"
