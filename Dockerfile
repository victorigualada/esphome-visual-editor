# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend_build
WORKDIR /src/frontend
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile
COPY frontend ./
RUN yarn build

FROM python:3.12-slim AS backend_build
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install --no-cache-dir -r /app/requirements.txt

FROM python:3.12-slim AS backend
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

ENV PYTHONPATH=/app/src
ENV HOST=0.0.0.0
ENV PORT=6056
ENV STATIC_DIR=/app/static
ENV PROJECTS_DIR=/data/projects
ENV CORS_ORIGINS=*

RUN useradd --create-home --uid 10001 eve \
  && mkdir -p /data/projects /app/static \
  && chown -R eve:eve /data /app

COPY --from=backend_build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/src /app/src
COPY --from=frontend_build /src/frontend/dist /app/static

EXPOSE 6056
USER eve

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import os,sys,urllib.request; p=os.environ.get('PORT') or os.environ.get('EVE_PORT','6056'); urllib.request.urlopen(f'http://127.0.0.1:{p}/api/meta', timeout=2).read(); sys.exit(0)"
CMD ["python", "-m", "eve_schema_service"]
