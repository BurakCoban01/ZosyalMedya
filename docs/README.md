# Dokümantasyon

Bu klasör, Enterprise Social & Community Platform (ZosyalMedya) hakkındaki
teknik ve kullanım dokümantasyonunu düzenler.

## Kullanım rehberleri

| Dosya | İçerik |
| --- | --- |
| [`local-product-runbook.md`](local-product-runbook.md) | İlk kurulum, normal başlatma, geliştirme, güvenli durdurma ve kurtarma komutları |
| [`proje-calistirma-ve-sayfa-rehberi.md`](proje-calistirma-ve-sayfa-rehberi.md) | Demo verisiyle çalıştırma ve sayfa sayfa demo turu |

## Mimari

[`architecture/`](architecture/) klasörü sistem genelindeki mimari kararları
belgeler:

- `01-system-overview.md` — sistem genel bakış ve bileşenler
- `02-ddd-bounded-contexts.md` — DDD sınırlı bağlamlar (bounded contexts)
- `06-persistence-providers.md` — PostgreSQL/MongoDB/Redis kalıcılık sağlayıcıları
- `07-redis-and-caching.md` — önbellek ve geçersizleştirme
- `10-security.md` — güvenlik modeli (kimlik, izin, medya, oturum)
- `11-reliability-privacy-and-deployment.md` — güvenilirlik, gizlilik ve dağıtım

## İş alanı modülleri

| Klasör | İçerik |
| --- | --- |
| [`modules/`](modules/) | Content ve Questions modüllerinin domain kuralları ve akışları |
| [`learning/`](learning/) | İçerik/etkileşim, mesajlaşma/bildirim ve topluluk/medya tasarım notları |

## Geliştirme ve test

- [`development/testing-guide.md`](development/testing-guide.md) — test stratejisi ve komutlar
- [`frontend/angular-ve-ionic-rehberi.md`](frontend/angular-ve-ionic-rehberi.md) — Angular ve Ionic geliştirme rehberi
