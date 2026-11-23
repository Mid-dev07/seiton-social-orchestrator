# Risk Register & Operational Mitigations

| Risiko | Dampak | Mitigasi Teknis Wajib di Kode |
| :--- | :--- | :--- |
| **Pemblokiran / Shadowban Massal** akibat konten duplikat atau IP sama | Seluruh akun promosi tumbang bersamaan | 1) 1 akun = 1 `userDataDir` + 1 proxy khusus; 2) QA Gate memblokir teks dengan kemiripan >= 0.60; 3) FFmpeg re-encoding unik mengubah SHA-256 hash media per akun; 4) Batas kuota harian per akun. |
| **Loop Agen Tak Terbatas & Biaya Token Liar** di mode full-otomatis | API key terkuras dalam hitungan menit | 1) Maksimal 2x retry per node DAG; 2) Hard cap `max_token_budget` per kampanye; 3) Tombol darurat global **PAUSE ALL** yang mengecek state database sebelum setiap eksekusi agen & browser. |
| **Akun Terkena CAPTCHA / 2FA / Verifikasi** saat worker berjalan tanpa pengawasan | Percobaan login berulang memperparah suspensi akun | Deteksi otomatis URL/DOM checkpoint -> langsung set status akun `CHALLENGE_PAUSED`, simpan screenshot bukti, hentikan retry otomatis, dan tampilkan alert di dashboard. |
| **Kelebihan Beban RAM Lokal** akibat membuka puluhan browser Chromium sekaligus | Komputer lokal hang atau worker crash | Semaphore global `MAX_CONCURRENT_BROWSERS` (default 2) + antrean berurutan (mutex) per akun. |
| **Perubahan DOM Platform Mendadak** | Worker gagal menemukan tombol/input posting | Pemisahan file selector per platform (`*.selectors.ts`), mode `DRY_RUN=true` default untuk verifikasi aman, dan laporan error eksplisit dengan screenshot halaman saat gagal. |
