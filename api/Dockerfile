# Build from the repository root:  docker build -f api/Dockerfile .
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TEMPLATES_DIR=/app/templates
# LibreOffice (Writer only) turns the filled Word files into PDFs; the fonts keep layouts stable
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-dejavu fonts-liberation fonts-crosextra-carlito \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/app ./app
COPY templates ./templates
RUN useradd -m putlog && chown -R putlog /app
USER putlog
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
