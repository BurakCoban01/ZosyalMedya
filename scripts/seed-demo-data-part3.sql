-- ============================================================================
-- Enterprise Social & Community Platform — Demo Veri Seed Script (Part 3: Sorular/Mesajlasma/Topluluk/Bildirim/Yonetim)
-- Part 1 + Part 2 sonrasi calistirilir. Idempotent.
-- ============================================================================

BEGIN;
SET client_encoding TO 'UTF8';

-- Emre Karaca Id: 8c956dd6-2194-4d52-938a-dde1e5fd6264

-- ===========================================================================
-- 1. SORULAR (6 soru - Emre Karaca'ya)
-- ===========================================================================
INSERT INTO questions.questions
  ("Id","SenderId","TargetId","Body","IsAnonymous","Audience","Status",
   "AnswerBody","PublishAtUtc","AnsweredAtUtc","CreatedAtUtc","UpdatedAtUtc","Version")
SELECT id, sender, target, body, anon, audience, status, answer, pub, answered, created, created, 0
FROM (VALUES
  ('1a000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Modüler monolith ile microservices arasında karar vermeye çalışıyorum, hangi kriterler için monolith önerirsin?'::varchar,
   false, 'Public'::varchar, 'Answered'::varchar,
   'Ekip 20 kişiden küçükse ve domain sınırları net değilse modüler monolith. Bounded contextler olgunlaştıkça parçalayabilirsiniz. Önce monoliti doğru tasarla.'::varchar,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 days'),
  ('1a000000-0000-4000-8000-000000000002'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Junior bir geliştirici olarak kariyerime nasıl yön vermeliyim? Frontend mi backend mi?'::varchar,
   true, 'Public'::varchar, 'Answered'::varchar,
   'Önce temelleri öğren: veri yapıları, algoritmalar, ağ, işletim sistemleri. Sonra her ikisine de dokun, hangisi seni daha çok heyecanlandırıyorsa onu derinleş. T-shape olmak en iyisi.'::varchar,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'),
  ('1a000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'En sevdiğin teknik kitap hangisi?'::varchar,
   false, 'Public'::varchar, 'Published'::varchar, ''::varchar,
   NULL, NULL, NOW() - INTERVAL '6 hours'),
  ('1a000000-0000-4000-8000-000000000004'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Yeni başlayan biri için Angular öğrenmeye nereden başlamalı?'::varchar,
   true, 'Public'::varchar, 'Published'::varchar, ''::varchar,
   NULL, NULL, NOW() - INTERVAL '3 hours'),
  ('1a000000-0000-4000-8000-000000000005'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Açık kaynak projelere nasıl katkı başlamalıyım? İlk PRımı henüz gönderemedim.'::varchar,
   false, 'Public'::varchar, 'Published'::varchar, ''::varchar,
   NULL, NULL, NOW() - INTERVAL '1 hour'),
  ('1a000000-0000-4000-8000-000000000006'::uuid,'11000000-0000-4000-8000-000000000007'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Hangi oyunları oynuyorsun?'::varchar,
   true, 'Public'::varchar, 'Archived'::varchar, ''::varchar,
   NULL, NULL, NOW() - INTERVAL '10 days')
) AS v(id, sender, target, body, anon, audience, status, answer, pub, answered, created)
ON CONFLICT ("Id") DO UPDATE SET
  "Body" = EXCLUDED."Body", "AnswerBody" = EXCLUDED."AnswerBody",
  "Status" = EXCLUDED."Status", "AnsweredAtUtc" = EXCLUDED."AnsweredAtUtc",
  "UpdatedAtUtc" = NOW();

-- ===========================================================================
-- 2. KONUSMALAR (4) + UYELER + MESAJLAR (~22)
-- ===========================================================================
INSERT INTO messaging.conversations ("Id","Kind","Title","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  ('18000000-0000-4000-8000-000000000001','Direct','dm-ayse', NOW() - INTERVAL '4 days', NOW() - INTERVAL '2 hours', 0),
  ('18000000-0000-4000-8000-000000000002','Direct','dm-mehmet', NOW() - INTERVAL '3 days', NOW() - INTERVAL '5 hours', 0),
  ('18000000-0000-4000-8000-000000000003','Group','Proje Ekibi', NOW() - INTERVAL '7 days', NOW() - INTERVAL '1 hour', 0),
  ('18000000-0000-4000-8000-000000000004','Direct','dm-burak', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 0)
ON CONFLICT ("Id") DO UPDATE SET "Title" = EXCLUDED."Title", "UpdatedAtUtc" = NOW();

INSERT INTO messaging.conversation_members ("UserId","ConversationId","Role","JoinedAtUtc","LeftAtUtc","MutedUntilUtc","IsArchived","IsPinned")
VALUES
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','18000000-0000-4000-8000-000000000001','Owner', NOW() - INTERVAL '4 days', NULL, NULL, false, true),
  ('11000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000001','Member', NOW() - INTERVAL '4 days', NULL, NULL, false, false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','18000000-0000-4000-8000-000000000002','Owner', NOW() - INTERVAL '3 days', NULL, NULL, false, false),
  ('11000000-0000-4000-8000-000000000002','18000000-0000-4000-8000-000000000002','Member', NOW() - INTERVAL '3 days', NULL, NULL, false, true),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','18000000-0000-4000-8000-000000000003','Owner', NOW() - INTERVAL '7 days', NULL, NULL, false, true),
  ('11000000-0000-4000-8000-000000000003','18000000-0000-4000-8000-000000000003','Member', NOW() - INTERVAL '7 days', NULL, NULL, false, false),
  ('11000000-0000-4000-8000-000000000004','18000000-0000-4000-8000-000000000003','Member', NOW() - INTERVAL '7 days', NULL, NULL, false, false),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','18000000-0000-4000-8000-000000000004','Owner', NOW() - INTERVAL '2 days', NULL, NULL, false, false),
  ('11000000-0000-4000-8000-000000000006','18000000-0000-4000-8000-000000000004','Member', NOW() - INTERVAL '2 days', NULL, NULL, false, false)
ON CONFLICT ("ConversationId","UserId") DO UPDATE SET
  "Role" = EXCLUDED."Role", "IsPinned" = EXCLUDED."IsPinned";

INSERT INTO messaging.messages ("Id","ConversationId","SenderId","Text","MediaIds","ReplyToId","Status","CreatedAtUtc","UpdatedAtUtc","Version")
SELECT id, conv, sender, text, '{}'::uuid[], NULL::uuid, status, created, created, 0
FROM (VALUES
  ('19000000-0000-4000-8000-000000000001'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,
   'Selam Emre! Angular zoneless yazımı gördüğünü söylemiştin, yorumlarını merak ediyorum.'::varchar,'Sent'::varchar,NOW() - INTERVAL '4 days'),
  ('19000000-0000-4000-8000-000000000002'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Teşekkürler! Aslında senin Signals önerin üzerine başladım bu araştırmaya.'::varchar,'Sent'::varchar,NOW() - INTERVAL '4 days'),
  ('19000000-0000-4000-8000-000000000003'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,
   'Hangi senaryolarda zonelessın problem yaratacağını da yazabilir misin? Merak ettim.'::varchar,'Sent'::varchar,NOW() - INTERVAL '3 days'),
  ('19000000-0000-4000-8000-000000000004'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Üçüncü parti kütüphaneler NgZonea bağımlı kalmışsa sorun oluyor. setTimeout içinde state güncellemeleri otomatik tetiklemiyor.'::varchar,'Sent'::varchar,NOW() - INTERVAL '2 days'),
  ('19000000-0000-4000-8000-000000000005'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,
   'Anladım, çok sağol! Bu hafta sonu yazıyı paylaşacağım, link göndereceğim.'::varchar,'Sent'::varchar,NOW() - INTERVAL '2 hours'),
  ('19000000-0000-4000-8000-000000000006'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Sabırsızlıkla bekliyorum!'::varchar,'Sent'::varchar,NOW() - INTERVAL '1 hour'),
  ('19000000-0000-4000-8000-000000000007'::uuid,'18000000-0000-4000-8000-000000000002'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,
   'Merhaba! Tasarım sistemi tokenlarıyla ilgili bir kahve konuşması yapabilir miyiz?'::varchar,'Sent'::varchar,NOW() - INTERVAL '3 days'),
  ('19000000-0000-4000-8000-000000000008'::uuid,'18000000-0000-4000-8000-000000000002'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Tabii! Çarşamba uygun mu? 14:00 sonrası.'::varchar,'Sent'::varchar,NOW() - INTERVAL '3 days'),
  ('19000000-0000-4000-8000-000000000009'::uuid,'18000000-0000-4000-8000-000000000002'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,
   'Uygun, Zoom linki gönderiyorum.'::varchar,'Sent'::varchar,NOW() - INTERVAL '2 days'),
  ('19000000-0000-4000-8000-00000000000a'::uuid,'18000000-0000-4000-8000-000000000002'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Teşekkürler! O zamana kadar token hiyerarşisi için bir draft hazırlayacağım.'::varchar,'Sent'::varchar,NOW() - INTERVAL '1 day'),
  ('19000000-0000-4000-8000-00000000000b'::uuid,'18000000-0000-4000-8000-000000000002'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,
   'Harika, sabırsızlıkla bekliyorum.'::varchar,'Sent'::varchar,NOW() - INTERVAL '5 hours'),
  ('19000000-0000-4000-8000-00000000000c'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Toplantı başladı: bu sprint hedeflerimizi gözden geçirelim.'::varchar,'Sent'::varchar,NOW() - INTERVAL '7 days'),
  ('19000000-0000-4000-8000-00000000000d'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,
   'ML pipelineda distribution drift monitoring eklemek istiyorum.'::varchar,'Sent'::varchar,NOW() - INTERVAL '6 days'),
  ('19000000-0000-4000-8000-00000000000e'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000004'::uuid,
   'Altyapı tarafında Prometheus ve Loki kurdum, metric endpointlerini paylaşır mısın?'::varchar,'Sent'::varchar,NOW() - INTERVAL '5 days'),
  ('19000000-0000-4000-8000-00000000000f'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,
   'Tabii, bugün shared doca ekliyorum.'::varchar,'Sent'::varchar,NOW() - INTERVAL '4 days'),
  ('19000000-0000-4000-8000-000000000010'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Sprint reviewu cuma 15:00de yapalım, demo hazırlayalım.'::varchar,'Sent'::varchar,NOW() - INTERVAL '2 days'),
  ('19000000-0000-4000-8000-000000000011'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000004'::uuid,
   'Kabul, stagingi de hazırlayacağım.'::varchar,'Sent'::varchar,NOW() - INTERVAL '1 day'),
  ('19000000-0000-4000-8000-000000000012'::uuid,'18000000-0000-4000-8000-000000000003'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,
   'ML tarafında da her şey hazır, perf metriklerini paylaşacağım.'::varchar,'Sent'::varchar,NOW() - INTERVAL '1 hour'),
  ('19000000-0000-4000-8000-000000000013'::uuid,'18000000-0000-4000-8000-000000000004'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,
   'Selam! Startup mentorluğu konusunda konuşabilir miyiz?'::varchar,'Sent'::varchar,NOW() - INTERVAL '2 days'),
  ('19000000-0000-4000-8000-000000000014'::uuid,'18000000-0000-4000-8000-000000000004'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,
   'Memnuniyetle! Senin durumunu biraz daha anlatır mısın, hangi aşamadasın?'::varchar,'Sent'::varchar,NOW() - INTERVAL '2 days'),
  ('19000000-0000-4000-8000-000000000015'::uuid,'18000000-0000-4000-8000-000000000004'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,
   'Fikir aşamasındayım, target audience doğrulaması lazım. Bu hafta sonu uygun musun?'::varchar,'Sent'::varchar,NOW() - INTERVAL '1 day')
) AS v(id, conv, sender, text, status, created)
ON CONFLICT ("Id") DO UPDATE SET
  "Text" = EXCLUDED."Text", "Status" = EXCLUDED."Status", "UpdatedAtUtc" = NOW();

-- Sohbetlerin açılış ekranında güncel ve doğal bir konuşma ritmi bulunur.
INSERT INTO messaging.messages
  ("Id","ConversationId","SenderId","Text","MediaIds","ReplyToId","Status","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  ('19000000-0000-4000-8000-000000000016','18000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
   'Zoneless yazısını bu sabah yayımladım. Özellikle üçüncü parti kütüphaneler bölümünü senin notlarınla genişlettim.','{}',NULL,'Sent',NOW()-INTERVAL '5 hours',NOW()-INTERVAL '5 hours',0),
  ('19000000-0000-4000-8000-000000000017','18000000-0000-4000-8000-000000000001','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   'Okudum; geçiş kontrol listesini çok sevdim. Öğleden sonra ekiple paylaşacağım.','{}','19000000-0000-4000-8000-000000000016','Sent',NOW()-INTERVAL '4 hours 42 minutes',NOW()-INTERVAL '4 hours 42 minutes',0),
  ('19000000-0000-4000-8000-000000000018','18000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
   'Harika. Cuma günkü buluşmada gerçek bir migration örneğini de birlikte inceleyelim mi?','{}',NULL,'Sent',NOW()-INTERVAL '3 hours 55 minutes',NOW()-INTERVAL '3 hours 55 minutes',0),
  ('19000000-0000-4000-8000-000000000019','18000000-0000-4000-8000-000000000001','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   'Olur, 15.30 bana uyuyor. Öncesinde küçük bir örnek repo hazırlayacağım.','{}','19000000-0000-4000-8000-000000000018','Sent',NOW()-INTERVAL '3 hours 31 minutes',NOW()-INTERVAL '3 hours 31 minutes',0),
  ('19000000-0000-4000-8000-00000000001a','18000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002',
   'Dünkü araştırma oturumundan sonra token isimlerini sadeleştirdim. Renk yerine amaç üzerinden konuşmak ekibin işini kolaylaştırdı.','{}',NULL,'Sent',NOW()-INTERVAL '2 hours 25 minutes',NOW()-INTERVAL '2 hours 25 minutes',0),
  ('19000000-0000-4000-8000-00000000001b','18000000-0000-4000-8000-000000000002','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   'Tam da ihtiyacımız olan değişiklik. Yeni isimleri bileşen galerisinde görünce birlikte son bir tur atalım.','{}','19000000-0000-4000-8000-00000000001a','Sent',NOW()-INTERVAL '1 hour 58 minutes',NOW()-INTERVAL '1 hour 58 minutes',0),
  ('19000000-0000-4000-8000-00000000001c','18000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003',
   'Drift uyarıları için ilk haftanın eşiğini çıkardım; yanlış pozitifler beklediğimizden az. Öğleden sonra grafikleri paylaşacağım.','{}',NULL,'Sent',NOW()-INTERVAL '55 minutes',NOW()-INTERVAL '55 minutes',0),
  ('19000000-0000-4000-8000-00000000001d','18000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004',
   'Süper. Aynı zaman aralığının trace örneklerini hazırladım; review sırasında yan yana bakabiliriz.','{}','19000000-0000-4000-8000-00000000001c','Sent',NOW()-INTERVAL '34 minutes',NOW()-INTERVAL '34 minutes',0)
ON CONFLICT ("Id") DO UPDATE SET
  "Text"=EXCLUDED."Text", "ReplyToId"=EXCLUDED."ReplyToId", "Status"='Sent', "UpdatedAtUtc"=EXCLUDED."UpdatedAtUtc";

-- ===========================================================================
-- 3. TOPLULUKLAR (3) + UYELER + KURALLAR
-- ===========================================================================
INSERT INTO communities.communities ("Id","Slug","Name","Description","Visibility","Status","PinnedContentIds","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  ('1c000000-0000-4000-8000-000000000001','yazilim-gelistiriciler','Yazılım Geliştiriciler Türkiye',
   'Türkiyenin yazılım geliştirici topluluğu. Frontend, backend, devops, mobile — her seviyeden geliştiriciyi bekliyoruz. Bilgi paylaşımı, iş ilanları ve etkinlik duyuruları.',
   'Public','Active','{}'::uuid[], NOW() - INTERVAL '20 days', NOW() - INTERVAL '1 day', 0),
  ('1c000000-0000-4000-8000-000000000002','tasarim-ux','Tasarım ve UX Topluluğu',
   'Tasarımcılar, UX araştırmacıları ve ürün insanları için buluşma noktası. Tasarım sistemleri, erişilebilirlik, kullanıcı araştırması ve daha fazlası.',
   'Public','Active','{}'::uuid[], NOW() - INTERVAL '15 days', NOW() - INTERVAL '2 days', 0),
  ('1c000000-0000-4000-8000-000000000003','girisimcilik-startup','Girişimcilik ve Startup',
   'Kurucular, yatırımcılar ve girişim hayali olanlar için topluluk. Mentörlük, yatırım, ürün-market fit, growth ve daha fazlası.',
   'Public','Active','{}'::uuid[], NOW() - INTERVAL '12 days', NOW() - INTERVAL '3 days', 0),
  ('1c000000-0000-4000-8000-000000000004','veri-yapay-zeka','Veri ve Yapay Zekâ',
   'Veri bilimi, makine öğrenmesi ve güvenilir yapay zekâ sistemleri üzerine uygulamalı bilgi paylaşımı.',
   'Public','Active','{}'::uuid[], NOW() - INTERVAL '10 days', NOW() - INTERVAL '4 hours', 0),
  ('1c000000-0000-4000-8000-000000000005','urun-liderleri','Ürün Liderleri Atölyesi',
   'Ürün stratejisi, araştırma ve ölçüm pratiklerini küçük bir çalışma grubunda derinleştiren onaylı üyelik alanı.',
   'Private','Active','{}'::uuid[], NOW() - INTERVAL '9 days', NOW() - INTERVAL '5 hours', 0),
  ('1c000000-0000-4000-8000-000000000006','akademik-yazilim','Akademik Yazılım Çalışmaları',
   'Araştırma yöntemleri ve yazılım mühendisliği eğitimi üzerine üyelerine açık çalışma topluluğu.',
   'Hidden','Active','{}'::uuid[], NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 hours', 0)
ON CONFLICT ("Slug") DO UPDATE SET
  "Name" = EXCLUDED."Name", "Description" = EXCLUDED."Description", "UpdatedAtUtc" = NOW();

INSERT INTO communities.members ("UserId","CommunityId","Role","Status","CreatedAtUtc","UpdatedAtUtc")
VALUES
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','1c000000-0000-4000-8000-000000000001','Owner','Active', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
  ('11000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','Moderator','Active', NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days'),
  ('11000000-0000-4000-8000-000000000003','1c000000-0000-4000-8000-000000000001','Member','Active', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
  ('11000000-0000-4000-8000-000000000004','1c000000-0000-4000-8000-000000000001','Member','Active', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
  ('11000000-0000-4000-8000-000000000008','1c000000-0000-4000-8000-000000000001','Member','Active', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
  ('11000000-0000-4000-8000-000000000002','1c000000-0000-4000-8000-000000000002','Owner','Active', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','1c000000-0000-4000-8000-000000000002','Member','Active', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days'),
  ('11000000-0000-4000-8000-000000000005','1c000000-0000-4000-8000-000000000002','Moderator','Active', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  ('11000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000002','Member','Active', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
  ('11000000-0000-4000-8000-000000000006','1c000000-0000-4000-8000-000000000003','Owner','Active', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','1c000000-0000-4000-8000-000000000003','Moderator','Active', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  ('11000000-0000-4000-8000-000000000007','1c000000-0000-4000-8000-000000000003','Member','Active', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
  ('11000000-0000-4000-8000-000000000008','1c000000-0000-4000-8000-000000000003','Member','Active', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('11000000-0000-4000-8000-000000000003','1c000000-0000-4000-8000-000000000004','Owner','Active', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  ('11000000-0000-4000-8000-000000000004','1c000000-0000-4000-8000-000000000004','Member','Active', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
  ('11000000-0000-4000-8000-000000000007','1c000000-0000-4000-8000-000000000004','Member','Active', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  ('11000000-0000-4000-8000-000000000006','1c000000-0000-4000-8000-000000000005','Owner','Active', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days'),
  ('11000000-0000-4000-8000-000000000002','1c000000-0000-4000-8000-000000000005','Member','Active', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
  ('11000000-0000-4000-8000-000000000008','1c000000-0000-4000-8000-000000000006','Owner','Active', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
  ('8c956dd6-2194-4d52-938a-dde1e5fd6264','1c000000-0000-4000-8000-000000000006','Member','Active', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days')
ON CONFLICT ("CommunityId","UserId") DO UPDATE SET
  "Role" = EXCLUDED."Role", "Status" = 'Active';

INSERT INTO communities.rules ("CommunityId","Text")
SELECT community_id::uuid, rule_text::varchar
FROM (VALUES
  ('1c000000-0000-4000-8000-000000000001','Saygılı ve yapıcı olun. Kişisel saldırı yasak.'),
  ('1c000000-0000-4000-8000-000000000001','Spam ve self-promotion sınırlı (haftada 1).'),
  ('1c000000-0000-4000-8000-000000000001','İş ilanları için doğru etiket kullanın.'),
  ('1c000000-0000-4000-8000-000000000002','Tasarım eleştirisi yapıcı olsun.'),
  ('1c000000-0000-4000-8000-000000000002','Kaynak paylaşımı zorunlu (orijinal tasarımcı etiketle).'),
  ('1c000000-0000-4000-8000-000000000003','Gizli NDAlı bilgi paylaşmayın.'),
  ('1c000000-0000-4000-8000-000000000003','Yatırım tavsiyesi verilmez, sadece deneyim paylaşılır.'),
  ('1c000000-0000-4000-8000-000000000003','Pitchler için pitch kanalını kullanın.'),
  ('1c000000-0000-4000-8000-000000000004','Paylaşılan veri kümelerinde kişisel bilgi bulundurmayın.'),
  ('1c000000-0000-4000-8000-000000000005','Vaka tartışmalarında şirket ve müşteri bilgilerini anonimleştirin.'),
  ('1c000000-0000-4000-8000-000000000006','Kaynak ve yöntem bilgisini açıkça belirtin.')
) AS fixture(community_id, rule_text)
WHERE NOT EXISTS (
  SELECT 1 FROM communities.rules existing
  WHERE existing."CommunityId"=community_id::uuid AND existing."Text"=rule_text)
ON CONFLICT ("CommunityId","Order") DO NOTHING;

-- ===========================================================================
-- 3b. ARAMA BELGELERİ
-- Ham SQL fixture eklemeleri uygulama handler'larını çalıştırmadığı için arama
-- indeksini kaynak tablolardan aynı görünürlük kurallarıyla yeniden üretir.
-- ===========================================================================
INSERT INTO search.documents
  ("Id","Type","OwnerId","Title","Body","Tags","Visibility","IsHidden","IsDeleted","DeepLink","UpdatedAtUtc","SourceVersion","Version")
SELECT "Id", 'Profile', "OwnerId", "DisplayName",
       concat('@',"Handle",' ',coalesce("Biography",''),' ',coalesce("Location",''),' ',coalesce("Organization",'')),
       CASE WHEN nullif("Organization",'') IS NULL THEN '{}'::text[] ELSE ARRAY[lower("Organization")]::text[] END,
       CASE WHEN "IsPrivate" THEN 'Private' ELSE 'Public' END, false, false,
       '/profil/'||"Handle", "UpdatedAtUtc", "Version", 1
FROM profiles.profiles
WHERE "OwnerId" IN ('8c956dd6-2194-4d52-938a-dde1e5fd6264','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000008')
ON CONFLICT ("Id","Type") DO UPDATE SET
  "OwnerId"=EXCLUDED."OwnerId", "Title"=EXCLUDED."Title", "Body"=EXCLUDED."Body", "Tags"=EXCLUDED."Tags",
  "Visibility"=EXCLUDED."Visibility", "IsHidden"=false, "IsDeleted"=false, "DeepLink"=EXCLUDED."DeepLink",
  "UpdatedAtUtc"=EXCLUDED."UpdatedAtUtc", "SourceVersion"=EXCLUDED."SourceVersion", "Version"=search.documents."Version"+1;

INSERT INTO search.documents
  ("Id","Type","OwnerId","Title","Body","Tags","Visibility","IsHidden","IsDeleted","DeepLink","UpdatedAtUtc","SourceVersion","Version")
SELECT "Id", 'Content', "AuthorId", left(coalesce(nullif("Text",''),'Medya paylaşımı'),120), coalesce("Text",''), "Hashtags",
       CASE WHEN "Visibility"='Public' THEN 'Public' WHEN "Visibility"='Followers' THEN 'Followers' ELSE 'Private' END,
       "Status"<>'Published', "Status"='Deleted', '/icerik/'||"Id"::text, "UpdatedAtUtc", "Version", 1
FROM content.posts
WHERE "Id"::text LIKE '13000000-0000-4000-8000-%'
ON CONFLICT ("Id","Type") DO UPDATE SET
  "OwnerId"=EXCLUDED."OwnerId", "Title"=EXCLUDED."Title", "Body"=EXCLUDED."Body", "Tags"=EXCLUDED."Tags",
  "Visibility"=EXCLUDED."Visibility", "IsHidden"=EXCLUDED."IsHidden", "IsDeleted"=EXCLUDED."IsDeleted", "DeepLink"=EXCLUDED."DeepLink",
  "UpdatedAtUtc"=EXCLUDED."UpdatedAtUtc", "SourceVersion"=EXCLUDED."SourceVersion", "Version"=search.documents."Version"+1;

INSERT INTO search.documents
  ("Id","Type","OwnerId","Title","Body","Tags","Visibility","IsHidden","IsDeleted","DeepLink","UpdatedAtUtc","SourceVersion","Version")
SELECT "Id", 'Question', "TargetId", 'Yanıtlanmış soru', concat("Body",' ',coalesce("AnswerBody",'')), '{}'::text[],
       CASE WHEN "Audience"='Public' THEN 'Public' WHEN "Audience"='Followers' THEN 'Followers' ELSE 'Private' END, false, false,
       '/sorular/'||"Id"::text, coalesce("AnsweredAtUtc","CreatedAtUtc"), "Version", 1
FROM questions.questions
WHERE "Status"='Answered' AND "Id"::text LIKE '1a000000-0000-4000-8000-%'
ON CONFLICT ("Id","Type") DO UPDATE SET
  "OwnerId"=EXCLUDED."OwnerId", "Title"=EXCLUDED."Title", "Body"=EXCLUDED."Body", "Tags"=EXCLUDED."Tags",
  "Visibility"=EXCLUDED."Visibility", "IsHidden"=false, "IsDeleted"=false, "DeepLink"=EXCLUDED."DeepLink",
  "UpdatedAtUtc"=EXCLUDED."UpdatedAtUtc", "SourceVersion"=EXCLUDED."SourceVersion", "Version"=search.documents."Version"+1;

INSERT INTO search.documents
  ("Id","Type","OwnerId","Title","Body","Tags","Visibility","IsHidden","IsDeleted","DeepLink","UpdatedAtUtc","SourceVersion","Version")
SELECT c."Id", 'Community', owner."UserId", c."Name",
       concat(c."Description",' ',coalesce((SELECT string_agg(r."Text",' ') FROM communities.rules r WHERE r."CommunityId"=c."Id"),'')),
       '{}'::text[], CASE WHEN c."Visibility"='Public' THEN 'Public' ELSE 'Private' END,
       c."Status"<>'Active', c."Status"='Archived', '/topluluklar/'||c."Slug", c."UpdatedAtUtc", c."Version", 1
FROM communities.communities c
JOIN communities.members owner ON owner."CommunityId"=c."Id" AND owner."Role"='Owner' AND owner."Status"='Active'
WHERE c."Id"::text LIKE '1c000000-0000-4000-8000-%'
ON CONFLICT ("Id","Type") DO UPDATE SET
  "OwnerId"=EXCLUDED."OwnerId", "Title"=EXCLUDED."Title", "Body"=EXCLUDED."Body", "Tags"=EXCLUDED."Tags",
  "Visibility"=EXCLUDED."Visibility", "IsHidden"=EXCLUDED."IsHidden", "IsDeleted"=EXCLUDED."IsDeleted", "DeepLink"=EXCLUDED."DeepLink",
  "UpdatedAtUtc"=EXCLUDED."UpdatedAtUtc", "SourceVersion"=EXCLUDED."SourceVersion", "Version"=search.documents."Version"+1;

-- ===========================================================================
-- 4. BILDIRIMLER (~12, farklı tipler)
-- ===========================================================================
INSERT INTO notifications.inbox
  ("Id","RecipientId","ActorId","Kind","EntityId","AggregationKey",
   "TitleTemplateKey","BodyTemplateKey","TemplateVersion","Arguments",
   "DeepLink","Count","ReadAtUtc","DeliveryState","DeliveryAttempts",
   "NextAttemptAtUtc","LastError","CreatedAtUtc","UpdatedAtUtc","IdempotencyKey","Version")
SELECT id, recip, actor, kind, entity, agg, title_key, body_key, 1, args, deeplink, cnt, read_at, 'Delivered', 0, NULL, '', created, created, idem, 0
FROM (VALUES
  ('1b000000-0000-4000-8000-000000000001'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'NewFollower'::varchar,NULL::uuid,'follow:ayseyilmaz'::varchar,
   'notification.follow.title'::varchar,'notification.follow.body'::varchar,
   '{"actorName":"Ayşe Yılmaz","actorHandle":"ayseyilmaz"}'::jsonb,'/profil/ayseyilmaz'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '5 days','seed-follow-1'::varchar),
  ('1b000000-0000-4000-8000-000000000002'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'Reaction'::varchar,'13000000-0000-4000-8000-000000000001'::uuid,'reaction:post:1'::varchar,
   'notification.reaction.title'::varchar,'notification.reaction.body'::varchar,
   '{"actorName":"Zeynep Kaya","preview":"Angular zoneless paylaşımın...","kind":"Insightful"}'::jsonb,'/akis'::varchar,1,NOW() - INTERVAL '1 day',NOW() - INTERVAL '5 days','seed-reaction-1'::varchar),
  ('1b000000-0000-4000-8000-000000000003'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'Reaction'::varchar,'13000000-0000-4000-8000-000000000001'::uuid,'reaction:post:1b'::varchar,
   'notification.reaction.title'::varchar,'notification.reaction.body'::varchar,
   '{"actorName":"Merve Arslan","preview":"Angular zoneless paylaşımın...","kind":"Celebrate"}'::jsonb,'/akis'::varchar,2,NOW() - INTERVAL '1 day',NOW() - INTERVAL '4 days','seed-reaction-2'::varchar),
  ('1b000000-0000-4000-8000-000000000004'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000003'::uuid,'Comment'::varchar,'13000000-0000-4000-8000-000000000001'::uuid,'comment:post:1'::varchar,
   'notification.comment.title'::varchar,'notification.comment.body'::varchar,
   '{"actorName":"Zeynep Kaya","preview":"Zonelessa geçişte injection context..."}'::jsonb,'/akis'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '2 days','seed-comment-1'::varchar),
  ('1b000000-0000-4000-8000-000000000005'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'Comment'::varchar,'13000000-0000-4000-8000-000000000009'::uuid,'comment:post:9'::varchar,
   'notification.comment.title'::varchar,'notification.comment.body'::varchar,
   '{"actorName":"Ayşe Yılmaz","preview":"Sabah yazma pratiğini ben de yapıyorum..."}'::jsonb,'/akis'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '6 days','seed-comment-2'::varchar),
  ('1b000000-0000-4000-8000-000000000006'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'System'::varchar,'1a000000-0000-4000-8000-000000000001'::uuid,'question:1'::varchar,
   'notification.question.title'::varchar,'notification.question.body'::varchar,
   '{"actorName":"Burak Aydın","preview":"Modüler monolith ile microservices..."}'::jsonb,'/sorular'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '3 days','seed-question-1'::varchar),
  ('1b000000-0000-4000-8000-000000000007'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,'Message'::varchar,'18000000-0000-4000-8000-000000000001'::uuid,'message:conv:1'::varchar,
   'notification.message.title'::varchar,'notification.message.body'::varchar,
   '{"actorName":"Ayşe Yılmaz","preview":"Hangi senaryolarda zoneless..."}'::jsonb,'/mesajlar'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '3 days','seed-message-1'::varchar),
  ('1b000000-0000-4000-8000-000000000008'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,'Message'::varchar,'18000000-0000-4000-8000-000000000002'::uuid,'message:conv:2'::varchar,
   'notification.message.title'::varchar,'notification.message.body'::varchar,
   '{"actorName":"Mehmet Demir","preview":"Tasarım sistemi tokenlarıyla ilgili..."}'::jsonb,'/mesajlar'::varchar,1,NOW() - INTERVAL '5 hours',NOW() - INTERVAL '3 days','seed-message-2'::varchar),
  ('1b000000-0000-4000-8000-000000000009'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000005'::uuid,'Comment'::varchar,'13000000-0000-4000-8000-00000000000a'::uuid,'mention:post:a'::varchar,
   'notification.mention.title'::varchar,'notification.mention.body'::varchar,
   '{"actorName":"Elif Şahin","preview":"@emrekaraca sen de katıl! Karmaşık bir konuyu..."}'::jsonb,'/akis'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '20 hours','seed-mention-1'::varchar),
  ('1b000000-0000-4000-8000-00000000000a'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000002'::uuid,'System'::varchar,'1a000000-0000-4000-8000-000000000004'::uuid,'question:4'::varchar,
   'notification.question.title'::varchar,'notification.question.body'::varchar,
   '{"actorName":"Anonim","preview":"Yeni başlayan biri için Angular öğrenmeye..."}'::jsonb,'/sorular'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '3 hours','seed-question-2'::varchar),
  ('1b000000-0000-4000-8000-00000000000b'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'NewFollower'::varchar,NULL::uuid,'follow:burakaydin'::varchar,
   'notification.follow.title'::varchar,'notification.follow.body'::varchar,
   '{"actorName":"Burak Aydın","actorHandle":"burakaydin"}'::jsonb,'/profil/burakaydin'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '1 day','seed-follow-2'::varchar),
  ('1b000000-0000-4000-8000-00000000000c'::uuid,'8c956dd6-2194-4d52-938a-dde1e5fd6264'::uuid,'11000000-0000-4000-8000-000000000006'::uuid,'Reaction'::varchar,'13000000-0000-4000-8000-00000000000f'::uuid,'reaction:post:f'::varchar,
   'notification.reaction.title'::varchar,'notification.reaction.body'::varchar,
   '{"actorName":"Burak Aydın","preview":"Eleştirel düşünme paylaşımın...","kind":"Insightful"}'::jsonb,'/akis'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '1 day','seed-reaction-3'::varchar),
  ('1b000000-0000-4000-8000-00000000000d'::uuid,'11000000-0000-4000-8000-000000000008'::uuid,'11000000-0000-4000-8000-000000000005'::uuid,'NewFollower'::varchar,NULL::uuid,'follow-request:elif-merve'::varchar,
   'notification.follow_request.title'::varchar,'notification.follow_request.body'::varchar,
   '{"actorName":"Elif Şahin","actorHandle":"elifsahin","followState":"Pending"}'::jsonb,'/baglantilar?view=requests'::varchar,1,NULL::timestamptz,NOW() - INTERVAL '45 minutes','seed-follow-request-1'::varchar)
) AS v(id, recip, actor, kind, entity, agg, title_key, body_key, args, deeplink, cnt, read_at, created, idem)
ON CONFLICT ("Id") DO UPDATE SET
  "Kind" = EXCLUDED."Kind", "Arguments" = EXCLUDED."Arguments", "DeepLink"=EXCLUDED."DeepLink", "Count" = EXCLUDED."Count",
  "DeliveryState" = 'Delivered', "UpdatedAtUtc" = NOW();

-- ===========================================================================
-- 5. KAYITLI ICERIK (2 - Emre Karaca kaydetmiş)
-- ===========================================================================
INSERT INTO content.saved_content ("Id","OwnerId","PostId","Collection","CreatedAtUtc","Version")
VALUES
  ('1f000000-0000-4000-8000-000000000001','8c956dd6-2194-4d52-938a-dde1e5fd6264','13000000-0000-4000-8000-000000000005','Teknik', NOW() - INTERVAL '3 days', 0),
  ('1f000000-0000-4000-8000-000000000002','8c956dd6-2194-4d52-938a-dde1e5fd6264','13000000-0000-4000-8000-00000000000b','İlham', NOW() - INTERVAL '2 days', 0)
ON CONFLICT ("OwnerId","PostId","Collection") DO NOTHING;

-- ===========================================================================
-- 6. MODERASYON (2 report + 2 case)
-- ===========================================================================
INSERT INTO moderation.reports ("Id","ReporterId","SubjectType","SubjectId","Reason","Details","EvidenceReferences","Status","CaseId","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  ('1d000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000007','Content','13000000-0000-4000-8000-00000000000d','Spam',
   'Bu gönderi birden fazla platformda kopya olarak görünüyor, orijinal içerik değil.','{}'::text[],'Triaged','1e000000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days', 0),
  ('1d000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','User','11000000-0000-4000-8000-000000000008','Other',
   'Kullanıcı profilinde farklı isimler kullanıyor, gerçek dışı görünüyor.','{}'::text[],'Triaged','1e000000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 0)
ON CONFLICT ("Id") DO UPDATE SET
  "SubjectType" = EXCLUDED."SubjectType", "Reason" = EXCLUDED."Reason", "Details" = EXCLUDED."Details",
  "Status" = EXCLUDED."Status", "CaseId" = EXCLUDED."CaseId", "UpdatedAtUtc" = NOW();

INSERT INTO moderation.cases ("Id","ReportId","SubjectType","SubjectId","TargetUserId","AssignedModeratorId","Status","AppealStatus","AppealText","AppealDecisionReason","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  ('1e000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Content','13000000-0000-4000-8000-00000000000d','11000000-0000-4000-8000-000000000007','8c956dd6-2194-4d52-938a-dde1e5fd6264',
   'Actioned','None','','', NOW() - INTERVAL '4 days', NOW() - INTERVAL '2 days', 0),
  ('1e000000-0000-4000-8000-000000000002','1d000000-0000-4000-8000-000000000002','User','11000000-0000-4000-8000-000000000008','11000000-0000-4000-8000-000000000008',NULL,
   'InReview','None','','', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 0)
ON CONFLICT ("Id") DO UPDATE SET
  "SubjectType" = EXCLUDED."SubjectType", "Status" = EXCLUDED."Status",
  "AssignedModeratorId" = EXCLUDED."AssignedModeratorId", "UpdatedAtUtc" = NOW();

-- ===========================================================================
-- 7. ADMINISTRATION (4 feature flag + 5 setting)
-- ===========================================================================
INSERT INTO administration.feature_flags ("Id","Key","Description","Enabled","RolloutPercentage","CreatedAtUtc","UpdatedAtUtc","Version")
VALUES
  (gen_random_uuid(),'enable_polls','Anket oluşturma ve oylama özelliği',true,100, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 0),
  (gen_random_uuid(),'enable_communities','Topluluk oluşturma ve katılma özelliği',true,100, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 0),
  (gen_random_uuid(),'maintenance_mode','Bakım modu — yeni gönderimleri kapatır',false,0, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 0),
  (gen_random_uuid(),'beta_features','Beta özellikleri belirli yüzdelikte aç',false,10, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 0)
ON CONFLICT ("Key") DO UPDATE SET
  "Description" = EXCLUDED."Description", "Enabled" = EXCLUDED."Enabled", "RolloutPercentage" = EXCLUDED."RolloutPercentage";

INSERT INTO administration.settings ("Id","ValueJson","Description","UpdatedAtUtc","Version")
VALUES
  ('platform.name','{"value":"Enterprise Social & Community Platform"}'::jsonb,'Platform görünen adı', NOW() - INTERVAL '30 days', 0),
  ('platform.locale','{"value":"tr-TR"}'::jsonb,'Varsayılan dil/bölge', NOW() - INTERVAL '30 days', 0),
  ('content.max_length','{"value":5000}'::jsonb,'Maksimum gönderi karakter sayısı', NOW() - INTERVAL '30 days', 0),
  ('feed.page_size','{"value":12}'::jsonb,'Feed sayfa boyutu', NOW() - INTERVAL '30 days', 0),
  ('messaging.max_conversation_members','{"value":64}'::jsonb,'Bir konuşmadaki maksimum üye', NOW() - INTERVAL '30 days', 0)
ON CONFLICT ("Id") DO UPDATE SET
  "ValueJson" = EXCLUDED."ValueJson", "Description" = EXCLUDED."Description", "UpdatedAtUtc" = NOW();

-- ===========================================================================
-- 8. DENETIM GUNLUGU (5 audit entry)
-- ===========================================================================
INSERT INTO audit.entries ("Id","ActorId","Action","TargetType","TargetId","Severity","MetadataJson","CorrelationId","OccurredAtUtc")
VALUES
  ('20000000-0000-4000-8000-000000000001','8c956dd6-2194-4d52-938a-dde1e5fd6264','user.login','User','8c956dd6-2194-4d52-938a-dde1e5fd6264','Info','{"ip":"127.0.0.1","userAgent":"Edge"}'::jsonb,'audit-login-1', NOW() - INTERVAL '1 day'),
  ('20000000-0000-4000-8000-000000000002','8c956dd6-2194-4d52-938a-dde1e5fd6264','post.create','Post','13000000-0000-4000-8000-00000000000b','Info','{"visibility":"Public"}'::jsonb,'audit-post-1', NOW() - INTERVAL '4 days'),
  ('20000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','user.register','User','11000000-0000-4000-8000-000000000001','Info','{}'::jsonb,'audit-reg-1', NOW() - INTERVAL '20 days'),
  ('20000000-0000-4000-8000-000000000004','8c956dd6-2194-4d52-938a-dde1e5fd6264','moderation.action','Case','1e000000-0000-4000-8000-000000000001','Warning','{"action":"actioned"}'::jsonb,'audit-mod-1', NOW() - INTERVAL '2 days'),
  ('20000000-0000-4000-8000-000000000005','8c956dd6-2194-4d52-938a-dde1e5fd6264','community.create','Community','1c000000-0000-4000-8000-000000000001','Info','{"slug":"yazilim-gelistiriciler"}'::jsonb,'audit-comm-1', NOW() - INTERVAL '20 days')
ON CONFLICT ("Id") DO UPDATE SET
  "Action"=EXCLUDED."Action", "TargetType"=EXCLUDED."TargetType", "TargetId"=EXCLUDED."TargetId",
  "Severity"=EXCLUDED."Severity", "MetadataJson"=EXCLUDED."MetadataJson", "OccurredAtUtc"=EXCLUDED."OccurredAtUtc";

COMMIT;
