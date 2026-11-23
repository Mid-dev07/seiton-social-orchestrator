"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Eye,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  Moon,
  PauseOctagon,
  Play,
  RefreshCw,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
  Zap,
} from "lucide-react";

type Platform = "tiktok" | "threads" | "x" | "instagram" | "facebook";
type ViewId = "accounts" | "campaign" | "monitor" | "gallery" | "settings";

export interface OperatorProfile {
  email: string;
  name: string;
  role: string;
}

export interface SafeMuseSettingsDto {
  baseUrl: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  orchestratorModel: string;
  specialistModel: string;
  guardModel: string;
  imageModel: string;
  livePlatformAutomation: boolean;
  liveProxyEnabled: boolean;
}

export interface AgentSkillStandardDto {
  id: string;
  name: string;
  sourceRepo: string;
  appliedRoles: string[];
  summary: string;
  rules: string[];
}

interface SafeAccount {
  id: string;
  platform: Platform | string;
  handle: string;
  groupTag: string;
  profileDir: string;
  proxyDisplay: string;
  hasSession: boolean;
  isDummyAccount?: boolean;
  timezone: string;
  dailyPostLimit: number;
  postsToday: number;
  status: string;
  lastActiveAt: number | null;
}

interface CampaignItem {
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

interface AgentRunItem {
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

interface ContentAssetItem {
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

interface PublishJobItem {
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

interface InsightItem {
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

interface PerformanceMemory {
  updatedAt: number;
  winningPatterns: string[];
  platformHighlights: Record<string, string>;
  lastCampaignId?: string;
}

export interface DashboardState {
  globalPaused: boolean;
  dryRunDefault: boolean;
  providerMode: string;
  runtimeMode?: "local" | "cloudflare-edge";
  museSettings?: SafeMuseSettingsDto;
  agentSkills?: AgentSkillStandardDto[];
  accounts: SafeAccount[];
  campaigns: CampaignItem[];
  agentRuns: AgentRunItem[];
  contentAssets: ContentAssetItem[];
  publishJobs: PublishJobItem[];
  insights: InsightItem[];
  performanceMemory: PerformanceMemory;
}

interface SseFeedEntry {
  type: string;
  campaignId?: string;
  accountId?: string;
  stage?: string;
  status?: string;
  message: string;
  timestamp: number;
}

interface OnboardingState {
  accountId: string;
  platform: string;
  handle: string;
  screenshotPath: string;
  currentUrl: string;
  message: string;
}

const ALL_PLATFORMS: Platform[] = ["tiktok", "threads", "x", "instagram", "facebook"];

const DAG_STAGE_META = [
  { key: "RESEARCH", title: "1. Riset Tren", desc: "Analisa masalah UMKM" },
  { key: "STRATEGY", title: "2. Strategi", desc: "Jadwal & variasi sudut" },
  { key: "COPY", title: "3. Copy Anti-Slop", desc: "Seven Sweeps copywriting" },
  { key: "MEDIA", title: "4. Visual Desain", desc: "Safe-zone & hash unik" },
  { key: "QA", title: "5. QA Gate", desc: "Anti-duplikat <0.60" },
  { key: "PUBLISH", title: "6. Eksekusi", desc: "Browser profil terisolasi" },
  { key: "INSIGHT", title: "7. Analitik", desc: "Metrik & memori belajar" },
] as const;

const CAMPAIGN_PRESETS = [
  {
    id: "umkm",
    title: "Digitalisasi Kasir & Stok UMKM",
    desc: "Edukasi pembukuan rapi dan kasir QR Seiton.id untuk warung & kafe.",
    group: "seiton-umkm",
    platforms: ALL_PLATFORMS,
    prompt:
      "Kampanye Seiton.id: ajak pemilik UMKM beralih dari catatan kertas ke kasir digital, kontrol stok otomatis, dan katalog online terhubung agar omzet lebih mudah dipantau.",
  },
  {
    id: "premium",
    title: "Paket Aplikasi Premium Resmi",
    desc: "Promosi langganan aplikasi desain, AI & produktivitas bergaransi anti-suspend.",
    group: "seiton-premium",
    platforms: ALL_PLATFORMS,
    prompt:
      "Kampanye Seiton.id Premium Apps: kenalkan paket langganan aplikasi kreatif, AI asisten, dan cloud workspace berlisensi resmi bergaransi penuh untuk freelancer dan tim bisnis.",
  },
  {
    id: "ecosystem",
    title: "Ekosistem Lengkap Lintas Platform",
    desc: "Jalankan kampanye serentak pada seluruh akun sehat di 5 platform.",
    group: "all",
    platforms: ALL_PLATFORMS,
    prompt:
      "Kampanye terpadu Seiton.id: gabungkan solusi digitalisasi operasional UMKM dan efisiensi biaya software premium resmi dengan jaminan garansi akun.",
  },
  {
    id: "quick-test",
    title: "Uji Cepat TikTok & X",
    desc: "Kampanye ringkas fokus video pendek dan opini padat di X.",
    group: "all",
    platforms: ["tiktok", "x"] as Platform[],
    prompt:
      "Promosi ringkas Seiton.id: pangkas biaya software tim kreatif dan rapikan antrean kasir toko lewat satu dashboard terkelola.",
  },
];

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  x: 280,
  threads: 500,
  instagram: 2200,
  tiktok: 2200,
  facebook: 63206,
};

function statusLabelIndonesian(status: string): string {
  switch (status) {
    case "IDLE":
      return "Siap Terhubung";
    case "ACTIVE":
      return "Sedang Berjalan";
    case "ONBOARDING_OTP":
      return "Menunggu Kode OTP";
    case "CHALLENGE_PAUSED":
      return "Butuh Verifikasi CAPTCHA/2FA";
    case "RATE_LIMITED":
      return "Kuota Harian Penuh";
    case "DISABLED":
      return "Nonaktif";
    case "COMPLETED":
      return "Selesai";
    case "RUNNING":
      return "Berjalan";
    case "QUEUED":
      return "Antrean";
    case "PAUSED":
      return "Dijeda Kill Switch";
    case "PAUSED_BUDGET":
      return "Dijeda Batas Token";
    case "DRY_RUN_OK":
      return "Simulasi Dry-Run OK";
    case "PUBLISHED":
      return "Terpublikasi";
    default:
      return status;
  }
}

function badgeTone(status: string, isLight: boolean): string {
  switch (status) {
    case "COMPLETED":
    case "SUCCESS":
    case "PASSED":
    case "DRY_RUN_OK":
    case "PUBLISHED":
    case "IDLE":
      return isLight
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "RUNNING":
    case "ACTIVE":
    case "QUEUED":
    case "PENDING":
    case "ONBOARDING_OTP":
      return isLight
        ? "bg-teal-50 text-teal-800 border-teal-200"
        : "bg-teal-500/15 text-teal-300 border-teal-500/30";
    case "PAUSED":
    case "PAUSED_BUDGET":
    case "RATE_LIMITED":
      return isLight
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "CHALLENGE_PAUSED":
    case "FAILED":
    case "REJECTED":
    case "DISABLED":
      return isLight
        ? "bg-rose-50 text-rose-800 border-rose-200"
        : "bg-rose-500/15 text-rose-300 border-rose-500/30";
    default:
      return isLight
        ? "bg-slate-100 text-slate-700 border-slate-200"
        : "bg-slate-800 text-slate-300 border-slate-700";
  }
}

function resolveMediaSrc(rawPath: string | null): string | null {
  if (!rawPath) return null;
  if (rawPath.startsWith("/api/") || rawPath.startsWith("data:") || rawPath.startsWith("http")) {
    return rawPath;
  }
  return `/api/media?path=${encodeURIComponent(rawPath)}`;
}

export function DashboardClient({
  initialState,
  initialOperator = null,
}: {
  initialState: DashboardState;
  initialOperator?: OperatorProfile | null;
}) {
  const [operator, setOperator] = useState<OperatorProfile | null>(initialOperator);
  const [loginEmail, setLoginEmail] = useState("admin@seiton.id");
  const [loginPassword, setLoginPassword] = useState("seiton2026");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const isLight = theme === "light";

  const [state, setState] = useState<DashboardState>(initialState);
  const [activeView, setActiveView] = useState<ViewId>("accounts");
  const [sseConnected, setSseConnected] = useState(false);
  const [sseFeed, setSseFeed] = useState<SseFeedEntry[]>([]);
  const [killSwitchLatency, setKillSwitchLatency] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Account Vault & Email+OTP Onboarding Wizard
  const [accountPlatformFilter, setAccountPlatformFilter] = useState<string>("all");
  const [obPlatform, setObPlatform] = useState<Platform>("x");
  const [obMode, setObMode] = useState<"signup" | "login">("signup");
  const [obEmail, setObEmail] = useState("");
  const [obHandle, setObHandle] = useState("");
  const [obDisplayName, setObDisplayName] = useState("");
  const [obPassword, setObPassword] = useState("");
  const [obGroupTag, setObGroupTag] = useState("seiton-umkm");
  const [obProxyUrl, setObProxyUrl] = useState("");
  const [obShowBrowser, setObShowBrowser] = useState(true);
  const [activeOnboarding, setActiveOnboarding] = useState<OnboardingState | null>(null);
  const [otpInput, setOtpInput] = useState("");

  // Session / Cookie Modal
  const [sessionModalAccount, setSessionModalAccount] = useState<SafeAccount | null>(null);
  const [sessionModalTab, setSessionModalTab] = useState<"verify" | "cookie" | "challenge">(
    "cookie"
  );
  const [cookieInput, setCookieInput] = useState("");
  const [proxyOverrideInput, setProxyOverrideInput] = useState("");
  const [challengeCodeInput, setChallengeCodeInput] = useState("");

  // Campaign Studio
  const [commandPrompt, setCommandPrompt] = useState(CAMPAIGN_PRESETS[0]!.prompt);
  const [targetGroupTag, setTargetGroupTag] = useState("all");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(ALL_PLATFORMS);
  const [maxTokenBudget, setMaxTokenBudget] = useState(50000);
  const [dailyQuotaOverride, setDailyQuotaOverride] = useState(5);
  const [dryRun, setDryRun] = useState(true);
  const [executionMode, setExecutionMode] = useState<"fast" | "browser">(
    initialState.runtimeMode === "cloudflare-edge" ? "fast" : "browser"
  );

  // Monitor & Gallery
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [inspectorPlatformFilter, setInspectorPlatformFilter] = useState<string>("all");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);

  // Muse AI & Live System Settings
  const [museBaseUrl, setMuseBaseUrl] = useState(
    initialState.museSettings?.baseUrl ?? "https://api.meta.ai/v1"
  );
  const [museApiKeyInput, setMuseApiKeyInput] = useState("");
  const [museOrchestratorModel, setMuseOrchestratorModel] = useState(
    initialState.museSettings?.orchestratorModel ?? "muse-wonder-1.0"
  );
  const [museSpecialistModel, setMuseSpecialistModel] = useState(
    initialState.museSettings?.specialistModel ?? "muse-spark-1.3"
  );
  const [museGuardModel, setMuseGuardModel] = useState(
    initialState.museSettings?.guardModel ?? "muse-ember-1.0"
  );
  const [museImageModel, setMuseImageModel] = useState(
    initialState.museSettings?.imageModel ?? "muse-image-1.0"
  );
  const [livePlatformAutomation, setLivePlatformAutomation] = useState(
    initialState.museSettings?.livePlatformAutomation ?? true
  );
  const [liveProxyEnabled, setLiveProxyEnabled] = useState(
    initialState.museSettings?.liveProxyEnabled ?? false
  );
  const [aiDiagnostic, setAiDiagnostic] = useState<{
    ok: boolean;
    providerName?: string;
    modelUsed?: string;
    latencyMs?: number;
    sampleTopic?: string;
    error?: string;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 5000);
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as DashboardState;
      setState(data);
    } catch {
      // Retain existing state on transient error
    }
  }, []);

  useEffect(() => {
    if (!operator && typeof window !== "undefined") {
      const saved = window.localStorage.getItem("seiton_operator_profile");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as OperatorProfile;
          if (parsed.email) setOperator(parsed);
        } catch {
          window.localStorage.removeItem("seiton_operator_profile");
        }
      }
    }
  }, [operator]);

  useEffect(() => {
    if (!operator) return;
    const eventSource = new EventSource("/api/events");
    eventSource.addEventListener("connected", (evt) => {
      setSseConnected(true);
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as SseFeedEntry;
        setSseFeed((prev) => [parsed, ...prev].slice(0, 60));
      } catch {
        // Ignore parse error
      }
    });
    eventSource.addEventListener("pipeline", (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as SseFeedEntry;
        setSseFeed((prev) => [parsed, ...prev].slice(0, 60));
        void refreshState();
      } catch {
        // Ignore parse error
      }
    });
    eventSource.onerror = () => setSseConnected(false);

    const pollInterval = setInterval(() => void refreshState(), 4000);
    return () => {
      eventSource.close();
      clearInterval(pollInterval);
    };
  }, [operator, refreshState]);

  const handleOperatorLogin = async (quickDemo: boolean, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          quickDemo ? { quickDemo: true } : { email: loginEmail, password: loginPassword }
        ),
      });
      const data = (await res.json()) as {
        authenticated?: boolean;
        operator?: OperatorProfile;
        error?: string;
      };
      if (!res.ok || !data.authenticated || !data.operator) {
        throw new Error(data.error || "Login gagal");
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("seiton_operator_profile", JSON.stringify(data.operator));
      }
      setOperator(data.operator);
      await refreshState();
      showToast(`Masuk sebagai ${data.operator.name}`);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleOperatorLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("seiton_operator_profile");
    }
    setOperator(null);
  };

  const handleToggleKillSwitch = async () => {
    setBusyAction(true);
    setErrorBanner(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paused: !state.globalPaused,
          reason: !state.globalPaused
            ? "Operator menekan PAUSE ALL CAMPAIGNS"
            : "Operator melanjutkan operasi",
        }),
      });
      const json = (await res.json()) as {
        paused?: boolean;
        elapsedMs?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Gagal mengubah kill switch");
      setKillSwitchLatency(json.elapsedMs ?? Math.round(performance.now() - t0));
      await refreshState();
      showToast(
        json.paused
          ? "Kill Switch aktif: seluruh dispatch dihentikan."
          : "Operasi dilanjutkan."
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Kill switch error");
    } finally {
      setBusyAction(false);
    }
  };

  const handlePurgeDummyAccounts = async () => {
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/accounts?mode=purge_dummies", {
        method: "DELETE",
      });
      const json = (await res.json()) as { removed?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Gagal menghapus akun dummy");
      await refreshState();
      showToast(
        `${json.removed ?? 0} akun dummy dihapus. Silakan buat atau hubungkan akun asli Anda.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal hapus dummy");
    } finally {
      setBusyAction(false);
    }
  };

  const handleStartOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/accounts/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_onboarding",
          platform: obPlatform,
          mode: obMode,
          email: obEmail.trim(),
          handle: obHandle.trim(),
          displayName: obDisplayName.trim() || undefined,
          password: obPassword || undefined,
          groupTag: obGroupTag,
          proxyUrl: obProxyUrl.trim() || undefined,
          headless: !obShowBrowser,
        }),
      });
      const json = (await res.json()) as {
        account?: SafeAccount;
        screenshotPath?: string;
        currentUrl?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.account) {
        throw new Error(json.error || "Gagal memulai onboarding browser");
      }
      setActiveOnboarding({
        accountId: json.account.id,
        platform: json.account.platform,
        handle: json.account.handle,
        screenshotPath: json.screenshotPath ?? "",
        currentUrl: json.currentUrl ?? "",
        message: json.message ?? "Browser dibuka.",
      });
      await refreshState();
      showToast("Sesi browser dibuka. Masukkan OTP email bila diminta.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Onboarding gagal");
    } finally {
      setBusyAction(false);
    }
  };

  const handleOnboardingStep = async (
    action: "submit_otp" | "refresh_screenshot" | "complete_manual"
  ) => {
    if (!activeOnboarding) return;
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/accounts/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          accountId: activeOnboarding.accountId,
          otpCode: action === "submit_otp" ? otpInput.trim() : undefined,
        }),
      });
      const json = (await res.json()) as {
        account?: SafeAccount;
        screenshotPath?: string;
        currentUrl?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Gagal memproses langkah onboarding");
      if (action === "refresh_screenshot") {
        setActiveOnboarding((prev) =>
          prev
            ? {
                ...prev,
                screenshotPath: json.screenshotPath ?? prev.screenshotPath,
                currentUrl: json.currentUrl ?? prev.currentUrl,
                message: json.message ?? prev.message,
              }
            : null
        );
      } else {
        setActiveOnboarding(null);
        setOtpInput("");
        setObEmail("");
        setObHandle("");
        setObPassword("");
      }
      await refreshState();
      showToast(json.message || "Akun berhasil dihubungkan!");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Aksi onboarding gagal");
    } finally {
      setBusyAction(false);
    }
  };

  const handleSessionAction = async (payload: {
    accountId: string;
    action: "verify_session" | "import_cookie" | "resolve_challenge" | "verify_all";
    cookiePayload?: string;
    verificationCode?: string;
    proxyUrl?: string;
  }) => {
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/accounts/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        account?: SafeAccount;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Aksi sesi akun gagal");
      await refreshState();
      if (json.account) setSessionModalAccount(json.account);
      if (payload.action === "verify_all") setSessionModalAccount(null);
      showToast(json.message || "Sesi akun diperbarui.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal memproses sesi");
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteSingleAccount = async (accountId: string) => {
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/accounts?id=${encodeURIComponent(accountId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error || "Gagal menghapus akun");
      }
      await refreshState();
      showToast("Akun dihapus dari Vault.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal hapus akun");
    } finally {
      setBusyAction(false);
    }
  };

  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandPrompt,
          targetPlatforms: selectedPlatforms,
          targetGroupTag,
          dryRun,
          executionMode,
          maxTokenBudget,
          dailyQuotaOverride,
        }),
      });
      const json = (await res.json()) as { campaignId?: string; error?: string };
      if (!res.ok) throw new Error(json.error || "Gagal meluncurkan kampanye");
      setActiveView("monitor");
      await refreshState();
      showToast(`Kampanye ${json.campaignId} dijalankan.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal meluncurkan kampanye");
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveMuseSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: museBaseUrl.trim(),
          apiKey: museApiKeyInput.trim() || undefined,
          orchestratorModel: museOrchestratorModel.trim(),
          specialistModel: museSpecialistModel.trim(),
          guardModel: museGuardModel.trim(),
          imageModel: museImageModel.trim(),
          livePlatformAutomation,
          liveProxyEnabled,
        }),
      });
      const json = (await res.json()) as { settings?: SafeMuseSettingsDto; error?: string };
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan pengaturan Muse AI");
      setMuseApiKeyInput("");
      await refreshState();
      showToast("Konfigurasi koneksi Meta Muse AI & browser live disimpan terenkripsi.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal simpan pengaturan");
    } finally {
      setBusyAction(false);
    }
  };

  const handleTestMuseConnection = async () => {
    setBusyAction(true);
    setAiDiagnostic(null);
    try {
      const res = await fetch("/api/settings/test-ai", { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        providerName?: string;
        modelUsed?: string;
        latencyMs?: number;
        sampleTopic?: string;
        error?: string;
      };
      setAiDiagnostic(json);
    } catch (err) {
      setAiDiagnostic({
        ok: false,
        error: err instanceof Error ? err.message : "Gagal terhubung ke endpoint uji",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p)
        ? prev.length > 1
          ? prev.filter((item) => item !== p)
          : prev
        : [...prev, p]
    );
  };

  const handleCopyCaption = async (assetId: string, caption: string) => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedAssetId(assetId);
      setTimeout(() => setCopiedAssetId((p) => (p === assetId ? null : p)), 2000);
    } catch {
      showToast("Gagal menyalin caption.");
    }
  };

  const dummyCount = useMemo(
    () => state.accounts.filter((a) => a.isDummyAccount).length,
    [state.accounts]
  );

  const readyAccounts = useMemo(
    () =>
      state.accounts.filter(
        (a) =>
          (a.status === "IDLE" || a.status === "ACTIVE") &&
          a.postsToday < a.dailyPostLimit
      ),
    [state.accounts]
  );

  const preflightMatchedAccounts = useMemo(
    () =>
      readyAccounts.filter((acc) => {
        const platformMatch = selectedPlatforms.includes(acc.platform as Platform);
        const groupMatch =
          targetGroupTag === "all" ||
          targetGroupTag === "seiton-all" ||
          acc.groupTag === targetGroupTag;
        return platformMatch && groupMatch;
      }),
    [readyAccounts, selectedPlatforms, targetGroupTag]
  );

  const filteredVaultAccounts = useMemo(() => {
    if (accountPlatformFilter === "all") return state.accounts;
    return state.accounts.filter((a) => a.platform === accountPlatformFilter);
  }, [state.accounts, accountPlatformFilter]);

  const latestCampaign = state.campaigns[0] ?? null;
  const latestCampaignRuns = useMemo(() => {
    if (!latestCampaign) return [];
    return state.agentRuns.filter((r) => r.campaignId === latestCampaign.id);
  }, [latestCampaign, state.agentRuns]);

  const stageStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of latestCampaignRuns) {
      if (!map.has(run.stage)) map.set(run.stage, run.status);
    }
    return map;
  }, [latestCampaignRuns]);

  const completedStagesCount = useMemo(
    () =>
      DAG_STAGE_META.filter((s) => stageStatusMap.get(s.key) === "SUCCESS").length,
    [stageStatusMap]
  );

  const accountById = useMemo(
    () => new Map(state.accounts.map((a) => [a.id, a])),
    [state.accounts]
  );

  const jobByAssetId = useMemo(
    () => new Map(state.publishJobs.map((j) => [j.assetId, j])),
    [state.publishJobs]
  );

  const filteredAssets = useMemo(() => {
    if (inspectorPlatformFilter === "all") return state.contentAssets;
    return state.contentAssets.filter((a) => a.platform === inspectorPlatformFilter);
  }, [state.contentAssets, inspectorPlatformFilter]);

  const challengedCount = state.accounts.filter(
    (a) => a.status === "CHALLENGE_PAUSED"
  ).length;

  // Semantic UI Tokens (ui-ux-pro-max Eye-Friendly Dual Theme)
  const bgCanvas = isLight ? "bg-[#F6F8FB] text-slate-900" : "bg-[#0B0F17] text-[#E6EDF6]";
  const bgSurface = isLight
    ? "bg-white border-[#DCE3EE]"
    : "bg-[#121824] border-slate-800/90";
  const bgElevated = isLight
    ? "bg-[#EEF2F7] border-[#D3DCE9]"
    : "bg-[#182030] border-slate-700/70";
  const textMuted = isLight ? "text-slate-600" : "text-slate-400";
  const inputSurface = isLight
    ? "bg-white border-slate-300 text-slate-900 focus:border-teal-600"
    : "bg-[#0B0F17] border-slate-700 text-slate-100 focus:border-teal-500";

  if (!operator) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 py-12 ${bgCanvas}`}>
        <div className={`w-full max-w-md space-y-6 rounded-2xl border p-8 shadow-xl ${bgSurface}`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-teal-500/40 bg-teal-500/15 text-teal-400">
              <Cpu className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Seiton-Social Media</h1>
              <p className={`text-sm ${textMuted}`}>
                Workspace Orkestrasi Promosi Seiton.id
              </p>
            </div>
          </div>

          <div className={`rounded-xl border p-4 text-sm ${bgElevated}`}>
            <p className="font-semibold text-teal-400">Akses Operator</p>
            <p className={`mt-1 text-xs leading-relaxed ${textMuted}`}>
              Kelola koneksi akun sosial media asli (Email + OTP), konfigurasi Meta Muse AI, dan jalankan kampanye anti-slop lintas 5 platform.
            </p>
            <p className="mt-2 font-mono text-xs text-teal-400">
              admin@seiton.id · seiton2026
            </p>
          </div>

          {loginError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-400">
              {loginError}
            </div>
          )}

          <button
            type="button"
            disabled={loginBusy}
            onClick={() => void handleOperatorLogin(true)}
            data-testid="quick-operator-login"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Masuk Instan sebagai Operator Seiton.id
          </button>

          <form
            onSubmit={(e) => void handleOperatorLogin(false, e)}
            className="space-y-4 border-t border-slate-800/50 pt-4"
          >
            <div>
              <label className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                Email Operator
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                required
              />
            </div>
            <div>
              <label className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                Kata Sandi
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loginBusy}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${bgElevated}`}
            >
              <Lock className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Masuk dengan Kredensial
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: Array<{
    id: ViewId;
    label: string;
    sub: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }> = [
    {
      id: "accounts",
      label: "1. Akun & Buat Akun (OTP)",
      sub: `${readyAccounts.length}/${state.accounts.length} akun siap`,
      icon: UserPlus,
    },
    {
      id: "campaign",
      label: "2. Studio Kampanye",
      sub: "1-pintu multi-agen",
      icon: Rocket,
    },
    {
      id: "monitor",
      label: "3. Monitor Orkestrator",
      sub: latestCampaign ? `${completedStagesCount}/7 tahap` : "Siaga",
      icon: Activity,
    },
    {
      id: "gallery",
      label: "4. Galeri & Analitik",
      sub: `${state.contentAssets.length} aset konten`,
      icon: Layers,
    },
    {
      id: "settings",
      label: "5. Muse AI & Skills",
      sub: state.museSettings?.hasApiKey ? "Muse Live Aktif" : state.providerMode,
      icon: Sliders,
    },
  ];

  return (
    <div className={`min-h-screen transition-colors ${bgCanvas}`}>
      {/* Top Status & Safety Header */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur ${
          isLight ? "border-slate-200 bg-white/90" : "border-slate-800/90 bg-[#0B0F17]/95"
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-500/40 bg-teal-500/15 text-teal-400">
              <Cpu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight sm:text-lg">
                  Seiton-Social Media
                </h1>
                <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-teal-400">
                  {state.runtimeMode === "cloudflare-edge" ? "Cloud Edge" : "Local Studio"}
                </span>
              </div>
              <p className={`text-xs ${textMuted}`}>
                Promosi Seiton.id · {state.providerMode}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${badgeTone(
                "IDLE",
                isLight
              )}`}
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {dryRun ? "DRY_RUN Aman" : "MODE LIVE"}
            </span>

            <span
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                sseConnected ? badgeTone("IDLE", isLight) : badgeTone("PAUSED", isLight)
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  sseConnected ? "animate-pulse bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {sseConnected ? "Live" : "Sync"}
            </span>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Ubah tema gelap atau terang"
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-xs font-medium transition ${bgElevated}`}
            >
              {isLight ? (
                <Moon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>

            <div
              className={`hidden min-h-11 items-center gap-2 rounded-xl border px-3 text-xs sm:inline-flex ${bgElevated}`}
            >
              <UserCheck className="h-4 w-4 text-teal-400" strokeWidth={1.5} aria-hidden="true" />
              <span>{operator.email}</span>
              <button
                type="button"
                onClick={() => void handleOperatorLogout()}
                aria-label="Keluar dari dashboard"
                className="ml-1 rounded p-1 hover:text-rose-400"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleToggleKillSwitch()}
              disabled={busyAction}
              data-testid="global-kill-switch"
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold tracking-wide text-white transition ${
                state.globalPaused
                  ? "border-emerald-400/50 bg-emerald-600 hover:bg-emerald-500"
                  : "border-rose-400/60 bg-rose-600 hover:bg-rose-500"
              }`}
            >
              {state.globalPaused ? (
                <>
                  <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  RESUME ALL
                </>
              ) : (
                <>
                  <PauseOctagon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  PAUSE ALL CAMPAIGNS
                </>
              )}
              {killSwitchLatency !== null && (
                <span className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[11px]">
                  {killSwitchLatency}ms
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr]">
        {/* Left Navigation Sidebar */}
        <aside className="space-y-3">
          <nav aria-label="Navigasi utama" className={`space-y-1.5 rounded-2xl border p-2.5 ${bgSurface}`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition ${
                    active
                      ? "bg-teal-600 text-white shadow-sm"
                      : isLight
                        ? "text-slate-700 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.label}</div>
                    <div
                      className={`truncate text-xs ${
                        active ? "text-teal-100" : textMuted
                      }`}
                    >
                      {item.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Compact System Health Card */}
          <div className={`space-y-2.5 rounded-2xl border p-4 text-xs ${bgSurface}`}>
            <div className="font-semibold">Status Koneksi Inti</div>
            <div className="flex items-center justify-between">
              <span className={textMuted}>Meta Muse AI</span>
              <span className="font-semibold text-teal-400">
                {state.museSettings?.hasApiKey
                  ? state.museSettings.orchestratorModel
                  : state.runtimeMode === "cloudflare-edge"
                    ? "Cloudflare Meta AI"
                    : "Fallback Lokal"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={textMuted}>Browser Live</span>
              <span className="font-semibold">
                {state.museSettings?.livePlatformAutomation ? "Aktif" : "Simulasi"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={textMuted}>Standar Anti-Slop</span>
              <span className="font-semibold text-emerald-400">
                {state.agentSkills?.length ?? 4} Skills Aktif
              </span>
            </div>
          </div>
        </aside>

        {/* Main Workspace Canvas */}
        <main className="min-w-0 space-y-5">
          {toastMessage && (
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${badgeTone("IDLE", isLight)}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{toastMessage}</span>
              </div>
              <button type="button" onClick={() => setToastMessage(null)} aria-label="Tutup notifikasi">
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          )}

          {state.globalPaused && (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${badgeTone("FAILED", isLight)}`}>
              <PauseOctagon className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>
                <strong>GLOBAL KILL SWITCH AKTIF:</strong> Semua antrean baru dihentikan hingga Anda menekan RESUME ALL.
              </span>
            </div>
          )}

          {challengedCount > 0 && (
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${badgeTone("PAUSED", isLight)}`}>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <strong>{challengedCount} akun</strong> membutuhkan verifikasi CAPTCHA / 2FA.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("accounts")}
                className="min-h-10 rounded-lg bg-amber-600 px-3.5 text-xs font-semibold text-white hover:bg-amber-500"
              >
                Periksa Sekarang
              </button>
            </div>
          )}

          {errorBanner && (
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${badgeTone("FAILED", isLight)}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{errorBanner}</span>
              </div>
              <button type="button" onClick={() => setErrorBanner(null)} className="text-xs underline">
                Tutup
              </button>
            </div>
          )}

          {/* VIEW 1: AKUN ASLI & BUAT AKUN BARU (EMAIL + OTP) */}
          {activeView === "accounts" && (
            <section className="space-y-6">
              {dummyCount > 0 && (
                <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${badgeTone("PAUSED", isLight)}`}>
                  <div className="space-y-1">
                    <div className="text-sm font-bold">
                      Masih Terdapat {dummyCount} Akun Dummy Bawaan
                    </div>
                    <p className="text-xs opacity-90">
                      Hapus akun contoh bawaan dalam 1 klik, lalu buat atau hubungkan akun sosial media asli menggunakan Wizard Email + OTP di bawah.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handlePurgeDummyAccounts()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Hapus Semua Akun Dummy ({dummyCount})
                  </button>
                </div>
              )}

              {/* Email + OTP Real Browser Account Creation / Login Wizard */}
              <div className={`rounded-2xl border p-6 ${bgSurface}`}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold">
                      Wizard Buat Akun Baru &amp; Login Asli (Email + Setor OTP)
                    </h2>
                    <p className={`mt-1 text-sm ${textMuted}`}>
                      Masukkan email Anda—sistem membuka profil Chromium terisolasi ke platform pilihan, mengisi form, dan menunggu Anda menyetor kode OTP dari email.
                    </p>
                  </div>
                </div>

                {!activeOnboarding ? (
                  <form onSubmit={(e) => void handleStartOnboarding(e)} className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Platform Target
                      </label>
                      <select
                        value={obPlatform}
                        onChange={(e) => setObPlatform(e.target.value as Platform)}
                        className={`min-h-11 w-full rounded-xl border px-3 text-sm focus:outline-none ${inputSurface}`}
                      >
                        {ALL_PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {p.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Aksi Browser
                      </label>
                      <select
                        value={obMode}
                        onChange={(e) => setObMode(e.target.value as "signup" | "login")}
                        className={`min-h-11 w-full rounded-xl border px-3 text-sm focus:outline-none ${inputSurface}`}
                      >
                        <option value="signup">Daftar Akun Baru (Sign Up)</option>
                        <option value="login">Login Akun Sudah Ada</option>
                      </select>
                    </div>
                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Grup Promosi
                      </label>
                      <select
                        value={obGroupTag}
                        onChange={(e) => setObGroupTag(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3 text-sm focus:outline-none ${inputSurface}`}
                      >
                        <option value="seiton-umkm">seiton-umkm (UMKM)</option>
                        <option value="seiton-premium">seiton-premium (Aplikasi Premium)</option>
                      </select>
                    </div>

                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Email Pendaftaran / Login
                      </label>
                      <input
                        type="email"
                        placeholder="emailanda@gmail.com"
                        value={obEmail}
                        onChange={(e) => setObEmail(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                        required
                      />
                    </div>
                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Username / Handle
                      </label>
                      <input
                        type="text"
                        placeholder="@seiton.bisnis"
                        value={obHandle}
                        onChange={(e) => setObHandle(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                        required
                      />
                    </div>
                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Kata Sandi Akun Sosmed
                      </label>
                      <input
                        type="password"
                        placeholder="Minimal 6 karakter"
                        value={obPassword}
                        onChange={(e) => setObPassword(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Proxy Khusus Akun (Opsional · Terenkripsi AES-256-GCM)
                      </label>
                      <input
                        type="text"
                        placeholder="http://user:pass@ip:port (kosongkan jika IP lokal)"
                        value={obProxyUrl}
                        onChange={(e) => setObProxyUrl(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                      />
                    </div>
                    <div>
                      <label className={`mb-1.5 block text-xs font-semibold ${textMuted}`}>
                        Nama Tampilan (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Seiton Digital UMKM"
                        value={obDisplayName}
                        onChange={(e) => setObDisplayName(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none ${inputSurface}`}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-3">
                      <label className="flex min-h-11 items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={obShowBrowser}
                          onChange={(e) => setObShowBrowser(e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <span>Tampilkan jendela browser asli agar saya bisa melihat / menyelesaikan CAPTCHA</span>
                      </label>

                      <button
                        type="submit"
                        disabled={busyAction}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
                      >
                        <Mail className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                        Buka Browser &amp; Mulai Daftar / Login
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={`grid gap-5 rounded-2xl border p-5 lg:grid-cols-2 ${bgElevated}`}>
                    <div className="space-y-4">
                      <div>
                        <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-bold ${badgeTone("ONBOARDING_OTP", isLight)}`}>
                          Menunggu Setoran OTP · {activeOnboarding.platform.toUpperCase()} ({activeOnboarding.handle})
                        </span>
                        <p className="mt-2 text-sm leading-relaxed">
                          {activeOnboarding.message}
                        </p>
                        <p className={`mt-1 truncate font-mono text-xs ${textMuted}`}>
                          URL Aktif: {activeOnboarding.currentUrl}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold">
                          Masukkan Kode OTP dari Email Anda
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Contoh: 482910"
                            value={otpInput}
                            onChange={(e) => setOtpInput(e.target.value)}
                            className={`min-h-11 flex-1 rounded-xl border px-3.5 font-mono text-sm focus:outline-none ${inputSurface}`}
                          />
                          <button
                            type="button"
                            disabled={busyAction || otpInput.trim().length < 3}
                            onClick={() => void handleOnboardingStep("submit_otp")}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                          >
                            Kirim OTP
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleOnboardingStep("refresh_screenshot")}
                          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-semibold ${bgSurface}`}
                        >
                          <RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                          Refresh Screenshot Browser
                        </button>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleOnboardingStep("complete_manual")}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                          Selesai di Browser &amp; Simpan Cookie Asli
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className={`text-xs font-semibold ${textMuted}`}>
                        Pratinjau Langsung Browser Terisolasi
                      </div>
                      {activeOnboarding.screenshotPath ? (
                        <img
                          src={resolveMediaSrc(activeOnboarding.screenshotPath) ?? ""}
                          alt="Live Onboarding Browser"
                          className="h-64 w-full rounded-xl border border-slate-700 bg-black object-contain"
                        />
                      ) : (
                        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-700 text-xs text-slate-500">
                          Menunggu tangkapan layar browser...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Account Vault List */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {["all", ...ALL_PLATFORMS].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAccountPlatformFilter(p)}
                        className={`min-h-11 rounded-xl border px-3.5 text-xs font-semibold uppercase transition ${
                          accountPlatformFilter === p
                            ? "border-teal-500 bg-teal-600 text-white"
                            : bgSurface
                        }`}
                      >
                        {p === "all" ? `Semua (${state.accounts.length})` : p}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("campaign")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-500"
                  >
                    Lanjut ke Studio Kampanye
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>

                {filteredVaultAccounts.length === 0 ? (
                  <div className={`rounded-2xl border p-10 text-center text-sm ${bgSurface} ${textMuted}`}>
                    Belum ada akun di filter ini. Gunakan Wizard Email + OTP di atas untuk mendaftarkan atau menghubungkan akun sosial media asli Anda.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredVaultAccounts.map((acc) => (
                      <div key={acc.id} className={`flex flex-col justify-between rounded-2xl border p-5 ${bgSurface}`}>
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold uppercase ${bgElevated}`}>
                                  {acc.platform}
                                </span>
                                <span
                                  className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${
                                    acc.isDummyAccount
                                      ? badgeTone("PAUSED", isLight)
                                      : badgeTone("IDLE", isLight)
                                  }`}
                                >
                                  {acc.isDummyAccount ? "Sample Dummy" : "Akun Asli"}
                                </span>
                              </div>
                              <h3 className="mt-2 text-base font-bold">{acc.handle}</h3>
                              <p className={`text-xs ${textMuted}`}>
                                Grup: {acc.groupTag} · {acc.timezone}
                              </p>
                            </div>
                            <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${badgeTone(acc.status, isLight)}`}>
                              {statusLabelIndonesian(acc.status)}
                            </span>
                          </div>

                          <div className={`mt-3 space-y-1 rounded-xl border p-3 font-mono text-xs ${bgElevated}`}>
                            <div className="truncate">Proxy: {acc.proxyDisplay}</div>
                            <div>
                              Kuota: {acc.postsToday}/{acc.dailyPostLimit} · Sesi:{" "}
                              {acc.hasSession ? "Terenkripsi" : "Kosong"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSessionModalAccount(acc);
                              setSessionModalTab(
                                acc.status === "CHALLENGE_PAUSED" ? "challenge" : "cookie"
                              );
                            }}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-teal-600/15 px-3.5 text-xs font-semibold text-teal-400 hover:bg-teal-600/25"
                          >
                            <KeyRound className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                            Import Cookie / Kelola Sesi
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSingleAccount(acc.id)}
                            aria-label={`Hapus akun ${acc.handle}`}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-500/30 px-3 text-xs font-semibold text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* VIEW 2: STUDIO KAMPANYE */}
          {activeView === "campaign" && (
            <section className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <div className={`rounded-2xl border p-6 ${bgSurface}`}>
                  <h2 className="text-base font-bold">
                    Template Promosi Seiton.id (Siap Pakai)
                  </h2>
                  <p className={`mt-1 text-sm ${textMuted}`}>
                    Setiap template diolah oleh 6 agen AI dengan aturan Anti-Slop Copywriting dan variasi unik per akun.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {CAMPAIGN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCommandPrompt(preset.prompt);
                          setTargetGroupTag(preset.group);
                          setSelectedPlatforms(preset.platforms);
                          showToast(`Template "${preset.title}" diterapkan.`);
                        }}
                        className={`min-h-20 rounded-xl border p-4 text-left transition hover:border-teal-500 ${bgElevated}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-teal-400">{preset.title}</span>
                          <Sparkles className="h-4 w-4 text-teal-400" strokeWidth={1.5} aria-hidden="true" />
                        </div>
                        <p className={`mt-1 text-xs ${textMuted}`}>{preset.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={(e) => void handleLaunchCampaign(e)} className={`space-y-4 rounded-2xl border p-6 ${bgSurface}`}>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Perintah Kampanye (1-Pintu)
                    </label>
                    <textarea
                      rows={4}
                      value={commandPrompt}
                      onChange={(e) => setCommandPrompt(e.target.value)}
                      className={`w-full rounded-xl border p-3.5 text-sm leading-relaxed focus:outline-none ${inputSurface}`}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold">
                      Platform Target ({selectedPlatforms.length}/5 dipilih)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_PLATFORMS.map((p) => {
                        const selected = selectedPlatforms.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => togglePlatform(p)}
                            className={`min-h-11 rounded-xl border px-4 text-xs font-bold uppercase transition ${
                              selected
                                ? "border-teal-500 bg-teal-600 text-white"
                                : bgElevated
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">Grup Akun</label>
                      <select
                        value={targetGroupTag}
                        onChange={(e) => setTargetGroupTag(e.target.value)}
                        className={`min-h-11 w-full rounded-xl border px-3 text-sm ${inputSurface}`}
                      >
                        <option value="all">Semua Grup</option>
                        <option value="seiton-umkm">seiton-umkm</option>
                        <option value="seiton-premium">seiton-premium</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">Mode Eksekusi</label>
                      <select
                        value={executionMode}
                        onChange={(e) => setExecutionMode(e.target.value as "fast" | "browser")}
                        className={`min-h-11 w-full rounded-xl border px-3 text-sm ${inputSurface}`}
                      >
                        <option value="browser">Browser Asli (Playwright + FFmpeg)</option>
                        <option value="fast">Ringan &amp; Cepat (SVG/Edge)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">Batas Token</label>
                      <input
                        type="number"
                        min={500}
                        step={500}
                        value={maxTokenBudget}
                        onChange={(e) => setMaxTokenBudget(Number(e.target.value))}
                        className={`min-h-11 w-full rounded-xl border px-3 text-sm ${inputSurface}`}
                      />
                    </div>
                  </div>

                  <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${bgElevated}`}>
                    <label className="flex min-h-11 items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={dryRun}
                        onChange={(e) => setDryRun(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span>
                        Mode <strong>DRY_RUN</strong> (isi form + screenshot tanpa klik Publish live)
                      </span>
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <span>Kuota/Hari:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={dailyQuotaOverride}
                        onChange={(e) => setDailyQuotaOverride(Number(e.target.value))}
                        className={`min-h-11 w-20 rounded-xl border px-3 text-sm ${inputSurface}`}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busyAction || state.globalPaused || preflightMatchedAccounts.length === 0}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-bold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Rocket className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    {preflightMatchedAccounts.length === 0
                      ? "Belum Ada Akun Siap — Cek Tab Akun"
                      : `Jalankan Orkestrasi ke ${preflightMatchedAccounts.length} Akun`}
                  </button>
                </form>
              </div>

              {/* Pre-Flight & PerformanceMemory */}
              <div className="space-y-4">
                <div className={`space-y-3 rounded-2xl border p-5 ${bgSurface}`}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                    Kesiapan Pre-Flight
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className={textMuted}>Akun Siap:</span>
                      <span className="font-bold">{preflightMatchedAccounts.length} akun</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={textMuted}>AI Provider:</span>
                      <span className="font-semibold text-teal-400">{state.providerMode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={textMuted}>QA Anti-Duplikat:</span>
                      <span className="font-mono text-emerald-400">&lt; 0.60</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={textMuted}>Anti-Slop Guard:</span>
                      <span className="text-emerald-400">Aktif</span>
                    </div>
                  </div>
                </div>

                <div className={`space-y-3 rounded-2xl border p-5 ${bgSurface}`}>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-400">
                    <TrendingUp className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    PerformanceMemory
                  </div>
                  <ul className="space-y-2 text-xs leading-relaxed">
                    {state.performanceMemory.winningPatterns.slice(0, 3).map((pat, idx) => (
                      <li key={idx} className={`rounded-xl border p-3 ${bgElevated}`}>
                        {pat}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 3: MONITOR ORKESTRATOR */}
          {activeView === "monitor" && (
            <section className="space-y-5">
              {latestCampaign?.status === "COMPLETED" && (
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${badgeTone("IDLE", isLight)}`}>
                  <div className="flex items-center gap-2.5 text-sm font-semibold">
                    <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                    Kampanye selesai! Seluruh aset lolos Anti-Slop &amp; QA Gate.
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("gallery")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    Buka Galeri Konten &amp; Analitik
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className={`rounded-2xl border p-6 ${bgSurface}`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">
                      Alur 7 Tahap DAG {latestCampaign ? `(${latestCampaign.id})` : ""}
                    </h2>
                    <p className={`text-xs ${textMuted}`}>
                      {latestCampaign
                        ? latestCampaign.commandPrompt
                        : "Belum ada kampanye berjalan."}
                    </p>
                  </div>
                  {latestCampaign && (
                    <span className={`rounded-lg border px-3 py-1 text-xs font-bold ${badgeTone(latestCampaign.status, isLight)}`}>
                      {statusLabelIndonesian(latestCampaign.status)} ·{" "}
                      {Math.round((completedStagesCount / DAG_STAGE_META.length) * 100)}%
                    </span>
                  )}
                </div>

                <div className="mb-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-800/60">
                  <div
                    className="h-full bg-teal-500 transition-all duration-500"
                    style={{
                      width: `${Math.round((completedStagesCount / DAG_STAGE_META.length) * 100)}%`,
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {DAG_STAGE_META.map((stage) => {
                    const st = stageStatusMap.get(stage.key) ?? "IDLE";
                    return (
                      <div key={stage.key} className={`rounded-xl border p-3.5 ${badgeTone(st, isLight)}`}>
                        <div className="text-xs font-bold">{stage.title}</div>
                        <div className="mt-1 text-xs opacity-85">{stage.desc}</div>
                        <div className="mt-2 font-mono text-[11px] font-bold">{st}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <div className={`rounded-2xl border p-5 ${bgSurface}`}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-teal-400">
                    Live Event Stream
                  </h3>
                  <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                    {sseFeed.length === 0 ? (
                      <p className={`text-xs ${textMuted}`}>Menunggu event pipeline...</p>
                    ) : (
                      sseFeed.map((evt, i) => (
                        <div key={`${evt.timestamp}-${i}`} className={`rounded-xl border p-3 text-xs ${bgElevated}`}>
                          <div className={`flex justify-between text-[11px] ${textMuted}`}>
                            <span className="font-mono text-teal-400">{evt.type}</span>
                            <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="mt-1 leading-relaxed">{evt.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`rounded-2xl border p-5 lg:col-span-2 ${bgSurface}`}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider">
                    Audit Eksekusi Agen (Model &amp; Token)
                  </h3>
                  <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                    {state.agentRuns.length === 0 ? (
                      <p className={`text-xs ${textMuted}`}>Belum ada riwayat agen.</p>
                    ) : (
                      state.agentRuns.map((run) => {
                        const expanded = expandedRunId === run.id;
                        return (
                          <div key={run.id} className={`rounded-xl border p-3.5 text-xs ${bgElevated}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold">{run.stage}</span>
                                <span className="rounded bg-teal-500/15 px-2 py-0.5 font-mono text-[11px] text-teal-400">
                                  {run.modelUsed}
                                </span>
                                <span className={textMuted}>attempt #{run.attempt}</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <span className={textMuted}>
                                  {run.tokensUsed} tok · {run.durationMs}ms
                                </span>
                                <span className={`rounded border px-2 py-0.5 font-bold ${badgeTone(run.status, isLight)}`}>
                                  {run.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedRunId(expanded ? null : run.id)}
                                  className="min-h-8 px-2 font-semibold text-teal-400 hover:underline"
                                >
                                  {expanded ? "Tutup JSON" : "Detail JSON"}
                                </button>
                              </div>
                            </div>
                            {run.errorMessage && (
                              <p className="mt-2 text-rose-400">{run.errorMessage}</p>
                            )}
                            {expanded && (
                              <pre className="mt-2.5 max-h-48 overflow-auto rounded-lg bg-black/50 p-3 font-mono text-[11px] text-slate-200">
                                {run.outputJson}
                              </pre>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 4: GALERI KONTEN & ANALITIK */}
          {activeView === "gallery" && (
            <section className="space-y-6">
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${bgSurface}`}>
                <div>
                  <h2 className="text-base font-bold">
                    Galeri Konten Siap Pakai, Bukti Browser &amp; Analitik
                  </h2>
                  <p className={`text-xs ${textMuted}`}>
                    Setiap konten terverifikasi Anti-Slop, kemiripan lintas akun &lt; 0.60, dan hash media SHA-256 unik.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["all", ...ALL_PLATFORMS].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInspectorPlatformFilter(p)}
                      className={`min-h-11 rounded-xl border px-3 text-xs font-semibold uppercase ${
                        inspectorPlatformFilter === p
                          ? "border-teal-500 bg-teal-600 text-white"
                          : bgElevated
                      }`}
                    >
                      {p === "all" ? `Semua (${state.contentAssets.length})` : p}
                    </button>
                  ))}
                </div>
              </div>

              {filteredAssets.length === 0 ? (
                <div className={`rounded-2xl border p-12 text-center ${bgSurface}`}>
                  <p className={`text-sm ${textMuted}`}>
                    Belum ada konten dihasilkan untuk filter ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveView("campaign")}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white hover:bg-teal-500"
                  >
                    <Rocket className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Buat Kampanye di Studio
                  </button>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {filteredAssets.map((asset) => {
                    const acc = accountById.get(asset.accountId);
                    const job = jobByAssetId.get(asset.id);
                    const charLimit = PLATFORM_CHAR_LIMITS[asset.platform] ?? 2200;
                    const mediaUrl = resolveMediaSrc(asset.mediaPath);
                    const screenshotUrl = resolveMediaSrc(job?.screenshotPath ?? null);
                    const copied = copiedAssetId === asset.id;

                    return (
                      <div key={asset.id} className={`space-y-4 rounded-2xl border p-5 text-sm ${bgSurface}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold uppercase ${bgElevated}`}>
                              {asset.platform}
                            </span>
                            <span className="font-bold">{acc?.handle ?? asset.accountId}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-lg border px-2 py-0.5 font-mono text-xs ${badgeTone("IDLE", isLight)}`}>
                              Kemiripan: {asset.similarityScore.toFixed(3)}
                            </span>
                            {job && (
                              <span className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${badgeTone(job.status, isLight)}`}>
                                {statusLabelIndonesian(job.status)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className={`rounded-xl border p-4 ${bgElevated}`}>
                          <div className={`mb-2 flex items-center justify-between text-xs ${textMuted}`}>
                            <span>
                              {asset.caption.length}/{charLimit} karakter · {asset.aspectRatio}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopyCaption(asset.id, asset.caption)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 text-xs font-semibold text-teal-400 hover:bg-teal-500/25"
                            >
                              {copied ? (
                                <>
                                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                                  Tersalin
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                                  Salin Caption
                                </>
                              )}
                            </button>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {asset.caption}
                          </p>
                        </div>

                        <div className={`truncate rounded-lg border px-3 py-2 font-mono text-xs ${bgElevated} ${textMuted}`}>
                          SHA-256: {asset.mediaSha256 ?? "none"}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <div className={`flex items-center gap-1.5 text-xs font-semibold ${textMuted}`}>
                              <Eye className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                              Aset Desain
                            </div>
                            {mediaUrl ? (
                              asset.mediaType === "VIDEO" && mediaUrl.endsWith(".mp4") ? (
                                <video
                                  src={mediaUrl}
                                  controls
                                  className="h-44 w-full rounded-xl border border-slate-700 bg-black object-contain"
                                />
                              ) : (
                                <img
                                  src={mediaUrl}
                                  alt={`Render ${asset.accountId}`}
                                  className="h-44 w-full rounded-xl border border-slate-700 bg-black object-contain"
                                />
                              )
                            ) : (
                              <div className="flex h-44 items-center justify-center rounded-xl border border-slate-700 text-xs text-slate-500">
                                Tidak ada media
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <div className={`flex items-center gap-1.5 text-xs font-semibold ${textMuted}`}>
                              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                              Bukti Browser
                            </div>
                            {screenshotUrl ? (
                              <img
                                src={screenshotUrl}
                                alt={`Screenshot ${asset.accountId}`}
                                className="h-44 w-full rounded-xl border border-slate-700 bg-black object-contain"
                              />
                            ) : (
                              <div className="flex h-44 items-center justify-center rounded-xl border border-slate-700 text-xs text-slate-500">
                                Belum ada screenshot
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {state.insights.length > 0 && (
                <div className={`rounded-2xl border p-5 ${bgSurface}`}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-teal-400">
                    Insight Analyst Metrics
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className={`border-b ${textMuted}`}>
                        <tr>
                          <th className="py-2.5 pr-4">Akun</th>
                          <th className="py-2.5 pr-4">Platform</th>
                          <th className="py-2.5 pr-4">Views</th>
                          <th className="py-2.5 pr-4">Likes</th>
                          <th className="py-2.5 pr-4">Replies</th>
                          <th className="py-2.5 pr-4">Shares</th>
                          <th className="py-2.5">Pola Menang</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {state.insights.map((ins) => (
                          <tr key={ins.id}>
                            <td className="py-2.5 pr-4 font-semibold">
                              {accountById.get(ins.accountId)?.handle ?? ins.accountId}
                            </td>
                            <td className="py-2.5 pr-4 uppercase text-teal-400">{ins.platform}</td>
                            <td className="py-2.5 pr-4 font-mono">{ins.views}</td>
                            <td className="py-2.5 pr-4 font-mono">{ins.likes}</td>
                            <td className="py-2.5 pr-4 font-mono">{ins.replies}</td>
                            <td className="py-2.5 pr-4 font-mono">{ins.shares}</td>
                            <td className="py-2.5">{ins.winningPatternSummary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* VIEW 5: KONEKSI MUSE AI & EMBEDDED AGENT SKILLS */}
          {activeView === "settings" && (
            <section className="grid gap-6 lg:grid-cols-2">
              <form onSubmit={(e) => void handleSaveMuseSettings(e)} className={`space-y-4 rounded-2xl border p-6 ${bgSurface}`}>
                <div className="flex items-center gap-2.5">
                  <Settings className="h-5 w-5 text-teal-400" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-bold">
                      Koneksi Resmi Meta Muse AI &amp; Otomasi Sosial Media Live
                    </h2>
                    <p className={`text-xs ${textMuted}`}>
                      Status Key saat ini:{" "}
                      <strong className="text-teal-400">
                        {state.museSettings?.maskedApiKey ?? "Belum diisi"}
                      </strong>
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Meta Muse AI Base URL
                  </label>
                  <input
                    type="url"
                    value={museBaseUrl}
                    onChange={(e) => setMuseBaseUrl(e.target.value)}
                    className={`min-h-11 w-full rounded-xl border px-3.5 text-sm ${inputSurface}`}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Meta Muse API Key (dienkripsi AES-256-GCM sebelum disimpan)
                  </label>
                  <input
                    type="password"
                    placeholder="Masukkan META_API_KEY asli (kosongkan jika tidak mengubah)"
                    value={museApiKeyInput}
                    onChange={(e) => setMuseApiKeyInput(e.target.value)}
                    className={`min-h-11 w-full rounded-xl border px-3.5 text-sm ${inputSurface}`}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Orchestrator &amp; Insight</label>
                    <input
                      type="text"
                      value={museOrchestratorModel}
                      onChange={(e) => setMuseOrchestratorModel(e.target.value)}
                      className={`min-h-11 w-full rounded-xl border px-3 font-mono text-xs ${inputSurface}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Specialist Agents</label>
                    <input
                      type="text"
                      value={museSpecialistModel}
                      onChange={(e) => setMuseSpecialistModel(e.target.value)}
                      className={`min-h-11 w-full rounded-xl border px-3 font-mono text-xs ${inputSurface}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">QA Guard Model</label>
                    <input
                      type="text"
                      value={museGuardModel}
                      onChange={(e) => setMuseGuardModel(e.target.value)}
                      className={`min-h-11 w-full rounded-xl border px-3 font-mono text-xs ${inputSurface}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Image Anchor Model</label>
                    <input
                      type="text"
                      value={museImageModel}
                      onChange={(e) => setMuseImageModel(e.target.value)}
                      className={`min-h-11 w-full rounded-xl border px-3 font-mono text-xs ${inputSurface}`}
                    />
                  </div>
                </div>

                <div className={`space-y-2.5 rounded-xl border p-4 ${bgElevated}`}>
                  <label className="flex min-h-10 items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={livePlatformAutomation}
                      onChange={(e) => setLivePlatformAutomation(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span>
                      <strong>Koneksi Browser Sosial Media Live:</strong> buka URL asli (tiktok.com, threads.net, x.com, instagram.com, facebook.com)
                    </span>
                  </label>
                  <label className="flex min-h-10 items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={liveProxyEnabled}
                      onChange={(e) => setLiveProxyEnabled(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span>
                      <strong>Binding Proxy Live:</strong> teruskan proxy terenkripsi tiap akun ke Chromium
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                  >
                    Simpan Konfigurasi
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleTestMuseConnection()}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold ${bgElevated}`}
                  >
                    <Zap className="h-4 w-4 text-teal-400" strokeWidth={1.5} aria-hidden="true" />
                    Uji Koneksi AI
                  </button>
                </div>

                {aiDiagnostic && (
                  <div
                    className={`rounded-xl border p-4 text-xs ${
                      aiDiagnostic.ok
                        ? badgeTone("IDLE", isLight)
                        : badgeTone("FAILED", isLight)
                    }`}
                  >
                    {aiDiagnostic.ok ? (
                      <div className="space-y-1">
                        <div className="font-bold">
                          Koneksi Berhasil ({aiDiagnostic.providerName} · {aiDiagnostic.modelUsed})
                        </div>
                        <div>Latensi: {aiDiagnostic.latencyMs}ms</div>
                        <div>Sampel Tren: {aiDiagnostic.sampleTopic}</div>
                      </div>
                    ) : (
                      <div>Gagal terhubung: {aiDiagnostic.error}</div>
                    )}
                  </div>
                )}
              </form>

              {/* Embedded Agent Skills Catalog */}
              <div className={`space-y-4 rounded-2xl border p-6 ${bgSurface}`}>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="h-5 w-5 text-teal-400" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-bold">
                      Standar Kerja &amp; Skills Terintegrasi ke Agen AI
                    </h2>
                    <p className={`text-xs ${textMuted}`}>
                      Disuntikkan ke seluruh system prompt agen &amp; QA Gate untuk menghilangkan AI slop.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(state.agentSkills ?? []).map((skill) => (
                    <div key={skill.id} className={`rounded-xl border p-4 text-xs ${bgElevated}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-teal-400">{skill.name}</span>
                        <span className="rounded bg-teal-500/15 px-2 py-0.5 font-mono text-[11px] text-teal-400">
                          {skill.appliedRoles.join(", ")}
                        </span>
                      </div>
                      <div className={`mt-1 font-mono text-[11px] ${textMuted}`}>
                        Acuan: {skill.sourceRepo}
                      </div>
                      <p className="mt-2 leading-relaxed">{skill.summary}</p>
                      <ul className={`mt-2 list-disc space-y-1 pl-4 ${textMuted}`}>
                        {skill.rules.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ACCOUNT SESSION / COOKIE / CAPTCHA MODAL */}
      {sessionModalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-lg space-y-4 rounded-2xl border p-6 shadow-2xl ${bgSurface}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`rounded border px-2 py-0.5 text-xs font-bold uppercase ${bgElevated}`}>
                  {sessionModalAccount.platform}
                </span>
                <h3 className="mt-1.5 text-base font-bold">
                  Kelola Sesi: {sessionModalAccount.handle}
                </h3>
                <p className={`text-xs ${textMuted}`}>
                  Profil Terisolasi: {sessionModalAccount.profileDir}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSessionModalAccount(null)}
                aria-label="Tutup modal sesi"
                className="min-h-11 min-w-11 rounded-xl p-2 hover:bg-slate-800/50"
              >
                <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div className="flex gap-2 border-b border-slate-800/60 pb-2 text-xs">
              {[
                { id: "cookie", label: "Import Cookie Asli" },
                { id: "challenge", label: "Selesaikan CAPTCHA/2FA" },
                { id: "verify", label: "Verifikasi Sesi" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSessionModalTab(t.id as "verify" | "cookie" | "challenge")}
                  className={`min-h-10 rounded-lg px-3 font-semibold ${
                    sessionModalTab === t.id ? "bg-teal-600 text-white" : textMuted
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {sessionModalTab === "cookie" && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="mb-1.5 block font-semibold">
                    Cookie JSON Asli dari Browser (dienkripsi AES-256-GCM)
                  </label>
                  <textarea
                    rows={4}
                    placeholder='[{"name":"sessionid","value":"...","domain":".tiktok.com"}]'
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    className={`w-full rounded-xl border p-3 font-mono text-xs ${inputSurface}`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-semibold">
                    Proxy Khusus Akun (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="http://user:pass@ip:port"
                    value={proxyOverrideInput}
                    onChange={(e) => setProxyOverrideInput(e.target.value)}
                    className={`min-h-11 w-full rounded-xl border px-3 text-xs ${inputSurface}`}
                  />
                </div>
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    void handleSessionAction({
                      accountId: sessionModalAccount.id,
                      action: "import_cookie",
                      cookiePayload: cookieInput,
                      proxyUrl: proxyOverrideInput || undefined,
                    })
                  }
                  className="min-h-11 w-full rounded-xl bg-teal-600 font-bold text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  Enkripsi &amp; Simpan Cookie Login
                </button>
              </div>
            )}

            {sessionModalTab === "challenge" && (
              <div className="space-y-3 text-xs">
                <div className={`rounded-xl border p-3 ${badgeTone("PAUSED", isLight)}`}>
                  Status saat ini: <strong>{statusLabelIndonesian(sessionModalAccount.status)}</strong>. Selesaikan verifikasi 2FA/CAPTCHA, lalu masukkan kode atau konfirmasi di bawah.
                </div>
                <input
                  type="text"
                  placeholder="Kode OTP / Catatan verifikasi"
                  value={challengeCodeInput}
                  onChange={(e) => setChallengeCodeInput(e.target.value)}
                  className={`min-h-11 w-full rounded-xl border px-3 text-sm ${inputSurface}`}
                />
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    void handleSessionAction({
                      accountId: sessionModalAccount.id,
                      action: "resolve_challenge",
                      verificationCode: challengeCodeInput || "verified",
                    })
                  }
                  className="min-h-11 w-full rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
                >
                  Pulihkan Akun ke Siap Terhubung
                </button>
              </div>
            )}

            {sessionModalTab === "verify" && (
              <div className="space-y-3 text-xs">
                <p className={textMuted}>
                  Memverifikasi ulang binding proxy ({sessionModalAccount.proxyDisplay}) dan status sesi terenkripsi.
                </p>
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    void handleSessionAction({
                      accountId: sessionModalAccount.id,
                      action: "verify_session",
                    })
                  }
                  className="min-h-11 w-full rounded-xl bg-teal-600 font-bold text-white hover:bg-teal-500"
                >
                  Verifikasi Sesi Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
