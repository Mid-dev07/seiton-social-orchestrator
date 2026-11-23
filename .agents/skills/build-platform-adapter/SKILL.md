---
name: build-platform-adapter
description: "Prosedur standar untuk membuat, memperbarui, atau mengkalibrasi adapter otomasi browser untuk TikTok, Threads, X, Instagram, atau Facebook."
---

# Skill: Build & Calibrate Platform Adapter

Gunakan skill ini saat mengimplementasikan atau memperbarui selector DOM untuk salah satu dari 5 platform target (`tiktok`, `threads`, `x`, `instagram`, `facebook`).

## Langkah Kerja
1. **Pisahkan Selector dari Logika Alur:**
   - Simpan seluruh selector CSS/ARIA/role di file konfigurasi terpisah `apps/worker/src/adapters/selectors/<platform>.selectors.ts` lengkap dengan komentar tanggal verifikasi.
2. **Implementasikan Kontrak `PlatformAdapter`:**
   - `verifySession(page)`: Cek apakah profil sudah login dan bebas dari checkpoint/CAPTCHA.
   - `composePost(page, payload)`: Isi teks/caption secara bertahap (simulasi ketikan natural) dan unggah file media lokal bila ada.
   - `submitOrDryRun(page, dryRun)`:
     - Jika `dryRun === true`: Tangkap screenshot pratinjau composer ke `./data/logs/dry-run/<platform>-<accountId>-<timestamp>.png` dan kembalikan `{ status: "DRY_RUN_OK", screenshotPath }` **tanpa** menekan tombol Publish.
     - Jika `dryRun === false`: Klik tombol Publish, tunggu konfirmasi network/DOM, dan ekstrak URL/ID postingan.
   - `scrapeBasicMetrics(page, postUrl)`: Tarik metrik publik dasar (views, likes, replies, reposts) untuk Insight Analyst Agent.
3. **Validasi Batas Platform:**
   - Pastikan adapter menolak payload yang melanggar rasio aspek media atau batas karakter platform sebelum membuka browser.
4. **Uji Terisolasi:**
   - Jalankan test adapter dalam mode `DRY_RUN=true` terlebih dahulu sebelum mengizinkan eksekusi live pada akun uji coba.
