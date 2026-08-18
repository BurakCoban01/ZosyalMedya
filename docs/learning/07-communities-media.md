# Topluluk ve medya modülleri

## Topluluk sınırı

`Communities` üyelik, davet/istek, sahip-yönetici-moderatör-üye rolleri, kurallar, sabitlenen içerikler ve arşivleme kararlarının sahibidir. Üyelik ve rol değişiklikleri aggregate metotlarından geçer; HTTP katmanı bu kuralları tekrar üretmez. PostgreSQL seçimi, üyelik benzersizliği ve rol geçişlerinin güçlü tutarlılık ihtiyacından kaynaklanır. Modül başka bir modülün repository'sine erişmez.

## Medya yükleme yaşam döngüsü

Yükleme iki adımdır: istemci önce dosya adı, türü ve beklenen boyutla bir `Pending` kayıt açar; sonra yalnız kayıt sahibi baytları yükler. Uygulama gerçek boyutu beyanla karşılaştırır, SHA-256 içerik özeti üretir, zararlı imza taraması yapar ve dosya imzasının bildirilen MIME türüyle eşleştiğini doğrular.

Görüntüler SkiaSharp ile decode edilip yeniden encode edilir. Bu işlem kaynak dosyadaki EXIF ve benzeri taşınmaması gereken metadata'yı atar; ayrıca 320 ve 960 piksel sınırlarında WebP türevleri üretir. Büyük medya baytları PostgreSQL kaydında tutulmaz. Kayıtta yalnız sahiplik, görünürlük, durum, özet ve depolama anahtarları bulunur.

## Depolama ve erişim güvenliği

Varsayılan `FileSystemObjectStorage` düşük kaynaklı geliştirmede atomik geçici-dosya taşıması kullanır. `Modules:Media:ObjectStorageProvider=Minio` seçildiğinde `MinioObjectStorage` aynı portu resmi SDK ile uygular; bucket'ı idempotent oluşturur, stream upload/read, delete ve en fazla yedi günlük presigned GET URL üretir. Endpoint, access key ve secret yalnız typed options/ortam değişkeninden gelir. `RUN_OBJECT_STORAGE_TESTS=true` sözleşme testi gerçek MinIO container'ında put/read/sign/delete turunu çalıştırır.

`IObjectStorage` uygulama portudur. Yerel geliştirme adaptörü anahtarları yapılandırılmış kök altında çözer ve `GetFullPath` sonrası kök öneki kontrolü yapar; `../` ile dizin dışına çıkış reddedilir. Yazma önce benzersiz geçici dosyaya yapılır, sonra atomik taşıma ile yayınlanır.

İstemciye fiziksel dosya yolu verilmez. İndirme API'si her istekte `Public`, `Followers` veya `Private` görünürlüğünü ve sosyal grafikteki engel/takip durumunu doğrular. Süresi dolan tamamlanmamış kayıtları arka plan işi temizler. Yerel tarayıcı EICAR test imzasını reddeder. `AntivirusProvider=ClamAv` seçildiğinde `ClamAvAntivirusScanner`, dosyayı yol paylaşmadan clamd `INSTREAM` protokolüyle yollar; timeout ve semaphore, tarama kuyruğunun API belleğini sınırsız büyütmesini engeller. `docker compose --profile core --profile app --profile antivirus up` resmi `clamav/clamav:1.4_base` imajını ve kalıcı imza veritabanını açar. TCP protokolü şifreli olmadığı için clamd portu üretimde yalnız güvenilen iç ağda tutulmalıdır. MinIO adaptörü de aynı portun alternatifidir ve normal yerel kabul için zorunlu değildir.

## Neden tek veritabanı blob alanı kullanılmadı?

Uygulama kayıtlarıyla büyük medya baytlarını aynı satır/dokümana koymak yedekleme, sorgu belleği ve ölçekleme maliyetlerini birbirine bağlar. Metadata işlemsel depoda, baytlar nesne depolama portunda tutulduğu için MinIO veya bulut nesne depolamasına geçiş Domain/Application kodunu değiştirmez.
