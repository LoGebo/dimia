FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY agent ./agent

# baja los pesos del detector de turno y del VAD en build,
# no en el primer arranque (esa llamada no puede esperar)
RUN python -m agent.agent download-files || true

CMD ["python", "-m", "agent.agent", "start"]
