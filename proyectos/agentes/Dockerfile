FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agentes ./agentes
# [::] escucha IPv4 e IPv6 (proxy y checks de Fly por v4, red privada por v6).
CMD ["hypercorn", "agentes.api:app", "-b", "[::]:8080"]
