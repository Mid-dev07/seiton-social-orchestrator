---
trigger: glob
globs: "**/browser/**, **/adapters/**, **/security/**, **/crypto/**, **/*worker*"
description: "Aturan wajib untuk otomasi browser Playwright multi-profil, isolasi proxy, deteksi CAPTCHA/2FA, dan enkripsi kredensial lokal."
---

# Aturan Isolasi Browser & Keamanan Kredensial

## 1. Isolasi Profil & Konkurensi Akun
- Setiap akun wajib memiliki direktori profil persisten terpisah di `./data/profiles/<account_id>/`.
- Gunakan `chromium.launchPersistentContext(profileDir, { proxy, timezoneId, locale, viewport })` dengan parameter konsisten per akun.
- **Per-Account Mutex:** Gunakan antrean terkunci per `account_id` dan batasi total browser aktif secara bersamaan dengan `MAX_CONCURRENT_BROWSERS` (default `2` agar aman untuk RAM lokal).
- Tambahkan jeda acak manusiawi (*jitter* antara `1500ms` hingga `4500ms`) di antara interaksi halaman.

## 2. Deteksi Challenge & Auto-Pause
- Setiap `PlatformAdapter` wajib memeriksa keberadaan indikator checkpoint keamanan sebelum dan sesudah aksi:
  - URL redirect ke `/login`, `/checkpoint`, `/challenge`, `/two_factor`, atau `/suspended`.
  - Elemen DOM CAPTCHA (`iframe[src*="captcha"]`, `[data-testid*="challenge"]`, teks verifikasi keamanan).
- Jika terdeteksi:
  1. Segera ubah status akun di SQLite menjadi `CHALLENGE_PAUSED`.
  2. Simpan full-page screenshot ke `./data/logs/challenges/<account_id>-<timestamp>.png`.
  3. Tutup context browser dengan bersih dan **jangan** melakukan retry otomatis pada akun tersebut sampai diselesaikan manusia.

## 3. Enkripsi At-Rest (AES-256-GCM)
- Cookie sesi, password/URL proxy berautentikasi, dan token sensitif wajib dienkripsi sebelum disimpan ke SQLite menggunakan `AES-256-GCM` dengan IV acak 12-byte dan authentication tag 16-byte.
- Kunci diambil dari `process.env.MASTER_ENCRYPTION_KEY` (32-byte hex/base64). Jika kunci tidak valid saat startup, aplikasi wajib gagal lebih awal (*fail-fast*) dengan pesan instruksi yang jelas.
