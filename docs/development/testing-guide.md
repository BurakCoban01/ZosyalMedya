# Test ve doğrulama rehberi

## Hızlı doğrulama

```powershell
dotnet restore ZosyalMedya.sln
dotnet build ZosyalMedya.sln --no-restore
dotnet test ZosyalMedya.sln --no-build
docker compose --profile core config
```

## Gerçek altyapı testleri

Proje, makinedeki başka servislerle port çakışmasını azaltmak için PostgreSQL `55432`, MongoDB `57017`, Redis `56379` host portlarını kullanır.

Frontend component testleri Angular'ın `@angular/build:unit-test` hedefi, Vitest ve jsdom ile çalışır. `npm test` web ve mobil TestBed paketlerini ayrı ayrı derler; `npm audit --audit-level=high` doğrudan veya geçişli yüksek/kritik advisory bulunduğunda doğrulamayı durdurur. Angular 20 bu builder'ı deneysel olarak işaretlediği için sürüm yükseltmelerinde test hedefi ayrıca gözden geçirilmelidir; testlerin kendisi framework'ün gerçek `TestBed` ve template derleyicisini kullanır.

```powershell
docker compose --profile core up -d --wait
$env:RUN_INFRASTRUCTURE_TESTS = 'true'
dotnet test tests/Integration/ZosyalMedya.Tests.Integration.csproj
```

Test gate kapalıyken hızlı test komutu dış servise bağımlı değildir. CI ve kabul koşusunda gate mutlaka `true` olmalı, aksi halde bu koşu altyapı kanıtı sayılmaz.

## Migration

```powershell
dotnet ef migrations list --project src/Modules/Identity/Infrastructure --context IdentityDbContext
dotnet ef database update --project src/Modules/Identity/Infrastructure --context IdentityDbContext
```

API de seçili sağlayıcı PostgreSQL ise başlangıçta pending migration'ları uygular; MongoDB ise gerekli indexleri idempotent kurar. Üretimde migration yetkisini uygulama kimliğinden ayırmak istenirse initializer deployment job'a taşınmalıdır.

## Yalnızca bu projenin disposable konteynerlerini durdurma

```powershell
docker compose --profile core down
docker system df
```

Bu komut named volume'ları silmez. Veri volume'larını silen `down -v` ve global `docker system prune` otomatik çalıştırılmamalıdır.
