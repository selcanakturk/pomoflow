# PomoFlow PWA Test Plan

## Local test

1. Start a local server:
   ```bash
   npm run start
   ```
2. Open `http://localhost:4173`.
3. Run:
   ```bash
   npm run check
   npm run pwa:check
   ```

## Browser checks

- Manifest loads without errors.
- Service worker registers on `localhost`.
- App can be installed from the browser install UI.
- Refresh keeps the current user/session state.
- Offline reload shows the app shell.
- Desktop uses `assets/background.mp4`.
- Mobile width uses `assets/background-mobile.mp4`.

## Mobile checks

- Bottom navigation is visible only on small screens.
- Odak, Görevler, and İstatistik tabs show the correct sections.
- Hesap tab opens the auth/account modal.
- Timer ring does not overflow on small phones.
- Spotify opens and closes in the Odak tab.
- Notification permission flow works.
- Timer completion plays sound and vibrates when supported.

## Before Capacitor

- No console errors on first load.
- No horizontal scroll on mobile.
- Supabase SQL policies are applied.
- User data survives refresh and sign-out/sign-in.
- PWA install icon and app name look correct.
