# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS web-builder

WORKDIR /webapp

COPY WebApp/package*.json ./
RUN npm ci

COPY WebApp/ ./
RUN npm run build

FROM python:3.12.13-slim-bookworm AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:${PATH}"

RUN python -m venv /opt/venv

COPY services/api/requirements.txt /tmp/requirements.txt
RUN pip install --no-compile --requirement /tmp/requirements.txt

FROM python:3.12.13-slim-bookworm AS runtime

ARG APP_UID=10001
ARG APP_GID=10001

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    PORT=10000 \
    SYNAPSESYNC_DATA_DIR=/tmp/synapsesync-data \
    WEBAPP_DIST_DIR=/app/webapp-dist

RUN groupadd --system --gid "${APP_GID}" appgroup \
    && useradd --system --uid "${APP_UID}" --gid appgroup \
        --create-home --home-dir /home/appuser appuser

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=appuser:appgroup services/api/app ./app
COPY --from=web-builder --chown=appuser:appgroup /webapp/dist ./webapp-dist

USER appuser:appgroup

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '10000') + '/health', timeout=2)"]

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
