# Angular web ve Ionic mobil istemci rehberi

Bu belge genel bir teknoloji özeti değil, doğrudan bu depodaki istemcilerin neden bu biçimde kurulduğunu açıklar. Web uygulaması `apps/web-angular`, mobil/PWA uygulaması `apps/mobile-ionic`, üretilen ortak HTTP sözleşmesi ise `packages/api-client` altındadır.

## İstemci sınırları

İki uygulama aynı API tiplerini paylaşır fakat görsel bileşen paylaşmaz. Web istemcisi geniş ekranda sol gezinme rayı, merkez çalışma alanı ve sağ bağlam alanı kullanır. Mobil istemci `TabsPage` ile başparmak erişimine uygun alt sekmeler, Ionic sayfa geçişleri, safe-area boşlukları ve tablet genişliğinde sınırlı içerik sütunu kullanır. Böylece mobil ürün masaüstü arayüzünün küçültülmüş kopyası olmaz.

`contracts/openapi/api-v1.yaml` tek HTTP sözleşme kaynağıdır. `npm run api:generate`, `ng-openapi-gen` ile modelleri ve fonksiyonları üretir. Uygulamalar kalıcı modelleri veya URL gövdelerini elle çoğaltmak yerine `Api.invoke(...)` üzerinden bu fonksiyonları çağırır. Yeni bir endpoint önce OpenAPI sözleşmesine eklenmeli, istemci tekrar üretilmeli ve derleyicinin gösterdiği çağrı noktaları bilinçli biçimde güncellenmelidir.

## Kimlik doğrulama ve token yaşam döngüsü

Web'deki `TokenVault`, access ve refresh tokenlarını yalnızca geçerli tarayıcı sekmesinin `sessionStorage` alanında tutar; böylece aynı sekmedeki yenileme ve korumalı derin bağlantılar çalışır, sekme kapandığında oturum verisi silinir. Uzun ömürlü token `localStorage` içine yazılmaz ve çıkış işlemi sekme kaydını temizler. Mobildeki `MobileSession` kasıtlı olarak yalnızca bellektedir; üretimde cookie tabanlı BFF veya yerel Capacitor kasası eklendiğinde `SecureTokenStorage` portunun adaptörü değiştirilir.

Her iki HTTP interceptor da 401 yanıtında refresh rotasyonu yapar. Eşzamanlı istekler tek bir `Promise` üzerinden aynı rotasyonu bekler; böylece tek kullanımlık refresh tokenının paralel çağrılarla yanlışlıkla tekrar kullanılması önlenir. Refresh başarısızsa bellek temizlenir. Sunucu ayrıca token ailesinde yeniden kullanım algıladığında bütün aileyi iptal eder.

Mobil profil önbelleği yalnızca zaten kullanıcıya gösterilen profil görünümünü `zosyal:mobile:public-profile:v1` anahtarıyla saklar. Token, parola, oturum veya moderasyon verisi bu önbelleğe girmez. Ağ yokken son görünüm okunabilir; yazma işlemi ağ ve sunucu doğrulaması olmadan başarılı gösterilmez.

## Hesap güvenliği ve kişisel veri arayüzü

Web ve mobildeki ayrı `settings` dikey dilimleri aynı OpenAPI üretimli Identity fonksiyonlarını kullanır. Kullanıcı etkin cihazları görür ve tek tek iptal eder; TOTP kurulum anahtarını alıp kodla onaylar; yalnız bir kez gösterilen recovery code'ları saklar; MFA'yı TOTP veya recovery code ile kapatır. Veri dışa aktarma parola/MFA sırlarını içermez. Hesap silme, mevcut parola ve etkinse MFA kodunu sunucuya doğrulatır; başarılı olduğunda istemci belleğindeki token kasası temizlenir. Arayüz onayı sunucu authorization'ının yerine geçmez.

## Render yaklaşımının tarihsel yeri

Geleneksel MVC uygulamalarında sunucu HTML şablonunu oluşturur, form ve sayfa geçişleri çoğunlukla aynı host ve portta tamamlanırdı. SPA yaklaşımıyla Angular gibi istemciler arayüz durumunu tarayıcıda yönetmeye, backend ise Web API sözleşmesi sunmaya başladı. Aynı API bugün web, mobil ve ileride masaüstü gibi birden fazla istemciye hizmet edebilir; edge/gateway katmanı bu istemciler için ortak yönlendirme, hız sınırı ve gözlemlenebilirlik noktası olabilir.

React'in Virtual DOM yaklaşımı, önce bellekte bir ağaç üretip önceki ağaçla uzlaştırarak gerekli gerçek DOM değişikliklerini uygular. Angular aynı modeli birebir kullanmaz. Angular şablonları derler, change detection ile hangi binding'lerin değiştiğini izler ve Signals ile bağımlılığı daha hassas tanımlar. Bu projede:

- sayfalar lazy route ile ayrı chunk olarak yüklenir;
- bileşenlerde `OnPush` ve Signals kullanılır;
- tekrar eden uzun listelerde kararlı kimlik/`track` kullanılacaktır;
- çok uzun akışlar Angular CDK virtual scrolling ile yalnızca görünür satırları oluşturacaktır;
- `prefers-reduced-motion` kullanıcının hareket azaltma tercihine uyar.

Bu kararlar Angular ürününe yapay bir Virtual DOM katmanı eklemeden render maliyetini denetlenebilir tutar.

## PWA ve çevrimdışı davranış

Mobil üretim derlemesinde Angular service worker etkindir. `ngsw-config.json` uygulama kabuğunu önden, sürümlenmiş statik dosyaları tembel biçimde önbelleğe alır. `manifest.webmanifest` standalone açılışı, tema renklerini ve maskelenebilir uygulama ikonunu tanımlar. Service worker geliştirme derlemesinde kapalıdır; önbellek hatalarının yerel geliştirmeyi şaşırtmaması için yalnızca production çıktısında kaydedilir.

Çevrimdışı destek her komutu kuyruğa almak anlamına gelmez. Profilin son okunmuş hali güvenle gösterilir; takip, engelleme ve profil yazma gibi politika veya sürüm doğrulaması isteyen komutlar sunucuya ulaşmadan başarı sayılmaz. İleride çevrimdışı komut kuyruğu eklenirse idempotency anahtarı, kullanıcıya görünür bekleme durumu ve çatışma çözümü zorunludur.

## Stil ve erişilebilirlik

Web Tailwind 4'ü merkezi tema değişkenleriyle kullanır; mobil Ionic değişkenleri aynı koyu mürekkep, sıcak fildişi ve tek mercan vurgu diline bağlanır. Başlık hiyerarşisi, görünür form etiketleri, durum mesajlarında `role="status"`/`role="alert"`, klavye ile ulaşılabilir doğal kontroller ve işletim sistemi hareket azaltma tercihi temel erişilebilirlik katmanıdır. Renk tek başına durum taşımamalı; yeni ekranlar metinsel durum ve odak yönetimi eklemelidir.

## Yerel geliştirme ve doğrulama

Angular 20.3 için `.nvmrc` içindeki Node 24.18.0 kullanılır. Kurulumdan sonra:

```text
npm ci
npm run api:generate
npm run web:build
npm run mobile:build
```

`skipLibCheck`, Ionic web-component bildirimleri ile TypeScript DOM kitaplığındaki aynı adlı `autocorrect` alanının sürüm kaynaklı çakışmasını yoksayar; uygulama kaynaklarında `strict` ve Angular `strictTemplates` açık kalır. Üretim kabulünde iki bundle, `ngsw.json`, manifest ve ikon varlığı birlikte doğrulanmalıdır.
