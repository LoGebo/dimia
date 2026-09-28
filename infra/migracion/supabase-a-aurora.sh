#!/usr/bin/env bash
# Copia los datos de producción de Supabase a una base de Aurora que ya tiene el esquema
# (auth_stub + migraciones, sin semilla). Uso: ORIGEN=<dsn supabase> DESTINO=<dsn aurora> ./supabase-a-aurora.sh
# Supabase solo se lee. La copia es de datos (el esquema lo ponen las migraciones del repo), con los
# triggers apagados para no disparar avisos ni outbox al insertar.
set -euo pipefail
: "${ORIGEN:?falta ORIGEN}" "${DESTINO:?falta DESTINO}"
trabajo=$(mktemp -d)
trap 'rm -rf "$trabajo"' EXIT

# Tablas de public que existen en los dos lados (el orden lo resuelve pg_dump con las FK apagadas).
psql "$ORIGEN" -Atc "select tablename from pg_tables where schemaname='public' order by 1" > "$trabajo/origen.txt"
psql "$DESTINO" -Atc "select tablename from pg_tables where schemaname='public' order by 1" > "$trabajo/destino.txt"
comm -12 "$trabajo/origen.txt" "$trabajo/destino.txt" > "$trabajo/tablas.txt"
solo_origen=$(comm -23 "$trabajo/origen.txt" "$trabajo/destino.txt" | tr '\n' ' ')
[ -n "$solo_origen" ] && echo "Aviso: tablas solo en origen (no se copian): $solo_origen"

args=()
while read -r t; do args+=(--table "public.\"$t\""); done < "$trabajo/tablas.txt"
pg_dump "$ORIGEN" --data-only --no-owner --no-privileges "${args[@]}" > "$trabajo/datos.sql"

{
  echo "set session_replication_role = replica;"
  echo "begin;"
  # Los usuarios de auth solo aportan el id (FK de usuario_panel y tenant_member).
  psql "$ORIGEN" -Atc "select 'insert into auth.users (id) values (''' || id || ''') on conflict do nothing;' from auth.users"
  while read -r t; do echo "truncate public.\"$t\" cascade;"; done < "$trabajo/tablas.txt"
  grep -vE '^(SET transaction_timeout|SELECT pg_catalog.set_config\(.search_path)' "$trabajo/datos.sql"
  echo "commit;"
} > "$trabajo/carga.sql"
psql "$DESTINO" -v ON_ERROR_STOP=1 -q -f "$trabajo/carga.sql"

# Verificación: mismo número de filas en cada tabla.
diferencias=0
while read -r t; do
  a=$(psql "$ORIGEN" -Atc "select count(*) from public.\"$t\"")
  b=$(psql "$DESTINO" -Atc "set session_replication_role = replica; select count(*) from public.\"$t\"" | tail -1)
  if [ "$a" != "$b" ]; then echo "DIFERENTE $t: origen $a, destino $b"; diferencias=1; fi
done < "$trabajo/tablas.txt"
[ "$diferencias" = 0 ] && echo "OK: $(wc -l < "$trabajo/tablas.txt" | tr -d ' ') tablas con los mismos conteos"
exit "$diferencias"
