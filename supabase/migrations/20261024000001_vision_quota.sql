-- Mi Rosario: cuota atómica de solicitudes Vision, independiente del backend de reportes.
-- Ejecutar MANUALMENTE en un proyecto Supabase de pruebas, no en producción sin revisión.
create table if not exists public.vision_daily_quota (
  quota_day date not null,
  bucket text not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (quota_day, bucket)
);
alter table public.vision_daily_quota enable row level security;
revoke all on public.vision_daily_quota from public, anon, authenticated;

create or replace function public.admit_vision_analysis()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_day date := (now() at time zone 'utc')::date;
  v_bucket text;
begin
  if v_user is null then return false; end if;
  v_bucket := 'user:' || v_user::text;
  -- Serializa las admisiones para que dos instancias de Vercel no superen el cupo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mi-rosario-vision-quota', 0));

  insert into public.vision_daily_quota (quota_day, bucket, attempts)
  values (v_day, 'global', 0), (v_day, v_bucket, 0)
  on conflict (quota_day, bucket) do nothing;

  if (select attempts from public.vision_daily_quota where quota_day = v_day and bucket = 'global') >= 100
     or (select attempts from public.vision_daily_quota where quota_day = v_day and bucket = v_bucket) >= 10 then
    return false;
  end if;

  update public.vision_daily_quota set attempts = attempts + 1
  where quota_day = v_day and bucket in ('global', v_bucket);
  return true;
end;
$$;

revoke all on function public.admit_vision_analysis() from public, anon;
grant execute on function public.admit_vision_analysis() to authenticated;
comment on function public.admit_vision_analysis() is
  'Vision preview: 10 intentos por usuario/día UTC, 100 globales/día UTC, con bloqueo transaccional';
