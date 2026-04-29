# Dockerfile for the BACKEND service of MECE PPT.
#
# Used because the Nixpacks Python provider has been broken since
# 2026-04-28 (pip not on python's sys.path). Dockerfile gives us a
# clean python:3.12-slim base with pip pre-installed.

FROM python:3.12-slim

WORKDIR /app

# Install Python deps first for layer caching
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the rest of the repo (includes mckinsey_pptx/ which the backend
# imports via sys.path manipulation in backend/main.py)
COPY . /app

# Railway injects $PORT at runtime. The shell form lets bash expand it.
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 120
