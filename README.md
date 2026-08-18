# Enterprise Social & Community Platform (ZosyalMedya)

.NET tabanlı **modüler monolit** API, **Angular** web uygulaması ve **Ionic**
(PWA) mobil uygulamasından oluşan, uçtan uca çalışan bir kurumsal sosyal
iletişim ve topluluk platformudur.

Uygulamadaki her görünür özellik gerçek bir arka uç servisine ve veri tabanı
kaydına bağlıdır. Gönderiler, reaksiyonlar, anketler, yorumlar, mesajlaşma,
bildirimler, soru-cevap, topluluklar, sosyal grafik ve Stories uçtan uca gerçek
API çağrılarıyla çalışır.

---

## Bu Sayfanın İçindekiler

- [Özellikler](#özellikler)
- [Teknoloji yığını](#teknoloji-yığını)
- [Proje yapısı](#proje-yapısı)
- [Gereksinimler](#gereksinimler)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Demo hesapları](#demo-hesapları)
- [Uygulama adresleri](#uygulama-adresleri)
- [Sayfa rotaları](#sayfa-rotaları)
- [Testler](#testler)
- [Dokümantasyon](#dokümantasyon)
- [Lisans ve bildirimler](#lisans-ve-bildirimler)

---
<img width="1824" height="920" alt="Ekran görüntüsü 2026-08-18 212154" src="https://github.com/user-attachments/assets/c8922fb9-a372-4833-b69b-7e35ff856bbe" />

<img width="390" height="844" alt="v5-29-post-change-390-dark-feed" src="https://github.com/user-attachments/assets/f2ae24c0-c74c-4ed5-a935-adec41b273c5" />

<img width="390" height="844" alt="v5-25-ionic-feed-pagination-390" src="https://github.com/user-attachments/assets/4dace7fc-ddbe-4fa6-9530-b7e67fa0a30b" />

<img width="1299" height="861" alt="v5-story-viewer-attempt-1440" src="https://github.com/user-attachments/assets/4f8488c3-7a76-474d-820b-8af5e5a14008" />

<img width="390" height="844" alt="v5-20-story-viewer-dark-phone" src="https://github.com/user-attachments/assets/da9ed28b-a550-4f2c-bbb7-8b08e080971f" />

<img width="390" height="844" alt="v5-13-notifications-dark-phone" src="https://github.com/user-attachments/assets/c2f16acf-5b2a-43a2-8ab3-9705f46196dd" />
---

## Özellikler

**Kimlik ve hesap**

- Kayıt, e-posta doğrulama, giriş/çıkış, oturum yenileme ve güvenli oturum yönetimi
- Profil düzenleme, avatar/kapak yükleme, görünüm (tema) tercihleri
- İki adımlı doğrulama (MFA) ayarları, oturum listesi ve veri dışa aktarma

**İçerik ve etkileşim**

- Gerçek Takip ve Keşfet akışları; sayfalı (cursor) yükleme ve dürüst yükleme/hata durumları
- Metin, görsel ve video içeren gönderi oluşturma; yeniden paylaşım ve alıntı
- 5 tür reaksiyon, yorum ve yanıt (sahip düzenleme/silme ile), kaydetme
- 2–6 seçenekli anketler (çoklu seçim ve süreli)
- Mention (`@kullanici`) ve hashtag (`#etiket`) bağlantıları, hashtag keşfi
- Bağlamsal şikayet bildirimi

**Sosyal grafik**

- Takipçi/takip edilen sayıları ve sayfalı listeler
- Sahibe özel gelen özel takip isteği kuyruğu (kabul/red)
- Sessize alma, engelleme ve ilişki yönetimi

**Mesajlaşma ve bildirimler**

- Gerçek profil seçimiyle doğrudan/grup konuşmaları, gerçek zamanlı (SignalR) güncellemeler
- Mesajda medya, yanıtlama, düzenleme/silme, teslim/okundu durumları
- İçerik, soru, profil ve konuşma hedefli bildirimler ve güvenli derin bağlantılar

**Soru-Cevap, topluluklar ve Stories**

- Anonim/açık soru sorma, sahip gelen kutusu, yanıtlama/arşivleme/onaylı silme
- Topluluk kuralları, sabit gönderiler ve yetkili üye (moderatör) yönetimi
- Sunucu tarafında süresi dolan, yetkilendirilmiş görsel/video Stories (web + mobil)

**Yönetim ve güvenlik**

- Rol tabanlı yönetim paneli (`/yonetim`) ve moderasyon vakaları
- Medya için virüs tarama (ClamAV), boyut/kota sınırları ve sahip doğrulaması
- JWT tabanlı kimlik doğrulama, izin kontrolleri ve güvenli oturum yönetimi

---

## Teknoloji yığını

| Katman | Teknoloji |
| --- | --- |
| Arka uç | .NET 9 — modüler monolit (DDD + vertical slice), ASP.NET Core, SignalR |
| Veri tabanı | PostgreSQL (kimlik, grafik, arama vb.), MongoDB (medya/Stories meta verisi), Redis (önbellek/realtime) |
| Medya depolama | Yerel dosya sistemi (varsayılan) veya S3 uyumlu MinIO; ClamAV ile virüs taraması |
| Web | Angular 20 (standalone bileşenler, Tailwind, koyu/açık tema, PWA) |
| Mobil | Ionic 8 (PWA), aynı API ve oturum kontratlarını kullanır |
| API kontratı | OpenAPI 3.1 (`contracts/openapi/api-v1.yaml`); TypeScript istemci sürücüye göre üretilir |
| Dağıtım | Docker Compose (yerel) — Linux `arm64` hedefli (Coolify) |

**Arka uç modülleri:** Administration, Audit, Comments, Communities, Content,
Feed, Identity, Media, Messaging, Moderation, Notifications, Profiles,
Questions, Reactions, Search, SocialGraph, Stories.

Her modül `Application`, `Domain`, `Infrastructure` ve (gereken yerlerde)
`Contracts` katmanlarına ayrılır; modüller arası iletişim yalnızca açık
portlar (contract) üzerinden yapılır.

---

## Proje yapısı

```
├── src/
│   ├── BuildingBlocks/        # Ortak altyapı (Application, Domain, Infrastructure, Observability)
│   ├── Host/Api/              # API giriş noktası (Program.cs, SignalR hub, OpenAPI)
│   └── Modules/               # 17 iş alanı modülü (modular monolith)
├── apps/
│   ├── web-angular/           # Angular web uygulaması
│   └── mobile-ionic/          # Ionic/PWA mobil uygulaması
├── packages/
│   └── api-client/            # OpenAPI'den üretilen TypeScript istemci
├── contracts/openapi/         # API v1 OpenAPI kontratı (tek kaynak)
├── tests/
│   ├── Architecture/          # Mimari kural testleri
│   ├── Contract/              # API kontrat testleri
│   ├── Integration/           # Gerçek altyapı ile entegrasyon testleri
│   ├── Unit/                  # Birim testleri
│   ├── E2E/                   # Gerçek HTTP üzerinden uçtan uca senaryolar
│   └── Performance/           # Performans senaryoları
├── scripts/                   # PowerShell yardımcı scriptleri (dev-up, seed, verify)
├── deploy/                    # Coolify, Cloudflare Worker ve public-demo yapılandırmaları
├── docs/                      # Mimari ve kullanım dokümantasyonu
├── compose.yaml               # Yerel geliştirme Docker Compose
└── ZosyalMedya.sln            # .NET çözüm dosyası
```

---

## Gereksinimler

- **Docker Desktop** (Compose eklentili)
- **PowerShell**
- Backend geliştirmesi için **.NET 9 SDK**
- Frontend komutları makine genelindeki Node seçimini **değiştirmez**; proje
  `scripts/with-project-node.ps1` sarmalayıcısıyla proje Node sürümünü
  (24.18.0) kullanır.

---

## Hızlı başlangıç

### 1. İlk kurulum

`.env.example` dosyasını `.env` olarak kopyalayın ve `JWT_SIGNING_KEY`
değerini en az 32 karakterlik **özel** bir değerle değiştirin:

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` asla sürüm kontrolüne (git) eklenmez; `git status` ile doğrulayın.

### 2. İlk başlatma (seed dahil)

Aynı PowerShell oturumunda anahtarı yükleyin, demo parolasını girin ve
uygulamayı başlatın:

```powershell
$env:JWT_SIGNING_KEY = ((Get-Content .env | Where-Object { $_ -match '^JWT_SIGNING_KEY=' } | Select-Object -First 1) -replace '^JWT_SIGNING_KEY=', '')
$env:ESCP_DEMO_PASSWORD = Read-Host 'Yerel demo parolası'
& scripts\dev-up.ps1 -WithApplication -SeedDemoData
```

Bu komut temel servisleri ve uygulamayı başlatır, API'nin hazır olmasını
bekler ve gerçek SQL + Media API üzerinden **idempotent** demo verisini yükler.
Seed scripti mevcut verileri silmez; güvenle tekrar çalıştırılabilir.

### 3. Sonraki başlatmalar

Veri zaten hazırsa seed'e gerek yoktur:

```powershell
$env:JWT_SIGNING_KEY = ((Get-Content .env | Where-Object { $_ -match '^JWT_SIGNING_KEY=' } | Select-Object -First 1) -replace '^JWT_SIGNING_KEY=', '')
& scripts\dev-up.ps1 -WithApplication
```

### 4. Kaynak seviyesinde geliştirme (isteğe bağlı)

Web (ayrı PowerShell penceresinde):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npx ng serve web-angular --host 127.0.0.1 --port 4200
```

Ionic/PWA:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npx ng serve mobile-ionic --host 127.0.0.1 --port 8100
```

### 5. Güvenli durdurma

```powershell
docker compose --profile core --profile app stop
```

Normal çalışma akışında `docker compose down -v`, `docker volume rm` veya
Docker prune **kullanmayın** — bunlar demo verisini kalıcı olarak siler.

---

## Demo hesapları

Ana ve içeriği dolu hesap:

| Kullanıcı adı | E-posta | Roller |
| --- | --- | --- |
| `emrekaraca` | `emre.karaca@demo.escp.test` | `Member`, `Administrator` |

Alternatif bakış açıları (aynı yerel demo parolasıyla giriş yapar):
`ayseyilmaz`, `mehmetdemir`, `zeynepkaya`, `canozturk`, `elifsahin`,
`burakaydin`, `denizcelik`, `mervearslan`.

> Parola yalnızca `ESCP_DEMO_PASSWORD` üzerinden yerel süreçte sağlanır;
> izlenen dosyalara veya dokümantasyona yazılmaz.

Yeni kayıtlar `PendingVerification` durumunda başlar; API doğrulama iletisini
`src/Host/Api/.local/email-pickup` klasörüne `.eml` olarak yazar. En yeni
iletideki `http://localhost:58081/auth/verify-email?...` bağlantısını açtıktan
sonra hesap girişe hazır olur.

---

## Uygulama adresleri

| Servis | Adres |
| --- | --- |
| Web uygulaması | `http://localhost:58081` |
| API sağlık kontrolü | `http://localhost:58080/health/ready` |
| Swagger (API dokümantasyonu) | `http://localhost:58080/swagger` |
| Web geliştirme sunucusu | `http://127.0.0.1:4200` |
| Ionic geliştirme sunucusu | `http://127.0.0.1:8100` |

---

## Sayfa rotaları

| Rota | Sayfa |
| --- | --- |
| `/akis` | Takip ve Keşfet akışları, Stories rail, gönderi oluşturma |
| `/icerik/:id` | Gönderi detayı |
| `/kesfet` | Arama, trendler, topluluk keşfi |
| `/profil` / `/profil/:handle` | Kendi profili / herkese açık profil (medya, sosyal grafik) |
| `/mesajlar` | Mesajlaşma |
| `/bildirimler` | Bildirimler |
| `/kaydedilenler` | Kaydedilen içerikler |
| `/baglantilar` | Takipçi/takip edilen listeleri, özel takip istekleri |
| `/sorular` / `/sorular/:id` | Soru-Cevap kutusu ve yanıt detayı |
| `/topluluklar/:slug` | Topluluk detayı |
| `/ayarlar` | Tema, oturumlar, MFA, veri dışa aktarma |
| `/yonetim` | Yönetim paneli (yalnızca `Administrator`) |
| `/giris` | Giriş |

---

## Testler

```powershell
# Backend: mimari, kontrat, birim ve entegrasyon testleri
dotnet test ZosyalMedya.sln --configuration Release

# Frontend: web + Ionic bileşen testleri (proje Node sarmalayıcısı ile)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npm test

# Üretim derlemeleri
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npm run build
```

GitHub Actions (`ci.yml`) her push'ta: backend derleme/test, frontend test +
üretim derlemesi, `npm audit`, bağımlılık SBOM çıktısı ve public-demo Compose
doğrulamasını çalıştırır.

---

## Dokümantasyon

| Konu | Dosya |
| --- | --- |
| Yerel kurulum, geliştirme ve kurtarma rehberi | `docs/local-product-runbook.md` |
| Demo turu ve sayfa rehberi (Türkçe) | `docs/proje-calistirma-ve-sayfa-rehberi.md` |
| Mimari dokümantasyon | `docs/architecture/` |
| Test rehberi | `docs/development/testing-guide.md` |
| Tüm dokümanların indeksi | `docs/README.md` |

---

## Lisans ve bildirimler

Kaynak kod portföy incelemesi için paylaşılır; ayrıca bir açık kaynak lisansı
verilmez. Dağıtılan üçüncü taraf yazılımlar ve yazı tiplerinin bildirimleri
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) içinde listelenmiştir.
