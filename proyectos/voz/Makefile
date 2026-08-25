SHELL := /bin/bash
.DEFAULT_GOAL := help

VENV      := .venv
PY        := $(VENV)/bin/python
PIP       := $(VENV)/bin/pip
RUFF      := $(shell test -x $(VENV)/bin/ruff && echo $(VENV)/bin/ruff || echo ruff)
PSQL      ?= psql
PG_DSN    ?= postgresql://postgres:postgres@localhost:54322/postgres
IMAGEN    ?= rjd-agente
ETIQUETA  ?= dev
FLY_CONF  := deploy/fly.toml

.PHONY: help setup db-reset db-migrar test test-rapido lint fmt fmt-total dev consola \
        imagen deploy deploy-vps logs limpiar

help:
	@echo "Comandos disponibles:"
	@echo "  make setup       crea .venv, instala dependencias y .env"
	@echo "  make db-reset    reinicia la base local de Supabase con seed"
	@echo "  make db-migrar   aplica stub de auth, migraciones y seed sobre PG_DSN"
	@echo "  make test        pytest completo"
	@echo "  make lint        ruff check"
	@echo "  make fmt         arreglos automaticos de ruff"
	@echo "  make fmt-total   ruff format: reformatea TODO el repo"
	@echo "  make dev         agente en consola, contra la base local"
	@echo "  make imagen      construye la imagen docker del worker"
	@echo "  make deploy      despliega el worker a Fly.io"
	@echo "  make logs        logs del worker en Fly.io"
	@echo ""
	@echo "Variables: PG_DSN=$(PG_DSN)  IMAGEN=$(IMAGEN):$(ETIQUETA)"

setup: $(VENV)/bin/activate
	@test -f .env || (cp .env.example .env && echo "creado .env: llena las llaves")

$(VENV)/bin/activate: requirements.txt requirements-dev.txt
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt -r requirements-dev.txt
	@touch $(VENV)/bin/activate

db-reset:
	supabase db reset

db-migrar:
	$(PSQL) "$(PG_DSN)" -v ON_ERROR_STOP=1 -f .dev/auth_stub.sql
	@for f in supabase/migrations/*.sql; do \
	  echo "-> $$f"; \
	  $(PSQL) "$(PG_DSN)" -v ON_ERROR_STOP=1 -q -f "$$f" || exit 1; \
	done
	$(PSQL) "$(PG_DSN)" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

test:
	PG_DSN="$(PG_DSN)" $(PY) -m pytest -v

test-rapido:
	PG_DSN="$(PG_DSN)" $(PY) -m pytest -x -q

lint:
	$(RUFF) check .

fmt:
	$(RUFF) check --fix .

fmt-total:
	$(RUFF) format .

dev:
	$(PY) -m agent.agent dev

consola:
	$(PY) -m agent.agent console

# Vacia la cola de mensajes salientes. Proceso aparte del worker de voz.
despachador:
	$(PY) -m app.despachador

# Webhook de Instagram Direct y Messenger.
social:
	$(VENV)/bin/uvicorn channels.social.servidor:app --port 8081

imagen:
	docker build -t $(IMAGEN):$(ETIQUETA) .

deploy:
	fly deploy --config $(FLY_CONF) --dockerfile Dockerfile .

deploy-vps:
	ssh $(VPS) 'systemctl reload agente-voz && systemctl status --no-pager agente-voz'

logs:
	fly logs --config $(FLY_CONF)

limpiar:
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache
