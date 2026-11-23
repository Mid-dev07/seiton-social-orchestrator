import {
  CampaignPlanSchema,
  CopyBundleSchema,
  CopyItem,
  InsightReportSchema,
  PLATFORM_LIMITS,
  Platform,
  QAEvaluationSchema,
  ResearchBriefSchema,
  VisualSpec,
  VisualSpecBundleSchema,
  redactSecrets,
} from "@seiton/shared";
import { z } from "zod";

export type AgentRole =
  | "ORCHESTRATOR"
  | "RESEARCH"
  | "STRATEGY"
  | "COPY"
  | "DESIGNER"
  | "QA"
  | "INSIGHT"
  | "IMAGE";

export const MODEL_ROUTING: Record<AgentRole, string> = {
  ORCHESTRATOR: process.env.META_MODEL_ORCHESTRATOR || "muse-wonder-1.0",
  INSIGHT: process.env.META_MODEL_ORCHESTRATOR || "muse-wonder-1.0",
  RESEARCH: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
  STRATEGY: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
  COPY: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
  DESIGNER: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
  QA: process.env.META_MODEL_GUARD || "muse-ember-1.0",
  IMAGE: process.env.META_MODEL_IMAGE || "muse-image-1.0",
};

export interface StructuredGenerationRequest<TSchema extends z.ZodTypeAny> {
  role: AgentRole;
  schema: TSchema;
  systemPrompt: string;
  userPrompt: string;
  contextData: Record<string, unknown>;
}

export interface StructuredGenerationResult<T> {
  data: T;
  modelUsed: string;
  tokensUsed: number;
  providerName: "MetaMuseProvider" | "MockModelProvider";
}

export interface ModelProvider {
  readonly name: "MetaMuseProvider" | "MockModelProvider";
  generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredGenerationRequest<TSchema>
  ): Promise<StructuredGenerationResult<z.infer<TSchema>>>;
}

function estimateTokens(text: string): number {
  return Math.max(80, Math.ceil(text.length / 4));
}

function extractJsonObject(rawContent: string): unknown {
  const trimmed = rawContent.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch?.[1] ? fencedMatch[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

/**
 * Formats a CopyItem into platform-ready post text while honoring maxChars.
 */
export function formatCopyText(item: CopyItem): string {
  const limit = PLATFORM_LIMITS[item.platform].maxChars;
  const tags = item.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
  const full = `${item.hook}\n\n${item.body}\n\n${item.cta}\n${tags}`.trim();
  if (full.length <= limit) {
    return full;
  }
  const compact = `${item.hook} ${item.body} ${item.cta} ${tags}`.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  const minimal = `${item.hook} ${item.cta}`.replace(/\s+/g, " ").trim();
  return minimal.slice(0, limit);
}

/**
 * Production provider for Meta Model API (Muse AI) at https://api.meta.ai/v1.
 */
export class MetaMuseProvider implements ModelProvider {
  readonly name = "MetaMuseProvider" as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl ?? process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1").replace(
      /\/+$/,
      ""
    );
    this.apiKey = (apiKey ?? process.env.META_API_KEY ?? "").trim();
    if (!this.apiKey || this.apiKey === "mock") {
      throw new Error("MetaMuseProvider requires a non-mock META_API_KEY");
    }
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredGenerationRequest<TSchema>
  ): Promise<StructuredGenerationResult<z.infer<TSchema>>> {
    const modelUsed = MODEL_ROUTING[request.role];
    const endpoint = `${this.baseUrl}/chat/completions`;
    const bodyPayload = {
      model: modelUsed,
      temperature: request.role === "QA" ? 0.1 : 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${request.systemPrompt}\nReturn ONLY valid JSON matching the requested schema.`,
        },
        {
          role: "user",
          content: `${request.userPrompt}\n\nContext JSON:\n${JSON.stringify(request.contextData)}`,
        },
      ],
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const errText = redactSecrets(await response.text().catch(() => "Unknown API error"));
      throw new Error(`Meta Muse API error (${response.status}): ${errText}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Meta Muse API returned empty message content");
    }
    const parsedJson = extractJsonObject(content);
    const validated = request.schema.parse(parsedJson);
    const tokensUsed =
      json.usage?.total_tokens ?? estimateTokens(JSON.stringify(bodyPayload) + content);

    return {
      data: validated,
      modelUsed,
      tokensUsed,
      providerName: this.name,
    };
  }
}

interface SeitonCopyBlueprint {
  label: string;
  angle: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  accentHex: string;
  headline: string;
  subheadline: string;
}

/**
 * 12 lexicographically distinct blueprints promoting Seiton.id (UMKM digitalization + premium apps)
 * so multi-account campaigns stay well under the < 0.60 Jaccard/Cosine similarity ceiling.
 */
const SEITON_COPY_BANK: SeitonCopyBlueprint[] = [
  {
    label: "v1-kasir-qr",
    angle: "Efisiensi antrean kasir warung & kafe lewat katalog QR digital",
    hook: "Antrean kasir sering bikin pelanggan kabur saat jam makan siang?",
    body: "Banyak pemilik kedai kopi memakai sistem menu barcode otomatis agar pesanan langsung masuk dapur tanpa catat ulang.",
    cta: "Pelajari alur kasir rapi di portal Seiton.id sekarang.",
    hashtags: ["#KasirDigital", "#KedaiKopi", "#SeitonID"],
    accentHex: "#0F766E",
    headline: "Kasir Cepat Tanpa Salah Catat",
    subheadline: "Otomasi pesanan meja & dapur untuk kuliner lokal",
  },
  {
    label: "v2-bundling-desain",
    angle: "Hemat biaya software desain grafis & editing konten bulanan",
    hook: "Biaya langganan tool desain tim kreatif makin terasa berat tiap bulan?",
    body: "Gabungkan lisensi aplikasi grafis dan editor video resmi dalam satu paket terkelola agar arus kas toko tetap sehat.",
    cta: "Cek katalog paket hemat resmi via Seiton.id.",
    hashtags: ["#DesainUMKM", "#SoftwareResmi", "#HematBudget"],
    accentHex: "#B45309",
    headline: "Studio Konten Hemat Biaya",
    subheadline: "Lisensi aplikasi kreatif resmi untuk tim promosi",
  },
  {
    label: "v3-pembukuan-stok",
    angle: "Audit margin keuntungan harian pemilik toko kelontong & retail",
    hook: "Omzet ramai seharian tapi saldo rekening akhir bulan selalu menipis?",
    body: "Pencatatan HPP otomatis memetakan barang paling laris sekaligus mencegah kebocoran stok gudang kecil.",
    cta: "Mulai rapikan laporan laba rugi bersama Seiton.",
    hashtags: ["#PembukuanToko", "#ManajemenStok", "#BisnisLokal"],
    accentHex: "#1D4ED8",
    headline: "Laba Bersih Terpantau Akurat",
    subheadline: "Pantau stok menipis & margin produk secara real-time",
  },
  {
    label: "v4-ai-produktif",
    angle: "Akselerasi balasan chat customer service & penulisan deskripsi produk",
    hook: "Admin toko kewalahan membalas ratusan pesan masuk setiap malam?",
    body: "Manfaatkan asisten AI premium legal untuk menyusun katalog toko online dan skrip follow-up pembeli dalam hitungan detik.",
    cta: "Aktifkan akses workspace AI resmi melalui Seiton.id.",
    hashtags: ["#AdminCepat", "#AsistenAI", "#TokoOnline"],
    accentHex: "#7C3AED",
    headline: "Balas Pelanggan 3x Lebih Kilat",
    subheadline: "Asisten cerdas untuk CS & copywriting etalase",
  },
  {
    label: "v5-video-reels",
    angle: "Produksi video pendek promosi tanpa watermark untuk pemilik brand",
    hook: "Video produk terlihat amatir karena watermark aplikasi gratisan?",
    body: "Tingkatkan kepercayaan calon pembeli dengan rendering 4K bersih memakai akun editor video pro berlisensi jelas.",
    cta: "Amankan akun editing resmi hari ini di Seiton.id.",
    hashtags: ["#VideoProduk", "#KontenKreatif", "#BrandLokal"],
    accentHex: "#BE123C",
    headline: "Visual Tajam Bebas Watermark",
    subheadline: "Produksi klip promosi profesional dari smartphone",
  },
  {
    label: "v6-workspace-cloud",
    angle: "Kolaborasi spreadsheet & penyimpanan file tim remote tanpa batas",
    hook: "File faktur dan foto stok masih berserakan di memori ponsel pribadi?",
    body: "Pusatkan seluruh arsip pajak, invoice supplier, dan jadwal pengiriman ke penyimpanan cloud tim yang aman.",
    cta: "Beralih ke sistem kerja cloud terpadu via Seiton.",
    hashtags: ["#ArsipCloud", "#OperasionalRapi", "#KerjaTim"],
    accentHex: "#0369A1",
    headline: "Satu Gudang Arsip Digital",
    subheadline: "Sinkronisasi faktur & dokumen tim anti hilang",
  },
  {
    label: "v7-ekspansi-marketplace",
    angle: "Sinkronisasi etalase Instagram, TikTok Shop, dan website mandiri",
    hook: "Capek memperbarui harga barang satu per satu di lima aplikasi berbeda?",
    body: "Integrasikan etalase online mandiri agar tautan pemesanan langsung mengonversi trafik media sosial jadi transfer masuk.",
    cta: "Lihat demo etalase terhubung di Seiton.id.",
    hashtags: ["#EtalaseOnline", "#Omnichannel", "#JualanLaris"],
    accentHex: "#15803D",
    headline: "Tautan Order Langsung Closing",
    subheadline: "Hubungkan bio media sosial menuju checkout instan",
  },
  {
    label: "v8-keamanan-akun",
    angle: "Bahaya akun ilegal murah vs jaminan garansi resmi Seiton",
    hook: "Pernah kehilangan proyek penting gara-gara akun sharing murahan kena suspend?",
    body: "Pilih langganan aplikasi premium bergaransi penuh supaya materi presentasi dan aset brand tidak lenyap mendadak.",
    cta: "Dapatkan garansi akses resmi hanya di Seiton.id.",
    hashtags: ["#AntiSuspend", "#AkunGaransi", "#AmanTerpercaya"],
    accentHex: "#334155",
    headline: "Aset Aman Bebas Blokir",
    subheadline: "Garansi penuh pemakaian aplikasi premium legal",
  },
  {
    label: "v9-skala-franchise",
    angle: "Standarisasi SOP cabang baru usaha kuliner & jasa",
    hook: "Ingin membuka cabang kedua tapi bingung mengontrol kualitas pelayanan?",
    body: "Dokumentasikan SOP harian, daftar periksa kebersihan, serta target penjualan karyawan ke dalam papan kontrol terstruktur.",
    cta: "Unduh template SOP cabang digital di Seiton.",
    hashtags: ["#BukaCabang", "#SOPBisnis", "#FranchiseLokal"],
    accentHex: "#9333EA",
    headline: "Duplikasi Cabang Lebih Mudah",
    subheadline: "Pantau standar layanan outlet dalam satu dashboard",
  },
  {
    label: "v10-promo-bundle",
    angle: "Paket langganan tahunan untuk freelancer & agensi digital pemula",
    hook: "Freelancer pemula sering rugi karena membeli tools produktivitas secara eceran?",
    body: "Bundling aplikasi rapat daring, manajemen proyek, dan desain presentasi membantu menjaga margin proyek klien tetap tebal.",
    cta: "Bandingkan rincian paket freelancer di Seiton.id.",
    hashtags: ["#FreelancerID", "#ToolsProduktivitas", "#AgensiKecil"],
    accentHex: "#C2410C",
    headline: "Margin Proyek Klien Terjaga",
    subheadline: "Bundling software kerja harian harga bersahabat",
  },
  {
    label: "v11-loyalty-pelanggan",
    angle: "Database nomor pelanggan untuk kirim promo repeat order berkala",
    hook: "Pembeli hanya datang sekali lalu menghilang tanpa jejak?",
    body: "Simpan riwayat belanja konsumen secara rapi guna mengirim voucher ulang tahun dan penawaran eksklusif tiap bulan.",
    cta: "Bangun basis pelanggan setia lewat Seiton.id.",
    hashtags: ["#RepeatOrder", "#CRMPraktis", "#PelangganSetia"],
    accentHex: "#0D9488",
    headline: "Ubah Pembeli Jadi Pelanggan",
    subheadline: "Rekap kontak konsumen & pengingat promo otomatis",
  },
  {
    label: "v12-go-digital-2026",
    angle: "Transformasi bertahap usaha keluarga tradisional ke sistem modern",
    hook: "Usaha keluarga sudah puluhan tahun berdiri tapi belum punya jejak digital?",
    body: "Mulai langkah bertahap dari identitas visual profesional, katalog WhatsApp rapi, hingga aplikasi operasional harian ringan.",
    cta: "Konsultasikan transisi digital usaha Anda di Seiton.id.",
    hashtags: ["#UsahaKeluarga", "#TransformasiDigital", "#NaikKelas"],
    accentHex: "#2563EB",
    headline: "Warisan Bisnis Siap Modern",
    subheadline: "Pendampingan bertahap dari offline menuju digital",
  },
];

function selectDistinctBlueprints(count: number, attempt: number): SeitonCopyBlueprint[] {
  const result: SeitonCopyBlueprint[] = [];
  const offset = (attempt - 1) * 2;
  for (let i = 0; i < count; i += 1) {
    const idx = (i + offset) % SEITON_COPY_BANK.length;
    const blueprint = SEITON_COPY_BANK[idx];
    if (blueprint) {
      result.push(blueprint);
    }
  }
  return result;
}

/**
 * Deterministic local fallback model provider when META_API_KEY is empty or "mock".
 */
export class MockModelProvider implements ModelProvider {
  readonly name = "MockModelProvider" as const;

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredGenerationRequest<TSchema>
  ): Promise<StructuredGenerationResult<z.infer<TSchema>>> {
    const modelUsed = MODEL_ROUTING[request.role];
    const ctx = request.contextData;
    let output: unknown;

    switch (request.role) {
      case "RESEARCH": {
        const platforms = (ctx.targetPlatforms as Platform[] | undefined) ?? [
          "tiktok",
          "threads",
          "x",
          "instagram",
          "facebook",
        ];
        const priorPatterns = (ctx.priorWinningPatterns as string[] | undefined) ?? [];
        output = ResearchBriefSchema.parse({
          trends: platforms.map((platform, idx) => ({
            topic:
              idx % 2 === 0
                ? "Digitalisasi operasional UMKM & kasir cloud tanpa ribet"
                : "Efisiensi biaya langganan aplikasi premium resmi untuk kreator & bisnis",
            hookAngle:
              SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]?.angle ??
              "Studi kasus efisiensi biaya UMKM",
            platform,
            confidence: Number((0.84 + (idx % 3) * 0.04).toFixed(2)),
          })),
          audiencePainPoints: [
            "Pembukuan manual rawan selisih stok & arus kas",
            "Harga eceran aplikasi desain, AI, dan editing terlalu mahal untuk UMKM",
            "Kekhawatiran akun sharing ilegal cepat terkena suspend",
          ],
          bannedAngles: [
            "penipuan cepat kaya",
            "judi online",
            "aplikasi bajakan",
            "crack gratis",
          ],
          priorWinningPatterns: priorPatterns,
        });
        break;
      }

      case "STRATEGY": {
        const accounts = (ctx.accounts as Array<{ id: string; platform: Platform }> | undefined) ?? [];
        const attempt = Number(ctx.attempt ?? 1);
        const campaignId = String(ctx.campaignId ?? "camp");
        const blueprints = selectDistinctBlueprints(accounts.length, attempt);
        const now = Date.now();

        output = CampaignPlanSchema.parse({
          assignments: accounts.map((acc, idx) => {
            const bp = blueprints[idx] ?? SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]!;
            const scheduledIso = new Date(now + (idx + 1) * 15 * 60 * 1000).toISOString();
            const format: "IMAGE" | "VIDEO" = acc.platform === "tiktok" ? "VIDEO" : "IMAGE";
            return {
              accountId: acc.id,
              platform: acc.platform,
              scheduledIso,
              contentAngle: bp.angle,
              format,
              variationSeed: `seed-${campaignId.slice(0, 8)}-${acc.id}-${attempt}-${idx}`,
            };
          }),
        });
        break;
      }

      case "COPY": {
        const assignments =
          (ctx.assignments as Array<{ accountId: string; platform: Platform }> | undefined) ?? [];
        const attempt = Number(ctx.attempt ?? 1);
        const blueprints = selectDistinctBlueprints(assignments.length, attempt);

        const items: CopyItem[] = assignments.map((assignment, idx) => {
          const bp = blueprints[idx] ?? SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]!;
          const limit = PLATFORM_LIMITS[assignment.platform].maxChars;
          const hook = bp.hook;
          let body = bp.body;
          const cta = bp.cta;
          let hashtags = [...bp.hashtags];

          const candidateText = `${hook}\n\n${body}\n\n${cta}\n${hashtags.join(" ")}`;
          if (candidateText.length > limit) {
            hashtags = hashtags.slice(0, 2);
            const overhead = hook.length + cta.length + hashtags.join(" ").length + 8;
            const maxBodyLen = Math.max(24, limit - overhead);
            if (body.length > maxBodyLen) {
              body = `${body.slice(0, Math.max(10, maxBodyLen - 3)).trim()}...`;
            }
          }

          return {
            accountId: assignment.accountId,
            platform: assignment.platform,
            hook,
            body,
            cta,
            hashtags,
            variantLabel: `${bp.label}-a${attempt}`,
          };
        });

        output = CopyBundleSchema.parse({ items });
        break;
      }

      case "DESIGNER": {
        const assignments =
          (ctx.assignments as
            | Array<{
                accountId: string;
                platform: Platform;
                format: "IMAGE" | "VIDEO";
                variationSeed: string;
              }>
            | undefined) ?? [];
        const attempt = Number(ctx.attempt ?? 1);
        const blueprints = selectDistinctBlueprints(assignments.length, attempt);

        const specs: VisualSpec[] = assignments.map((assignment, idx) => {
          const bp = blueprints[idx] ?? SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]!;
          const aspectRatio =
            assignment.platform === "tiktok"
              ? "9:16"
              : assignment.platform === "instagram"
                ? "4:5"
                : "1:1";
          return {
            accountId: assignment.accountId,
            format: assignment.format,
            aspectRatio,
            headline: bp.headline,
            subheadline: bp.subheadline,
            accentHex: bp.accentHex,
            durationSec: assignment.format === "VIDEO" ? 2 : undefined,
            variationSeed: assignment.variationSeed,
          };
        });

        output = VisualSpecBundleSchema.parse({ specs });
        break;
      }

      case "QA": {
        const qaSummary = (ctx.deterministicPassed as boolean | undefined) ?? true;
        const flagged = (ctx.flaggedAccountIds as string[] | undefined) ?? [];
        output = QAEvaluationSchema.parse({
          overallPassed: qaSummary,
          complianceSummary: qaSummary
            ? "Seluruh aset lolos batas karakter platform, bebas kata terlarang, skor kemiripan < 0.60, dan SHA-256 media unik per akun."
            : `Ditemukan pelanggaran QA pada akun: ${flagged.join(", ")}`,
          flaggedAccountIds: flagged,
          rewriteGuidance: qaSummary
            ? undefined
            : "Ubah sudut pandang hook, kosakata isi, dan variasi visual agar berbeda jauh antar akun.",
        });
        break;
      }

      case "INSIGHT": {
        const jobs =
          (ctx.jobs as
            | Array<{
                publishJobId: string;
                accountId: string;
                platform: Platform;
                views: number;
                likes: number;
                replies: number;
                shares: number;
              }>
            | undefined) ?? [];
        output = InsightReportSchema.parse({
          metrics: jobs.map((job, idx) => ({
            publishJobId: job.publishJobId,
            accountId: job.accountId,
            platform: job.platform,
            views: job.views,
            likes: job.likes,
            replies: job.replies,
            shares: job.shares,
            winningPatternSummary:
              SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]?.angle ??
              "Pesan edukasi efisiensi UMKM & lisensi resmi",
          })),
          topWinningPatterns: [
            "Hook berbasis pain-point operasional harian UMKM menghasilkan interaksi tertinggi",
            "Penekanan jaminan legal & anti-suspend pada akun aplikasi premium meningkatkan klik CTA Seiton.id",
          ],
          recommendedNextAngles: [
            "Studi kasus sebelum-sesudah pembukuan toko menggunakan ekosistem Seiton",
            "Komparasi biaya paket tahunan aplikasi kreatif untuk tim konten UMKM",
          ],
        });
        break;
      }

      default:
        throw new Error(`Unsupported agent role in MockModelProvider: ${request.role}`);
    }

    const validated = request.schema.parse(output);
    const tokensUsed = estimateTokens(
      JSON.stringify(request.contextData) + JSON.stringify(validated)
    );

    return {
      data: validated,
      modelUsed,
      tokensUsed,
      providerName: this.name,
    };
  }
}

/**
 * Selects MetaMuseProvider when a real META_API_KEY is configured, or falls back deterministically to MockModelProvider.
 */
export function createModelProvider(): ModelProvider {
  const apiKey = (process.env.META_API_KEY ?? "").trim();
  if (!apiKey || apiKey === "mock") {
    return new MockModelProvider();
  }
  return new MetaMuseProvider(process.env.META_API_BASE_URL, apiKey);
}
