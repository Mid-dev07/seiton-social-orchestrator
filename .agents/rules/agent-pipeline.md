---
trigger: model_decision
description: "Aktifkan aturan ini saat merancang, menulis, atau memodifikasi orkestrator DAG, integrasi Meta Muse AI API, 6 agen spesialis, QA anti-duplikat, atau pipeline rendering media lokal."
---

# Aturan Pipeline Multi-Agen & Meta Model API (Muse AI)

## 1. Konfigurasi Resmi Meta Model API
- **Base URL Default:** `https://api.meta.ai/v1` (dibaca dari `process.env.META_API_BASE_URL`).
- **Autentikasi:** Header `Authorization: Bearer ${process.env.META_API_KEY}`.
- **Routing Model per Peran Agen:**
  - `muse-wonder-1.0`: Gunakan untuk **Orchestrator Lead** dan **Insight Analyst** (penalaran kompleks, dekomposisi kampanye, analisis pola performa).
  - `muse-spark-1.3`: Gunakan untuk **Researcher**, **Strategist**, **Copywriter**, dan **Designer Spec Generator** (kecepatan tinggi + structured JSON output).
  - `muse-ember-1.0`: Gunakan untuk **QA & Compliance Pre-Check** ringan atau klasifikasi cepat.
  - `muse-image-1.0`: Gunakan bila agen Designer membutuhkan generasi aset gambar dasar dengan *anchored composition* sebelum masuk ke komposisi lokal.
- **Fallback Otomatis:** Jika `META_API_KEY` kosong atau bernilai `"mock"`, `ModelProvider` wajib beralih secara deterministik ke `MockModelProvider` yang menghasilkan output valid sesuai skema Zod agar pengembangan & tes lokal tetap berjalan tanpa error.

## 2. Kontrak DAG & Circuit Breaker
- Setiap tahap agen (`RESEARCH` -> `STRATEGY` -> `COPY` -> `MEDIA` -> `QA_GATE` -> `PUBLISH` -> `INSIGHT`) wajib menyimpan snapshot input, output JSON, jumlah token, dan durasi ke tabel `agent_runs`.
- **Circuit Breaker:**
  - Maksimal `2` kali retry per tahap agen jika validasi Zod atau QA Gate gagal.
  - Hentikan eksekusi kampanye otomatis (`PAUSED_BUDGET`) jika total estimasi token/biaya melebihi `maxTokenBudget` kampanye.
  - Periksa flag global `system_state.global_paused` sebelum mengeksekusi setiap node DAG; jika `true`, batalkan dispatch dalam `< 2000ms`.

## 3. Aturan QA & Anti-Duplicate Gate
- Sebelum job masuk ke antrean `publish_jobs`, jalankan validasi terprogram:
  1. Panjang karakter sesuai batas platform (`X`: <= 280 per post, `Threads`: <= 500, `Instagram`: <= 2200, `TikTok`: <= 2200, `Facebook`: <= 63206).
  2. Skor kemiripan teks (normalized n-gram Jaccard / cosine similarity) antar dua akun dalam kampanye yang sama wajib `< 0.60`.
  3. Setiap file media output (PNG/MP4) wajib melewati proses re-encoding FFmpeg/Sharp dengan variasi metadata/crop mikro (`1-2px`) per akun sehingga SHA-256 hash file berbeda untuk setiap akun.
