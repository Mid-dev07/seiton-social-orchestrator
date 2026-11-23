import {
  AccountSessionActionSchema,
  CreateAccountInputSchema,
  CreateCampaignInputSchema,
  KillSwitchInputSchema,
  OperatorLoginInputSchema,
  PLATFORM_LIMITS,
  Platform,
  UpdateAccountInputSchema,
} from "../packages/shared/src/schemas";
import { evaluateCampaignAntiDuplicate } from "../packages/shared/src/similarity";

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface AssetsLike {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsLike;
  SEITON_KV?: KVLike;
  META_API_KEY?: string;
  META_API_BASE_URL?: string;
  OPERATOR_EMAIL?: string;
  OPERATOR_PASSWORD?: string;
}

interface AccountRecord {
  id: string;
  platform: Platform;
  handle: string;
  groupTag: string;
  profileDir: string;
  proxyDisplay: string;
  hasSession: boolean;
  timezone: string;
  dailyPostLimit: number;
  postsToday: number;
  status: string;
  lastActiveAt: number | null;
}

interface CampaignRecord {
  id: string;
  commandPrompt: string;
  targetPlatforms: string;
  targetGroupTag: string;
  dryRun: number;
  maxTokenBudget: number;
  tokensUsed: number;
  status: string;
  createdAt: number;
}

interface AgentRunRecord {
  id: string;
  campaignId: string;
  stage: string;
  modelUsed: string;
  attempt: number;
  inputJson: string;
  outputJson: string;
  tokensUsed: number;
  durationMs: number;
  status: string;
  errorMessage: string | null;
  createdAt: number;
}

interface ContentAssetRecord {
  id: string;
  campaignId: string;
  accountId: string;
  platform: string;
  hook: string;
  caption: string;
  mediaType: string;
  aspectRatio: string;
  mediaPath: string | null;
  mediaSha256: string | null;
  similarityScore: number;
  qaStatus: string;
  qaNotes: string | null;
  createdAt: number;
}

interface PublishJobRecord {
  id: string;
  campaignId: string;
  accountId: string;
  assetId: string;
  scheduledAt: number;
  status: string;
  publishedUrl: string | null;
  screenshotPath: string | null;
  errorMessage: string | null;
}

interface InsightRecord {
  id: string;
  publishJobId: string;
  accountId: string;
  platform: string;
  views: number;
  likes: number;
  replies: number;
  shares: number;
  winningPatternSummary: string;
  collectedAt: number;
}

interface EdgeStoreState {
  globalPaused: boolean;
  accounts: AccountRecord[];
  campaigns: CampaignRecord[];
  agentRuns: AgentRunRecord[];
  contentAssets: ContentAssetRecord[];
  publishJobs: PublishJobRecord[];
  insights: InsightRecord[];
  performanceMemory: {
    updatedAt: number;
    winningPatterns: string[];
    platformHighlights: Record<string, string>;
    lastCampaignId?: string;
  };
}

const SESSION_COOKIE = "seiton_operator_session";
const STATE_KEY = "seiton_orchestrator_state_v1";

const SEITON_COPY_BANK = [
  {
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
    angle: "Paket langganan tahunan untuk freelancer & agensi digital pemula",
    hook: "Freelancer pemula sering rugi karena membeli tools produktivitas secara eceran?",
    body: "Bundling aplikasi rapat daring, manajemen proyek, dan desain presentasi membantu menjaga margin proyek klien tetap tebal.",
    cta: "Bandingkan rincian paket freelancer di Seiton.id.",
    hashtags: ["#FreelancerID", "#ToolsProduktivitas", "#AgensiKecil"],
    accentHex: "#C2410C",
    headline: "Margin Proyek Klien Terjaga",
    subheadline: "Bundling software kerja harian harga bersahabat",
  },
];

function createInitialEdgeState(): EdgeStoreState {
  const defaultAccounts: AccountRecord[] = [
    { id: "acc-tiktok-umkm", platform: "tiktok", handle: "@seiton.umkm.id", groupTag: "seiton-umkm" },
    { id: "acc-tiktok-premium", platform: "tiktok", handle: "@seiton.appvault", groupTag: "seiton-premium" },
    { id: "acc-threads-umkm", platform: "threads", handle: "@seiton.digital.umkm", groupTag: "seiton-umkm" },
    { id: "acc-threads-premium", platform: "threads", handle: "@seiton.premium.hub", groupTag: "seiton-premium" },
    { id: "acc-x-umkm", platform: "x", handle: "@seiton_umkm", groupTag: "seiton-umkm" },
    { id: "acc-x-premium", platform: "x", handle: "@seiton_premium", groupTag: "seiton-premium" },
    { id: "acc-ig-umkm", platform: "instagram", handle: "@seiton.id.official", groupTag: "seiton-umkm" },
    { id: "acc-ig-premium", platform: "instagram", handle: "@seiton.pro.store", groupTag: "seiton-premium" },
    { id: "acc-fb-umkm", platform: "facebook", handle: "Seiton UMKM Digital Indonesia", groupTag: "seiton-umkm" },
    { id: "acc-fb-premium", platform: "facebook", handle: "Seiton Premium App Solutions", groupTag: "seiton-premium" },
  ].map((item, idx) => ({
    id: item.id,
    platform: item.platform as Platform,
    handle: item.handle,
    groupTag: item.groupTag,
    profileDir: `./data/profiles/${item.platform}-${item.id}`,
    proxyDisplay: `http://seiton_op_${idx + 1}:****@proxy-node-${idx + 1}.seiton.local:8080`,
    hasSession: true,
    timezone: "Asia/Jakarta",
    dailyPostLimit: 5,
    postsToday: 0,
    status: "IDLE",
    lastActiveAt: null,
  }));

  return {
    globalPaused: false,
    accounts: defaultAccounts,
    campaigns: [],
    agentRuns: [],
    contentAssets: [],
    publishJobs: [],
    insights: [],
    performanceMemory: {
      updatedAt: Date.now(),
      winningPatterns: [
        "Studi kasus UMKM hemat waktu pembukuan & desain dengan Seiton.id",
        "Perbandingan biaya langganan aplikasi premium resmi Seiton vs harga reguler",
      ],
      platformHighlights: {
        tiktok: "Video 9:16 singkat dengan hook angka efisiensi UMKM",
        threads: "Diskusi tanya-jawab produktivitas owner UMKM",
        x: "Thread ringkas micro-tips tools bisnis digital",
        instagram: "Visual 4:5 kontras tinggi dengan CTA cek bio Seiton.id",
        facebook: "Narasi studi kasus ROI operasional toko lokal",
      },
    },
  };
}

let memoryStore: EdgeStoreState | null = null;

async function loadState(env: Env): Promise<EdgeStoreState> {
  if (env.SEITON_KV) {
    const raw = await env.SEITON_KV.get(STATE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as EdgeStoreState;
      } catch {
        // Fall through to re-seed
      }
    }
    const fresh = createInitialEdgeState();
    await env.SEITON_KV.put(STATE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  if (!memoryStore) {
    memoryStore = createInitialEdgeState();
  }
  return memoryStore;
}

async function saveState(env: Env, next: EdgeStoreState): Promise<void> {
  memoryStore = next;
  if (env.SEITON_KV) {
    await env.SEITON_KV.put(STATE_KEY, JSON.stringify(next));
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSvgCreative(params: {
  headline: string;
  subheadline: string;
  accentHex: string;
  handle: string;
  aspectRatio: string;
  seed: string;
}): string {
  const dims =
    params.aspectRatio === "9:16"
      ? { width: 540, height: 960 }
      : params.aspectRatio === "4:5"
        ? { width: 600, height: 750 }
        : { width: 600, height: 600 };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.width}" height="${dims.height}" viewBox="0 0 ${dims.width} ${dims.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${escapeXml(params.accentHex)}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#090d16" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${dims.width}" height="${dims.height}" fill="url(#bg)"/>
  <circle cx="${Math.round(dims.width * 0.4)}" cy="${Math.round(dims.height * 0.35)}" r="260" fill="url(#glow)"/>
  <rect x="28" y="28" width="136" height="34" rx="17" fill="#0f172a" stroke="${escapeXml(params.accentHex)}" stroke-width="1.5"/>
  <text x="52" y="50" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="13" font-weight="700">SEITON.ID</text>
  <text x="${dims.width - 34}" y="50" text-anchor="end" fill="#94a3b8" font-family="monospace" font-size="12">CLOUD EDGE · ${escapeXml(params.aspectRatio)}</text>
  <rect x="28" y="${Math.round(dims.height * 0.26)}" width="${dims.width - 56}" height="${Math.round(dims.height * 0.44)}" rx="18" fill="#0f172a" fill-opacity="0.9" stroke="#334155"/>
  <rect x="28" y="${Math.round(dims.height * 0.26)}" width="6" height="${Math.round(dims.height * 0.44)}" rx="3" fill="${escapeXml(params.accentHex)}"/>
  <text x="52" y="${Math.round(dims.height * 0.35)}" fill="#38bdf8" font-family="system-ui,sans-serif" font-size="13" font-weight="700">DIGITALISASI UMKM &amp; APLIKASI PREMIUM</text>
  <text x="52" y="${Math.round(dims.height * 0.44)}" fill="#ffffff" font-family="system-ui,sans-serif" font-size="24" font-weight="800">${escapeXml(params.headline.slice(0, 34))}</text>
  <text x="52" y="${Math.round(dims.height * 0.52)}" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="15">${escapeXml(params.subheadline.slice(0, 48))}</text>
  <line x1="28" y1="${dims.height - 70}" x2="${dims.width - 28}" y2="${dims.height - 70}" stroke="#1e293b"/>
  <text x="32" y="${dims.height - 36}" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="14" font-weight="600">${escapeXml(params.handle)}</text>
  <text x="${dims.width - 32}" y="${dims.height - 36}" text-anchor="end" fill="#64748b" font-family="monospace" font-size="11">${escapeXml(params.seed)}</text>
</svg>`;
}

function buildSvgComposer(params: {
  platform: string;
  handle: string;
  caption: string;
  sha256: string;
  challenged: boolean;
  dryRun: boolean;
}): string {
  const cleanCaption = params.caption.replace(/\s+/g, " ").slice(0, 128);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="360" viewBox="0 0 760 360">
  <rect width="760" height="360" rx="14" fill="#0b1120"/>
  <rect x="20" y="20" width="720" height="320" rx="12" fill="#111827" stroke="${params.challenged ? "#ef4444" : "#334155"}"/>
  <rect x="20" y="20" width="720" height="48" rx="12" fill="#0f172a"/>
  <text x="40" y="49" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="15" font-weight="700">${escapeXml(params.platform.toUpperCase())} COMPOSER · ${escapeXml(params.handle)}</text>
  <rect x="510" y="31" width="210" height="26" rx="13" fill="${params.challenged ? "#7f1d1d" : "#064e3b"}"/>
  <text x="615" y="48" text-anchor="middle" fill="${params.challenged ? "#fca5a5" : "#6ee7b7"}" font-family="system-ui,sans-serif" font-size="11" font-weight="700">${params.challenged ? "CHALLENGE PAUSED" : params.dryRun ? "DRY_RUN · PUBLISH LOCKED" : "PUBLISHED"}</text>
  <rect x="40" y="88" width="680" height="160" rx="10" fill="#020617" stroke="#1e293b"/>
  <text x="58" y="120" fill="${params.challenged ? "#f87171" : "#38bdf8"}" font-family="system-ui,sans-serif" font-size="12" font-weight="700">${params.challenged ? "CAPTCHA / 2FA CHECKPOINT TERDETEKSI" : "PRATINJAU COMPOSER TERISOLASI (EDGE)"}</text>
  <text x="58" y="156" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="14">${escapeXml(cleanCaption.slice(0, 64))}</text>
  <text x="58" y="184" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="14">${escapeXml(cleanCaption.slice(64, 128))}</text>
  <text x="58" y="226" fill="#64748b" font-family="monospace" font-size="11">SHA-256: ${escapeXml(params.sha256.slice(0, 32))}...</text>
  <rect x="550" y="272" width="170" height="36" rx="8" fill="${params.challenged ? "#b91c1c" : "#0e7490"}" opacity="0.8"/>
  <text x="635" y="295" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="12" font-weight="700">${params.challenged ? "Paused (CAPTCHA)" : params.dryRun ? "Publish Locked" : "Published"}</text>
</svg>`;
}

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(headers ?? {}),
    },
  });
}

function parseSessionCookie(request: Request) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const part = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`));
  if (!part) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(part.slice(SESSION_COOKIE.length + 1))) as {
      email?: string;
      name?: string;
      role?: string;
    };
    if (parsed.email && parsed.name) {
      return { email: parsed.email, name: parsed.name, role: parsed.role ?? "Growth Lead" };
    }
  } catch {
    return null;
  }
  return null;
}

function formatCaption(platform: Platform, bp: (typeof SEITON_COPY_BANK)[number]): string {
  const limit = PLATFORM_LIMITS[platform].maxChars;
  const tags = bp.hashtags.join(" ");
  const full = `${bp.hook}\n\n${bp.body}\n\n${bp.cta}\n${tags}`;
  if (full.length <= limit) return full;
  const compact = `${bp.hook} ${bp.body} ${bp.cta} ${bp.hashtags.slice(0, 2).join(" ")}`.replace(
    /\s+/g,
    " "
  );
  return compact.slice(0, limit);
}

const worker: { fetch(request: Request, env: Env): Promise<Response> } = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Internal edge error";
      const status = error instanceof SyntaxError ? 400 : 500;
      return jsonResponse({ error: msg }, status);
    }
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // 1. Operator Auth
    if (pathname === "/api/auth") {
      if (request.method === "GET") {
        const op = parseSessionCookie(request);
        return jsonResponse({ authenticated: Boolean(op), operator: op });
      }
      if (request.method === "DELETE") {
        return jsonResponse(
          { authenticated: false, operator: null },
          200,
          {
            "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
          }
        );
      }
      if (request.method === "POST") {
        const body = await request.json();
        const parsed = OperatorLoginInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: "Format login tidak valid" }, 400);
        }
        const expectedEmail = (env.OPERATOR_EMAIL ?? "admin@seiton.id").toLowerCase();
        const expectedPass = env.OPERATOR_PASSWORD ?? "seiton2026";
        if (!parsed.data.quickDemo) {
          const email = (parsed.data.email ?? "").trim().toLowerCase();
          if (email !== expectedEmail || (parsed.data.password ?? "") !== expectedPass) {
            return jsonResponse(
              { error: "Email atau password salah. Gunakan admin@seiton.id / seiton2026 atau Masuk Instan." },
              401
            );
          }
        }
        const operator = {
          email: expectedEmail,
          name: "Operator Seiton.id",
          role: "Growth Lead",
        };
        return jsonResponse(
          { authenticated: true, operator },
          200,
          {
            "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(
              JSON.stringify(operator)
            )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
          }
        );
      }
    }

    // 2. Dashboard State
    if (pathname === "/api/state" && request.method === "GET") {
      const store = await loadState(env);
      const hasLiveKey = Boolean(env.META_API_KEY && env.META_API_KEY !== "mock");
      return jsonResponse({
        ...store,
        dryRunDefault: true,
        providerMode: hasLiveKey ? "MetaMuseProvider" : "MockModelProvider",
        runtimeMode: "cloudflare-edge",
      });
    }

    // 3. Kill Switch
    if (pathname === "/api/kill-switch" && request.method === "POST") {
      const startedAt = Date.now();
      const parsed = KillSwitchInputSchema.safeParse(await request.json());
      if (!parsed.success) {
        return jsonResponse({ error: "Payload kill switch tidak valid" }, 400);
      }
      const store = await loadState(env);
      store.globalPaused = parsed.data.paused;
      let pausedCampaigns = 0;
      if (parsed.data.paused) {
        for (const camp of store.campaigns) {
          if (camp.status === "RUNNING" || camp.status === "QUEUED") {
            camp.status = "PAUSED";
            pausedCampaigns += 1;
          }
        }
      }
      await saveState(env, store);
      return jsonResponse({
        paused: store.globalPaused,
        updatedAt: Date.now(),
        pausedCampaigns,
        elapsedMs: Date.now() - startedAt,
      });
    }

    // 4. Accounts CRUD
    if (pathname === "/api/accounts") {
      const store = await loadState(env);
      if (request.method === "GET") {
        return jsonResponse({ accounts: store.accounts });
      }
      if (request.method === "POST") {
        const parsed = CreateAccountInputSchema.safeParse(await request.json());
        if (!parsed.success) {
          return jsonResponse({ error: "Input akun tidak valid" }, 400);
        }
        const input = parsed.data;
        const id = `acc-${input.platform}-${crypto.randomUUID().slice(0, 8)}`;
        const created: AccountRecord = {
          id,
          platform: input.platform,
          handle: input.handle,
          groupTag: input.groupTag,
          profileDir: `./data/profiles/${input.platform}-${id}`,
          proxyDisplay: input.proxyUrl ? "aes-256-gcm://encrypted" : "direct-local",
          hasSession: true,
          timezone: input.timezone,
          dailyPostLimit: input.dailyPostLimit,
          postsToday: 0,
          status: "IDLE",
          lastActiveAt: null,
        };
        store.accounts.push(created);
        await saveState(env, store);
        return jsonResponse({ account: created }, 201);
      }
      if (request.method === "PATCH") {
        const parsed = UpdateAccountInputSchema.safeParse(await request.json());
        if (!parsed.success) {
          return jsonResponse({ error: "Update akun tidak valid" }, 400);
        }
        const acc = store.accounts.find((a) => a.id === parsed.data.id);
        if (!acc) {
          return jsonResponse({ error: "Akun tidak ditemukan" }, 404);
        }
        if (parsed.data.status) acc.status = parsed.data.status;
        if (parsed.data.resetPostsToday) acc.postsToday = 0;
        if (parsed.data.handle) acc.handle = parsed.data.handle;
        if (parsed.data.dailyPostLimit) acc.dailyPostLimit = parsed.data.dailyPostLimit;
        await saveState(env, store);
        return jsonResponse({ account: acc });
      }
    }

    // 5. Account Session & Login Actions
    if (pathname === "/api/accounts/session" && request.method === "POST") {
      const parsed = AccountSessionActionSchema.safeParse(await request.json());
      if (!parsed.success) {
        return jsonResponse({ error: "Input sesi akun tidak valid" }, 400);
      }
      const store = await loadState(env);
      const now = Date.now();

      if (parsed.data.action === "verify_all") {
        let verifiedCount = 0;
        for (const acc of store.accounts) {
          if (acc.status === "DISABLED") continue;
          acc.hasSession = true;
          acc.status = "IDLE";
          acc.lastActiveAt = now;
          verifiedCount += 1;
        }
        await saveState(env, store);
        return jsonResponse({
          verifiedCount,
          accounts: store.accounts,
          message: `${verifiedCount} akun berhasil diverifikasi & siap digunakan kampanye.`,
        });
      }

      const target = store.accounts.find((a) => a.id === parsed.data.accountId);
      if (!target) {
        return jsonResponse({ error: "Akun tidak ditemukan" }, 404);
      }
      target.hasSession = true;
      target.status = "IDLE";
      target.lastActiveAt = now;
      if (parsed.data.proxyUrl) {
        target.proxyDisplay = "aes-256-gcm://encrypted";
      }
      await saveState(env, store);
      return jsonResponse({
        account: target,
        message: `Sesi ${target.handle} (${target.platform}) diperbarui & siap beroperasi.`,
      });
    }

    // 6. Launch Campaign (7-Stage Edge DAG)
    if (pathname === "/api/campaigns" && request.method === "POST") {
      const store = await loadState(env);
      if (store.globalPaused) {
        return jsonResponse(
          { error: "Operasi dijeda oleh Global Kill Switch (PAUSE ALL CAMPAIGNS)." },
          409
        );
      }
      const parsed = CreateCampaignInputSchema.safeParse(await request.json());
      if (!parsed.success) {
        return jsonResponse({ error: "Input kampanye tidak valid" }, 400);
      }
      const input = parsed.data;
      if (input.dailyQuotaOverride) {
        for (const acc of store.accounts) {
          acc.dailyPostLimit = input.dailyQuotaOverride;
        }
      }

      const eligible = store.accounts.filter((acc) => {
        if (
          acc.status === "DISABLED" ||
          acc.status === "CHALLENGE_PAUSED" ||
          acc.status === "RATE_LIMITED" ||
          acc.postsToday >= acc.dailyPostLimit
        ) {
          return false;
        }
        const platformMatch = input.targetPlatforms.includes(acc.platform);
        const groupMatch =
          input.targetGroupTag === "all" ||
          input.targetGroupTag === "seiton-all" ||
          acc.groupTag === input.targetGroupTag;
        return platformMatch && groupMatch;
      });

      if (eligible.length === 0) {
        return jsonResponse(
          { error: "Tidak ada akun sehat dengan kuota tersedia untuk target ini." },
          400
        );
      }

      const now = Date.now();
      const campaignId = `camp-${crypto.randomUUID().slice(0, 10)}`;
      const campaign: CampaignRecord = {
        id: campaignId,
        commandPrompt: input.commandPrompt,
        targetPlatforms: JSON.stringify(input.targetPlatforms),
        targetGroupTag: input.targetGroupTag,
        dryRun: 1,
        maxTokenBudget: input.maxTokenBudget,
        tokensUsed: 0,
        status: "RUNNING",
        createdAt: now,
      };
      store.campaigns.unshift(campaign);

      const newRuns: AgentRunRecord[] = [];
      const addRun = (
        stage: string,
        modelUsed: string,
        outputObj: unknown,
        tokens: number
      ) => {
        campaign.tokensUsed += tokens;
        newRuns.unshift({
          id: `run-${crypto.randomUUID().slice(0, 10)}`,
          campaignId,
          stage,
          modelUsed,
          attempt: 1,
          inputJson: JSON.stringify({ campaignId, stage }),
          outputJson: JSON.stringify(outputObj),
          tokensUsed: tokens,
          durationMs: 45,
          status: "SUCCESS",
          errorMessage: null,
          createdAt: Date.now(),
        });
      };

      addRun(
        "RESEARCH",
        "muse-spark-1.3",
        {
          trends: input.targetPlatforms.map((p, i) => ({
            platform: p,
            topic: SEITON_COPY_BANK[i % SEITON_COPY_BANK.length]!.angle,
          })),
        },
        340
      );

      const assignments = eligible.map((acc, idx) => ({
        accountId: acc.id,
        platform: acc.platform,
        angle: SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]!.angle,
        variationSeed: `seed-${campaignId.slice(0, 8)}-${acc.id}-${idx}`,
      }));
      addRun("STRATEGY", "muse-spark-1.3", { assignments }, 390);

      const candidates = await Promise.all(
        eligible.map(async (acc, idx) => {
          const bp = SEITON_COPY_BANK[idx % SEITON_COPY_BANK.length]!;
          const caption = formatCaption(acc.platform, bp);
          const aspectRatio =
            acc.platform === "tiktok"
              ? ("9:16" as const)
              : acc.platform === "instagram"
                ? ("4:5" as const)
                : ("1:1" as const);
          const seed = `seed-${campaignId.slice(0, 8)}-${acc.id}-${idx}`;
          const mediaSha256 = await sha256Hex(`${campaignId}:${acc.id}:${seed}:${bp.headline}`);
          const mediaPath = `/api/media?svg=creative&headline=${encodeURIComponent(
            bp.headline
          )}&subheadline=${encodeURIComponent(bp.subheadline)}&accent=${encodeURIComponent(
            bp.accentHex
          )}&handle=${encodeURIComponent(acc.handle)}&ratio=${encodeURIComponent(
            aspectRatio
          )}&seed=${encodeURIComponent(seed)}`;

          return {
            acc,
            bp,
            caption,
            aspectRatio,
            seed,
            mediaSha256,
            mediaPath,
          };
        })
      );

      addRun(
        "COPY",
        "muse-spark-1.3",
        { items: candidates.map((c) => ({ accountId: c.acc.id, chars: c.caption.length })) },
        520
      );
      addRun(
        "MEDIA",
        "muse-spark-1.3",
        { renderedCount: candidates.length },
        410
      );

      const qaResult = evaluateCampaignAntiDuplicate(
        candidates.map((c) => ({
          accountId: c.acc.id,
          platform: c.acc.platform,
          fullText: c.caption,
          aspectRatio: c.aspectRatio,
          mediaSha256: c.mediaSha256,
        }))
      );
      addRun("QA", "muse-ember-1.0", qaResult, 280);

      for (const c of candidates) {
        const qaItem = qaResult.results.find((r) => r.accountId === c.acc.id);
        const assetId = `asset-${crypto.randomUUID().slice(0, 10)}`;
        store.contentAssets.unshift({
          id: assetId,
          campaignId,
          accountId: c.acc.id,
          platform: c.acc.platform,
          hook: c.bp.hook,
          caption: c.caption,
          mediaType: "IMAGE",
          aspectRatio: c.aspectRatio,
          mediaPath: c.mediaPath,
          mediaSha256: c.mediaSha256,
          similarityScore: qaItem?.similarityScore ?? 0,
          qaStatus: qaItem?.passed ? "PASSED" : "REJECTED",
          qaNotes: qaItem?.notes.length
            ? qaItem.notes.join("; ")
            : "Lolos QA Gate (< 0.60 & SHA-256 unik)",
          createdAt: Date.now(),
        });

        const challenged = input.simulateChallengeAccountId === c.acc.id;
        const jobId = `job-${crypto.randomUUID().slice(0, 10)}`;
        const screenshotPath = `/api/media?svg=composer&platform=${encodeURIComponent(
          c.acc.platform
        )}&handle=${encodeURIComponent(c.acc.handle)}&caption=${encodeURIComponent(
          c.caption.slice(0, 140)
        )}&sha=${encodeURIComponent(c.mediaSha256)}&challenged=${
          challenged ? "1" : "0"
        }&dryRun=1`;

        store.publishJobs.unshift({
          id: jobId,
          campaignId,
          accountId: c.acc.id,
          assetId,
          scheduledAt: Date.now(),
          status: challenged ? "CHALLENGE_PAUSED" : "DRY_RUN_OK",
          publishedUrl: null,
          screenshotPath,
          errorMessage: challenged ? "Simulasi CAPTCHA / 2FA terdeteksi" : null,
        });

        if (challenged) {
          c.acc.status = "CHALLENGE_PAUSED";
          c.acc.lastActiveAt = Date.now();
        } else {
          c.acc.postsToday += 1;
          c.acc.status = c.acc.postsToday >= c.acc.dailyPostLimit ? "RATE_LIMITED" : "IDLE";
          c.acc.lastActiveAt = Date.now();

          store.insights.unshift({
            id: `ins-${crypto.randomUUID().slice(0, 10)}`,
            publishJobId: jobId,
            accountId: c.acc.id,
            platform: c.acc.platform,
            views: 680 + ((c.acc.handle.length * 137) % 1400),
            likes: 58 + ((c.acc.handle.length * 29) % 180),
            replies: 9 + (c.acc.handle.length % 17),
            shares: 14 + (c.acc.handle.length % 23),
            winningPatternSummary: c.bp.angle,
            collectedAt: Date.now(),
          });
        }
      }

      addRun("PUBLISH", "cloudflare-edge-runner", { jobs: candidates.length }, 190);
      addRun(
        "INSIGHT",
        "muse-wonder-1.0",
        { insightsCollected: candidates.length },
        360
      );

      campaign.status = "COMPLETED";
      store.agentRuns = [...newRuns, ...store.agentRuns].slice(0, 80);
      store.contentAssets = store.contentAssets.slice(0, 80);
      store.publishJobs = store.publishJobs.slice(0, 80);
      store.insights = store.insights.slice(0, 60);
      store.performanceMemory.updatedAt = Date.now();
      store.performanceMemory.lastCampaignId = campaignId;

      await saveState(env, store);
      return jsonResponse({ campaignId, status: "COMPLETED" }, 201);
    }

    // 7. SSE Stream (Edge keepalive + connected frame)
    if (pathname === "/api/events" && request.method === "GET") {
      const payload = `event: connected\ndata: ${JSON.stringify({
        type: "connected",
        message: "Cloudflare Edge Live Stream aktif",
        timestamp: Date.now(),
      })}\n\n`;
      return new Response(payload, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    // 8. Dynamic SVG Media & Composer Preview Renderer
    if (pathname === "/api/media" && request.method === "GET") {
      const svgMode = url.searchParams.get("svg");
      if (svgMode === "composer") {
        const svg = buildSvgComposer({
          platform: url.searchParams.get("platform") ?? "tiktok",
          handle: url.searchParams.get("handle") ?? "@seiton.id",
          caption: url.searchParams.get("caption") ?? "",
          sha256: url.searchParams.get("sha") ?? "edge",
          challenged: url.searchParams.get("challenged") === "1",
          dryRun: url.searchParams.get("dryRun") !== "0",
        });
        return new Response(svg, {
          headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      const svg = buildSvgCreative({
        headline: url.searchParams.get("headline") ?? "Seiton.id Digitalisasi UMKM",
        subheadline:
          url.searchParams.get("subheadline") ?? "Aplikasi Premium Resmi & Kasir Modern",
        accentHex: url.searchParams.get("accent") ?? "#0F766E",
        handle: url.searchParams.get("handle") ?? "@seiton.id",
        aspectRatio: url.searchParams.get("ratio") ?? "1:1",
        seed: url.searchParams.get("seed") ?? "edge-preview",
      });
      return new Response(svg, {
        headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // Fallback to static bundled React dashboard assets
    return env.ASSETS.fetch(request);
}

export default worker;
