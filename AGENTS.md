# Workspace Operating Rules — Multi-Agent Social Media Orchestrator

Dokumen ini adalah aturan permanen (`always_on`) untuk seluruh agen AI di Google Antigravity saat mengerjakan repositori ini.

## 1. Sumber Kebenaran Tunggal (Single Source of Truth)
Sebelum membuat perubahan skema, API, atau alur agen, selalu rujuk spesifikasi resmi proyek:
- Ruang lingkup & non-tujuan: @docs/PROJECT_BRIEF.md
- Arsitektur, skema SQLite, kontrak Zod, dan integrasi Meta Muse AI: @docs/TECH_SPEC.md
- Mitigasi risiko pemblokiran akun, konkurensi, dan keamanan: @docs/RISK_MITIGATION.md

## 2. Invarian Arsitektur Wajib
1. **Local-First Zero-Infra:** Aplikasi harus dapat dijalankan lokal hanya dengan `pnpm install && pnpm dev`. Dilarang menambahkan dependensi Docker, Redis, atau database eksternal sebagai syarat wajib menjalankan aplikasi.
2. **Strict TypeScript & Zod Boundaries:** Dilarang menggunakan `any` tanpa alasan eksplisit. Seluruh input/output antar agen AI, API route, dan adapter platform wajib divalidasi menggunakan skema Zod di `packages/shared`.
3. **One Account = One Isolated Context:** Dilarang keras menjalankan dua sesi browser secara bersamaan pada akun yang sama, atau berbagi `userDataDir` dan proxy antar akun yang berbeda.
4. **Default Safety (`DRY_RUN=true`):** Sistem tidak boleh melakukan klik tombol publikasi live secara default. Mode live hanya aktif jika `DRY_RUN=false` dan flag eksplisit pada kampanye diaktifkan.
5. **No Secret Leakage:** Dilarang mencetak API key, password proxy, cookie sesi, atau `MASTER_ENCRYPTION_KEY` ke `console.log`, file log, maupun SSE stream.

## 3. Standar Anti-Slop Kode
- Tidak ada fungsi dummy, `// TODO: implementasi nanti`, atau data palsu yang disamarkan sebagai hasil nyata.
- Setiap blok `catch` wajib mencatat error terstruktur, memperbarui state database (`FAILED`, `RATE_LIMITED`, atau `CHALLENGE_PAUSED`), dan memicu circuit breaker bila ambang batas kegagalan tercapai.
- Seluruh perintah build, migrasi, dan pengujian harus diverifikasi melalui eksekusi terminal nyata menggunakan `/verify-milestone`.
