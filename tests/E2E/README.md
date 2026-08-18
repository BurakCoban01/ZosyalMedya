# Canlı uçtan uca testler

Bu betikler sahte repository kullanmaz; çalışan API, veri depoları, Redis, SignalR ve yerel e-posta pickup adaptörüyle konuşur. Kayıt olan kullanıcılar `identity-helper.mjs` tarafından pickup e-postasındaki tek kullanımlık belirteçle doğrulanır. API farklı bir çalışma dizininden başlatılırsa `EMAIL_PICKUP_DIR` açıkça verilir. Compose API'si sınanıyorsa `EMAIL_PICKUP_CONTAINER=zosyalmedya-api-1` seçilir; yardımcı yalnız `docker exec` argümanlarıyla sabit pickup dizinini okur, shell komutu birleştirmez.

```powershell
$env:API_URL = 'http://127.0.0.1:5084'
node tests/E2E/messaging-live.mjs
node tests/E2E/search-live.mjs
node tests/E2E/media-live.mjs
node tests/E2E/content-engagement-live.mjs
```

Moderasyon testi yönetici kimliğini kaynak koddan almaz. Yerel composition root için bootstrap değerleri secret ortam değişkenlerinden verilir; test aynı hesabı `E2E_ADMIN_LOGIN` ve `E2E_ADMIN_PASSWORD` ile kullanır:

```powershell
$env:E2E_ADMIN_LOGIN = $env:ADMIN_BOOTSTRAP_USERNAME
$env:E2E_ADMIN_PASSWORD = $env:ADMIN_BOOTSTRAP_PASSWORD
node tests/E2E/moderation-live.mjs
```

Bu değerler `.env.example` içinde bilerek boş bırakılmıştır. Gerçek sırlar repoya eklenmez.
