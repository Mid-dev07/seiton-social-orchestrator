# Seiton-Social Media — 1-Pintu Multi-Agent Social Media Orchestrator

Aplikasi orkestrasi & manajemen promosi sosial media berbasis **state machine DAG** dan **6 agen spesialis (Meta Muse AI)** untuk **10 akun lintas 5 platform** (`tiktok`, `threads`, `x`, `instagram`, `facebook`) dengan fokus promosi **Seiton.id (digitalisasi UMKM & paket aplikasi premium resmi)**.

## Fitur Utama
- **Dual-Layer Login System:**
  - Portal Operator (`admin@seiton.id` / `seiton2026` atau 1-klik **Masuk Instan**)
  - Account Vault & Session Wizard (verifikasi sesi 1-klik, import cookie terenkripsi **AES-256-GCM**, serta pemulihan checkpoint **CAPTCHA/2FA**)
- **Alur Kerja Terpandu 4 Langkah:**
  1. **Akun & Login** — Status 10 akun terisolasi (`userDataDir` + proxy terenkripsi per akun)
  2. **Buat Kampanye 1-Pintu** — 4 preset siap pakai Seiton.id + Pre-Flight Check + mode hemat resource (`Ringan SVG/Edge` vs `Browser Penuh Playwright + FFmpeg`)
  3. **Proses AI & Browser (SSE)** — Monitor real-time 7 tahap DAG (`RESEARCH` → `STRATEGY` → `COPY` → `MEDIA` → `QA` → `PUBLISH` → `INSIGHT`)
  4. **Hasil & Analitik** — Pratinjau copy (1-klik salin), visual PNG/MP4/SVG, hash SHA-256 unik, skor anti-duplikat `< 0.60`, screenshot dry-run, & `PerformanceMemory`
- **Pengaman Otomatis:** Mode aman default `DRY_RUN=true`, maksimal 2x retry QA Gate, batas biaya token, deteksi CAPTCHA → `CHALLENGE_PAUSED`, serta Global Kill Switch (**PAUSE ALL CAMPAIGNS**) `< 2000ms`.

## Menjalankan Lokal (Zero-Infra)
```bash
cp .env.example .env
pnpm install
pnpm dev
```
Buka `http://localhost:3000`.

## Verifikasi Lengkap
```bash
pnpm verify
pnpm build
```

## Deploy Gratis ke Cloudflare Workers (Tanpa Beban Device Lokal)
```bash
pnpm cf:deploy
```
