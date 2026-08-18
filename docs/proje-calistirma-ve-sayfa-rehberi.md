# Enterprise Social & Community Platform — Çalıştırma ve sayfa rehberi

Bu belge, mevcut yerel ürünü güvenli biçimde başlatıp dolu demo verisiyle
gezmek içindir. Ayrıntılı kurtarma ve geliştirme komutları için
[`local-product-runbook.md`](local-product-runbook.md) kullanılır.

## 1. İlk çalıştırma

Gereksinimler:

- Docker Desktop ve Compose;
- PowerShell;
- kaynak seviyesinde geliştirme için .NET 9 SDK;
- frontend geliştirmesi için yalnızca proje sarmalayıcısının kullandığı Node
  24.18.0.

`.env.example` dosyasını `.env` olarak kopyalayın ve en az 32 karakterlik özel
bir `JWT_SIGNING_KEY` belirleyin. Anahtarı veya token'ları belgeye, ekran
görüntüsüne ya da git'e koymayın.

```powershell
Copy-Item .env.example .env
notepad .env
$env:JWT_SIGNING_KEY = ((Get-Content .env | Where-Object { $_ -match '^JWT_SIGNING_KEY=' } | Select-Object -First 1) -replace '^JWT_SIGNING_KEY=', '')
$env:ESCP_DEMO_PASSWORD = Read-Host 'Yerel demo parolası'
& scripts\dev-up.ps1 -WithApplication -SeedDemoData
```

Komut temel servisleri ve uygulamayı başlatır, API readiness durumunu bekler ve
SQL + gerçek Media API üzerinden idempotent fixture'ları yükler. Mevcut ortak
verileri silmez.

Kontrol:

```powershell
Invoke-WebRequest http://localhost:58080/health/ready -UseBasicParsing
docker compose --profile core --profile app ps
```

- Web: `http://localhost:58081`
- Giriş: `http://localhost:58081/giris`
- API health: `http://localhost:58080/health/ready`
- Swagger: `http://localhost:58080/swagger`

## 2. Hazır gösterim hesapları

Ana ve içeriği dolu hesap:

- kullanıcı adı: `emrekaraca`
- e-posta: `emre.karaca@demo.escp.test`
- durum: aktif
- roller: `Member`, `Administrator`

Hesapta profil avatarı/kapak, yazılı ve görsel/video gönderiler, alıntı ve
yeniden paylaşım, anketler, yorumlar, kaydedilenler, takip grafiği, sorular,
konuşmalar, bildirimler, topluluklar, Stories ve yönetim verisi bulunur.

Alternatif bakış açıları için `ayseyilmaz`, `mehmetdemir`, `zeynepkaya`,
`canozturk`, `elifsahin`, `burakaydin`, `denizcelik` ve `mervearslan` hesapları
da aynı yerel parolayla seed edilir. Parola, yalnızca yerel süreçte
`ESCP_DEMO_PASSWORD` ile sağlanır; izlenen belgelere yazılmaz.

## 3. Kayıt ve giriş davranışı

Yeni kayıt güvenlik gereği `PendingVerification` durumundadır; aynı bilgilerle
hemen giriş yapılamaz. Yerel API doğrulama iletisini
`src/Host/Api/.local/email-pickup` klasörüne `.eml` olarak yazar. En yeni
iletideki `http://localhost:58081/auth/verify-email?...` bağlantısını açtıktan
sonra kayıt sırasında kullanılan kullanıcı adı/e-posta ve parolayla giriş
yapılır. Kullanıcıyı elle DB'de aktifleştirmek gerekmez.

Giriş başarısızsa önce şunları kontrol edin:

1. Kullanıcı adında boşluk olmadığını ve parolanın büyük/küçük harflerini.
2. API health yanıtının 200 olduğunu.
3. Yeni hesapsa doğrulama bağlantısının açıldığını.
4. Gösterim hesapları yoksa `ESCP_DEMO_PASSWORD` ayarlanarak
   `scripts\seed-demo.ps1` çalıştırıldığını.

## 4. Demo turu

### Akış ve içerik

`/akis` üzerinde Takip ve Keşfet sekmelerini gezin. Gerçek görsel/video
gönderilerini açın; reaksiyon, yorum/yanıt, kaydet, anket oyu, alıntı ve yeniden
paylaşım işlemlerini deneyin. Composer metin, 2–6 seçenekli anket ve görünürlüğe
uygun medya yükler. Gönderi ayrıntısı `/icerik/:id` yolundadır.

Üstteki Story rail gerçek, süreli ve yetkilendirilmiş içeriği gösterir. Uygun
görsel/video ile Story oluşturma, görüntüleme, profil geçişi ve sahibin silme
işlemi desteklenir. Ayrı bir Reels yüzeyi bilinçli olarak yoktur; mevcut sunucu
kontratında güvenilir video metadata ve video-only keşif cursor'u bulunmadığı
için sahte bir sekme eklenmemiştir.

### Profil ve sosyal grafik

`/profil` kendi profil düzenleme alanıdır; avatar/kapak yükleme ve görünüm
tercihleri gerçektir. `/profil/:handle` herkese açık profil, gönderi/medya
sekmesi, takipçi/takip edilen sayıları ve sayfalı listeleri sunar.
`/baglantilar` takipçi, takip edilen ve sahibin gelen özel takip isteklerini
gösterir; izin verilen takip, kabul/red, sessize alma ve engelleme işlemleri
buradan veya profil bağlamından yapılır.

### Keşfet ve topluluklar

`/kesfet` profil/içerik/topluluk/soru araması, trend hashtag'ler ve topluluk
keşfi sunar. Mention ve hashtag bağlantıları gerçek rotalara gider. Bağlamsal
şikayet işlemleri kullanıcıya ham UUID girdirmez. `/topluluklar/:slug` detay,
üyelik, kurallar, sabitler ve yetkili üye yönetimi içerir.

### Sorular

`/sorular` profil seçerek açık veya anonim soru göndermeyi, sahip inbox'ını,
yanıtlama/arşivleme ve onaylı silmeyi sunar. Yanıtlanmış açık sorular
`/sorular/:id` üzerinden izin-safe biçimde görüntülenir; anonim gönderici
kimliği açıklanmaz.

### Mesajlar ve bildirimler

`/mesajlar` gerçek profil seçimi, doğrudan/grup konuşmaları, özel medya,
yanıtlama, düzenleme/silme, teslim/okundu durumu ve realtime güncellemeleri
destekler. `/bildirimler` içerik, soru, profil, takip isteği ve konuşma gibi
semantik hedeflere güvenli derin bağlantılar verir.

### Kaydedilenler, ayarlar ve yönetim

`/kaydedilenler` gerçek içerik ayrıntı bağlantıları ve kayıttan çıkarma sağlar.
`/ayarlar` tema, oturumlar, MFA, veri dışa aktarma ve tehlikeli hesap silme
işlemlerini içerir. Gösterim sırasında hesap silmeyi ve mevcut oturumu iptal etmeyi
kullanmayın. `emrekaraca` Administrator rolüyle `/yonetim` dashboard ve
moderasyon vakalarını görebilir; feature-flag yazımı ayrıca onay ister.

## 5. Ionic kontrolü

Kaynak geliştirme sunucusu gerekiyorsa ayrı PowerShell penceresinde:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npx ng serve mobile-ionic --host 127.0.0.1 --port 8100
```

`http://127.0.0.1:8100` üzerinde akış/Stories, profil ve medya derin rotaları,
mesajlar, bildirimler, sorular ve sosyal grafın kritik telefon akışları
bulunur. Makine genelindeki Node seçimini değiştirmeyin.

## 6. Tekrar başlatma ve güvenli durdurma

Fixture'lar bir kez hazırsa tekrar seed gerekmez:

```powershell
$env:JWT_SIGNING_KEY = ((Get-Content .env | Where-Object { $_ -match '^JWT_SIGNING_KEY=' } | Select-Object -First 1) -replace '^JWT_SIGNING_KEY=', '')
& scripts\dev-up.ps1 -WithApplication
```

Veriyi koruyarak durdurma:

```powershell
docker compose --profile core --profile app stop
```

Normal çalışmada `docker compose down -v`, `docker volume rm` veya Docker prune
kullanmayın. Bunlar demo verisini kalıcı olarak silebilir.

## 7. Hızlı teşhis

```powershell
git status --porcelain
git log -4 --oneline
docker compose --profile core --profile app ps
Get-NetTCPConnection -LocalPort 4200,8100,58080,58081 -ErrorAction SilentlyContinue
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 node -v
Get-PSDrive C
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize
```

Yeni ağır test/build başlatmadan önce en az 2 GB disk ve 1 GB boş RAM bırakın.
Kesintiden sonra `git log` üzerinden en son kararlı checkpoint'ten devam edin;
kullanıcıya ait değişiklikleri resetleme, stash'leme veya üzerine yazma yapmayın.
