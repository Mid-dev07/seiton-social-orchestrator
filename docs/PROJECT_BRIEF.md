# Project Brief — Multi-Agent Social Media Command Center (1-Pintu)

## 1. Masalah & Tujuan
Mengelola puluhan akun lintas 5 jaringan sosial (TikTok, Threads, X, Instagram, Facebook) secara manual memakan waktu tinggi dan rawan inkonsistensi pesan. Aplikasi ini membangun **pusat kendali web lokal 1-pintu** yang menerima **1 perintah kampanye**, lalu mengorkestrasi tim agen AI berbasis **Meta Muse AI** untuk meriset tren, menyusun strategi, menulis copy unik per akun, merender aset visual/video lokal, memublikasikannya melalui profil browser terisolasi, dan mengevaluasi performanya secara berulang.

## 2. Target Pengguna & Lingkungan
- **Operator:** Pemilik brand / tim growth / operator agensi tunggal yang menjalankan aplikasi di mesin lokal (macOS/Linux/Windows).
- **Skala Target:** 10–50+ akun lintas TikTok, Threads, X, Instagram, dan Facebook.
- **Lingkungan Eksekusi:** 100% lokal-pertama (Next.js Dashboard + Node.js Worker + SQLite + Playwright + FFmpeg).

## 3. Ruang Lingkup MVP (Milestone 1)
- Input kampanye 1-pintu dengan batas kuota harian dan batas anggaran token.
- Orkestrator DAG stateful berbasis Meta Model API (`muse-wonder-1.0` & `muse-spark-1.3`) + fallback mock lokal.
- 6 peran agen spesialis terstruktur: Researcher, Strategist, Copywriter, Designer/Animator, QA & Publisher, dan Insight Analyst.
- Rendering media deterministik lokal (HTML-to-PNG + FFmpeg video wrapper) dengan variasi hash unik per akun.
- Browser automation terisolasi per akun (`userDataDir` + proxy per akun) dengan mode default `DRY_RUN=true`, auto-pause saat CAPTCHA/2FA, dan tombol darurat **PAUSE ALL**.

## 4. Non-Tujuan (Dilarang Dibangun di MVP)
- Tidak membangun backend SaaS multi-tenant cloud, sistem billing pengguna, atau autentikasi OAuth publik.
- Tidak membangun mesin *bypass* CAPTCHA otomatis ilegal atau spoofing kernel tingkat OS.
- Tidak mengandalkan layanan rendering video cloud berbayar sebagai syarat wajib agar aplikasi berjalan.
