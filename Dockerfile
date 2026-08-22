FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt


FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    XDG_CACHE_HOME=/srv/cache \
    HF_HOME=/srv/cache/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 agente \
 && useradd --uid 10001 --gid 10001 --home-dir /srv --no-create-home agente \
 && mkdir -p /srv/cache && chown -R agente:agente /srv

COPY --from=builder /opt/venv /opt/venv

WORKDIR /srv
COPY --chown=agente:agente app ./app
COPY --chown=agente:agente agent ./agent

USER agente

RUN python -m agent.agent download-files

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8081/', timeout=4).status == 200 else 1)"]

STOPSIGNAL SIGTERM

CMD ["python", "-m", "agent.agent", "start"]
