FROM python:3.12-slim AS build

WORKDIR /app

COPY requirements.txt /app/requirements.txt

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip && pip install --no-cache-dir -r /app/requirements.txt

COPY src /app/src

FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

ENV PYTHONPATH=/app/src
ENV HOST=0.0.0.0
ENV PORT=6056
ENV PROJECTS_DIR=/data/projects
ENV CORS_ORIGINS=*

RUN useradd --create-home --uid 10001 eve \
  && mkdir -p /data/projects \
  && chown -R eve:eve /data /app

COPY --from=build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --from=build /app/src /app/src

EXPOSE 6056

USER eve

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import os,sys,urllib.request; p=os.environ.get('PORT') or os.environ.get('EVE_PORT','6056'); urllib.request.urlopen(f'http://127.0.0.1:{p}/api/meta', timeout=2).read(); sys.exit(0)"

CMD ["python", "-m", "eve_schema_service"]

