-- =====================================================================
-- Ventas, fase 2: decisiones del dueño (A/B/C).
--
-- Cuando el agente pasa a alguien a una persona, el despachador le propone
-- al dueño dos o tres respuestas listas (app/decisiones.py). El dueño elige
-- en el panel y la respuesta sale como mensaje del agente; la conversación
-- vuelve al agente. Si el dueño prefiere contestar él, la toma.
-- =====================================================================

create table decision_dueno (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  interesado_id  uuid not null references interesado(id) on delete cascade,
  pregunta       text not null,
  -- [{"letra": "A", "titulo": "...", "mensaje": "..."}]; mensaje vacío = «contésteles usted»
  opciones       jsonb not null,
  elegida        text,
  creado         timestamptz not null default now(),
  resuelta_en    timestamptz
);
create unique index ux_decision_abierta on decision_dueno (interesado_id) where elegida is null;
create index ix_decision_tenant on decision_dueno (tenant_id, creado desc);

alter table decision_dueno enable row level security;
create policy decision_propia on decision_dueno for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
-- El despachador busca, en todos los negocios, a quién le falta su decisión.
create policy decision_motor on decision_dueno for select to app_cron using (true);

grant select, insert, update on decision_dueno to app_voz, app_texto, app_cron, app_api, app_panel;
grant select, insert, update, delete on decision_dueno to authenticated;

-- Interesados que esperan a una persona y todavía no tienen opciones propuestas.
create or replace function public.interesados_por_decidir(p_limite int default 20)
returns table (id uuid, tenant_id uuid, conversacion_id uuid, nombre text, lectura text)
language plpgsql as $$
begin
  perform set_config('app.usuario', 'motor-decisiones', true);
  return query
    select i.id, i.tenant_id, i.conversacion_id, i.nombre, i.lectura
      from interesado i
     where i.etapa = 'requiere_persona' and not i.tomado_por_persona and i.conversacion_id is not null
       and i.actualizado >= now() - interval '3 days'
       and not exists (select 1 from decision_dueno d where d.interesado_id = i.id)
     order by i.actualizado
     limit p_limite;
end $$;
grant execute on function public.interesados_por_decidir(int) to app_cron;

select public.aislar_por_negocio();
