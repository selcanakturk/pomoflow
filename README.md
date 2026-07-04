# PomoFlow

Vanilla JavaScript ile hazırlanmış premium Pomodoro ve görev takip uygulaması.

## Özellikler

- Pomodoro, kısa mola ve uzun mola zamanlayıcısı
- Günlük ve haftalık istatistikler (grafik)
- Streak (günlük seri) sistemi
- Günlük pomodoro hedefi ve ilerleme çubuğu
- Ayarlar penceresi (süreler, bildirimler, hedefler, senkron)
- Tarayıcı bildirimleri ve sesli uyarı
- Dark / Light tema
- Supabase ile bulut senkronizasyonu (opsiyonel)
- PWA desteği — telefona yüklenebilir

## Çalıştırma

`index.html` dosyasını tarayıcıda açman yeterli. PWA özellikleri için bir HTTP sunucusu kullan:

```bash
npx serve .
```

## Video arka plan

Loop olarak kullanmak istediğin videoyu şu dosya adıyla ekle:

```txt
assets/background.mp4
```

## Supabase senkronizasyonu

1. [Supabase](https://supabase.com) projesi oluştur
2. `supabase-setup.sql` dosyasını SQL Editor'da çalıştır
3. `config.js` dosyasına URL ve anon key'i ekle:

```js
window.POMOFLOW_CONFIG = {
  supabaseUrl: "https://xxx.supabase.co",
  supabaseAnonKey: "eyJ...",
};
```

4. Ayarlar → Senkron sekmesinden kayıt ol veya giriş yap

## PWA yükleme

Chrome/Edge: Adres çubuğundaki "Yükle" simgesine tıkla.
Safari (iOS): Paylaş → Ana Ekrana Ekle.

## Kontrol

```bash
npm run check
```
