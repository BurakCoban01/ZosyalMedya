-- ============================================================================
-- Enterprise Social & Community Platform — Gerçekçi Türkçe Demo Veri Seed Script
-- ----------------------------------------------------------------------------
-- Idempotent: güvenle tekrar tekrar çalıştırılabilir.
--   - Kullanıcılar/profiller: ON CONFLICT DO UPDATE (upsert)
--   - Diğer varlıklar: sabit UUID + ON CONFLICT DO NOTHING / DO UPDATE
-- Çalıştırma:
--   docker cp scripts\seed-demo-data.sql zosyalmedya-postgres-1:/tmp/seed1.sql
--   docker exec zosyalmedya-postgres-1 psql -U zosyalmedya -d zosyalmedya -v ON_ERROR_STOP=1 -f /tmp/seed1.sql
-- ----------------------------------------------------------------------------
-- Sabit UUID adlandırma şeması (hex son grup):
--   1100...  Kullanıcılar       1200...  Profiller
--   1300...  Gönderiler         1400...  Anketler
--   1500...  Anket seçenekleri   1600...  Tepkiler
--   1700...  Yorumlar           1800...  Konuşmalar
--   1900...  Mesajlar           1a00...  Sorular
--   1b00...  Bildirimler        1c00...  Topluluklar
--   1d00...  Şikayetler         1e00...  Vakalar
--   1f00...  Kayıtlı içerik     2000...  Denetim günlüğü
-- ============================================================================

BEGIN;
SET client_encoding TO 'UTF8';

-- Ana sunum hesabının sabit kimliği
-- 8c956dd6-2194-4d52-938a-dde1e5fd6264

-- Önceki yerel fixture handle'larını aynı sabit kimlikler üzerinde doğal
-- kullanıcı adlarına taşır. İlişkiler ve kullanıcı üretimi içerikler korunur.
UPDATE identity.users AS existing SET
  "Username"=fixture.username,
  "NormalizedUsername"=upper(fixture.username),
  "Email"=fixture.email,
  "NormalizedEmail"=upper(fixture.email),
  "UpdatedAtUtc"=NOW()
FROM (VALUES
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'emrekaraca','emre.karaca@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000001'::uuid,'ayseyilmaz','ayse.yilmaz@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000002'::uuid,'mehmetdemir','mehmet.demir@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000003'::uuid,'zeynepkaya','zeynep.kaya@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000004'::uuid,'canozturk','can.ozturk@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000005'::uuid,'elifsahin','elif.sahin@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000006'::uuid,'burakaydin','burak.aydin@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000007'::uuid,'denizcelik','deniz.celik@demo.escp.test'),
  ('11000000-0000-4000-8000-000000000008'::uuid,'mervearslan','merve.arslan@demo.escp.test')
) AS fixture(id,username,email)
WHERE existing."Id"=fixture.id;

-- ===========================================================================
-- 0. Ana sunum hesabını deterministik ve doğrulanmış olarak hazırla.
--    Bu ASP.NET Core Identity V3 özeti yalnızca yerel fixture hesabı içindir;
--    üretim hesabında kullanılmaz.
-- ===========================================================================
INSERT INTO identity.users
  ("Id","Username","NormalizedUsername","Email","NormalizedEmail",
   "PasswordHash","Status","FailedLoginCount","LockedUntilUtc",
   "CreatedAtUtc","UpdatedAtUtc","Version","Roles","MfaEnabled")
VALUES
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','emrekaraca','EMREKARACA',
   'emre.karaca@demo.escp.test','EMRE.KARACA@DEMO.ESCP.TEST',
   :'fixture_password_hash',
   'Active',0,NULL,NOW() - INTERVAL '30 days',NOW(),0,
   '{Member,Administrator}',false)
ON CONFLICT ("NormalizedUsername") DO UPDATE SET
  "PasswordHash"    = EXCLUDED."PasswordHash",
  "Status"          = 'Active',
  "FailedLoginCount"= 0,
  "LockedUntilUtc"  = NULL,
  "Roles"           = '{Member,Administrator}',
  "MfaEnabled"      = false,
  "UpdatedAtUtc"    = NOW()
WHERE identity.users."Id" = EXCLUDED."Id";

-- ===========================================================================
-- 1. Sekiz doğal Türkçe sosyal profil (upsert)
--    PasswordHash ana sunum hesabından kopyalanır.
-- ===========================================================================
INSERT INTO identity.users
  ("Id","Username","NormalizedUsername","Email","NormalizedEmail",
   "PasswordHash","Status","FailedLoginCount","CreatedAtUtc","UpdatedAtUtc",
   "Version","Roles","MfaEnabled")
VALUES
  ('11000000-0000-4000-8000-000000000001','ayseyilmaz','AYSEYILMAZ','ayse.yilmaz@demo.escp.test','AYSE.YILMAZ@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '20 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000002','mehmetdemir','MEHMETDEMIR','mehmet.demir@demo.escp.test','MEHMET.DEMIR@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '19 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000003','zeynepkaya','ZEYNEPKAYA','zeynep.kaya@demo.escp.test','ZEYNEP.KAYA@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '18 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000004','canozturk','CANOZTURK','can.ozturk@demo.escp.test','CAN.OZTURK@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '17 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000005','elifsahin','ELIFSAHIN','elif.sahin@demo.escp.test','ELIF.SAHIN@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '16 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000006','burakaydin','BURAKAYDIN','burak.aydin@demo.escp.test','BURAK.AYDIN@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '15 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000007','denizcelik','DENIZCELIK','deniz.celik@demo.escp.test','DENIZ.CELIK@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '14 days', NOW(), 0, '{Member}', false),
  ('11000000-0000-4000-8000-000000000008','mervearslan','MERVEARSLAN','merve.arslan@demo.escp.test','MERVE.ARSLAN@DEMO.ESCP.TEST',
   (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),'Active',0,
   NOW() - INTERVAL '13 days', NOW(), 0, '{Member}', false)
ON CONFLICT ("NormalizedUsername") DO UPDATE SET
  "Status"        = 'Active',
  "PasswordHash"  = (SELECT "PasswordHash" FROM identity.users WHERE "Id"='8c956dd6-2194-4d52-938a-dde1e5fd6264'),
  "UpdatedAtUtc"  = NOW()
WHERE identity.users."Id" = EXCLUDED."Id";

DO $$
DECLARE fixture_count integer;
BEGIN
  SELECT count(*) INTO fixture_count
  FROM identity.users AS existing
  JOIN (VALUES
    ('8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'EMREKARACA'),
    ('11000000-0000-4000-8000-000000000001'::uuid,'AYSEYILMAZ'),
    ('11000000-0000-4000-8000-000000000002'::uuid,'MEHMETDEMIR'),
    ('11000000-0000-4000-8000-000000000003'::uuid,'ZEYNEPKAYA'),
    ('11000000-0000-4000-8000-000000000004'::uuid,'CANOZTURK'),
    ('11000000-0000-4000-8000-000000000005'::uuid,'ELIFSAHIN'),
    ('11000000-0000-4000-8000-000000000006'::uuid,'BURAKAYDIN'),
    ('11000000-0000-4000-8000-000000000007'::uuid,'DENIZCELIK'),
    ('11000000-0000-4000-8000-000000000008'::uuid,'MERVEARSLAN')
  ) AS fixture(id, normalized_username)
    ON existing."Id"=fixture.id
   AND existing."NormalizedUsername"=fixture.normalized_username;

  IF fixture_count <> 9 THEN
    RAISE EXCEPTION 'Fixture kullanıcı adı başka bir hesaba ait; paylaşılan hesap değiştirilmedi.';
  END IF;
END $$;

-- ===========================================================================
-- 2. Profiller (upsert)
--    Ana hesabın kimliği de doğal bir ürün-profili olarak tutulur.
-- ===========================================================================
INSERT INTO profiles.profiles
  ("Id","OwnerId","Handle","NormalizedHandle","DisplayName","Biography",
   "Location","Organization","WebsiteUrl","IsPrivate","IsVerified",
   "Theme","Language","ReduceMotion","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  -- Emre Karaca (var olan profil OwnerId üzerinden güncellenir)
  ('12000000-0000-4000-8000-000000000000','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   'emrekaraca','EMREKARACA','Emre Karaca',
   'Yazılım mimarı. Modüler sistemler, ürün mühendisliği ve ekiplerin sürdürülebilir hız kurması üzerine notlar paylaşıyorum. Hafta sonları analog fotoğraf ve iyi kahve peşindeyim.',
   'İstanbul','Kuzey Labs','https://example.com/emrekaraca',false,true,'Light','Turkish',false,
   NOW() - INTERVAL '30 days', NOW(), 0),

  -- ayseyilmaz
  ('12000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
   'ayseyilmaz','AYSEYILMAZ','Ayşe Yılmaz',
   'Kıdemli Frontend Mühendisi. Angular, Signals ve zoneless change detection üzerine çalışıyorum. Tasarım sistemleri ve erişilebilirlik benim için tutku. Açık kaynak katkıcısı.',
   'İstanbul','TechCorp','https://example.com/ayseyilmaz',false,false,'Dark','Turkish',false,
   NOW() - INTERVAL '20 days', NOW(), 0),

  -- mehmetdemir
  ('12000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002',
   'mehmetdemir','MEHMETDEMIR','Mehmet Demir',
   'Ürün Tasarımcısı & UX Araştırmacısı. Tasarım sistemleri, tasarım tokenları ve kapsayıcı (erişilebilir) ürün deneyimi üzerine yazıyorum. Her iyi arayüzün arkasında empati vardır.',
   'İstanbul','DesignLab','https://example.com/mehmetdemir',false,false,'Light','Turkish',true,
   NOW() - INTERVAL '19 days', NOW(), 0),

  -- zeynepkaya
  ('12000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003',
   'zeynepkaya','ZEYNEPKAYA','Zeynep Kaya',
   'Veri Bilimci & ML Mühendisi. Veri kalitesi, özellik mühendisliği ve MLOps üzerine çalışıyorum. İnanıyorum ki kirli veriden hiçbir model kurtaramaz sizi.',
   'Ankara','DataInsights','https://example.com/zeynepkaya',false,false,'Dark','Turkish',false,
   NOW() - INTERVAL '18 days', NOW(), 0),

  -- canozturk
  ('12000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000004',
   'canozturk','CANOZTURK','Can Öztürk',
   'DevOps & Platform Mühendisi. Kubernetes, observability ve SRE kültürü üzerine içerik üretiyorum. Sistemlerin sağlıklı olması, özelliklerden daha önemlidir.',
   'İzmir','CloudSys','https://example.com/canozturk',false,true,'Dark','Turkish',false,
   NOW() - INTERVAL '17 days', NOW(), 0),

  -- elifsahin
  ('12000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000005',
   'elifsahin','ELIFSAHIN','Elif Şahin',
   'İçerik Üreticisi & Teknik Yazar. Karmaşık konuları sade bir dille anlatmaya çalışıyorum. Yaratıcılık bir kas gibidir, her gün biraz çalıştırın.',
   'İstanbul','Bağımsız','https://example.com/elifsahin',false,false,'Light','Turkish',false,
   NOW() - INTERVAL '16 days', NOW(), 0),

  -- burakaydin
  ('12000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000006',
   'burakaydin','BURAKAYDIN','Burak Aydın',
   'Girişimci & Mentor. İki startup kuran, üçüncüsünü büyüten biri olarak deneyimlerimi paylaşıyorum. Başarı hikayelerinden çok, başarısızlıklardan öğrenin.',
   'Ankara','StartupHub','https://example.com/burakaydin',false,true,'Light','Turkish',false,
   NOW() - INTERVAL '15 days', NOW(), 0),

  -- denizcelik
  ('12000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000007',
   'denizcelik','DENIZCELIK','Deniz Çelik',
   'Pazarlama & Growth Uzmanı. Veri odaklı büyüme stratejileri, deney kültürü ve ürün pazarlaması üzerine çalışıyorum. Tahmin değil, ölçüm.',
   'Bursa','GrowthCo','https://example.com/denizcelik',false,false,'Light','Turkish',false,
   NOW() - INTERVAL '14 days', NOW(), 0),

  -- mervearslan
  ('12000000-0000-4000-8000-000000000008','11000000-0000-4000-8000-000000000008',
   'mervearslan','MERVEARSLAN','Merve Arslan',
   'Akademisyen & Araştırmacı. Bilgisayar bilimleri dersleri veriyor, yazılım mühendisliği süreçleri üzerine araştırmalar yapıyorum. Eleştirel düşünmeyi öğretmek en büyük misyonum.',
   'İzmir','Dokuz Eylül Üniversitesi','https://example.com/mervearslan',true,false,'Light','Turkish',false,
   NOW() - INTERVAL '13 days', NOW(), 0)
ON CONFLICT ("OwnerId") DO UPDATE SET
  "Handle"            = EXCLUDED."Handle",
  "NormalizedHandle"  = EXCLUDED."NormalizedHandle",
  "DisplayName"       = EXCLUDED."DisplayName",
  "Biography"         = EXCLUDED."Biography",
  "Location"          = EXCLUDED."Location",
  "Organization"      = EXCLUDED."Organization",
  "WebsiteUrl"        = EXCLUDED."WebsiteUrl",
  "IsPrivate"         = EXCLUDED."IsPrivate",
  "Theme"             = EXCLUDED."Theme",
  "Language"          = EXCLUDED."Language",
  "ReduceMotion"      = EXCLUDED."ReduceMotion",
  "UpdatedAtUtc"      = NOW();

-- ===========================================================================
-- 3. Sosyal Graf (~29 ilişki)
--    Emre <-> 8 kullanıcı (karşılıklı), çapraz ilişkiler, 1 engelleme.
-- ===========================================================================
INSERT INTO social_graph.relationships
  ("Id","ActorId","TargetId","FollowState","IsBlocked","IsMuted","IsCloseFriend",
   "CreatedAtUtc","UpdatedAtUtc","Version")
SELECT
  gen_random_uuid(),
  actor::uuid, target::uuid, state::varchar,
  blocked::boolean, muted::boolean, close::boolean,
  NOW() - (random() * INTERVAL '10 days'), NOW(), 0
FROM (VALUES
  -- Emre 8 kullanıcıyı takip eder
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000001','Following',false,false,true),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000002','Following',false,false,false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000003','Following',false,false,true),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000004','Following',false,false,false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000005','Following',false,false,false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000006','Following',false,false,false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000007','Following',false,false,false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000008','Following',false,false,false),
  -- 8 kullanıcı Emre'yi takip eder
  ('11000000-0000-4000-8000-000000000001','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000002','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000003','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,true),
  ('11000000-0000-4000-8000-000000000004','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000005','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000006','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000007','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000008','8c956dd6-2194-4d52-938a-dde1e5fd6264','Following',false,false,false),
  -- Emre akışında iki medyalı üreticiyle karşılıklı bağ
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000001','Following',false,false,false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000002','Following',false,false,false),
  -- ayse <-> mehmet
  ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Following',false,false,false),
  -- zeynep <-> can
  ('11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004','Following',false,false,true),
  ('11000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000003','Following',false,false,false),
  -- elif <-> deniz
  ('11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000007','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000005','Following',false,false,false),
  -- burak <-> merve
  ('11000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000008','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000008','11000000-0000-4000-8000-000000000006','Following',false,false,false),
  -- çapraz ilişkiler (mükerrer (ActorId,TargetId) yok)
  ('11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000005','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000006','Following',false,false,false),
  ('11000000-0000-4000-8000-000000000008','11000000-0000-4000-8000-000000000001','Following',false,false,false),
  -- elifsahin -> private mervearslan: gerçek bekleyen takip isteği
  ('11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000008','Pending',false,false,false)
) AS v(actor, target, state, blocked, muted, close)
ON CONFLICT ("ActorId","TargetId") DO NOTHING;

-- Engelleme: var olan outsider kullanıcısı Emre'yi engeller
-- (gerçek outsider yoksa sessizce atlanır)
INSERT INTO social_graph.relationships
  ("Id","ActorId","TargetId","FollowState","IsBlocked","IsMuted","IsCloseFriend",
   "CreatedAtUtc","UpdatedAtUtc","Version")
SELECT
  gen_random_uuid(),
  (SELECT "Id" FROM identity.users WHERE "Username"='outsider223d2366dc'),
  '8c956dd6-2194-4d52-938a-dde1e5fd6264',
  'None', true, true, false,
  NOW() - INTERVAL '2 days', NOW(), 0
WHERE EXISTS (SELECT 1 FROM identity.users WHERE "Username"='outsider223d2366dc')
ON CONFLICT ("ActorId","TargetId") DO NOTHING;

COMMIT;
