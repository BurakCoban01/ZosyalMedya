# Kalıcılık sağlayıcıları ve storage-neutral repository

## Port neden Application katmanında?

`src/BuildingBlocks/Application/Persistence/IRepository.cs`, use-case'in ihtiyaç duyduğu davranışı tanımlar. Filtre `Expression<Func<TEntity,bool>>` olarak taşınır. Böylece handler “normalize e-posta eşitse bul” diyebilir; ancak `DbSet`, `IQueryable`, `IMongoCollection` veya `FilterDefinition` göremez.

Beş temel operasyon tamamen async'tir ve `CancellationToken` kabul eder:

- `CreateAsync` güçlü tipli kimlik döndürür.
- `SelectAsync` en fazla iki kayıt okuyup `SingleOrDefault` semantiği uygular; bozuk uniqueness durumunda keyfi kayıt seçmez.
- `ListByFilterAsync` sayfa boyutunu 1–100 arasında sınırlar ve deterministik son sıralama olarak kimliği kullanır.
- `UpdateAsync` replacement semantiğine sahiptir ve beklenen sürümü karşılaştırır.
- `DeleteByFilterAsync` birden fazla eşleşme olabileceği için etkilenen kayıt sayısını döndürür.

## İki adaptör

`PostgreSqlUserAccountRepository`, expression ağacını EF Core `Where` çağrısına verir. `IdentityDbContext` güçlü tipli `UserId` değerini `Guid` kolonuna converter ile eşler. `Version` concurrency token'dır. İlk migration `identity.users` tablosunu ve normalize kullanıcı/e-posta unique indexlerini oluşturur.

`MongoUserAccountRepository`, aynı expression ağacını resmi sürücünün `Find` metoduna verir. Domain tiplerine BSON attribute eklenmez; `UserId`, aggregate tabanı ve `UserAccount` class-map'leri Infrastructure içinde kaydedilir. `ux_username` ve `ux_email` indexleri başlangıçta idempotent oluşturulur. Update filtresine `Version` eklenerek compare-and-swap uygulanır.

Her iki adaptör de sağlayıcının duplicate-key hatasını `PersistenceConflictException` tipine çevirir. Handler bu teknik ayrıntıyı kullanıcıya güvenli bir domain hata kodu olarak döndürür.

## Sağlayıcı değiştirme

PowerShell örneği:

```powershell
$env:Security__Jwt__SigningKey = '<en-az-32-karakter-yerel-sır>'
$env:Modules__Identity__Persistence__Provider = 'MongoDb'
dotnet run --project src/Host/Api
```

Değişken kaldırıldığında `appsettings.json` içindeki PostgreSQL varsayılanına dönülür. Handler veya Domain kodu değişmez.

## Kanıt

`tests/Integration/Persistence/UserAccountRepositoryContractTests.cs` aynı test gövdesini iki türetilmiş fixture ile her iki adaptörde çalıştırır. Test create, select, bounded list/sort, replacement update, stale-version reddi, unique conflict, delete, null/not-found ve önceden iptal edilmiş token davranışını doğrular.

`tests/Integration/Persistence/UserSessionRepositoryContractTests.cs` ayrıca rotation history'nin kalıcı olduğunu, tüketilmiş token hashinden session bulunabildiğini, replay'in session'ı revoke ettiğini ve stale-version update'in reddedildiğini iki sağlayıcıda aynı testle kanıtlar.
