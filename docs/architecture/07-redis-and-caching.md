# Redis, cache ve dağıtık koordinasyon

`ICacheService`, `IIdempotencyStore` ve `IRateLimitStore` portları `BuildingBlocks.Application` içindedir; StackExchange.Redis tipi içermez. Tek `RedisStorageAdapters` sınıfı bu küçük, amaç odaklı portları uygular.

Anahtar biçimi şöyledir:

```text
{environment}:{application}:v1:{capability}:{business-key}
```

Bu biçim ortam çakışmasını önler ve serialization/key sözleşmesi değiştiğinde `v1` yükseltilerek kontrollü geçiş sağlar. Cache yazısında TTL verilmezse beş dakika uygulanır; kalıcı ve sınırsız cache key üretilmez. Idempotency `SET NX` ile, rate counter ise atomik `INCR` ve ilk artışta expiry ile çalışır.

Cache source-of-truth değildir. Redis okuma/yazma/invalidation hataları yapılandırılmış uyarı üretir ve cache operasyonu degraded davranır. Buna karşılık idempotency ve rate-limit koordinasyonu correctness etkilediği için hata sessizce “başarılı” sayılmaz.

`tests/Integration/Redis/RedisStorageAdaptersTests.cs` gerçek Redis üzerinde JSON round-trip, silme, aynı idempotency anahtarının ikinci kez reddi ve pencere içi sayacın 1→2 artışını sınar.
