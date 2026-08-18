# Dayanıklılık, kişisel veri ve dağıtım rehberi

## Kişisel veri yaşam döngüsü

`ExportMyIdentityDataHandler`, yalnız JWT subject'inin sahibi için Identity modülünün yönettiği kullanıcı ve cihaz oturumu verilerini döndürür. Parola özeti, refresh-token özeti, MFA secret'ı ve recovery-code özetleri dışa aktarılmaz. Export işlemi `identity.privacy.exported` audit olayı üretir.

`DeleteMyIdentityDataHandler` yüksek etkili bir komuttur. Geçerli access token'a ek olarak mevcut parola, MFA açıksa geçerli TOTP kodu ister. `UserAccount.ErasePersonalData` e-posta ve kullanıcı adını kullanıcı ID'sinden türetilen benzersiz fakat dış dünyada işe yaramayan değerlerle değiştirir; parolayı kullanılamaz yapar; MFA, recovery code ve ayrıcalıklı rolleri temizler; hesabı `Deactivated` durumuna alır. Geçici session ve security-challenge kayıtları hard-delete edilir. İçerik kimlikleri thread, audit, moderasyon ve yasal saklama kararlarının uygulanabilmesi için korunur; diğer modüller `UserPersonalDataErased` olayına kendi saklama politikalarıyla tepki verebilir.

JWT bearer doğrulamasındaki `OnTokenValidated`, subject hesabının hâlâ `Active` olduğunu repository üzerinden kontrol eder. Bu nedenle askıya alma veya veri silme, 15 dakikalık access-token ömrünün bitmesini beklemeden mevcut token'ı reddeder. Yüksek trafikte aynı davranış, kısa TTL'li ve event ile invalidated bir hesap-durumu cache'ine taşınabilir; source of truth Identity'dir.

## Outbox, inbox ve teslim garantisi

PostgreSQL modülleri aggregate değişikliği ile outbox satırını yerel transaction içinde yazar. `OutboxDeliveryWorker` satırları `FOR UPDATE SKIP LOCKED` ile lease eder. Bir worker çökerse `LockedUntilUtc` sonunda başka worker devam eder. Başarısızlıklar exponential backoff alır; `MaxAttempts` sonrasında `DeadLetteredAtUtc` set edilir.

MongoDB Messaging adaptörü event'i mesaj belgesine gömer. Tek belge insert atomik olduğundan “mesaj var, event yok” penceresi oluşmaz. Mongo worker da lease, retry ve dead-letter uygular. Her iki worker `IIntegrationEventConsumer` sözleşmesini kullanır. Consumer tamamlanınca `integration.inbox` kaydı handler tam adıyla yazılır; aynı event yeniden görülürse handler atlanır. Harici sağlayıcı çağrılarının ayrıca idempotency key kabul etmesi gerekir; notification aggregate'i message event ID'sini bu amaçla kullanır.

Sistem MongoDB, PostgreSQL, Redis ve object storage arasında distributed transaction kurmaz. Her bounded context kendi transaction'ını tamamlar; sonraki adımlar outbox, retry ve gerektiğinde telafi komutlarıyla ilerler.

## Secret ve Data Protection anahtarları

JWT signing key yalnız `Security__Jwt__SigningKey`, user-secrets veya onaylı secret store üzerinden sağlanır. Kaynak kontrollü appsettings içinde gerçek secret yoktur. Data Protection key ring yerel geliştirmede `.local/data-protection-keys`, container profilinde `protection-keys` volume'unda kalıcıdır; bu MFA enrollment payload'larının restart sonrasında okunabilmesini sağlar.

Production'da volume tek başına yeterli koruma değildir. Key ring bir X.509 sertifikası, işletim sistemi anahtar kasası veya KMS tarafından şifrelenmeli; erişim yalnız API workload identity'sine verilmelidir. Key rotation sırasında eski key'ler retention süresi boyunca okunabilir kalmalı, silme işlemi aktif token ömründen önce yapılmamalıdır.

Container imajı root olarak çalışmaz. `Dockerfile`, named volume bağlanmadan önce `/app/.local/data-protection-keys` mount noktasını `platform` kullanıcısına ait olarak oluşturur. Böylece temiz volume ilk kez hazırlanırken doğru sahiplik devralınır; çalışma zamanında `chmod 777` veya root API süreci gerektirilmez.

## Sağlık, gözlemlenebilirlik ve rollout

`/health/live` process canlılığını, `/health/ready` PostgreSQL/MongoDB/Redis bağımlılıklarını temsil eder. Orchestrator readiness başarılı olmadan trafik vermemeli; liveness'a harici bağımlılık eklenmemelidir. Correlation ID middleware'i HTTP cevabına aynı kimliği koyar; OpenTelemetry trace'i API, repository ve event correlation alanları arasında iz sürmeyi sağlar.

Zamanlanmış soru/gönderi ve bildirim teslim worker'ları tek bir geçici DNS/veritabanı kesintısında host'u düşürmez. Her çevrim cancellation'ı ayrı ele alır; beklenmeyen altyapı hatasını yapılandırılmış event ID ile kaydeder ve bir sonraki periyotta yeniden dener. İş hataları ise aggregate veya teslim kaydının kendi retry/dead-letter durumuna yazılır. Compose API healthcheck'i `/health/ready` sonucunu izlediği için `docker compose --wait`, yalnız process açılmışken değil bağımlılıklar gerçekten hazırken tamamlanır.

Önerilen rollout sırası:

1. Migration job'ını uygulama kimliğinden ayrı yetkiyle çalıştır.
2. Yeni API instance'larını readiness kapalı biçimde başlat.
3. Health ve outbox lag/dead-letter metriklerini doğrula.
4. Trafiği kademeli aktar; eski instance'ları lease süresinden uzun graceful shutdown ile kapat.
5. Geri dönüşte şema ileri/geri uyumluysa eski image'a dön; veri kaybettiren migration'ı otomatik geri alma.

## Gelecekte gateway ve modül çıkarma

Normal geliştirme ve kabul tek `Host.Api` ile devam eder. Bir modül bağımsız deploy edileceğinde önce public Contracts assembly'si sürümlenir, module-owned şema/koleksiyon erişimi ayrılır ve local consumer transport-neutral bir adapter arkasına alınır. Ardından YARP gibi bir edge `/api/v1/<module>` rotasını yeni servise yönlendirir. Correlation ID, JWT issuer/audience, Problem Details ve OpenAPI kontratı değişmeden kalır. Uygulama kodunda cross-module repository veya tablo join olmadığı için taşıma, handler'ları yeniden yazmayı gerektirmez.

Gateway authentication'ı merkezi doğrulayabilir fakat servis authorization'ı yeniden uygulamalıdır. “Gateway kontrol etti” varsayımı mesaj üyeliği, private-content görünürlüğü veya moderasyon policy'si için yeterli değildir.
