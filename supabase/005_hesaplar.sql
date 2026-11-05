-- Gündem: cüzdanda hesaplar (Ana hesap, Yemek kartı ...). Supabase > SQL Editor'e yapıştır, Run.
-- Mevcut kayıtların hepsi "Ana hesap"a yazılır; hiçbir kayıt silinmez.
alter table public.wallet add column if not exists account text not null default 'ana';
create index if not exists wallet_user_account_idx on public.wallet(user_id, account);
