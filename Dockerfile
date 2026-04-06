# Imagen oficial de Playwright para Python — incluye Chromium y todas sus dependencias
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Forzar wheel binario de greenlet (compatible Python 3.12) antes del resto
RUN pip install --no-cache-dir --only-binary=:all: "greenlet>=3.1.1"

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código
COPY . .

# Puerto que usa Render (variable de entorno $PORT, default 10000)
EXPOSE 10000

# Iniciar desde la carpeta backend
CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
