# Mesajlaşma ve bildirim güvenilirliği

## Üyelik neden her istekte denetlenir?

İstemcinin konuşma ekranını gösterebilmesi yetki kanıtı değildir. `SendMessageHandler`, `ListMessagesHandler`, `ChangeMessageHandler` ve SignalR `JoinConversation` işlemi konuşmayı repository'den yükler ve `Conversation.HasActiveMember` sonucunu denetler. Konuşma UUID'sini bilen üçüncü kullanıcı bu nedenle REST ve hub üzerinden içeriğe ulaşamaz.

`Conversation` doğrudan ve grup konuşmalarını, aktif üyeliği ve Owner/Administrator/Member rollerini korur. `Message` ayrı aggregate'tır; metin/medya, yanıt ilişkisi, 15 dakikalık düzenleme, 24 saatlik silme ve alıcı başına teslim/okundu durumunu korur. Doğrudan konuşmada SocialGraph engel politikası hem konuşma oluştururken hem mesaj gönderirken yeniden uygulanır.

## Kalıcılık ve cursor

PostgreSQL ve MongoDB adaptörleri aynı portları uygular. Mesaj sırası `CreatedAtUtc DESC, MessageId ASC`, konuşma sırası `UpdatedAtUtc DESC, ConversationId ASC` şeklindedir. Cursor iki alanı birlikte taşır. PostgreSQL UUID karşılaştırmasını SQL'de, MongoDB `$lt/$gt` ile yapar. Eşit zamanlı iki mesajla çalışan provider sözleşmesi tekrar veya atlama olmadığını doğrular.

PostgreSQL seçildiğinde `OutboxSaveChangesInterceptor`, `Message` ve `OutboxMessage` kayıtlarını aynı EF transaction'ına ekler. MongoDB standalone geliştirme profilinde çok belgeli transaction varsayılmaz. Bunun yerine `MongoMessageRepository`, `MessageSentIntegrationEvent` yükünü `_pendingEvents` alanında mesaj belgesiyle aynı `insertOne` işlemi içinde saklar. `MongoMessageOutboxWorker` event'i süreli lease ile claim eder; bildirim ve realtime consumer'larını çalıştırır; ortak PostgreSQL inbox tablosu handler idempotency'sini korur. Mesajın read/edit update'i `$set` kullandığı için gömülü event'i yanlışlıkla silmez. Başarısız teslim exponential backoff ve sınırlı denemeden sonra dead-letter zaman damgası alır.

## SignalR ve presence

`MessagingHub` JWT ile korunur. WebSocket query token'ı yalnız `/hubs` yolunda kabul edilir. Bağlantılar kullanıcı grubuna, yalnız üyeliği doğrulanan konuşmalar konuşma grubuna katılır. Redis backplane çok düğümlü hostlarda mesajların düğümler arasında iletilmesini sağlar. `IPresenceStore`, Redis sürücü tipini uygulamaya sızdırmadan bağlantı kimliklerini TTL ile tutar.

Web ve Ionic istemcileri resmî TypeScript SignalR istemcisini kullanır, otomatik yeniden bağlanır ve bağlantı kurulamadığında REST geçmişini kullanmaya devam eder. Optimistik gönderim API başarısız olursa snapshot'a geri döner.

## Bildirim aggregation ve teslimat

Notifications ayrı bounded context'tir. Bir mesaj bildirimi `message:{conversation}:{recipient}` aggregation anahtarını kullanır. 24 saat içindeki okunmamış benzer olaylar yeni satır yerine `Count` artırır ve son aktör/önizlemeyi günceller.

Bildirim kaydı, in-app inbox ile kanal teslimat durumunu birlikte izler. Arka plan işçisi Pending veya zamanı gelen RetryScheduled kayıtlarını depolama-nötr `INotificationChannel` portlarına verir. Hata üstel gecikmeyle yeniden zamanlanır; beşinci başarısızlık DeadLetter olur. Yerel geliştirme adaptörü yalnız yapılandırılmış log üretir; e-posta/push için ücretli servis zorunlu değildir.

Şablon anahtarı ve sürümü kayıtta saklanır. API ham kişisel metin üretmek yerine `TitleTemplateKey`, `BodyTemplateKey`, `TemplateVersion`, sınırlı arguments ve web/mobil deep link döndürür. İstemci yerelleştirmeyi kendi dilinde yapar.

## Kanıt

`tests/E2E/messaging-live.mjs` üç gerçek kullanıcı oluşturup yerel pickup e-postalarındaki tek kullanımlık belirteçlerle hesapları doğrular. Alıcı WebSocket'e bağlanır; gönderen iki mesaj yollar. Test canlı mesajı, canlı bildirimi, kalıcı geçmişi, `count=2` birleştirmesini, okundu geçişini ve üçüncü kullanıcının 403 aldığını doğrular. Aynı betik PostgreSQL ve MongoDB yapılandırmalarıyla çalışır. API başka bir çalışma dizininden başlatılırsa pickup yolu `EMAIL_PICKUP_DIR` ile verilir.
