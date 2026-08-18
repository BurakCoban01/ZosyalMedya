-- ============================================================================
-- Enterprise Social & Community Platform — Demo Veri Seed Script (Part 2: İçerik & Etkileşim & Yönetim)
-- Part 1 (users, profiles, social_graph) sonrası çalıştırılır.
-- Idempotent. Çalıştırma:
--   docker cp scripts\seed-demo-data-part2.sql zosyalmedya-postgres-1:/tmp/seed2.sql
--   docker exec zosyalmedya-postgres-1 psql -U zosyalmedya -d zosyalmedya -v ON_ERROR_STOP=1 -f /tmp/seed2.sql
-- ============================================================================

BEGIN;
SET client_encoding TO 'UTF8';

-- ===========================================================================
-- 1. GÖNDERİLER (16 post)
-- ===========================================================================
INSERT INTO content.posts
  ("Id","AuthorId","Text","MediaIds","Mentions","Hashtags","LinkUrl","ContentWarning",
   "IsSensitive","Visibility","Status","ShareKind","IsPinned",
   "PublishAtUtc","PublishedAtUtc","CreatedAtUtc","UpdatedAtUtc","ViewCount","Version")
SELECT id, author, text, '{}'::uuid[], mentions, hashtags, link, warning,
   false, vis, 'Published', 'Original', pinned,
   pub, pub, pub, pub, views, 0
FROM (VALUES
  -- Ayşe — Angular zoneless
  ('13000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,
   'Angular 20 ile zoneless change detection''a geçiş deneyimimizi paylaşıyorum. Signals + computed() kombinasyonu inanılmaz performans verdi, ama NgZone''a alışkın kodlarda dikkatli olmak gerek. Detaylı yazı yakında geliyor. @emrekaraca sen de denedin mi? #angular #frontend #performans',
   ARRAY['@emrekaraca']::text[], ARRAY['angular','frontend','performans']::text[],
   'https://blog.angular.dev/zoneless'::varchar, 'Uzun teknik yazı'::varchar,
   'Public'::varchar, false::boolean, NOW() - INTERVAL '5 days', 1247::bigint),
  -- Ayşe — Tasarım sistemi
  ('13000000-0000-4000-8000-000000000002'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,
   'Bir tasarım sistemi sadece renk paleti ve buton bileşenleri değildir. O, kararların yazılı olduğu bir anayasasıdır ekibin. Token hiyerarşisini küçük başlatın: 3 renk, 2 boşluk, 1 tip ölçeği. Gerisi ihtiyaç oldukça büyür. #tasarim #designsystem',
   ARRAY[]::text[], ARRAY['tasarim','designsystem']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '2 days', 412::bigint),
  -- Mehmet — ANKETLİ
  ('13000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,
   'Yıllardır tasarım sistemleri kuruyorum ve en çok yanıldığım şey token hiyerarşisini gereğinden büyük başlatmak oldu. Siz hangi yaklaşımı tercih ediyorsunuz?',
   ARRAY[]::text[], ARRAY['tasarim','ux']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '4 days', 893::bigint),
  -- Mehmet — Erişilebilirlik
  ('13000000-0000-4000-8000-000000000004'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,
   'Erişilebilirlik bir "ekstra özellik" değildir, ürünün temelidir. Bugün ekran okuyucuyla sitemizi test ettim, 12 farklı sorun buldum: eksik aria-label''lar, focus sırası hataları, düşük kontrast. @ayseyilmaz ekibiyle birlikte düzeltmeler yapacak. Herkes kendi ürününü ekran okuyucuyla bir gün kullansın! #a11y #erişilebilirlik',
   ARRAY['@ayseyilmaz']::text[], ARRAY['a11y','erisilebilirlik']::text[],
   'https://www.w3.org/WAI/standards-guidelines/wcag/'::varchar, NULL::varchar,
   'Public'::varchar, false::boolean, NOW() - INTERVAL '12 hours', 156::bigint),
  -- Zeynep — Veri kalitesi (popüler)
  ('13000000-0000-4000-8000-000000000005'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,
   'Veri kalitesi her zaman ML modelinden önemlidir. Ne kadar gelişmiş transformer kullanırsanız kullanın, kirli veriden kirli tahmin üretir. Çekirdek veri doğrulama pattern''lerimiz: 1) Schema validation (Pydantic) 2) Duplicate detection 3) Outlier detection (IQR) 4) Distribution drift monitoring. Bu dört katman prodüksiyon hatasını %80 azalttı. @canozturk altyapıyı sen kurmuştun, teşekkürler! #veribilimi #ml #dataquality',
   ARRAY['@canozturk']::text[], ARRAY['veribilimi','ml','dataquality']::text[],
   'https://github.com/zeynepdata/patterns'::varchar, 'Teknik paylaşım'::varchar,
   'Public'::varchar, false::boolean, NOW() - INTERVAL '6 days', 2103::bigint),
  -- Zeynep — Feature store
  ('13000000-0000-4000-8000-000000000006'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,
   'Feature store kavramını duymayan kalmıştır umarım. Eğitim ve çıkarım zamanı arasında feature tutarlılığını sağlayan kritik altyapı. Feast ve Tecton''u karşılaştırdık, küçük ekipler için Feast yeterli. Siz hangi feature store kullanıyorsunuz? #mlops #featurestore',
   ARRAY['@canozturk']::text[], ARRAY['mlops','featurestore']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '1 day', 534::bigint),
  -- Can — SRE
  ('13000000-0000-4000-8000-000000000007'::uuid,'11000000-0000-4000-8000-000000000004'::uuid,
   'SRE kültürü bir takım yapısı değil, zihniyet sorunudur. Hata bütçesi (error budget) kavramı herkesin aynı dili konuşmasını sağlar: ürün "daha hızlı" derken, mühendislik "daha istikrarlı" derken aynı şeyi tartışırız aslında. Geçen ay %99.95 yerine %99.5 SLA''ya düştük, otomatik feature freeze devreye girdi, iki haftada toparladık. #sre #devops #kultur',
   ARRAY[]::text[], ARRAY['sre','devops','kultur']::text[],
   'https://sre.google/sre-book/embracing-risk/'::varchar, NULL::varchar,
   'Public'::varchar, false::boolean, NOW() - INTERVAL '3 days', 1789::bigint),
  -- Can — Observability (ANKETLİ)
  ('13000000-0000-4000-8000-000000000008'::uuid,'11000000-0000-4000-8000-000000000004'::uuid,
   'Observability üç temel sütun: metrics, logs, traces. Ama çoğu ekip sadece metrics kullanıyor, gerisini "ileride ekleriz" diye erteliyor. Siz hangi yaklaşımı kullanıyorsunuz?',
   ARRAY[]::text[], ARRAY['observability','devops']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '18 hours', 645::bigint),
  -- Elif — Yaratıcılık (popüler)
  ('13000000-0000-4000-8000-000000000009'::uuid,'11000000-0000-4000-8000-000000000005'::uuid,
   'Yaratıcılık bir kas gibidir, her gün biraz çalıştırın. Sabah ilk uyanınca, telefona uzanmadan önce 5 dakika bir şey yazın. Önemsiz bir şey olabilir: bir rüya, bir duygu, bir niyet. 30 gün sonra geri okuyun, ne kadar değiştiğinizi göreceksiniz. Bu pratiği 2 yıldır yapıyorum, en verimli dönemim bu. #yaratıcılık #yazma #alışkanlık',
   ARRAY[]::text[], ARRAY['yaratıcılık','yazma','alışkanlık']::text[],
   NULL::varchar, 'Kişisel deneyim'::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '7 days', 3267::bigint),
  -- Elif — Sade anlatım
  ('13000000-0000-4000-8000-00000000000a'::uuid,'11000000-0000-4000-8000-000000000005'::uuid,
   'Karmaşık bir konuyu sade anlatmanın ilk kuralı: önce kendinize anlatın. İkinci kural: örnekler, kurallardan önce gelir. Üçüncü kural: analogi en güçlü silahınızdır. @mehmetdemir seninle yazı alışverişi yapabiliriz, @emrekaraca sen de katıl! #yazma #teknikyazarlık',
   ARRAY['@mehmetdemir','@emrekaraca']::text[], ARRAY['yazma','teknikyazarlık']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '20 hours', 289::bigint),
  -- Burak — Başarısızlık (en popüler)
  ('13000000-0000-4000-8000-00000000000b'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,
   'İki startup batırdım, üçüncüsünü büyütüyorum. En büyük öğrenim: ürün-market uyumunu "kullanıcı sayısı" ile değil, "kullanıcıların product''ı kullanma sıklığı" ile ölç. 1000 kayıttan 100''ü aktifse, product-market fit yok demektir. 100 kullanıcıdan 80''i haftalık aktifse, bir şeyler doğru gidiyor. Sayılarınıza dürüst olun. #girişimcilik #startup #productmarketfit',
   ARRAY[]::text[], ARRAY['girişimcilik','startup','productmarketfit']::text[],
   NULL::varchar, 'Kişisel deneyim'::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '4 days', 4521::bigint),
  -- Burak — İletişim aracı (ANKETLİ)
  ('13000000-0000-4000-8000-00000000000c'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,
   'Uzaktan çalışmada ekip iletişimi en kritik konu. Çok araç denedik, sonunda birkaçında kaldık. Sizin ana iletişim aracınız hangisi?',
   ARRAY[]::text[], ARRAY['uzaktançalışma','ekip']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '1 day', 567::bigint),
  -- Deniz — Growth deneyleri
  ('13000000-0000-4000-8000-00000000000d'::uuid,'11000000-0000-4000-8000-000000000007'::uuid,
   'Growth marketing''te tahmin değil, ölçüm vardır. Geçen ay bir A/B testinde "kırmızı buton mu yeşil buton mu" diye tartıştık. 2 haftalık test sonucu: yeşil buton %12 daha fazla dönüşüm verdi. @zeynepkaya veriyi sen analiz ettin, harika iş çıkardın. Deney kültürü olmayan şirkette growth olmaz. #growth #abtesting #veri',
   ARRAY['@zeynepkaya']::text[], ARRAY['growth','abtesting','veri']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '3 days', 1893::bigint),
  -- Deniz — SEO
  ('13000000-0000-4000-8000-00000000000e'::uuid,'11000000-0000-4000-8000-000000000007'::uuid,
   'SEO''da en çok yanılgı: "anahtar kelime ne kadar çok, o kadar iyi". Hayır. Bir içerik bir anahtar kelimeye odaklanmalı, ilgili LSI kelimelerle zenginleştirilmeli. Bot değil, insan için yazın. Tersini yaparsanız her iki taraf da kaybeder. #seo #içerik #pazarlama',
   ARRAY[]::text[], ARRAY['seo','içerik','pazarlama']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '15 hours', 412::bigint),
  -- Merve — Eleştirel düşünme
  ('13000000-0000-4000-8000-00000000000f'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,
   'Öğrencilere her yıl sorduğum soru: "En son ne zaman fikrini değiştirdin?" Çoğu hatırlayamıyor. Bu, eleştirel düşünmenin eksikliğidir. Fikrini değiştiremeyen öğrenemiyor demektir. Kanıta dayalı karar verme en güçlü araçtır. #akademik #eleştireldüşünme #öğrenme',
   ARRAY[]::text[], ARRAY['akademik','eleştireldüşünme','öğrenme']::text[],
   NULL::varchar, 'Uzun düşünce yazısı'::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '2 days', 876::bigint),
  -- Merve — Mentörlük
  ('13000000-0000-4000-8000-000000000010'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,
   'Mentörlük yapmak, mentörün de öğrendiği bir süreçtir. Her öğrenciye bir şey öğretirken, kendime iki şey öğreniyorum. Geçen hafta öğrencim "hoca bu algoritma neden O(n log n) değil de O(n²)?" diye sordu. Cevap verirken fark ettim: bazı durumlarda O(n²) daha hızlı. @emrekaraca @burakaydin bu konuyu konuşalım! #mentörlük #algoritma',
   ARRAY['@emrekaraca','@burakaydin']::text[], ARRAY['mentörlük','algoritma']::text[],
   NULL::varchar, NULL::varchar, 'Public'::varchar, false::boolean,
   NOW() - INTERVAL '8 hours', 234::bigint)
) AS v(id, author, text, mentions, hashtags, link, warning, vis, pinned, pub, views)
ON CONFLICT ("Id") DO UPDATE SET
  "Text" = EXCLUDED."Text",
  "Mentions" = EXCLUDED."Mentions",
  "Hashtags" = EXCLUDED."Hashtags",
  "LinkUrl" = EXCLUDED."LinkUrl",
  "ContentWarning" = EXCLUDED."ContentWarning",
  "ShareKind" = EXCLUDED."ShareKind",
  "ViewCount" = EXCLUDED."ViewCount",
  "PublishedAtUtc" = EXCLUDED."PublishedAtUtc",
  "UpdatedAtUtc" = NOW();

-- ===========================================================================
-- 2. ANKETLER (3 anket)
-- ===========================================================================
INSERT INTO content.polls ("Id","PostId","AuthorId","Question","AllowMultiple","ClosesAtUtc","CreatedAtUtc","Version")
VALUES
  ('14000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003',
   '11000000-0000-4000-8000-000000000002',
   'Hangi tasarım sistemi yaklaşımını tercih ediyorsunuz?', false,
   NOW() + INTERVAL '7 days', NOW() - INTERVAL '4 days', 0),
  ('14000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000008',
   '11000000-0000-4000-8000-000000000004',
   'Hangi gözlemlenebilirlik yaklaşımını kullanıyorsunuz?', false,
   NOW() + INTERVAL '5 days', NOW() - INTERVAL '18 hours', 0),
  ('14000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-00000000000c',
   '11000000-0000-4000-8000-000000000006',
   'Uzaktan çalışmada hangi araçları kullanıyorsunuz? (Birden fazla)', true,
   NOW() + INTERVAL '10 days', NOW() - INTERVAL '1 day', 0)
ON CONFLICT ("PostId") DO UPDATE SET
  "Question" = EXCLUDED."Question",
  "AllowMultiple" = EXCLUDED."AllowMultiple",
  "ClosesAtUtc" = EXCLUDED."ClosesAtUtc";

-- ===========================================================================
-- 3. ANKET SEÇENEKLERİ
-- ===========================================================================
INSERT INTO content.poll_options ("Id","PollId","Text","VoteCount")
VALUES
  ('15000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','Atomik tasarım (Brad Frost)', 12),
  ('15000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','Token hiyerarşisi', 18),
  ('15000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000001','Bileşen odaklı', 9),
  ('15000000-0000-4000-8000-000000000004','14000000-0000-4000-8000-000000000001','Henüz metodoloji yok', 4),
  ('15000000-0000-4000-8000-000000000005','14000000-0000-4000-8000-000000000002','Sadece metrics (Prometheus)', 7),
  ('15000000-0000-4000-8000-000000000006','14000000-0000-4000-8000-000000000002','Metrics + Logs (Loki/ELK)', 14),
  ('15000000-0000-4000-8000-000000000007','14000000-0000-4000-8000-000000000002','Tam OpenTelemetry stack', 11),
  ('15000000-0000-4000-8000-000000000008','14000000-0000-4000-8000-000000000002','Henüz yok', 3),
  ('15000000-0000-4000-8000-000000000009','14000000-0000-4000-8000-000000000003','Slack', 22),
  ('15000000-0000-4000-8000-00000000000a','14000000-0000-4000-8000-000000000003','Microsoft Teams', 8),
  ('15000000-0000-4000-8000-00000000000b','14000000-0000-4000-8000-000000000003','Discord', 15),
  ('15000000-0000-4000-8000-00000000000c','14000000-0000-4000-8000-000000000003','Email (hala!)', 6)
ON CONFLICT ("PollId","Id") DO UPDATE SET
  "Text" = EXCLUDED."Text",
  "VoteCount" = EXCLUDED."VoteCount";

-- Anket oyları
INSERT INTO content.poll_ballots ("PollId","ActorId","OptionIds","CastAtUtc")
VALUES
  ('14000000-0000-4000-8000-000000000001','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   ARRAY['15000000-0000-4000-8000-000000000002']::uuid[], NOW() - INTERVAL '3 days'),
  ('14000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
   ARRAY['15000000-0000-4000-8000-000000000002']::uuid[], NOW() - INTERVAL '3 days'),
  ('14000000-0000-4000-8000-000000000002','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   ARRAY['15000000-0000-4000-8000-000000000007']::uuid[], NOW() - INTERVAL '1 day'),
  ('14000000-0000-4000-8000-000000000003','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   ARRAY['15000000-0000-4000-8000-000000000009','15000000-0000-4000-8000-00000000000b']::uuid[], NOW() - INTERVAL '20 hours')
ON CONFLICT ("PollId","ActorId") DO UPDATE SET
  "OptionIds" = EXCLUDED."OptionIds",
  "CastAtUtc" = EXCLUDED."CastAtUtc";

-- ===========================================================================
-- 4. TEPKİLER
-- ===========================================================================
INSERT INTO reactions.reactions ("Id","ActorId","ContentId","Kind","IsActive","CreatedAtUtc","UpdatedAtUtc","Version")
SELECT id, actor, content_id, kind, true, created, created, 0
FROM (VALUES
  ('16000000-0000-4000-8000-000000000001'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,'Like'::varchar,NOW() - INTERVAL '4 days'),
  ('16000000-0000-4000-8000-000000000002'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,'Insightful'::varchar,NOW() - INTERVAL '4 days'),
  ('16000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000004'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,'Like'::varchar,NOW() - INTERVAL '3 days'),
  ('16000000-0000-4000-8000-000000000004'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,'Love'::varchar,NOW() - INTERVAL '3 days'),
  ('16000000-0000-4000-8000-000000000005'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,'Like'::varchar,NOW() - INTERVAL '5 days'),
  ('16000000-0000-4000-8000-000000000006'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,'Insightful'::varchar,NOW() - INTERVAL '5 days'),
  ('16000000-0000-4000-8000-000000000007'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,'Like'::varchar,NOW() - INTERVAL '5 days'),
  ('16000000-0000-4000-8000-000000000008'::uuid,'11000000-0000-4000-8000-000000000004'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,'Insightful'::varchar,NOW() - INTERVAL '4 days'),
  ('16000000-0000-4000-8000-000000000009'::uuid,'11000000-0000-4000-8000-000000000007'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,'Like'::varchar,NOW() - INTERVAL '4 days'),
  ('16000000-0000-4000-8000-00000000000a'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000007'::uuid,'Like'::varchar,NOW() - INTERVAL '2 days'),
  ('16000000-0000-4000-8000-00000000000b'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'13000000-0000-4000-8000-000000000007'::uuid,'Insightful'::varchar,NOW() - INTERVAL '2 days'),
  ('16000000-0000-4000-8000-00000000000c'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'13000000-0000-4000-8000-000000000007'::uuid,'Love'::varchar,NOW() - INTERVAL '2 days'),
  ('16000000-0000-4000-8000-00000000000d'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000009'::uuid,'Like'::varchar,NOW() - INTERVAL '6 days'),
  ('16000000-0000-4000-8000-00000000000e'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,'13000000-0000-4000-8000-000000000009'::uuid,'Like'::varchar,NOW() - INTERVAL '6 days'),
  ('16000000-0000-4000-8000-00000000000f'::uuid,'11000000-0000-4000-8000-000000000007'::uuid,'13000000-0000-4000-8000-000000000009'::uuid,'Like'::varchar,NOW() - INTERVAL '5 days'),
  ('16000000-0000-4000-8000-000000000010'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'13000000-0000-4000-8000-000000000009'::uuid,'Insightful'::varchar,NOW() - INTERVAL '5 days'),
  ('16000000-0000-4000-8000-000000000011'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,'Like'::varchar,NOW() - INTERVAL '3 days'),
  ('16000000-0000-4000-8000-000000000012'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,'Insightful'::varchar,NOW() - INTERVAL '3 days'),
  ('16000000-0000-4000-8000-000000000013'::uuid,'11000000-0000-4000-8000-000000000005'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,'Love'::varchar,NOW() - INTERVAL '3 days'),
  ('16000000-0000-4000-8000-000000000014'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,'Like'::varchar,NOW() - INTERVAL '2 days'),
  ('16000000-0000-4000-8000-000000000015'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-00000000000d'::uuid,'Like'::varchar,NOW() - INTERVAL '2 days'),
  ('16000000-0000-4000-8000-000000000016'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'13000000-0000-4000-8000-00000000000d'::uuid,'Insightful'::varchar,NOW() - INTERVAL '2 days'),
  ('16000000-0000-4000-8000-000000000017'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-00000000000f'::uuid,'Like'::varchar,NOW() - INTERVAL '1 day'),
  ('16000000-0000-4000-8000-000000000018'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'13000000-0000-4000-8000-00000000000f'::uuid,'Insightful'::varchar,NOW() - INTERVAL '1 day')
) AS v(id, actor, content_id, kind, created)
ON CONFLICT ("ActorId","ContentId") DO UPDATE SET
  "Kind" = EXCLUDED."Kind", "IsActive" = true, "UpdatedAtUtc" = NOW();

-- ===========================================================================
-- 5. YORUMLAR
-- ===========================================================================
INSERT INTO comments.comments ("Id","AuthorId","ContentId","ParentId","Depth","Text","Mentions","Status","CreatedAtUtc","UpdatedAtUtc","Version")
SELECT id, author, content_id, NULL::uuid, 0, text, mentions, 'Visible', created, created, 0
FROM (VALUES
  ('17000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,
   'Zoneless''a geçişte injection context içinde schedule çalıştırıyoruz, sorunsuz. Paylaşım için teşekkürler!'::varchar, ARRAY['@ayseyilmaz']::text[],NOW() - INTERVAL '4 days'),
  ('17000000-0000-4000-8000-000000000002'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,
   'Bu çok değerli bir deneyim paylaşımı. Detaylı yazıyı sabırsızlıkla bekliyorum.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '3 days'),
  ('17000000-0000-4000-8000-000000000003'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,
   'Distribution drift monitoring için hangi aracı kullanıyorsunuz? Evidently mi, NannyML mi?'::varchar, ARRAY['@zeynepkaya']::text[],NOW() - INTERVAL '5 days'),
  ('17000000-0000-4000-8000-000000000004'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,
   'NannyML kullanıyoruz, churn tahminlerinde çok işe yarıyor. Pydantic validation olmazsa olmaz.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '4 days'),
  ('17000000-0000-4000-8000-000000000005'::uuid,'11000000-0000-4000-8000-000000000007'::uuid,'13000000-0000-4000-8000-000000000005'::uuid,
   'A/B testing''te de benzer validation pattern''leri kullanıyoruz, ürün tarafında da veri kalitesi kritik.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '4 days'),
  ('17000000-0000-4000-8000-000000000006'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000007'::uuid,
   'Hata bütçesi kavramı gerçekten oyunun kurallarını değiştiriyor.'::varchar, ARRAY['@canozturk']::text[],NOW() - INTERVAL '2 days'),
  ('17000000-0000-4000-8000-000000000007'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'13000000-0000-4000-8000-000000000007'::uuid,
   'Bizim startup''ta error budget henüz uygulamadık, ama bu paylaşım ikna oldu. Pazartesi ekibe sunacağım.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '2 days'),
  ('17000000-0000-4000-8000-000000000008'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,'13000000-0000-4000-8000-000000000009'::uuid,
   'Sabah yazma pratiğini ben de yapıyorum, 90 gündür. En verimli dönemim bu, kesinlikle tavsiye ederim.'::varchar, ARRAY['@elifsahin']::text[],NOW() - INTERVAL '6 days'),
  ('17000000-0000-4000-8000-000000000009'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-000000000009'::uuid,
   'Bu pratiği 30 gün denemeye karar verdim. Teşekkürler ilham için!'::varchar, ARRAY[]::text[],NOW() - INTERVAL '5 days'),
  ('17000000-0000-4000-8000-00000000000a'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,
   'Aktif kullanıcı metrik olarak weekly active''ı kullanıyoruz, ama product-market fit için retention cohort''lara bakıyoruz.'::varchar, ARRAY['@burakaydin']::text[],NOW() - INTERVAL '3 days'),
  ('17000000-0000-4000-8000-00000000000b'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,
   'Başarısızlıkları paylaşmak çok değerli. Akademik dünyada da yayınlanmayan negatif sonuçlar büyük kayıp.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '2 days'),
  ('17000000-0000-4000-8000-00000000000c'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-00000000000b'::uuid,
   'Retention W4''ü (4. hafta retention) ürün-market fit göstergesi olarak kullanıyoruz, %40 üstü hedefliyoruz.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '2 days'),
  ('17000000-0000-4000-8000-00000000000d'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'13000000-0000-4000-8000-00000000000f'::uuid,
   '"En son ne zaman fikrini değiştirdin?" sorusu gerçekten düşündürücü.'::varchar, ARRAY['@mervearslan']::text[],NOW() - INTERVAL '1 day'),
  ('17000000-0000-4000-8000-00000000000e'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'13000000-0000-4000-8000-00000000000f'::uuid,
   'Mentörlükte öğrenci soruları gerçekten en büyük öğrenim kaynağı.'::varchar, ARRAY[]::text[],NOW() - INTERVAL '12 hours')
) AS v(id, author, content_id, text, mentions, created)
ON CONFLICT ("Id") DO UPDATE SET
  "Text" = EXCLUDED."Text", "Mentions" = EXCLUDED."Mentions", "Status" = 'Visible', "UpdatedAtUtc" = NOW();

-- Gerçek iki seviyeli yorum zincirleri. Sabit kimlikler tekrar çalıştırmada
-- aynı yanıtları günceller; yeni satır çoğaltmaz.
INSERT INTO comments.comments
  ("Id","AuthorId","ContentId","ParentId","Depth","Text","Mentions","Status","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  ('17000000-0000-4000-8000-00000000000f','11000000-0000-4000-8000-000000000001',
   '13000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002',1,
   'Kesinlikle. Yazıda özellikle eski NgZone bağımlılıklarını nasıl ayıkladığımızı da göstereceğim.',
   ARRAY['@emrekaraca']::text[],'Visible',NOW() - INTERVAL '2 days',NOW() - INTERVAL '2 days',0),
  ('17000000-0000-4000-8000-000000000010','11000000-0000-4000-8000-000000000006',
   '13000000-0000-4000-8000-00000000000b','17000000-0000-4000-8000-00000000000c',1,
   'W4 retention hedefi çok iyi bir referans. Segmentlere göre dağılımı da ayrı izlemek resmi netleştiriyor.',
   ARRAY['@emrekaraca']::text[],'Visible',NOW() - INTERVAL '1 day',NOW() - INTERVAL '1 day',0)
ON CONFLICT ("Id") DO UPDATE SET
  "ParentId"=EXCLUDED."ParentId", "Depth"=EXCLUDED."Depth", "Text"=EXCLUDED."Text",
  "Mentions"=EXCLUDED."Mentions", "Status"='Visible', "UpdatedAtUtc"=NOW();

-- Önceki doğrulama turlarında ana fixture hesabında oluşturulmuş görünen test
-- metinlerini silmeden, aynı kayıtlar üzerinde doğal sosyal paylaşımlara taşır.
-- Metin koşulu kullanıcı daha sonra kaydı değiştirdiyse üstüne yazılmasını önler.
UPDATE content.posts SET "Text"='İlk kahvemi alıp haftalık mimari notlarını toparladım. Küçük kararların birkaç sprint sonra nasıl büyüdüğünü görmek hâlâ şaşırtıyor. #yazılım #mimari',
  "Hashtags"=ARRAY['yazılım','mimari']::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='8196ea8a-b393-4479-ac78-f49ce1657ec6' AND "Text"='ilk yorum';
UPDATE content.posts SET "Text"='Akış servisindeki sınırları yeniden gözden geçirdik. Okuma modeli sadeleştikçe ekipteki konuşmalar da netleşiyor. #ürünmühendisliği',
  "Hashtags"=ARRAY['ürünmühendisliği']::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='ca6b6774-5d6b-4fd2-bdf1-27ec419ce23f' AND "Text" LIKE 'Demo akışındaki%';
UPDATE content.posts SET "Text"='Bu hafta ekipçe yorum, bildirim ve mesaj akışlarının birbirini nasıl beslediğini konuştuk. En iyi ürün ayrıntıları çoğu zaman bu küçük geçişlerde saklı.',
  "Hashtags"='{}'::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='ffb044dd-54fc-47f8-aad8-6f4b8a7a793e' AND "Text" LIKE 'ZosyalMedya demo%';
UPDATE content.posts SET "Text"='Bir gönderiyi yayımlamadan önce kendime üç soru soruyorum: Kime sesleniyor, neyi netleştiriyor, okuyan kişi buradan neyle ayrılıyor?',
  "Hashtags"='{}'::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='7c78a03a-fcb7-43b0-b585-00a0d1160b0c' AND "Text" LIKE 'Composer%';
UPDATE content.posts SET "Text"='Dağıtık ekiplerde güveni araçlar değil, düzenli geri bildirim ve açık karar kayıtları kuruyor. Bu hafta en çok bunu düşündüm. #ekip #iletişim',
  "Hashtags"=ARRAY['ekip','iletişim']::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='c2dcb24f-a75b-4792-94d1-03560e3f2863' AND "Text" LIKE 'V3 yerel demo:%';
UPDATE content.posts SET "Text"='İyi bir ürün turu özellik listesinden çok bir hikâye anlatmalı: keşfet, bağ kur, üret, geri dön. Akış tasarlarken bu sırayı masada tutuyorum. #ürün',
  "Hashtags"=ARRAY['ürün']::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='89437b17-8f5f-4121-a748-9237dff1f973' AND "Text" LIKE 'V3 yerel demo:%';
UPDATE content.posts SET "Text"='Bir sosyal üründe sizi geri getiren şey hangisi: iyi sohbetler, yakın çevrenizin paylaşımları, topluluklar yoksa kaydettiğiniz içerikler? #ürünaraştırması',
  "Hashtags"=ARRAY['ürünaraştırması']::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='47989473-7fcc-43c8-a8ed-cea8bbfb1552' AND "Text" LIKE 'Demo sırasında%';
UPDATE content.posts SET "Text"='Erişilebilirlik kontrolünü son adım değil, tasarım kararının parçası yaptığımızda ürünün dili de sadeleşiyor. Klavye ile bir tur atmak bazen saatlerce doküman okumaktan daha öğretici. #erişilebilirlik',
  "Hashtags"=ARRAY['erişilebilirlik']::text[], "UpdatedAtUtc"=NOW()
WHERE "Id"='ed6cf9d6-ca15-48a2-9d34-ffa102d938cf' AND "Text" LIKE 'Erişilebilirlik kontrolü demo%';
UPDATE content.posts SET "Text"='Öğle arasında gökyüzündeki ışık bir anda değişti; ofiste herkes pencerenin önünde buluştu. Günün en plansız ama en güzel molasıydı.',
  "UpdatedAtUtc"=NOW()
WHERE "Id"='333e86d8-2832-44ca-97f8-86643c504d05' AND "Text"='Güneş tutulması olmuş bugün';

COMMIT;
