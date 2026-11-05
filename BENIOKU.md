# Gündem

Kişisel görev uygulaman. **Android** ve **Windows** uygulaması olarak çalışır, ikisi aynı listeyi gösterir (görevler Supabase'de durur).

## Nasıl çalışıyor

- Bu klasör uygulamanın kaynağıdır. GitHub'a gönderdiğinde (Push) GitHub iki uygulamayı da kendisi derler ve **Releases** sayfasında yeni sürüm olarak yayınlar.
- **Windows** uygulaması yeni sürümü kendisi indirir, "Gündem güncellendi" diye sorar.
- **Android** uygulamasında üstte "Yeni sürüm hazır → Güncelle" şeridi çıkar.
- Görevler hiçbir güncellemede silinmez.

## İlk kurulum (bir kez)

Depo **açık (public)**: kodu başkaları görebilir, görevlerin Supabase'de şifreyle korunur, kimse göremez.

1. **Supabase:** **Authentication → Sign In / Providers** bölümünde **Allow new users to sign up** kapalı olsun.
2. **Gizli bilgiler:** depo → **Settings → Secrets and variables → Actions → New repository secret**:
   `ANDROID_KEYSTORE` ve `ANDROID_KEYSTORE_PASSWORD` (Belgeler'deki `Gundem-GIZLI-imza-anahtari.txt` dosyasından).
3. **Derleme tarifi:** `kurulum\derle.yml` dosyasını Not Defteri ile aç, tamamını kopyala. github.com'da deponda **Add file → Create new file** → dosya adı `.github/workflows/derle.yml` → yapıştır → **Commit changes**. Sonra GitHub Desktop'ta **Fetch origin → Pull origin**.
4. **Kur:** Derleme (~15 dk) bitince depo → **Releases**:
   - **Windows:** `Gundem-Kurulum-1.0.X.exe` indir, çalıştır. Uyarı çıkarsa **Ek bilgi → Yine de çalıştır**.
   - **Android:** Telefonda Releases sayfasını aç, `Gundem.apk`'yı indir ve aç. Sonraki güncellemeler uygulama içindeki **Güncelle** şeridinden gelir.

İleride depo özel yapılmak istenirse: `supabase/002_surumler.sql` çalıştırılır, `SUPABASE_SERVICE_KEY` ve `UPDATE_TOKEN` secret'ları eklenir; kod iki modu da destekliyor.

## Cüzdan kurulumu (bir kez)
Supabase → **SQL Editor** → `supabase/003_cuzdan.sql` içeriğini yapıştır → **Run**. Cüzdan sekmesi bundan sonra çalışır.

## Kategoriler (bir kez)
Supabase → **SQL Editor** → `supabase/004_ayarlar.sql` → **Run**. Kategorilerin iki cihazda ortak olması için gerekli. Düzenleme: uygulamada **⋯ → Kategoriler**.

## Güncelleme yapmak
1. Claude'dan değişikliği iste. Claude bu klasördeki dosyaları düzenler.
2. GitHub Desktop'u aç. Solda değişen dosyalar görünür. Sol alttaki **Summary** kutusuna kısa bir not yaz (ör. "takvim eklendi") → **Commit to main** → üstte **Push origin**.
3. ~10 dakika sonra uygulamalar yeni sürümü kendisi bulur.

## Klasördeki dosyalar

| Dosya / klasör | Ne işe yarar |
|---|---|
| `index.html`, `app.js`, `styles.css` | Uygulamanın ekranları ve mantığı |
| `config.js` | Supabase adresi ve anahtarı |
| `build-info.js` | Sürüm numarası (GitHub derlerken kendisi yazar) |
| `vendor/` | Hazır kütüphaneler (Supabase, Capacitor) |
| `icons/`, `assets/`, `build/` | Uygulama simgeleri ve açılış ekranı |
| `electron/` | Windows uygulamasının kabuğu |
| `capacitor.config.json` | Android uygulamasının ayarları |
| `scripts/` | Derleme sırasında çalışan küçük yardımcılar |
| `.github/workflows/derle.yml` | GitHub'a "iki uygulamayı derle ve yayınla" diyen tarif |
| `supabase/001_kurulum.sql` | Veritabanı kurulumu (bir kez çalıştırıldı) |
| `package.json` | Kullanılan araçların listesi |

## Geliştirme notları (Claude için)
- Yeni bölüm: `app.js` içindeki `TABS` dizisine sekme ekle. Verisi yeni tabloda, yeni `supabase/002_...sql` dosyasıyla; `drop` yok, mevcut sütun silinmez.
- Her değişiklikte `app.js` `VERSION` artır. Uygulama sürüm numarası (1.0.X) GitHub çalışma numarasından gelir.
- Platform: `IS_ANDROID` (Capacitor), `IS_DESKTOP` (Electron, `window.gundemDesktop`). Android'de ses tanıma `@capacitor-community/speech-recognition`; Windows uygulamasında ses tanıma yok (Electron'da Web Speech çalışmıyor).
- Android projesi her derlemede sıfırdan üretilir (`npx cap add android` + `scripts/patch-android.js`). Kalıcı Android ayarı gerekiyorsa patch betiğine ekle.
- Gün sabah 07:00'de değişir (`DAY_START_HOUR`).

- Depo ileride özel yapılırsa: sadece okuma yetkili fine-grained token oluşturup `UPDATE_TOKEN` secret'ı olarak ekle; kod ikisini de destekliyor.
- Cüzdan: tablo `wallet` (kind in/out, amount, cat, note, date). Alt kutuya yazılan cümle `parseMoney` ile para içeriyorsa cüzdana, değilse göreve gider. Kategoriler `W_CATS`, anahtar kelimeler `W_WORDS`.
- Akıcı mod (`html.lite`): Android'de otomatik; bulanık cam ve hareketli ışıklar kapalı.
- Kategoriler `prefs` tablosunda (tek satır, jsonb `data`: taskCats, wallet.in/out). Varsayılanlar `DEFAULT_PREFS`. Kategori anahtarları (id) değişmez, sadece ad/renk değişir; eski kayıtlar bozulmaz.
- Alt kutuda/seste ilk kelime "gelir"/"gider" ise tür ve para algılaması zorlanır.
