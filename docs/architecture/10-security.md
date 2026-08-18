# Güvenlik tasarımı

## Parola ve token ayrımı

Kullanıcı parolaları `AdaptivePasswordHasher` ile ASP.NET Core `PasswordHasher<T>` üzerinden PBKDF2 tabanlı, salt içeren ve sürümlenebilir biçimde saklanır. Referans projedeki düz SHA-256 parola yaklaşımı kullanılmaz.

Refresh token 64 bayt kriptografik rastgele veridir. Parola değildir; yüksek entropili olduğu için depoda `RefreshTokenProtector` tarafından SHA-256 özeti tutulur. Ham değer yalnızca login/refresh cevabında istemciye bir kez verilir; log, veritabanı veya cache'e yazılmaz.

## Rotation ve reuse detection

```mermaid
sequenceDiagram
    participant C as İstemci
    participant A as Identity API
    participant S as UserSession aggregate
    participant D as Session repository
    C->>A: refresh(token A)
    A->>D: hash(A) ile session bul
    A->>S: Rotate(hash A, hash B)
    S->>S: A'yı consumed zincirine ekle
    A->>D: expected Version ile replacement
    A-->>C: access token + token B
    C->>A: eski token A tekrar kullanılır
    A->>D: consumed hash A ile session bul
    A->>S: reuse nedeniyle session revoke
    A-->>C: 401; yeniden giriş gerekli
```

`UserSession` tüketilmiş token hashlerini en fazla 128 rotation boyunca tutar. Sınır aşılırsa session güvenli biçimde kapatılır; koleksiyon sınırsız büyümez. PostgreSQL bunu `text[]`, MongoDB gömülü dizi olarak saklar.

## Cihaz oturumları

Login isteği `DeviceId` ve kullanıcıya gösterilecek `DeviceName` taşır. Aynı kullanıcı/cihaz yeniden giriş yaptığında önceki aktif session revoke edilir. Yetkili kullanıcı:

- `GET /api/v1/identity/sessions` ile kendi cihazlarını listeler;
- `DELETE /api/v1/identity/sessions/{id}` ile yalnızca kendisine ait session'ı kapatır;
- `POST /api/v1/identity/logout` ile refresh tokenın session'ını idempotent kapatır.

Session liste DTO'su refresh hashlerini döndürmez. Kaynak sahipliği handler içinde doğrulanır; yalnızca route authorization'a güvenilmez.

## Kanıt ve kalan işler

Gerçek PostgreSQL ve MongoDB API koşularında login → rotation → session listesi → eski token replay zinciri çalıştırılmış; replay ve son geçerli tokenın tekrar kullanımı `401` üretmiştir. Unit testleri aggregate invariantlarını, provider contract testleri kalıcılık eşdeğerliğini sınar.

Email verification, password reset, TOTP/recovery code, export/delete-my-data ve rol/policy yönetimi henüz tamamlanmamıştır; bunlar Identity bounded contextinin kalan kabul maddeleridir.
