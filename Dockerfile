# Python 3.11 estable — compatible con greenlet, playwright, etc.
FROM python:3.11-slim-bullseye

WORKDIR /app

# Dependencias del sistema para Chromium (instaladas como root en build time)
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libcairo2 wget ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar Chromium en path fijo (accesible al usuario de runtime de Render)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install chromium

# Copiar el código
COPY . .

EXPOSE 10000

CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
