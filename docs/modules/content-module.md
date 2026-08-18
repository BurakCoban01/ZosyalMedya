# Content modülü: gönderi, anket, gösterim ve kayıt koleksiyonları

Content bounded context gönderinin yayın yaşam döngüsüne, revizyonlarına, anketine, tekilleştirilmiş gösterimine ve kullanıcının kayıt koleksiyonuna sahip olur. HTTP uçları [Program.cs](../../src/Host/Api/Program.cs) içinde yalnızca kimliği ve DTO'yu ilgili vertical-slice handler'a aktarır; kurallar `Content/Application` ve `Content/Domain` katmanlarında kalır.

## Anket yazma sırası

Web [feed.page.ts](../../apps/web-angular/src/app/features/feed/feed.page.ts) ve mobil [mobile-feed.page.ts](../../apps/mobile-ionic/src/app/features/feed/mobile-feed.page.ts) önce gönderiyi oluşturur, sunucunun verdiği typed gönderi kimliğiyle anketi ekler. Bu iki ayrı yerel transaction'dır: anket başarısız olursa istemci başarı mesajı göstermez. Dağıtık transaction taklidi yapılmaz. Anket sorusu ve en az iki dolu seçenek istemcide erken doğrulanır; kapanış ve oy politikalarının asıl yetkili doğrulaması sunucudadır.

`VotePollRequest` HTTP sınırında JSON tarafından kurulabilen `IReadOnlyList<Guid>` kabul eder. Handler bunu `HashSet`'e çevirerek yinelenen seçenekleri domain politikasından önce tekilleştirir. Application portu böylece JSON serializer ayrıntısı taşımaz. `tests/E2E/content-engagement-live.mjs` gerçek HTTP üzerinden anket oluşturma ve oy verme regresyonunu korur; web ve mobil feed bileşen testleri üretilmiş OpenAPI fonksiyonlarının çağrıldığını doğrular.

## Okuma ve hata yalıtımı

Feed read model'i anket aggregate'ini zorunlu bir join ile taşımaz. İstemciler görünür kartlar için `getPoll` çağrılarını paralel yapar; anketi olmayan gönderinin `404` sonucu ana akışı hata durumuna düşürmez. Bu seçim ilk sürümde modül sınırını açık tutar. Trafik büyüdüğünde aynı sözleşme, feed projection'ına olaylarla beslenen isteğe bağlı bir anket özeti eklenerek N+1 maliyetinden kurtarılabilir.

## Gösterim ve kayıt tutarlılığı

Gösterim isteği kullanıcı/oturum kimliğiyle tekilleştirilir. Web ve mobil istemci sekme oturumu boyunca kararlı, rastgele bir `X-View-Session` üretir; yeniden render aynı gösterimi büyütmez. Gösterim çağrıları `Promise.allSettled` ile yapılır, bu nedenle analitik yazma arızası kaynak-of-truth feed okumasını engellemez.

Kaydet/kaldır arayüzü iyimser güncellenir; API reddederse önceki `Set` snapshot'ı geri yüklenir. PostgreSQL repository seçimleri `Id` ile deterministik sıralanır ve `Take(2) + SingleOrDefault` kullanarak benzersizlik ihlalinde rastgele bir kayıt döndürmez. Büyük listeler `CreatedAtUtc + Id` cursor sırasını, yönetimsel sınırlı listeler ise bounded limit'i kullanır.
