---
name: ui-ux-pro-max
description: "Standar desain antarmuka dashboard Seiton-Social Media mengacu pada nextlevelbuilder/ui-ux-pro-max-skill (kontras >=4.5:1, nol emoji struktural, target klik >=44px, ritme spasi 8px, dan hierarki navigasi bersih)."
---

# UI/UX Pro Max Standard (Seiton-Social Media)

Acuan: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`

## Aturan Prioritas Wajib
1. **Aksesibilitas & Kontras (CRITICAL):** Kontras teks normal minimal `4.5:1` di Light & Dark Mode; focus ring terlihat jelas; seluruh tombol ikon wajib punya `aria-label`; ikon dekoratif di sebelah teks diberi `aria-hidden="true"`.
2. **Target Sentuh & Interaksi (CRITICAL):** Tinggi tombol interaktif minimal `44px` (`min-h-11`), jarak antar kontrol minimal `8px`, feedback loading jelas saat proses berjalan.
3. **Nol Emoji Struktural (HIGH):** Gunakan ikon vektor SVG (`lucide-react` stroke `1.5px`) untuk navigasi, status, dan tombol aksi. Dilarang memakai emoji sebagai ikon UI.
4. **Tipografi & Warna Semantik (MEDIUM):** Ukuran body `>= 14px`–`16px`, line-height `1.5`, dilarang teks `< 12px` untuk konten utama, dan gunakan token warna semantik yang ramah mata (bukan hitam pekat `#000` atau neon berlebih).
5. **Progressive Disclosure & Layout (HIGH):** Pisahkan tugas utama ke navigasi sidebar yang rapi dan tampilkan detail teknis JSON hanya saat diminta (`expandable`).
