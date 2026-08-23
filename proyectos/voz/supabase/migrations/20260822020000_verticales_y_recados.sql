create table vertical_template (
  clave         text primary key,
  nombre        text not null,
  instrucciones text not null,
  saludo        text not null,
  herramientas  jsonb not null default '["agendar","recado"]'::jsonb,
  activo        boolean not null default true
);

insert into vertical_template (clave, nombre, instrucciones, saludo, herramientas) values
('clinica', 'Consultorio o clinica',
'CONTEXTO: consultorio medico o dental.
- Trata a quien llama como paciente. Tono calido y tranquilo, sin prisa.
- Primera vez o seguimiento: preguntalo, cambia la duracion de la cita.
- Si describen sintomas, NO opines ni diagnostiques. Agenda o transfiere.
- Cualquier cosa que suene urgente: transfiere de inmediato.',
'{nombre}, buen dia. ¿En que le puedo ayudar?',
'["agendar","recado"]'),

('restaurante', 'Restaurante',
'CONTEXTO: restaurante. Reservas de mesa.
- Tono calido y rapido. La gente llama con hambre y con prisa.
- Siempre pregunta cuantas personas: define que mesa cabe.
- Si mencionan alergias o restricciones, anotalas en las notas Y avisa que
  lo confirmara el equipo. Nunca asegures que un platillo es seguro.
- Si piden comida para llevar y no puedes tomar el pedido, ofrece mandar
  el menu por WhatsApp.',
'{nombre}, buenas. ¿Le ayudo con una reservacion?',
'["agendar","recado"]'),

('salon', 'Salon de belleza o barberia',
'CONTEXTO: salon de belleza o barberia.
- Tono relajado y amistoso.
- Pregunta que servicio quieren: la duracion cambia mucho entre uno y otro.
- Si piden un estilista en particular, respetalo al buscar disponibilidad.',
'{nombre}, ¡hola! ¿Que necesitas?',
'["agendar","recado"]'),

('taller', 'Taller mecanico o de servicio',
'CONTEXTO: taller mecanico o de servicio tecnico.
- Pregunta marca, modelo y ano del vehiculo o del equipo, y anotalo en notas.
- Pregunta que problema tiene, con las palabras del cliente. No diagnostiques
  ni estimes costos de reparacion: eso lo ve el tecnico.
- Distingue entre dejar el vehiculo y solo cotizar.',
'{nombre}, buen dia. ¿En que le puedo ayudar?',
'["agendar","recado"]'),

('inmobiliaria', 'Inmobiliaria o desarrollo',
'CONTEXTO: inmobiliaria. La mayoria de llamadas son por una propiedad anunciada.
- Pregunta por cual propiedad llaman y como se enteraron.
- Agenda visitas. Si preguntan precio y no lo tienes en la informacion del
  negocio, no lo inventes: toma sus datos y avisa que le marcan.
- Captura presupuesto y zona de interes en las notas.',
'{nombre}, buen dia. ¿Sobre que propiedad le interesa informacion?',
'["agendar","recado"]'),

('recepcion', 'Recepcion general o call center',
'CONTEXTO: recepcion telefonica general. Puede no haber nada que agendar.
- Tu trabajo es entender que necesita la persona, responder lo que este en la
  informacion del negocio, y tomar recado con sus datos cuando no puedas
  resolverlo.
- Siempre confirma el numero de contacto repitiendolo.
- Ante cualquier tema que requiera criterio humano, transfiere.',
'{nombre}, buen dia. ¿En que le puedo ayudar?',
'["recado"]')
;

alter table tenant add column vertical_clave text references vertical_template(clave);
update tenant set vertical_clave = vertical::text;
alter table tenant alter column vertical_clave set not null;
alter table tenant alter column vertical_clave set default 'recepcion';
alter table tenant drop column vertical;
alter table tenant rename column vertical_clave to vertical;
drop type vertical;

create table lead (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  nombre      text,
  telefono    text not null,
  asunto      text not null,
  detalle     text,
  campos      jsonb not null default '{}'::jsonb,
  atendido    boolean not null default false,
  call_id     text,
  creado      timestamptz not null default now()
);
create index ix_lead_tenant on lead(tenant_id, creado desc) where not atendido;

create or replace function public.registrar_recado(
  p_tenant   uuid,
  p_telefono text,
  p_asunto   text,
  p_nombre   text default null,
  p_detalle  text default null,
  p_campos   jsonb default '{}'::jsonb,
  p_call_id  text default null
) returns jsonb
language plpgsql as $$
declare v_id uuid;
begin
  insert into lead (tenant_id, nombre, telefono, asunto, detalle, campos, call_id)
  values (p_tenant, nullif(trim(coalesce(p_nombre,'')),''), p_telefono,
          p_asunto, p_detalle, coalesce(p_campos,'{}'::jsonb), p_call_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'lead_id', v_id);
end $$;

alter table lead enable row level security;
create policy lead_propio on lead
  for all
  using      (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

alter table vertical_template enable row level security;
create policy vertical_lectura on vertical_template for select using (activo);
