# Cómo trabajamos en este repo

Dos socios, un monorepo, despliegue automático. Estas son las reglas para que
nadie tumbe producción sin querer.

## Ramas

| Rama | Para qué | A dónde va |
|---|---|---|
| `main` | Lo que está en producción. **Protegida.** | `dimia.mx` en cuanto entra el merge |
| `dev` | Integración: lo que ya funciona pero aún no sale | Vista previa con URL propia |
| `trabajo/<lo-que-sea>` | Un cambio a la vez | Vista previa con URL propia |

**A `main` no se sube directo.** Sale una rama, entra por Pull Request.

```bash
git switch dev && git pull
git switch -c trabajo/hero-mas-corto
# … cambios …
git add -A && git commit -m "Acortar el titular del hero"
git push -u origin trabajo/hero-mas-corto
gh pr create --base dev --fill
```

Vercel comenta en el PR con la URL de vista previa en cuanto compila. Se revisa ahí,
no en capturas.

Cuando `dev` esté como debe: PR de `dev` → `main`. Ese merge despliega a producción.

## Qué corre solo

| Cuándo | Qué pasa |
|---|---|
| Push a cualquier rama que toque `sitio/web/**` | Vercel construye una vista previa · GitHub Actions revisa tipos y compila |
| Push a cualquier rama que toque `proyectos/voz/**` | CI: ruff, pruebas contra Postgres 17 y compilación de la imagen |
| Merge a `main` con cambios en `sitio/web/**` | Despliegue a producción en `dimia.mx` |
| Merge a `main` sin cambios en `sitio/web/**` | Vercel **no** construye: el paso de ignorado lo detecta |

Cada workflow filtra por ruta. Un cambio en `marca/` no levanta un Postgres ni
redespliega el sitio.

## Mensajes de commit

En español, en presente, describiendo el efecto. El primer renglón cabe en una línea:

```
Acortar el titular del hero para que no parta en móvil
```

No `fix`, no `wip`, no `cambios varios`.

## Antes de abrir el PR

```bash
cd sitio/web && npm run typecheck && npm run build   # el sitio
cd proyectos/voz && make prueba                      # el motor
```

Si CI lo va a atrapar, mejor atraparlo antes.

## Variables de entorno

Ninguna credencial entra al repo. Los `.env.example` son la referencia; los valores
reales viven en Vercel (sitio) y en el servidor (motor de voz).

Para trabajar el sitio en local con las variables de producción:

```bash
cd sitio/web && npx vercel env pull .env.local
```

## Qué revisar en un PR del sitio

- ¿Se ve bien en la vista previa a 375 px, no solo en escritorio?
- ¿El contraste sigue pasando AA?
- ¿Se coló alguna esquina redondeada, sombra o color fuera de la paleta?
- ¿Alguna cifra, cliente o testimonio inventado? Los corchetes se quedan hasta que
  exista el dato real.

Las reglas completas de marca están en [`CLAUDE.md`](CLAUDE.md) y
[`marca/BRANDING.md`](marca/BRANDING.md).
