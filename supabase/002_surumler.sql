-- Gündem: Android güncellemeleri için özel dosya kutusu (Supabase > SQL Editor'e yapıştır, Run).
-- Kutu herkese kapalıdır; sadece uygulamaya giriş yapmış kullanıcı (sen) okuyabilir.
-- Yeni dosyaları GitHub, gizli "service_role" anahtarıyla yükler.

insert into storage.buckets (id, name, public)
values ('surumler', 'surumler', false)
on conflict (id) do nothing;

drop policy if exists "surumleri giris yapan okur" on storage.objects;
create policy "surumleri giris yapan okur" on storage.objects
  for select to authenticated
  using (bucket_id = 'surumler');
