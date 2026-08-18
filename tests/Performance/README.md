# Yük testi

`feed-and-search.k6.js`, kimlik doğrulanmış keşif akışı ile arama okuma yolunu birlikte yükler. Kabul eşiği hata oranı `%1` altı ve p95 yanıt süresi `400 ms` altıdır. Yerel sonuç kapasite iddiası değildir; kullanılan donanım, veri hacmi, commit ve yapılandırmayla birlikte saklanmalıdır.

Kayıt akışı e-posta doğrulaması gerektirdiği için yük testi, kimlik yaşam döngüsünü ölçümün içine gizlice katmaz. Önce yerel pickup e-postasından doğrulanan ayrı bir kullanıcı üretilir, sonra erişim belirteci k6'ya aktarılır:

```powershell
$env:API_URL = 'http://127.0.0.1:5084'
$env:ACCESS_TOKEN = node tests/Performance/provision-load-user.mjs
k6 run -e API_URL=$env:API_URL -e ACCESS_TOKEN=$env:ACCESS_TOKEN tests/Performance/feed-and-search.k6.js
```

API farklı çalışma dizininden başlatıldıysa pickup klasörü `EMAIL_PICKUP_DIR` ortam değişkeniyle açıkça belirtilir. Bu yalnızca yerel test adaptörüdür; üretim e-posta sağlayıcısının içeriğine erişmez.
