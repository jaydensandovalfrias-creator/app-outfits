-- Vestidor: esquema inicial
-- Tablas con RLS por dueño, grants explícitos (las tablas nuevas ya no se
-- exponen solas a la Data API) y control de cuota de IA.
-- El día de cuota es en UTC, igual que el reinicio diario de Cloudflare.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ruta de Storage válida: empieza con la carpeta del dueño y no sube de nivel.
create function private.ruta_propia(p_ruta text, p_dueno uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ruta is null
      or (p_ruta like (p_dueno::text || '/%')
          and position('..' in p_ruta) = 0
          and char_length(p_ruta) <= 200);
$$;

-- ---------------------------------------------------------------------------
-- Ajustes globales (solo backend)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  global_daily_neurons numeric(10,2) not null default 10000 check (global_daily_neurons >= 0),
  default_user_daily_neurons numeric(10,2) not null default 3300 check (default_user_daily_neurons >= 0),
  user_daily_ai_calls integer not null default 200 check (user_daily_ai_calls >= 0),
  user_calls_per_minute integer not null default 10 check (user_calls_per_minute > 0),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;
grant select, update on public.app_settings to service_role;

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  daily_neuron_limit numeric(10,2) not null default 3300 check (daily_neuron_limit >= 0),
  body_photo_path text,          -- foto completa (bucket cuerpos), para pegar la cabeza
  body_ref_path text,            -- versión menor a 512 px para la IA
  head_ref_path text,            -- recorte de la cabeza menor a 512 px
  body_photo_consent_at timestamptz,
  analysis_consent_at timestamptz,
  body_analysis jsonb,
  body_analysis_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_rutas_propias check (
    private.ruta_propia(body_photo_path, id)
    and private.ruta_propia(body_ref_path, id)
    and private.ruta_propia(head_ref_path, id)
  ),
  constraint profiles_foto_con_consentimiento check (
    (body_photo_path is null and body_ref_path is null and head_ref_path is null)
    or body_photo_consent_at is not null
  )
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
-- El límite diario y el análisis NO se pueden editar desde el cliente.
grant update (display_name, body_photo_path, body_ref_path, head_ref_path,
              body_photo_consent_at, analysis_consent_at)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create policy "profiles: ver el propio" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: editar el propio" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Perfil automático al crear una cuenta (las cuentas las crea el admin).
create function private.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, daily_neuron_limit)
  values (
    new.id,
    coalesce((select s.default_user_daily_neurons from public.app_settings s where s.id), 3300)
  );
  return new;
end;
$$;
revoke execute on function private.crear_perfil() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.crear_perfil();

-- ---------------------------------------------------------------------------
-- Prendas
-- ---------------------------------------------------------------------------
create table public.garments (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category text not null check (category in ('arriba', 'abajo', 'calzado')),
  name text not null default '' check (char_length(name) <= 80),
  image_path text not null,      -- imagen sin fondo para mostrar (bucket prendas)
  ref_path text not null,        -- versión menor a 512 px para la IA
  color text check (char_length(color) <= 40),
  color_hex text check (color_hex ~ '^#[0-9a-fA-F]{6}$'),
  style text check (char_length(style) <= 40),
  season text check (season in ('calor', 'templado', 'frio', 'cualquiera')),
  formality smallint check (formality between 1 and 5),
  ai_tags jsonb,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garments_rutas_propias check (
    image_path is not null and ref_path is not null
    and private.ruta_propia(image_path, user_id)
    and private.ruta_propia(ref_path, user_id)
  )
);
create index garments_user_category_idx on public.garments (user_id, category);

alter table public.garments enable row level security;
revoke all on public.garments from public, anon, authenticated;
grant select, delete on public.garments to authenticated;
-- user_id no está en los grants: siempre es auth.uid() por default.
grant insert (category, name, image_path, ref_path, color, color_hex, style, season,
              formality, ai_tags, confirmed)
  on public.garments to authenticated;
grant update (category, name, image_path, ref_path, color, color_hex, style, season,
              formality, ai_tags, confirmed)
  on public.garments to authenticated;
grant select, insert, update, delete on public.garments to service_role;

create policy "garments: ver las propias" on public.garments
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "garments: crear propias" on public.garments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "garments: editar las propias" on public.garments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "garments: borrar las propias" on public.garments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger garments_updated_at before update on public.garments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pruebas "Verlo en mí" (las escribe solo la Edge Function)
-- ---------------------------------------------------------------------------
create table public.tryons (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  top_id bigint references public.garments (id) on delete set null,
  bottom_id bigint references public.garments (id) on delete set null,
  shoes_id bigint references public.garments (id) on delete set null,
  status text not null default 'generando' check (status in ('generando', 'listo', 'error')),
  result_path text,
  neurons numeric(10,2) not null default 0,
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint tryons_ruta_propia check (private.ruta_propia(result_path, user_id))
);
create index tryons_user_created_idx on public.tryons (user_id, created_at desc);
create index tryons_top_idx on public.tryons (top_id);
create index tryons_bottom_idx on public.tryons (bottom_id);
create index tryons_shoes_idx on public.tryons (shoes_id);

alter table public.tryons enable row level security;
revoke all on public.tryons from public, anon, authenticated;
grant select, delete on public.tryons to authenticated;
grant select, insert, update, delete on public.tryons to service_role;

create policy "tryons: ver las propias" on public.tryons
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "tryons: borrar las propias" on public.tryons
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Recomendaciones (las escribe solo la Edge Function)
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null,
  top_id bigint references public.garments (id) on delete set null,
  bottom_id bigint references public.garments (id) on delete set null,
  shoes_id bigint references public.garments (id) on delete set null,
  explanation text check (char_length(explanation) <= 1500),
  no_match boolean not null default false,
  missing text check (char_length(missing) <= 300),
  model text,
  created_at timestamptz not null default now()
);
create index recommendations_user_created_idx on public.recommendations (user_id, created_at desc);
create index recommendations_top_idx on public.recommendations (top_id);
create index recommendations_bottom_idx on public.recommendations (bottom_id);
create index recommendations_shoes_idx on public.recommendations (shoes_id);

alter table public.recommendations enable row level security;
revoke all on public.recommendations from public, anon, authenticated;
grant select, delete on public.recommendations to authenticated;
grant select, insert, update, delete on public.recommendations to service_role;

create policy "recommendations: ver las propias" on public.recommendations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "recommendations: borrar las propias" on public.recommendations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Uso de IA: cuota, límite por minuto y registro
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('etiquetar', 'analizar', 'verlo', 'recomendar')),
  provider text not null check (provider in ('cloudflare', 'nvidia')),
  neurons_reserved numeric(10,2) not null default 0 check (neurons_reserved >= 0),
  neurons numeric(10,2) check (neurons >= 0),
  status text not null default 'en_curso' check (status in ('en_curso', 'ok', 'error')),
  detail text check (char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update on public.ai_usage to service_role;

create policy "ai_usage: ver el propio" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Neuronas que cuentan para la cuota: lo real si ya se sabe; lo reservado si
-- sigue en curso; nada si falló sin cobrar.
create function private.neuronas_cuentan(p_status text, p_reservadas numeric, p_reales numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'error' then coalesce(p_reales, 0)
    else coalesce(p_reales, p_reservadas)
  end;
$$;

-- Reserva una llamada de IA si cabe en los límites. Solo la usa el backend.
create function public.reservar_llamada_ia(
  p_user uuid,
  p_kind text,
  p_provider text,
  p_neuronas numeric
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_inicio timestamptz := date_trunc('day', now(), 'UTC');
  v_limite numeric;
  v_usadas_usuario numeric;
  v_usadas_global numeric;
  v_llamadas_dia integer;
  v_llamadas_minuto integer;
  v_id bigint;
begin
  if p_neuronas is null or p_neuronas < 0 then
    raise exception 'neuronas_invalidas' using errcode = '22023';
  end if;

  -- Serializa las reservas para que dos peticiones no rebasen la cuota a la vez.
  perform pg_advisory_xact_lock(hashtext('vestidor_cuota_ia'));

  select * into v_settings from public.app_settings where id;
  select daily_neuron_limit into v_limite from public.profiles where id = p_user;
  if v_limite is null then
    raise exception 'perfil_inexistente' using errcode = 'P0002';
  end if;

  select
    coalesce(sum(private.neuronas_cuentan(status, neurons_reserved, neurons)) filter (where user_id = p_user), 0),
    coalesce(sum(private.neuronas_cuentan(status, neurons_reserved, neurons)), 0),
    count(*) filter (where user_id = p_user),
    count(*) filter (where user_id = p_user and created_at > now() - interval '1 minute')
  into v_usadas_usuario, v_usadas_global, v_llamadas_dia, v_llamadas_minuto
  from public.ai_usage
  where created_at >= v_inicio;

  if v_llamadas_minuto >= v_settings.user_calls_per_minute then
    raise exception 'limite_por_minuto' using errcode = 'P0001';
  end if;
  if v_llamadas_dia >= v_settings.user_daily_ai_calls then
    raise exception 'limite_llamadas_dia' using errcode = 'P0001';
  end if;
  if p_neuronas > 0 and v_usadas_usuario + p_neuronas > v_limite then
    raise exception 'cuota_usuario' using errcode = 'P0001';
  end if;
  if p_neuronas > 0 and v_usadas_global + p_neuronas > v_settings.global_daily_neurons then
    raise exception 'cuota_global' using errcode = 'P0001';
  end if;

  insert into public.ai_usage (user_id, kind, provider, neurons_reserved)
  values (p_user, p_kind, p_provider, p_neuronas)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.reservar_llamada_ia(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.reservar_llamada_ia(uuid, text, text, numeric) to service_role;

-- Contador visible: lo que llevo hoy, mi límite y el total de la app.
-- SECURITY DEFINER porque suma el uso de todos; solo devuelve totales y
-- exige sesión iniciada.
create function public.mi_cuota()
returns table (
  usadas numeric,
  limite numeric,
  global_usadas numeric,
  global_limite numeric,
  reinicia timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(private.neuronas_cuentan(u.status, u.neurons_reserved, u.neurons))
              from public.ai_usage u
              where u.user_id = (select auth.uid())
                and u.created_at >= date_trunc('day', now(), 'UTC')), 0),
    (select p.daily_neuron_limit from public.profiles p where p.id = (select auth.uid())),
    coalesce((select sum(private.neuronas_cuentan(u.status, u.neurons_reserved, u.neurons))
              from public.ai_usage u
              where u.created_at >= date_trunc('day', now(), 'UTC')), 0),
    (select s.global_daily_neurons from public.app_settings s where s.id),
    date_trunc('day', now(), 'UTC') + interval '1 day'
  where (select auth.uid()) is not null;
$$;
revoke execute on function public.mi_cuota() from public, anon;
grant execute on function public.mi_cuota() to authenticated;

-- Las funciones auxiliares de private se usan dentro de checks y del cálculo.
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.ruta_propia(text, uuid) to authenticated, service_role;
grant execute on function private.neuronas_cuentan(text, numeric, numeric) to authenticated, service_role;
grant execute on function private.set_updated_at() to authenticated, service_role;
