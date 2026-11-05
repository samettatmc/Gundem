-- Gündem: Cüzdan (gelir / gider) tablosu. Supabase > SQL Editor'e yapıştır, Run.
-- Sadece yeni tablo ekler; mevcut görevlere dokunmaz.

create table if not exists public.wallet (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('in','out')),   -- in = gelir, out = gider
  amount      numeric(14,2) not null check (amount >= 0),
  cat         text,
  note        text,
  date        date not null default current_date,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  timestamptz not null default now()
);

create index if not exists wallet_user_date_idx on public.wallet(user_id, date);

-- Güvenlik: herkes sadece KENDİ hareketlerini görür ve değiştirir.
alter table public.wallet enable row level security;
drop policy if exists "kendi cuzdanim" on public.wallet;
create policy "kendi cuzdanim" on public.wallet
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists wallet_updated_at on public.wallet;
create trigger wallet_updated_at before update on public.wallet
  for each row execute function public.set_updated_at();

do $$ begin
  alter publication supabase_realtime add table public.wallet;
exception when duplicate_object then null; end $$;
