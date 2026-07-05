# Cortex backend — FastAPI (async) + Pydantic v2
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffering stdout/stderr (better container logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps required by common Azure SDK / crypto wheels (python-jose[cryptography], etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# .env is not copied into the image by design — pass real config via `docker run --env-file`
# or `docker-compose.yml`'s `env_file:` at runtime (see project root docker-compose.yml).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
