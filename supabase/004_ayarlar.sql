-- Gündem: kategoriler gibi kişisel ayarlar (iki cihazda ortak). Supabase > SQL Editor'e yapıştır, Run.
create table if not exists public.prefs (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.prefs enable row level security;
drop policy if exists "kendi ayarlarim" on public.prefs;
create policy "kendi ayarlarim" on public.prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists prefs_updated_at on public.prefs;
create trigger prefs_updated_at before update on public.prefs
  for each row execute function public.set_updated_at();
do $$ begin
  alter publication supabase_realtime add table public.prefs;
exception when duplicate_object then null; end $$;
