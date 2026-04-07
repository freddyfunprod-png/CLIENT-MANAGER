# Python 3.11 estable — compatible con greenlet, playwright, etc.
FROM python:3.11-slim-bullseye

WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NO instalamos Chromium — Render free tier no soporta browsers headless
# El scraper/WhatsApp bulk requiere upgrade a plan pago con más RAM/disco

# Copiar el código
COPY . .

EXPOSE 10000

CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
