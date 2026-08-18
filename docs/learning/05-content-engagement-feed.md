# İçerik, etkileşim ve akış dilimi

## Neden üç ayrı bounded context?

`Post`, yayın yaşam döngüsünü ve görünürlüğü korur. `Reaction`, aktör–içerik tekilliğini ve idempotent tepki değişimini korur. `Comment` ise yazarlık, üst yorum ve en fazla beş seviye derinlik kuralını korur. Bunları tek bir büyük servis veya aggregate yapmak, her tepki için gönderi belgesinin yazılmasına ve eşzamanlılık çakışmalarının büyümesine yol açardı.

Her modül sürücüden bağımsız port tanımlar. EF `DbSet`, Mongo `FilterDefinition` ve Redis `IDatabase` Application katmanına çıkmaz. Content görünürlük kararını SocialGraph'ın public contract'ından alır; Reactions ve Comments etkileşim iznini Content contract'ından sorar.

## Cursor neden yalnızca tarih değildir?

Birden çok gönderi aynı saat hassasiyetinde yayınlanabilir. Yalnızca tarih taşıyan cursor bu kayıtları atlayabilir veya tekrarlayabilir. Bu nedenle cursor şu sıralama anahtarını taşır:

```text
PublishedAtUtc DESC, PostId ASC
```

`PostFeedQuery`, bu ölçütleri depolama-nötr biçimde porta taşır. PostgreSQL adaptörü UUID karşılaştırmasını SQL içinde, MongoDB adaptörü `$lt/$gt` filtreleriyle yapar. Uygulama katmanında `IQueryable` veya sürücü ifadesi yoktur. Aynı zaman damgalı üç kayıtla çalışan konteyner sözleşmesi iki sağlayıcıda da ikinci sayfanın farklı kayıtla başladığını sınar.

## Görünürlük ve sıralama

Akış önce sunucuda şu kayıtları eler:

- yayınlanmamış veya silinmiş içerik;
- hedef kitlesi izleyiciye uymayan içerik;
- engellenen, engelleyen veya sessize alınan hesap içeriği.

Takip akışı kronolojiktir. Keşif akışı güncellik, takip/yakın çevre ilişkisi ve tepki–yorum sinyallerini deterministik bir puana çevirir. API her öğede en fazla üç kısa `rankingReasons` döndürür; bu bilgi hata ayıklama ve “neden görüyorum?” açıklaması içindir, gizli kişisel veri içermez.

## Redis geçersizleştirme

Akış sayfaları kısa süreli cache-aside modeliyle saklanır. İçerik, tepki veya yorum yazımı `feed:generation` değerini yeni bir rastgele nesle ilerletir. Cache anahtarı nesli içerdiği için eski sayfa TTL dolmasını beklemeden erişilemez olur. Ortak Redis adaptörü anahtarın önüne ortam, uygulama, sürüm ve capability ekler; kesinti halinde kaynak veri bozulmaz, yalnızca önbelleksiz çalışma sürer.

## Web ve mobil davranış

Angular web istemcisi kart yığını yerine ayraçlı editoryal akış kullanır. Angular + Ionic istemcisi ayrı mobil navigasyon, pull-to-refresh ve güvenli alan uyumlu alt sekme sunar. İki istemci de OpenAPI'den üretilmiş aynı tipleri kullanır. Tepki ve yorum sayacı önce yerelde güncellenir; API başarısız olursa alınan snapshot geri yüklenir. Uzun listeler cursor ile artımlı yüklenir.

## İlgili kod

- `src/Modules/Content/Application/Posts/PostSlices.cs`
- `src/Modules/Content/Application/Ports/ContentPorts.cs`
- `src/Modules/Feed/Application/Feeds/FeedSlices.cs`
- `apps/web-angular/src/app/features/feed/feed.page.ts`
- `apps/mobile-ionic/src/app/features/feed/mobile-feed.page.ts`
- `tests/Integration/Persistence/PostRepositoryContractTests.cs`
