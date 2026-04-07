# Python 3.11 estable — compatible con greenlet, playwright, etc.
FROM python:3.11-slim-bullseye

WORKDIR /app

# Dependencias del sistema necesarias para Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libx11-xcb1 libxcb1 \
    libxcursor1 libxi6 libxtst6 libglib2.0-0 \
    fonts-liberation libappindicator3-1 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar Chromium de Playwright (non-fatal: puede fallar en Render free tier)
RUN playwright install chromium || echo "⚠️ Playwright install failed — WhatsApp bulk unavailable"

# Copiar el código
COPY . .

EXPOSE 10000

CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
