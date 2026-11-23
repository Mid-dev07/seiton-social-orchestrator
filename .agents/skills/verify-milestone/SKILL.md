---
name: verify-milestone
description: "Jalankan siklus verifikasi tertutup (typecheck, lint, unit tests, dan integration test end-to-end) sebelum menyatakan milestone selesai."
---

# Skill: Verify Milestone (Closed-Loop Verification)

Gunakan prosedur ini setiap kali menyelesaikan satu modul utama atau sebelum melaporkan selesainya milestone kepada pengguna.

## Langkah Eksekusi Wajib
1. **Static Analysis & Typecheck:**
   - Jalankan `pnpm typecheck` (atau `tsc --noEmit` di seluruh workspace).
   - Jalankan `pnpm lint`.
   - Perbaiki seluruh error tipe atau lint tanpa menggunakan `@ts-ignore`.
2. **Database & Security Verification:**
   - Pastikan migrasi SQLite berjalan bersih pada database test sementara.
   - Jalankan unit test untuk enkripsi `AES-256-GCM` (memastikan ciphertext berbeda tiap enkripsi dan gagal jika auth tag dimodifikasi).
3. **Agent Pipeline & Anti-Duplicate Verification:**
   - Jalankan test otomatis yang mensimulasikan 1 perintah kampanye untuk minimal **2 akun berbeda** pada platform yang sama.
   - Verifikasi bahwa:
     - Status DAG berpindah berurutan hingga selesai.
     - Caption kedua akun memiliki skor kemiripan `< 0.60`.
     - SHA-256 hash file media kedua akun **tidak identik**.
4. **Browser Dry-Run & Kill Switch Verification:**
   - Jalankan simulasi `DRY_RUN=true` dan verifikasi screenshot tersimpan di `./data/logs/dry-run/`.
   - Uji fungsi **PAUSE ALL CAMPAIGNS** dan pastikan job baru berhenti dalam `< 2000ms`.
   - Uji simulasi deteksi CAPTCHA dan pastikan status akun berubah menjadi `CHALLENGE_PAUSED`.
5. **Laporan Bukti:**
   - Ringkas hasil eksekusi aktual dari terminal (jumlah test lulus, waktu eksekusi, dan file log/artefak yang dihasilkan).
