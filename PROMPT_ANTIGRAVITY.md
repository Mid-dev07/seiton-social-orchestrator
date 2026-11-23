# Prompt Eksekusi Google Antigravity (Gemini 4 Neon & Argon)

## Panduan Pemilihan Model & Mode di Antigravity
- **Tahap Planning & Arsitektur (`/plan`):** Gunakan **Orchestrator (Argon)** atau **Gemini 4 Argon (Thinking: High)** untuk menyusun blueprint, skema database SQLite, dan kontrak state machine DAG tanpa celah konkurensi.
- **Tahap Eksekusi Kode & Test Suite:** Beralih ke **Gemini 4 Neon (Thinking: High/Extra)** atau **Orchestrator (Neon)** untuk implementasi multi-file cepat dan eksekusi siklus verifikasi tertutup di terminal.

---

## Prompt Siap Tempel (Isi 3 Variabel `[DALAM_KURUNG]` Sebelum Mengirim)

```xml
<objective>
Bangun Milestone 1 dari aplikasi web lokal manajemen & orkestrasi promosi sosial media 1-pintu bernama [NAMA_PROYEK] untuk 5 platform (TikTok, Threads, X, Instagram, Facebook).
- Skala akun target: [TARGET_JUMLAH_AKUN] akun lintas 5 platform.
- Fokus promosi: [FOKUS_PROMOSI].
- Mode operasi: Full-otomatis berbasis state machine DAG dengan isolasi profil browser persisten per akun dan pengaman otomatis (circuit breaker, deteksi CAPTCHA, rate limiter, serta global kill switch).
</objective>

<context_and_specs>
Seluruh aturan arsitektur, kontrak database, skema JSON antar agen, integrasi Meta Model API (Muse AI), serta aturan isolasi browser sudah tersedia di workspace ini. Baca dan patuhi tanpa penyimpangan:
- @AGENTS.md
- @docs/PROJECT_BRIEF.md
- @docs/TECH_SPEC.md
- @docs/RISK_MITIGATION.md
</context_and_specs>

<milestone_1_deliverables>
Bangun dan verifikasi seluruh komponen Milestone 1 secara end-to-end dalam mode default `DRY_RUN=true`:
1. **Monorepo & Database Lokal:** Setup TypeScript monorepo (`apps/web` Next.js App Router + `apps/worker` Node.js worker + `packages/shared` skema Zod & tipe data) dengan SQLite (`better-sqlite3`) + Drizzle ORM dan migrasi otomatis untuk tabel `campaigns`, `accounts`, `agent_runs`, `content_assets`, `publish_jobs`, dan `insights`.
2. **Enkripsi Kredensial Lokal:** Implementasi enkripsi AES-256-GCM menggunakan `MASTER_ENCRYPTION_KEY` dari `.env` untuk melindungi cookie sesi, proxy credentials, dan API key di SQLite.
3. **ModelProvider Layer (Meta Muse AI + Fallback):** Implementasi interface `ModelProvider` dengan `MetaMuseProvider` (`https://api.meta.ai/v1` — mendukung routing model `muse-wonder-1.0`, `muse-spark-1.3`, `muse-ember-1.0`, dan `muse-image-1.0`) serta `MockModelProvider` otomatis bila `META_API_KEY` belum diisi.
4. **DAG Orchestrator & 6 Specialist Agents:**
   - Orchestrator (Muse Wonder / Spark) memecah 1 perintah menjadi pipeline stateful per platform & akun.
   - Researcher Agent -> `ResearchBrief`
   - Social Media Strategist Agent -> `CampaignPlan` (jadwal + matriks variasi lintas akun)
   - Copywriter Agent -> `CopyBundle` (hook, caption, thread, CTA sesuai limit platform)
   - Designer & Animator Agent -> `VisualSpec` JSON yang dirender deterministik oleh mesin lokal (HTML/CSS-to-PNG via Playwright + wrapper FFmpeg dengan re-encoding metadata unik per akun agar file hash berbeda).
   - Automated QA & Anti-Duplicate Gate -> validasi rasio aspek, batas karakter, kata terlarang, dan skor kemiripan Jaccard/cosine antar akun `< 0.60` (maksimal 2x retry otomatis sebelum status `FAILED`).
   - Insight Analyst Agent -> menarik metrik simulasi/live ke `insights` dan memperbarui `PerformanceMemory` untuk siklus berikutnya.
5. **Isolated Browser Worker & 5 Platform Adapters (`DRY_RUN`):**
   - `BrowserProfileManager` berbasis Playwright `launchPersistentContext` dengan 1 `userDataDir` terpisah per akun, binding proxy HTTP/SOCKS5 per akun, kunci antrean per akun (tidak pernah 2 sesi simultan untuk akun yang sama), dan deteksi otomatis halaman login/2FA/CAPTCHA yang langsung mengubah status akun menjadi `CHALLENGE_PAUSED` + menyimpan screenshot bukti.
   - 5 `PlatformAdapter` (`tiktok`, `threads`, `x`, `instagram`, `facebook`) dengan file konfigurasi selector terpusat dan simulasi alur penuh + screenshot tanpa klik Publish selama `DRY_RUN=true`.
6. **Dashboard Operasional Lokal:**
   - Command Center (input 1 perintah kampanye, pilih grup akun, kuota harian, batas biaya token).
   - Account Vault (tambah/edit akun, proxy, timezone, status kesehatan akun).
   - Live Agent Pipeline Feed real-time menggunakan Server-Sent Events (SSE).
   - Content & Asset Inspector (pratinjau hasil copy, visual PNG/MP4, hash file, skor anti-duplikat, dan screenshot dry-run).
   - Global Kill Switch (**PAUSE ALL CAMPAIGNS**) yang selalu terlihat di header dan menghentikan dispatch job baru dalam `< 2000ms`.
</milestone_1_deliverables>

<execution_and_verification>
1. Mulai dengan `/plan` singkat yang memetakan urutan pembuatan file dan dependensi modul.
2. Implementasikan kode nyata tanpa placeholder `TODO`, tanpa `try/catch` kosong, dan tanpa hardcode secret.
3. Jalankan skill `/verify-milestone` (typecheck, lint, unit test, dan integration test end-to-end 1 perintah -> 2 akun berbeda -> validasi anti-duplikat -> dry-run publish -> uji tombol PAUSE ALL) dan perbaiki sendiri setiap error sebelum melaporkan penyelesaian.
</execution_and_verification>
```
