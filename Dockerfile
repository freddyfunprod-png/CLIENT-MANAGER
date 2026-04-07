# Python 3.11 estable — compatible con greenlet, playwright, etc.
FROM python:3.11-slim-bullseye

WORKDIR /app

# Dependencias del sistema para Chromium (Playwright)
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 libx11-xcb1 \
    wget ca-certificates fonts-liberation libappindicator3-1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar browser de Playwright (Chromium)
RUN playwright install chromium

# Copiar el código
COPY . .

EXPOSE 10000

CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
