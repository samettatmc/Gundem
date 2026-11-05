-- Gündem: veritabanı kurulumu (Supabase > SQL Editor'e yapıştır ve Run'a bas)
-- Bu dosyayı sadece BİR KEZ çalıştır. Yeni özellikler için 002_, 003_ ... dosyaları eklenir;
-- eski tabloları silmez, sadece yenilerini ekler. Böylece veriler kaybolmaz.

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  date        date,                 -- planlanan gün (boşsa tarihsiz)
  cat         text,                 -- is | ev | okul | kisi
  picked_for  date,                 -- sabah "bugüne al" ile seçildiği gün
  done        boolean not null default false,
  done_at     date,
  done_ts     bigint,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_idx on public.tasks(user_id);

-- Güvenlik: herkes sadece KENDİ görevlerini görebilir ve değiştirebilir.
alter table public.tasks enable row level security;

drop policy if exists "kendi gorevlerim" on public.tasks;
create policy "kendi gorevlerim" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at alanını otomatik güncelle
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Telefonda yapılan değişiklik bilgisayarda anında görünsün (canlı eşitleme)
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
