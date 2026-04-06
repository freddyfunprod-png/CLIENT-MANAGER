# Imagen oficial de Playwright para Python — incluye Chromium y todas sus dependencias
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Headers de Python necesarios para compilar extensiones C (greenlet, etc.)
RUN apt-get update && apt-get install -y python3-dev gcc g++ && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código
COPY . .

# Puerto que usa Render (variable de entorno $PORT, default 10000)
EXPOSE 10000

# Iniciar desde la carpeta backend
CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
