# Dimia Consulting

Monorepo de la firma. Todo el contexto —negocio, marca, sitio y proyectos— vive aquí para
que cualquiera de los dos socios, y cualquier agente que trabaje con nosotros, arranque con
la misma información.

**Dimia diseña, construye y opera sistemas de decisión.** Agentes de voz, automatización,
datos y analítica, transformación digital y marketing medido contra ingreso real. La IA es
el método; el argumento es el resultado verificable.

> Sistemas de decisión para empresas que ya no alcanzan a contestar.

## Mapa

| Carpeta | Qué hay |
|---|---|
| [`negocio/`](negocio/) | Posicionamiento, servicios y la bitácora de decisiones. Empieza aquí. |
| [`marca/`](marca/) | Manual de identidad y todos los archivos de logotipo, ícono, favicon y paleta. |
| [`sitio/`](sitio/) | El sitio `dimia.mx`: prompts de construcción y el prototipo actual. |
| [`proyectos/voz/`](proyectos/voz/) | El motor de agendamiento por voz. Es el producto insignia y ya opera. |
| [`CLAUDE.md`](CLAUDE.md) | Contexto para los agentes: reglas de marca, voz y convenciones. |
| [`CONTRIBUIR.md`](CONTRIBUIR.md) | Ramas, despliegue y qué corre solo. Léelo antes del primer PR. |

## En línea

**[dimia.mx](https://dimia.mx)** — desplegado desde `sitio/web` con Vercel.
Cada merge a `main` que toque esa carpeta sale a producción; cada rama y cada PR
levantan su propia vista previa. El detalle, en [`CONTRIBUIR.md`](CONTRIBUIR.md).

## Socios

- **Rogelio Díaz Alanís** — Operaciones
- **Jesús Daniel Martínez García** — Tecnología

## Arrancar el motor de voz

```bash
cd proyectos/voz
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # llenar credenciales
make dev
```

Detalle completo en [`proyectos/voz/README.md`](proyectos/voz/README.md).

## Pendientes de la firma

- Registrar `dimia.mx`, `dimia.ai` y `dimia.com.mx`. Ninguno está tomado todavía.
- Registro de marca ante el IMPI, clase 42.
- Definir qué clientes tienen autorización escrita para aparecer con nombre.
- Medir tiempo medio de llamada y porcentaje de llamadas fuera de horario con un cliente real.
