-- =========================================================
-- Instalación de la base de datos del CRM
--
-- Cómo usarlo: en tu proyecto de Supabase entrá a "SQL Editor", pegá TODO
-- este archivo y apretá "Run". Se corre una sola vez, en un proyecto nuevo.
--
-- Después corré `npm run configurar` en la terminal para crear tu empresa
-- y tu usuario.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------

create type estado_conversacion as enum ('abierto', 'pendiente', 'cerrado');
create type remitente_mensaje as enum ('cliente', 'agente');
create type rol_usuario as enum ('vendedor', 'atendedor_online', 'supervisor', 'dueno');
create type temperatura_contacto as enum ('frio', 'tibio', 'caliente');
create type tipo_mensaje as enum ('texto', 'imagen', 'pdf', 'audio', 'documento');
-- WhatsApp puede rechazar la entrega después de aceptar el envío (ack asíncrono).
create type estado_entrega_mensaje as enum ('enviado', 'error');

-- ---------- Tablas ----------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- Marca propia: la edita el dueño desde "Mi empresa".
  color_primario text,
  color_acento text,
  logo_url text,
  creado_en timestamptz not null default now()
);

-- Cada CRM es de UNA sola empresa: este índice hace que la base rechace
-- cualquier intento de crear una segunda.
create unique index empresas_una_sola on empresas ((true));

create table lineas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  numero text not null,
  estado text not null default 'desconectado',
  creado_en timestamptz not null default now()
);

-- El id coincide con el del usuario en Supabase Auth (auth.users).
create table usuarios (
  id uuid primary key,
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null,
  linea_id uuid references lineas_whatsapp (id) on delete set null,
  activo boolean not null default true,
  -- Zona IANA (ej. 'America/La_Paz') para los mensajes programados.
  zona_horaria text,
  creado_en timestamptz not null default now()
);

-- Etapas del embudo de ventas. `tipo` marca las dos etapas finales que
-- cuentan para las métricas, sin importar cómo se llamen.
create table etapas_venta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'normal' check (tipo in ('normal', 'ganada', 'perdida')),
  orden int not null,
  color smallint,
  creado_en timestamptz not null default now()
);

create table contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  telefono text not null,
  nombre text,
  producto_interes text,
  origen text,
  temperatura temperatura_contacto,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- WhatsApp a veces identifica el chat por un @lid en vez del número real.
  lid text,
  etapa_id uuid references etapas_venta (id) on delete set null,
  etapa_actualizada_en timestamptz,
  valor_estimado numeric,
  probabilidad_cierre smallint check (probabilidad_cierre between 0 and 100),
  unique (empresa_id, telefono)
);
create index contactos_lid_idx on contactos (empresa_id, lid) where lid is not null;

create table conversaciones (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references lineas_whatsapp (id) on delete cascade,
  contacto_telefono text not null,
  contacto_nombre text,
  estado estado_conversacion not null default 'abierto',
  agente_asignado_id uuid references usuarios (id) on delete set null,
  ultima_actividad timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

-- Una sola conversación "abierta" por contacto y línea (evita chats
-- duplicados cuando llegan varios adjuntos juntos).
create unique index conversaciones_abierta_unica_idx
  on conversaciones (linea_id, contacto_telefono)
  where estado = 'abierto';

create table mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  remitente remitente_mensaje not null,
  agente_id uuid references usuarios (id) on delete set null,
  tipo tipo_mensaje not null default 'texto',
  contenido text,
  media_url text,
  creado_en timestamptz not null default now(),
  whatsapp_id text,
  estado_entrega estado_entrega_mensaje not null default 'enviado',
  error_entrega text
);

create table notas (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references contactos (id) on delete cascade,
  autor_id uuid references usuarios (id) on delete set null,
  texto text not null,
  creado_en timestamptz not null default now()
);

create table tareas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,
  titulo text not null,
  fecha timestamptz,
  completada boolean not null default false,
  asignado_a uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table respuestas_rapidas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  titulo text not null,
  contenido text not null,
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now(),
  atajo text,
  tipo text not null default 'texto' check (tipo in ('texto', 'imagen', 'pdf', 'audio')),
  media_url text,
  constraint respuestas_rapidas_media_url_check check (tipo = 'texto' or media_url is not null)
);

-- Etiquetas de WhatsApp Business, sincronizadas desde la cuenta.
create table etiquetas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references lineas_whatsapp (id) on delete cascade,
  whatsapp_id text not null,
  nombre text not null,
  color smallint,
  eliminada boolean not null default false,
  actualizado_en timestamptz not null default now(),
  unique (linea_id, whatsapp_id)
);

create table contacto_etiquetas (
  contacto_id uuid not null references contactos (id) on delete cascade,
  etiqueta_id uuid not null references etiquetas_whatsapp (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (contacto_id, etiqueta_id)
);

-- Bot de respuestas automáticas: 'rapida' es una lista de pasos, 'flujo'
-- es un editor visual con ramas.
create table respuestas_automaticas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  palabra_clave text not null,
  activo boolean not null default true,
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now(),
  pasos jsonb not null default '[]'::jsonb,
  demora_segundos integer not null default 0,
  palabras_clave text[] not null default '{}',
  modo_coincidencia text not null default 'contiene',
  tolerancia_errores boolean not null default false,
  disparador text not null default 'palabra_clave',
  tipo text not null default 'rapida',
  nombre text,
  flujo jsonb,
  constraint respuestas_automaticas_demora_valida check (demora_segundos >= 0 and demora_segundos <= 3600),
  constraint respuestas_automaticas_modo_valido check (modo_coincidencia in ('contiene', 'exacta', 'empieza_con')),
  constraint respuestas_automaticas_disparador_valido
    check (disparador in ('palabra_clave', 'primer_mensaje', 'primer_mensaje_del_dia', 'cualquier_mensaje')),
  constraint respuestas_automaticas_tipo_valido check (tipo in ('rapida', 'flujo'))
);

-- En qué paso de un flujo quedó esperando cada conversación. Solo la usa
-- el servidor: con RLS activado y sin políticas, el navegador no la ve.
create table bot_sesiones (
  conversacion_id uuid primary key references conversaciones (id) on delete cascade,
  regla_id uuid not null references respuestas_automaticas (id) on delete cascade,
  nodo_id text not null,
  linea_id uuid not null,
  telefono text not null,
  actualizado_en timestamptz not null default now()
);

create table mensajes_programados (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  linea_id uuid not null,
  telefono text not null,
  contenido text not null,
  enviar_en timestamptz not null,
  estado text not null default 'pendiente',
  cancelar_si_responde boolean not null default true,
  motivo text,
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  constraint mensajes_programados_estado_valido
    check (estado in ('pendiente', 'enviando', 'enviado', 'cancelado', 'error'))
);
create index mensajes_programados_pendientes_idx on mensajes_programados (estado, enviar_en);
create index mensajes_programados_conversacion_idx on mensajes_programados (conversacion_id);

-- ---------- Automatismos ----------

-- Al crear la empresa, le cargamos las 4 etapas del embudo por defecto.
create function empresas_crear_etapas() returns trigger as $$
begin
  insert into etapas_venta (empresa_id, nombre, tipo, orden) values
    (new.id, 'Primer Contacto', 'normal', 1),
    (new.id, 'En Negociación', 'normal', 2),
    (new.id, 'Venta Ganada', 'ganada', 3),
    (new.id, 'Venta Perdida', 'perdida', 4);
  return new;
end;
$$ language plpgsql;

create trigger empresas_etapas_iniciales after insert on empresas
  for each row execute function empresas_crear_etapas();

-- Todo contacto nuevo arranca en la primera etapa del embudo.
create function contactos_asignar_etapa_inicial() returns trigger as $$
begin
  if new.etapa_id is null then
    select id into new.etapa_id from etapas_venta
      where empresa_id = new.empresa_id and tipo = 'normal'
      order by orden asc limit 1;
    new.etapa_actualizada_en := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger contactos_etapa_inicial before insert on contactos
  for each row execute function contactos_asignar_etapa_inicial();

-- ---------- Función para los permisos ----------
-- Devuelve la fila de `usuarios` del que está logueado.

create or replace function usuario_actual()
returns usuarios
language sql
stable
security definer
as $function$
  select * from usuarios where id = auth.uid();
$function$;

-- ---------- Permisos (Row Level Security) ----------
-- Un vendedor solo ve su propia línea de WhatsApp; el resto ve todo.

alter table empresas enable row level security;
alter table lineas_whatsapp enable row level security;
alter table usuarios enable row level security;
alter table etapas_venta enable row level security;
alter table contactos enable row level security;
alter table conversaciones enable row level security;
alter table mensajes enable row level security;
alter table notas enable row level security;
alter table tareas enable row level security;
alter table respuestas_rapidas enable row level security;
alter table etiquetas_whatsapp enable row level security;
alter table contacto_etiquetas enable row level security;
alter table respuestas_automaticas enable row level security;
alter table bot_sesiones enable row level security;
alter table mensajes_programados enable row level security;

-- La empresa solo se lee desde la app; se crea con `npm run configurar` y
-- su marca se edita por el servidor.
create policy "empresas_select" on empresas for select
  using (id = (select empresa_id from usuario_actual()));

create policy "lineas_select" on lineas_whatsapp for select
  using (empresa_id = (select empresa_id from usuario_actual()));

create policy "lineas_admin" on lineas_whatsapp for all
  using (
    (select rol from usuario_actual()) = 'dueno'
    and empresa_id = (select empresa_id from usuario_actual())
  );

create policy "usuarios_select" on usuarios for select
  using (empresa_id = (select empresa_id from usuario_actual()));

create policy "usuarios_insert" on usuarios for insert
  with check (
    (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
    and empresa_id = (select empresa_id from usuario_actual())
  );

create policy "usuarios_update" on usuarios for update
  using (
    (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
    and empresa_id = (select empresa_id from usuario_actual())
  )
  with check (empresa_id = (select empresa_id from usuario_actual()));

create policy "etapas_venta_select" on etapas_venta for select
  using (empresa_id = (select empresa_id from usuario_actual()));

create policy "etapas_venta_admin" on etapas_venta for all
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  )
  with check (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  );

-- Un vendedor ve un contacto si tiene alguna conversación en su línea, o si
-- todavía no tiene ninguna conversación (recién cargado a mano).
create policy "contactos_select" on contactos for select
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (
      (select rol from usuario_actual()) <> 'vendedor'
      or exists (select 1 from conversaciones c where c.contacto_telefono = contactos.telefono and c.linea_id = (select linea_id from usuario_actual()))
      or not exists (select 1 from conversaciones c where c.contacto_telefono = contactos.telefono)
    )
  );

create policy "contactos_insert" on contactos for insert
  with check (empresa_id = (select empresa_id from usuario_actual()));

create policy "contactos_update" on contactos for update
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (
      (select rol from usuario_actual()) <> 'vendedor'
      or exists (select 1 from conversaciones c where c.contacto_telefono = contactos.telefono and c.linea_id = (select linea_id from usuario_actual()))
      or not exists (select 1 from conversaciones c where c.contacto_telefono = contactos.telefono)
    )
  );

create policy "contactos_delete" on contactos for delete
  using (
    empresa_id = (select empresa_id from usuario_actual())
    and (select rol from usuario_actual()) = any (array['supervisor', 'dueno']::rol_usuario[])
  );

create policy "conversaciones_select" on conversaciones for select
  using (
    linea_id in (select id from lineas_whatsapp where empresa_id = (select empresa_id from usuario_actual()))
    and (
      (select rol from usuario_actual()) <> 'vendedor'
      or linea_id = (select linea_id from usuario_actual())
    )
  );

create policy "conversaciones_update" on conversaciones for update
  using (
    linea_id in (select id from lineas_whatsapp where empresa_id = (select empresa_id from usuario_actual()))
    and (
      (select rol from usuario_actual()) <> 'vendedor'
      or linea_id = (select linea_id from usuario_actual())
    )
  );

create policy "mensajes_select" on mensajes for select
  using (
    conversacion_id in (
      select c.id from conversaciones c
      join lineas_whatsapp l on l.id = c.linea_id
      where l.empresa_id = (select empresa_id from usuario_actual())
        and (
          (select rol from usuario_actual()) <> 'vendedor'
          or c.linea_id = (select linea_id from usuario_actual())
        )
    )
  );

create policy "mensajes_insert" on mensajes for insert
  with check (
    conversacion_id in (
      select c.id from conversaciones c
      join lineas_whatsapp l on l.id = c.linea_id
      where l.empresa_id = (select empresa_id from usuario_actual())
        and (
          (select rol from usuario_actual()) <> 'vendedor'
          or c.linea_id = (select linea_id from usuario_actual())
        )
    )
  );

create policy "notas_todo" on notas for all
  using (contacto_id in (select id from contactos where empresa_id = (select empresa_id from usuario_actual())))
  with check (contacto_id in (select id from contactos where empresa_id = (select empresa_id from usuario_actual())));

create policy "tareas_todo" on tareas for all
  using (empresa_id = (select empresa_id from usuario_actual()))
  with check (empresa_id = (select empresa_id from usuario_actual()));

create policy "respuestas_todo" on respuestas_rapidas for all
  using (empresa_id = (select empresa_id from usuario_actual()))
  with check (empresa_id = (select empresa_id from usuario_actual()));

-- Las etiquetas las escribe el servidor al sincronizar con WhatsApp.
create policy "etiquetas_whatsapp_select" on etiquetas_whatsapp for select
  using (linea_id in (select id from lineas_whatsapp where empresa_id = (select empresa_id from usuario_actual())));

create policy "contacto_etiquetas_select" on contacto_etiquetas for select
  using (contacto_id in (select id from contactos where empresa_id = (select empresa_id from usuario_actual())));

-- Un agente puede poner o quitar a mano una etiqueta que ya existe; queda
-- solo en el CRM, nunca se escribe de vuelta en WhatsApp.
create policy "contacto_etiquetas_insert" on contacto_etiquetas for insert
  with check (contacto_id in (select id from contactos where empresa_id = (select empresa_id from usuario_actual())));

create policy "contacto_etiquetas_delete" on contacto_etiquetas for delete
  using (contacto_id in (select id from contactos where empresa_id = (select empresa_id from usuario_actual())));

create policy "respuestas_automaticas_todo" on respuestas_automaticas for all
  using (empresa_id = (select empresa_id from usuario_actual()))
  with check (empresa_id = (select empresa_id from usuario_actual()));

create policy "mensajes_programados_todo" on mensajes_programados for all
  using (
    conversacion_id in (
      select c.id from conversaciones c
      join lineas_whatsapp l on l.id = c.linea_id
      where l.empresa_id = (select empresa_id from usuario_actual())
        and (
          (select rol from usuario_actual()) <> 'vendedor'
          or c.linea_id = (select linea_id from usuario_actual())
        )
    )
  )
  with check (
    conversacion_id in (
      select c.id from conversaciones c
      join lineas_whatsapp l on l.id = c.linea_id
      where l.empresa_id = (select empresa_id from usuario_actual())
        and (
          (select rol from usuario_actual()) <> 'vendedor'
          or c.linea_id = (select linea_id from usuario_actual())
        )
    )
  );

-- ---------- Tiempo real ----------
-- Las pantallas se actualizan solas cuando cambian estas tablas.

alter publication supabase_realtime add table
  conversaciones, mensajes, contactos, contacto_etiquetas, etapas_venta,
  etiquetas_whatsapp, lineas_whatsapp, respuestas_rapidas, tareas;

-- ---------- Archivos (fotos, audios, documentos, logo) ----------

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Cualquiera con el link puede ver un archivo (así se muestran en el chat).
create policy "media_lectura_publica" on storage.objects for select
  using (bucket_id = 'media');

-- Solo usuarios logueados pueden subir o reemplazar archivos.
create policy "media_subida_autenticados" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media');

create policy "media_actualizacion_autenticados" on storage.objects for update
  to authenticated
  using (bucket_id = 'media')
  with check (bucket_id = 'media');
