# Python 3.11 estable — compatible con greenlet, playwright, etc.
FROM python:3.11-slim-bullseye

WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar Chromium + todas sus dependencias del sistema automáticamente
RUN playwright install --with-deps chromium

# Copiar el código
COPY . .

EXPOSE 10000

CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
