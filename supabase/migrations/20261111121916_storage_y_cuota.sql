-- Vestidor: buckets privados de Storage y contador de cuota sin SECURITY
-- DEFINER expuesto.

-- ---------------------------------------------------------------------------
-- Contador de cuota
-- ---------------------------------------------------------------------------
-- Solo el total global necesita leer el uso de todos. Vive en private (no
-- expuesto por la API), exige sesión y devuelve un único número.
create function private.uso_global_hoy()
returns table (usadas numeric, limite numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(private.neuronas_cuentan(u.status, u.neurons_reserved, u.neurons))
              from public.ai_usage u
              where u.created_at >= date_trunc('day', now(), 'UTC')), 0),
    (select s.global_daily_neurons from public.app_settings s where s.id)
  where (select auth.uid()) is not null;
$$;
revoke execute on function private.uso_global_hoy() from public, anon;
grant execute on function private.uso_global_hoy() to authenticated, service_role;

-- El resto se calcula con los permisos del usuario (RLS aplica).
create or replace function public.mi_cuota()
returns table (
  usadas numeric,
  limite numeric,
  global_usadas numeric,
  global_limite numeric,
  reinicia timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((select sum(private.neuronas_cuentan(u.status, u.neurons_reserved, u.neurons))
              from public.ai_usage u
              where u.user_id = (select auth.uid())
                and u.created_at >= date_trunc('day', now(), 'UTC')), 0),
    (select p.daily_neuron_limit from public.profiles p where p.id = (select auth.uid())),
    g.usadas,
    g.limite,
    date_trunc('day', now(), 'UTC') + interval '1 day'
  from private.uso_global_hoy() g
  where (select auth.uid()) is not null;
$$;
revoke execute on function public.mi_cuota() from public, anon;
grant execute on function public.mi_cuota() to authenticated;

-- ---------------------------------------------------------------------------
-- Buckets privados
-- ---------------------------------------------------------------------------
-- cuerpos:    foto de cuerpo completo, su versión para la IA y la cabeza
-- prendas:    imagen sin fondo de cada prenda y su versión para la IA
-- resultados: fotos de "Verlo en mí" (solo las escribe la Edge Function)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cuerpos', 'cuerpos', false, 8 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('prendas', 'prendas', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('resultados', 'resultados', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']);

-- Cada quien solo toca su carpeta: <bucket>/<su user id>/...
create policy "storage: ver lo propio" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('cuerpos', 'prendas', 'resultados')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: subir a mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('cuerpos', 'prendas')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Reemplazar un archivo (upsert) necesita insert + select + update.
create policy "storage: reemplazar lo propio" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('cuerpos', 'prendas')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('cuerpos', 'prendas')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: borrar lo propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('cuerpos', 'prendas', 'resultados')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
