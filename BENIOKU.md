# Gündem

Kişisel görev uygulaman. **Android** ve **Windows** uygulaması olarak çalışır, ikisi aynı listeyi gösterir (görevler Supabase'de durur).

## Nasıl çalışıyor

- Bu klasör uygulamanın kaynağıdır. GitHub'a gönderdiğinde (Push) GitHub iki uygulamayı da kendisi derler ve **Releases** sayfasında yeni sürüm olarak yayınlar.
- **Windows** uygulaması yeni sürümü kendisi indirir, "Gündem güncellendi" diye sorar.
- **Android** uygulamasında üstte "Yeni sürüm hazır → Güncelle" şeridi çıkar.
- Görevler hiçbir güncellemede silinmez.

## İlk kurulum (bir kez)

Depo **özel (private)**: GitHub profilinde kimse göremez. Uygulamalar güncellemeleri şöyle alır:
- **Windows:** sadece okuma yetkili bir anahtarla (UPDATE_TOKEN) GitHub'dan, kendiliğinden.
- **Android:** GitHub her derlemede yeni APK'yı Supabase'deki özel `surumler` kutusuna koyar. Uygulama orada yeni sürüm görürse "Yeni sürüm hazır → Güncelle" der. GitHub'a giriş gerekmez; kutuyu sadece uygulamaya giriş yapmış kişi (sen) okuyabilir.

1. **Supabase:** SQL Editor'de `supabase/002_surumler.sql` içeriğini çalıştır. **Authentication → Sign In / Providers** bölümünde **Allow new users to sign up** kapalı olsun (yoksa başkası hesap açıp dosyaları okuyabilir).
2. **Depo özel olsun:** github.com → depo → **Settings** → en altta **Change repository visibility → Make private**.
3. **Gizli bilgiler:** depo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `ANDROID_KEYSTORE` ve `ANDROID_KEYSTORE_PASSWORD`: Belgeler'deki `Gundem-GIZLI-imza-anahtari.txt` dosyasından.
   - `SUPABASE_SERVICE_KEY`: Supabase → **Project Settings → API Keys → Legacy API keys** → **service_role** (secret) anahtarı. Bunu başka hiçbir yere yapıştırma.
   - `UPDATE_TOKEN`: github.com → profil resmi → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** → Repository access: **Only select repositories → Gundem**, Permissions: **Contents: Read-only** → oluşan `github_pat_...` metni.
4. **Derleme tarifi:** `kurulum\derle.yml` dosyasını Not Defteri ile aç, tamamını kopyala. github.com'da deponda **Add file → Create new file** → dosya adı `.github/workflows/derle.yml` → yapıştır → **Commit changes**. Sonra GitHub Desktop'ta **Fetch origin → Pull origin**.
5. **İlk kurulum dosyaları:** Derleme (~15 dk) bitince depo → **Releases**:
   - **Windows:** `Gundem-Kurulum-1.0.X.exe` indir, çalıştır. "Windows bilgisayarınızı korudu" çıkarsa **Ek bilgi → Yine de çalıştır**.
   - **Android:** İlk APK'yı telefona bir kez aktarman gerekir (depo özel). En kolayı: bilgisayarda Releases'ten `Gundem.apk`'yı indir, kendine e-postayla ya da Google Drive'la gönder, telefonda aç. Sonraki güncellemeler uygulama içinden gelir.

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
