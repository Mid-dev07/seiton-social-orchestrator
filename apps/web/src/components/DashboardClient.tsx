"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Eye,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  PauseOctagon,
  Play,
  Plus,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  X,
  Zap,
} from "lucide-react";

type Platform = "tiktok" | "threads" | "x" | "instagram" | "facebook";
type WorkflowStep = 1 | 2 | 3 | 4;

export interface OperatorProfile {
  email: string;
  name: string;
  role: string;
}

interface SafeAccount {
  id: string;
  platform: Platform | string;
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

const ALL_PLATFORMS: Platform[] = ["tiktok", "threads", "x", "instagram", "facebook"];

const DAG_STAGE_META = [
  { key: "RESEARCH", title: "1. Riset Tren", desc: "Analisis tren & pain point UMKM" },
  { key: "STRATEGY", title: "2. Strategi", desc: "Jadwal & variasi sudut pandang" },
  { key: "COPY", title: "3. Copy Unik", desc: "Hook & CTA sesuai batas karakter" },
  { key: "MEDIA", title: "4. Render Visual", desc: "Generasi grafis/video unik" },
  { key: "QA", title: "5. QA Gate", desc: "Cek anti-duplikat (<0.60) & hash" },
  { key: "PUBLISH", title: "6. Eksekusi", desc: "Simulasi/publish profil terisolasi" },
  { key: "INSIGHT", title: "7. Insight", desc: "Metrik & update PerformanceMemory" },
] as const;

const CAMPAIGN_PRESETS = [
  {
    id: "umkm",
    title: "Digitalisasi UMKM Seiton.id",
    desc: "Edukasi kasir QR, pembukuan stok, dan efisiensi warung/toko lokal.",
    group: "seiton-umkm",
    platforms: ALL_PLATFORMS,
    prompt:
      "Kampanye Seiton.id: bantu pemilik UMKM beralih dari catatan manual ke sistem kasir digital, stok otomatis, dan etalase online terhubung agar omzet naik tanpa salah catat.",
  },
  {
    id: "premium",
    title: "Paket Aplikasi Premium Resmi",
    desc: "Promosi akun aplikasi kreatif, AI, & produktivitas resmi bergaransi.",
    group: "seiton-premium",
    platforms: ALL_PLATFORMS,
    prompt:
      "Kampanye Seiton.id Premium Apps: perkenalkan paket langganan aplikasi desain, editing video, AI asisten, dan cloud workspace resmi bergaransi anti-suspend dengan harga hemat untuk kreator & tim bisnis.",
  },
  {
    id: "ecosystem",
    title: "Ekosistem Penuh 10 Akun",
    desc: "Serentak di seluruh 10 akun lintas 5 platform dengan variasi unik.",
    group: "all",
    platforms: ALL_PLATFORMS,
    prompt:
      "Kampanye gabungan Seiton.id: edukasi digitalisasi UMKM modern sekaligus penawaran bundling aplikasi premium resmi anti-blokir untuk mempercepat pertumbuhan bisnis digital Indonesia.",
  },
  {
    id: "quick-test",
    title: "Uji Cepat TikTok & X",
    desc: "Kampanye ringkas lintas 4 akun (TikTok & X) untuk verifikasi cepat.",
    group: "all",
    platforms: ["tiktok", "x"] as Platform[],
    prompt:
      "Promosi kilat Seiton.id: gabungkan sistem kasir digital UMKM dan akses software kreatif resmi dalam satu langganan aman.",
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
      return "Siap (Terlogin)";
    case "ACTIVE":
      return "Sedang Eksekusi";
    case "CHALLENGE_PAUSED":
      return "Perlu Verifikasi CAPTCHA/2FA";
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
      return "Dry-Run Sukses";
    case "PUBLISHED":
      return "Terpublikasi";
    default:
      return status;
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "SUCCESS":
    case "PASSED":
    case "DRY_RUN_OK":
    case "PUBLISHED":
    case "IDLE":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "RUNNING":
    case "ACTIVE":
    case "QUEUED":
    case "PENDING":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "PAUSED":
    case "PAUSED_BUDGET":
    case "RATE_LIMITED":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "CHALLENGE_PAUSED":
    case "FAILED":
    case "REJECTED":
    case "DISABLED":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  }
}

function resolveMediaSrc(rawPath: string | null): string | null {
  if (!rawPath) {
    return null;
  }
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

  const [state, setState] = useState<DashboardState>(initialState);
  const [step, setStep] = useState<WorkflowStep>(
    initialState.campaigns.length > 0 ? 4 : 1
  );
  const [sseConnected, setSseConnected] = useState(false);
  const [sseFeed, setSseFeed] = useState<SseFeedEntry[]>([]);
  const [killSwitchLatency, setKillSwitchLatency] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Step 1: Account Vault filters & Session Wizard Modal
  const [accountPlatformFilter, setAccountPlatformFilter] = useState<string>("all");
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [sessionModalAccount, setSessionModalAccount] = useState<SafeAccount | null>(null);
  const [sessionModalTab, setSessionModalTab] = useState<"verify" | "cookie" | "challenge">(
    "verify"
  );
  const [cookieInput, setCookieInput] = useState(
    '[{"name":"sessionid","value":"seiton_verified_cookie_token","domain":".seiton.id"}]'
  );
  const [proxyOverrideInput, setProxyOverrideInput] = useState("");
  const [challengeCodeInput, setChallengeCodeInput] = useState("");

  // Add account form state
  const [newPlatform, setNewPlatform] = useState<Platform>("tiktok");
  const [newHandle, setNewHandle] = useState("");
  const [newGroupTag, setNewGroupTag] = useState("seiton-umkm");
  const [newProxyUrl, setNewProxyUrl] = useState("http://user:pass@proxy.seiton.local:8080");
  const [newTimezone, setNewTimezone] = useState("Asia/Jakarta");
  const [newDailyLimit, setNewDailyLimit] = useState(5);

  // Step 2: Command Center form state
  const [commandPrompt, setCommandPrompt] = useState(CAMPAIGN_PRESETS[0]!.prompt);
  const [targetGroupTag, setTargetGroupTag] = useState("all");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(ALL_PLATFORMS);
  const [maxTokenBudget, setMaxTokenBudget] = useState(50000);
  const [dailyQuotaOverride, setDailyQuotaOverride] = useState(5);
  const [dryRun, setDryRun] = useState(true);
  const [executionMode, setExecutionMode] = useState<"fast" | "browser">(
    initialState.runtimeMode === "cloudflare-edge" ? "fast" : "fast"
  );
  const [simulateChallengeAccountId, setSimulateChallengeAccountId] = useState("");

  // Step 3 & 4: Inspectors
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [inspectorPlatformFilter, setInspectorPlatformFilter] = useState<string>("all");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as DashboardState;
      setState(data);
    } catch {
      // Keep current state on transient failure
    }
  }, []);

  // Restore local operator session fallback when running on edge static shell
  useEffect(() => {
    if (!operator && typeof window !== "undefined") {
      const saved = window.localStorage.getItem("seiton_operator_profile");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as OperatorProfile;
          if (parsed.email) {
            setOperator(parsed);
          }
        } catch {
          window.localStorage.removeItem("seiton_operator_profile");
        }
      }
    }
  }, [operator]);

  useEffect(() => {
    if (!operator) {
      return;
    }

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
        // Ignore malformed event
      }
    });

    eventSource.onerror = () => {
      setSseConnected(false);
    };

    const pollInterval = setInterval(() => {
      void refreshState();
    }, 4000);

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
      showToast(`Selamat datang, ${data.operator.name}!`);
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
      if (!res.ok) {
        throw new Error(json.error || "Gagal mengubah kill switch");
      }
      const clientElapsed = Math.round(performance.now() - t0);
      setKillSwitchLatency(json.elapsedMs ?? clientElapsed);
      await refreshState();
      showToast(
        json.paused
          ? "Global Kill Switch diaktifkan — seluruh dispatch dihentikan."
          : "Operasi dilanjutkan kembali."
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Kill switch error");
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
      if (!res.ok) {
        throw new Error(json.error || "Aksi sesi akun gagal");
      }
      await refreshState();
      if (json.account) {
        setSessionModalAccount(json.account);
      }
      if (payload.action === "verify_all") {
        setSessionModalAccount(null);
      }
      showToast(json.message || "Sesi akun berhasil diperbarui.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal memproses sesi akun");
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
          simulateChallengeAccountId: simulateChallengeAccountId || undefined,
        }),
      });
      const json = (await res.json()) as { campaignId?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Gagal meluncurkan kampanye");
      }
      setStep(3);
      await refreshState();
      showToast(`Kampanye ${json.campaignId} diluncurkan!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal meluncurkan kampanye");
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHandle.trim()) return;
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: newPlatform,
          handle: newHandle.trim(),
          groupTag: newGroupTag.trim(),
          proxyUrl: newProxyUrl.trim() || undefined,
          timezone: newTimezone.trim(),
          dailyPostLimit: newDailyLimit,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Gagal menambahkan akun");
      }
      setNewHandle("");
      setShowAddAccountForm(false);
      await refreshState();
      showToast("Akun baru berhasil disimpan & dienkripsi ke Account Vault.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal menambah akun");
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateAccount = async (
    id: string,
    patch: { status?: string; resetPostsToday?: boolean }
  ) => {
    setBusyAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error || "Gagal memperbarui akun");
      }
      await refreshState();
      showToast("Status akun berhasil diperbarui.");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Update akun gagal");
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
      setTimeout(() => {
        setCopiedAssetId((prev) => (prev === assetId ? null : prev));
      }, 2000);
    } catch {
      showToast("Gagal menyalin ke clipboard.");
    }
  };

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
      if (!map.has(run.stage)) {
        map.set(run.stage, run.status);
      }
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

  // --- OPERATOR LOGIN SCREEN ---
  if (!operator) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b14] px-4 py-12 text-slate-100">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl shadow-cyan-950/30">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Seiton-Social Media</h1>
              <p className="text-xs text-slate-400">
                Portal Operator 1-Pintu · Promosi Seiton.id
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3.5 text-xs text-cyan-100">
            <div className="font-semibold text-cyan-300">Siap Pakai (Quick Access)</div>
            <p className="mt-1 text-slate-300">
              Masuk untuk mengelola 10 akun lintas TikTok, Threads, X, Instagram, dan Facebook beserta pipeline 6 agen AI.
            </p>
            <div className="mt-2 font-mono text-[11px] text-cyan-200">
              Email: admin@seiton.id · Sandi: seiton2026
            </div>
          </div>

          {loginError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-200">
              {loginError}
            </div>
          )}

          <button
            type="button"
            disabled={loginBusy}
            onClick={() => void handleOperatorLogin(true)}
            data-testid="quick-operator-login"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-500 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            Masuk Instan sebagai Operator Seiton.id
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-3 text-[11px] text-slate-500">atau login manual</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          <form
            onSubmit={(e) => void handleOperatorLogin(false, e)}
            className="space-y-3.5"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Email Operator
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Kata Sandi
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loginBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              Masuk dengan Kredensial
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      {/* Persistent Operational Header + Global Kill Switch */}
      <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-[#0b1120]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                  Seiton-Social Media
                </h1>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                  {state.runtimeMode === "cloudflare-edge" ? "Cloud Edge Mode" : "1-Pintu Orchestrator"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Promosi <span className="text-slate-200">Seiton.id (UMKM &amp; Aplikasi Premium)</span> · {readyAccounts.length}/{state.accounts.length} Akun Siap
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              DRY_RUN={String(state.dryRunDefault)}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                sseConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  sseConnected ? "animate-pulse bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {sseConnected ? "LIVE STREAM" : "SYNC"}
            </span>

            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 sm:inline-flex">
              <UserCheck className="h-3.5 w-3.5 text-cyan-400" />
              <span>{operator.email}</span>
              <button
                type="button"
                onClick={() => void handleOperatorLogout()}
                title="Keluar"
                className="ml-1 text-slate-400 hover:text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleToggleKillSwitch()}
              disabled={busyAction}
              data-testid="global-kill-switch"
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold tracking-wide transition ${
                state.globalPaused
                  ? "border-emerald-400/50 bg-emerald-600 text-white hover:bg-emerald-500"
                  : "border-rose-400/60 bg-rose-600 text-white shadow-lg shadow-rose-950/50 hover:bg-rose-500"
              }`}
            >
              {state.globalPaused ? (
                <>
                  <Play className="h-4 w-4" />
                  RESUME ALL
                </>
              ) : (
                <>
                  <PauseOctagon className="h-4 w-4" />
                  PAUSE ALL CAMPAIGNS
                </>
              )}
              {killSwitchLatency !== null && (
                <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">
                  {killSwitchLatency}ms
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {toastMessage && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 text-xs font-medium text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-300 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {state.globalPaused && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            <div className="flex items-center gap-2.5">
              <PauseOctagon className="h-5 w-5 shrink-0 text-rose-400" />
              <span>
                <strong>GLOBAL KILL SWITCH AKTIF:</strong> Seluruh dispatch node DAG &amp; antrean browser baru dihentikan seketika.
              </span>
            </div>
          </div>
        )}

        {challengedCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
              <span>
                <strong>{challengedCount} Akun Butuh Verifikasi CAPTCHA/2FA:</strong> Buka Langkah 1 (Akun &amp; Login) untuk menyelesaikan verifikasi agar akun bisa dipakai kembali.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-1 font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              Periksa Akun Bermasalah
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="underline hover:text-white"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Guided 4-Step Workflow Stepper */}
        <section className="grid gap-3 sm:grid-cols-4">
          {[
            {
              num: 1 as WorkflowStep,
              title: "1. Akun & Login",
              sub: `${readyAccounts.length}/${state.accounts.length} akun siap`,
              icon: KeyRound,
            },
            {
              num: 2 as WorkflowStep,
              title: "2. Buat Kampanye",
              sub: "Pilih preset & target platform",
              icon: Rocket,
            },
            {
              num: 3 as WorkflowStep,
              title: "3. Proses AI & Browser",
              sub: latestCampaign
                ? `${completedStagesCount}/7 tahap · ${statusLabelIndonesian(latestCampaign.status)}`
                : "Monitor live pipeline",
              icon: Activity,
            },
            {
              num: 4 as WorkflowStep,
              title: "4. Hasil & Analitik",
              sub: `${state.contentAssets.length} konten · ${state.insights.length} metrik`,
              icon: Layers,
            },
          ].map((item) => {
            const Icon = item.icon;
            const active = step === item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => setStep(item.num)}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                  active
                    ? "border-cyan-400/70 bg-cyan-500/15 shadow-lg shadow-cyan-950/30"
                    : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    active
                      ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
                      : "border-slate-700 bg-slate-950 text-slate-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div
                    className={`truncate text-xs font-bold ${
                      active ? "text-white" : "text-slate-200"
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="truncate text-[11px] text-slate-400">{item.sub}</div>
                </div>
              </button>
            );
          })}
        </section>

        {/* STEP 1: KONEKSI & LOGIN AKUN */}
        {step === 1 && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div>
                <h2 className="text-base font-bold text-white">
                  Langkah 1: Cek Status Login &amp; Koneksi 10 Akun Sosial Media
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Setiap akun memiliki profil terisolasi (`userDataDir`) &amp; proxy terenkripsi AES-256-GCM. Pastikan akun berstatus <strong>Siap (Terlogin)</strong> sebelum menjalankan kampanye.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    void handleSessionAction({
                      accountId: "all",
                      action: "verify_all",
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-4 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Verifikasi Semua Akun (1-Klik)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddAccountForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Akun
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
                >
                  Lanjut ke Langkah 2: Buat Kampanye
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {showAddAccountForm && (
              <form
                onSubmit={(e) => void handleCreateAccount(e)}
                className="grid gap-3 rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 sm:grid-cols-6"
              >
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Platform</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value as Platform)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                  >
                    {ALL_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-400">Handle / Halaman</label>
                  <input
                    type="text"
                    placeholder="@seiton.umkm.baru"
                    value={newHandle}
                    onChange={(e) => setNewHandle(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Grup</label>
                  <input
                    type="text"
                    value={newGroupTag}
                    onChange={(e) => setNewGroupTag(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Limit/Hari</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newDailyLimit}
                    onChange={(e) => setNewDailyLimit(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="w-full rounded-lg bg-cyan-600 py-2 text-xs font-bold text-white hover:bg-cyan-500"
                  >
                    Simpan Akun
                  </button>
                </div>
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Proxy HTTP/SOCKS5 (Terenkripsi AES-256-GCM)
                  </label>
                  <input
                    type="text"
                    value={newProxyUrl}
                    onChange={(e) => setNewProxyUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-400">Timezone</label>
                  <input
                    type="text"
                    value={newTimezone}
                    onChange={(e) => setNewTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </form>
            )}

            {/* Platform filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              {["all", ...ALL_PLATFORMS].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAccountPlatformFilter(p)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase transition ${
                    accountPlatformFilter === p
                      ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                      : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {p === "all" ? `Semua (${state.accounts.length})` : p}
                </button>
              ))}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredVaultAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-300">
                          {acc.platform}
                        </span>
                        <h3 className="mt-1.5 text-sm font-bold text-white">
                          {acc.handle}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Grup: {acc.groupTag} · {acc.timezone}
                        </p>
                      </div>
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(acc.status)}`}
                      >
                        {statusLabelIndonesian(acc.status)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 font-mono text-[10px] text-slate-400">
                      <div className="truncate">Proxy: {acc.proxyDisplay}</div>
                      <div>
                        Kuota: {acc.postsToday}/{acc.dailyPostLimit} post · Sesi:{" "}
                        <span className={acc.hasSession ? "text-emerald-300" : "text-amber-300"}>
                          {acc.hasSession ? "Terenkripsi Aktif" : "Belum Login"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSessionModalAccount(acc);
                        setSessionModalTab(
                          acc.status === "CHALLENGE_PAUSED" ? "challenge" : "verify"
                        );
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                        acc.status === "CHALLENGE_PAUSED"
                          ? "border-amber-400/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                          : "border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
                      }`}
                    >
                      <KeyRound className="h-3 w-3" />
                      {acc.status === "CHALLENGE_PAUSED"
                        ? "Selesaikan CAPTCHA"
                        : "Login / Kelola Sesi"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateAccount(acc.id, { resetPostsToday: true })
                      }
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700"
                    >
                      Reset Kuota
                    </button>

                    {acc.status === "DISABLED" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateAccount(acc.id, { status: "IDLE" })
                        }
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300"
                      >
                        Aktifkan
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateAccount(acc.id, { status: "DISABLED" })
                        }
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/20"
                      >
                        Nonaktifkan
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* STEP 2: BUAT KAMPANYE 1-PINTU */}
        {step === 2 && (
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <h2 className="text-base font-bold text-white">
                  Langkah 2: Pilih Preset Siap Pakai atau Tulis Perintah Kampanye
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Klik salah satu template Seiton.id di bawah ini untuk mengisi form otomatis, atau sesuaikan target sesuai kebutuhan Anda.
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
                        showToast(`Preset "${preset.title}" diterapkan.`);
                      }}
                      className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-left transition hover:border-cyan-500/60 hover:bg-slate-950"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-300">
                          {preset.title}
                        </span>
                        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(e) => void handleLaunchCampaign(e)}
                className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
              >
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                    Perintah Kampanye (1-Pintu)
                  </label>
                  <textarea
                    rows={3}
                    value={commandPrompt}
                    onChange={(e) => setCommandPrompt(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-300">
                    Target Platform ({selectedPlatforms.length}/5 dipilih)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PLATFORMS.map((p) => {
                      const selected = selectedPlatforms.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(p)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase transition ${
                            selected
                              ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                              : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500"
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
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Grup Akun
                    </label>
                    <select
                      value={targetGroupTag}
                      onChange={(e) => setTargetGroupTag(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="all">Semua Grup (10 Akun)</option>
                      <option value="seiton-umkm">seiton-umkm (5 Akun UMKM)</option>
                      <option value="seiton-premium">seiton-premium (5 Akun Premium)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Mode Eksekusi (Hemat Device)
                    </label>
                    <select
                      value={executionMode}
                      onChange={(e) =>
                        setExecutionMode(e.target.value as "fast" | "browser")
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="fast">Ringan &amp; Cepat (SVG / Edge, 0% Beban CPU)</option>
                      <option value="browser">Browser Penuh (Playwright + FFmpeg MP4)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Batas Token
                    </label>
                    <input
                      type="number"
                      min={500}
                      step={500}
                      value={maxTokenBudget}
                      onChange={(e) => setMaxTokenBudget(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={dryRun}
                      onChange={(e) => setDryRun(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600"
                    />
                    <span>
                      <strong>DRY_RUN</strong> (Simulasi Aman)
                    </span>
                  </label>
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">
                      Kuota Harian / Akun
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={dailyQuotaOverride}
                      onChange={(e) => setDailyQuotaOverride(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">
                      Uji Deteksi CAPTCHA (Opsional)
                    </label>
                    <select
                      value={simulateChallengeAccountId}
                      onChange={(e) => setSimulateChallengeAccountId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="">Normal (Tanpa Challenge)</option>
                      {state.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          Simulasi CAPTCHA: {acc.handle}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    busyAction ||
                    state.globalPaused ||
                    preflightMatchedAccounts.length === 0
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Rocket className="h-4 w-4" />
                  {state.globalPaused
                    ? "Sistem Dijeda (Global Kill Switch Aktif)"
                    : preflightMatchedAccounts.length === 0
                      ? "Tidak Ada Akun Siap — Periksa Langkah 1"
                      : `Luncurkan Kampanye ke ${preflightMatchedAccounts.length} Akun Sekarang`}
                </button>
              </form>
            </div>

            {/* Pre-Flight Summary & PerformanceMemory */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Ringkasan Pre-Flight (Siap Jalan)
                </h3>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Akun Terpilih &amp; Sehat:</span>
                    <span className="font-bold text-white">
                      {preflightMatchedAccounts.length} akun
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mode Eksekusi:</span>
                    <span className="font-semibold text-cyan-300">
                      {executionMode === "fast" ? "Ringan (SVG/Edge)" : "Browser Penuh"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Keamanan Publish:</span>
                    <span className="font-semibold text-emerald-300">
                      {dryRun ? "DRY_RUN (Tanpa Post Live)" : "LIVE"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Batas Kemiripan QA:</span>
                    <span className="font-mono text-emerald-300">&lt; 0.60</span>
                  </div>
                </div>
                {preflightMatchedAccounts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
                    {preflightMatchedAccounts.map((acc) => (
                      <span
                        key={acc.id}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300"
                      >
                        {acc.platform}: {acc.handle}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  <TrendingUp className="h-4 w-4" />
                  Memori Pola Menang (PerformanceMemory)
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  {state.performanceMemory.winningPatterns.slice(0, 3).map((pat, idx) => (
                    <li
                      key={idx}
                      className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5"
                    >
                      {pat}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* STEP 3: MONITOR 6 AGEN AI & BROWSER */}
        {step === 3 && (
          <section className="space-y-5">
            {latestCampaign?.status === "COMPLETED" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4">
                <div className="flex items-center gap-2.5 text-sm text-emerald-200">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <span>
                    <strong>Pipeline Selesai!</strong> Seluruh copy unik, visual, screenshot dry-run, dan insight telah siap diperiksa.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Lihat Hasil Konten &amp; Analitik (Langkah 4)
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Langkah 3: Progres Orkestrasi 7 Tahap DAG{" "}
                    {latestCampaign ? `(${latestCampaign.id})` : ""}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {latestCampaign
                      ? latestCampaign.commandPrompt
                      : "Belum ada kampanye berjalan. Mulai dari Langkah 2."}
                  </p>
                </div>
                {latestCampaign && (
                  <span
                    className={`rounded border px-2.5 py-1 text-xs font-bold ${statusBadgeClass(latestCampaign.status)}`}
                  >
                    {statusLabelIndonesian(latestCampaign.status)} ·{" "}
                    {Math.round((completedStagesCount / DAG_STAGE_META.length) * 100)}%
                  </span>
                )}
              </div>

              <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                  style={{
                    width: `${Math.round((completedStagesCount / DAG_STAGE_META.length) * 100)}%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-7">
                {DAG_STAGE_META.map((stage) => {
                  const st = stageStatusMap.get(stage.key) ?? "IDLE";
                  return (
                    <div
                      key={stage.key}
                      className={`rounded-xl border p-3 text-left ${statusBadgeClass(st)}`}
                    >
                      <div className="text-[11px] font-bold">{stage.title}</div>
                      <div className="mt-0.5 text-[10px] opacity-80">{stage.desc}</div>
                      <div className="mt-1.5 font-mono text-[10px] font-bold">{st}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Live Activity Stream
                </h3>
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {sseFeed.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Menunggu aktivitas baru dari agen AI...
                    </p>
                  ) : (
                    sseFeed.map((evt, i) => (
                      <div
                        key={`${evt.timestamp}-${i}`}
                        className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-mono text-cyan-400">{evt.type}</span>
                          <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-1 text-slate-200">{evt.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 lg:col-span-2">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
                  Log Eksekusi Agen (`agent_runs`)
                </h3>
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {state.agentRuns.length === 0 ? (
                    <p className="text-xs text-slate-500">Belum ada log eksekusi.</p>
                  ) : (
                    state.agentRuns.map((run) => {
                      const expanded = expandedRunId === run.id;
                      return (
                        <div
                          key={run.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{run.stage}</span>
                              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-violet-300">
                                {run.modelUsed}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                attempt #{run.attempt}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">
                                {run.tokensUsed} tok · {run.durationMs}ms
                              </span>
                              <span
                                className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(run.status)}`}
                              >
                                {run.status}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedRunId(expanded ? null : run.id)
                                }
                                className="text-[11px] text-cyan-400 hover:underline"
                              >
                                {expanded ? "Tutup JSON" : "Detail JSON"}
                              </button>
                            </div>
                          </div>
                          {run.errorMessage && (
                            <p className="mt-1.5 text-xs text-rose-300">{run.errorMessage}</p>
                          )}
                          {expanded && (
                            <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-800 bg-black/60 p-2 font-mono text-[10px] text-slate-300">
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

        {/* STEP 4: HASIL KONTEN, VISUAL & ANALITIK */}
        {step === 4 && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  Langkah 4: Hasil Konten Siap Pakai, Visual &amp; Analitik Performa
                </h2>
                <p className="text-xs text-slate-400">
                  Seluruh teks dijamin berbeda lintas akun (skor kemiripan &lt; 0.60) dengan hash file media SHA-256 unik per akun.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["all", ...ALL_PLATFORMS].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInspectorPlatformFilter(p)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase ${
                      inspectorPlatformFilter === p
                        ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                        : "border-slate-700 bg-slate-950 text-slate-400 hover:text-white"
                    }`}
                  >
                    {p === "all" ? `Semua (${state.contentAssets.length})` : p}
                  </button>
                ))}
              </div>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-10 text-center">
                <p className="text-sm font-medium text-slate-300">
                  Belum ada konten yang dihasilkan untuk filter ini.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-500"
                >
                  <Rocket className="h-4 w-4" />
                  Buat Kampanye Pertama di Langkah 2
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredAssets.map((asset) => {
                  const acc = accountById.get(asset.accountId);
                  const job = jobByAssetId.get(asset.id);
                  const charLimit = PLATFORM_CHAR_LIMITS[asset.platform] ?? 2200;
                  const mediaUrl = resolveMediaSrc(asset.mediaPath);
                  const screenshotUrl = resolveMediaSrc(job?.screenshotPath ?? null);
                  const copied = copiedAssetId === asset.id;

                  return (
                    <div
                      key={asset.id}
                      className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-800 px-2 py-0.5 font-bold uppercase text-cyan-300">
                            {asset.platform}
                          </span>
                          <span className="font-bold text-white">
                            {acc?.handle ?? asset.accountId}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                            Anti-Duplikat: {asset.similarityScore.toFixed(3)} (&lt;0.60)
                          </span>
                          {job && (
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(job.status)}`}
                            >
                              {statusLabelIndonesian(job.status)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-400">
                          <span>
                            Caption ({asset.caption.length}/{charLimit} karakter) · {asset.aspectRatio}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopyCaption(asset.id, asset.caption)}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:bg-slate-800"
                          >
                            {copied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                Tersalin!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Salin Caption
                              </>
                            )}
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                          {asset.caption}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-black/40 p-2 font-mono text-[10px] text-slate-400">
                        <div className="truncate">SHA-256: {asset.mediaSha256 ?? "none"}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                            <Eye className="h-3 w-3" /> Visual Desain Lokal
                          </div>
                          {mediaUrl ? (
                            asset.mediaType === "VIDEO" && mediaUrl.endsWith(".mp4") ? (
                              <video
                                src={mediaUrl}
                                controls
                                className="h-44 w-full rounded-lg border border-slate-800 bg-black object-contain"
                              />
                            ) : (
                              <img
                                src={mediaUrl}
                                alt={`Render ${asset.accountId}`}
                                className="h-44 w-full rounded-lg border border-slate-800 bg-black object-contain"
                              />
                            )
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-lg border border-slate-800 text-slate-600">
                              Tidak ada media
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                            <CheckCircle2 className="h-3 w-3" /> Pratinjau Composer ({job?.status ?? "N/A"})
                          </div>
                          {screenshotUrl ? (
                            <img
                              src={screenshotUrl}
                              alt={`Screenshot ${asset.accountId}`}
                              className="h-44 w-full rounded-lg border border-slate-800 bg-black object-contain"
                            />
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-lg border border-slate-800 text-slate-600">
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
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Insight Analyst Metrics (`insights`)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-[11px] text-slate-400">
                      <tr>
                        <th className="py-2 pr-3">Akun</th>
                        <th className="py-2 pr-3">Platform</th>
                        <th className="py-2 pr-3">Views</th>
                        <th className="py-2 pr-3">Likes</th>
                        <th className="py-2 pr-3">Replies</th>
                        <th className="py-2 pr-3">Shares</th>
                        <th className="py-2">Pola Menang (Winning Pattern)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-slate-200">
                      {state.insights.map((ins) => (
                        <tr key={ins.id}>
                          <td className="py-2 pr-3 font-semibold">
                            {accountById.get(ins.accountId)?.handle ?? ins.accountId}
                          </td>
                          <td className="py-2 pr-3 uppercase text-cyan-300">{ins.platform}</td>
                          <td className="py-2 pr-3 font-mono">{ins.views}</td>
                          <td className="py-2 pr-3 font-mono">{ins.likes}</td>
                          <td className="py-2 pr-3 font-mono">{ins.replies}</td>
                          <td className="py-2 pr-3 font-mono">{ins.shares}</td>
                          <td className="py-2 text-slate-300">{ins.winningPatternSummary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ACCOUNT LOGIN & SESSION WIZARD MODAL */}
      {sessionModalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-300">
                  {sessionModalAccount.platform}
                </span>
                <h3 className="mt-1 text-base font-bold text-white">
                  Kelola Sesi &amp; Login: {sessionModalAccount.handle}
                </h3>
                <p className="text-xs text-slate-400">
                  Profil Terisolasi: {sessionModalAccount.profileDir}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSessionModalAccount(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2 border-b border-slate-800 pb-2 text-xs">
              {[
                { id: "verify", label: "Verifikasi 1-Klik" },
                { id: "cookie", label: "Import Cookie/Token" },
                { id: "challenge", label: "Selesaikan CAPTCHA/2FA" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setSessionModalTab(t.id as "verify" | "cookie" | "challenge")
                  }
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    sessionModalTab === t.id
                      ? "bg-cyan-500/20 text-cyan-200"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {sessionModalTab === "verify" && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-300">
                  Memverifikasi ulang binding proxy ({sessionModalAccount.proxyDisplay}) dan menyegarkan sesi login terenkripsi AES-256-GCM agar akun siap dipakai.
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
                  className="w-full rounded-xl bg-cyan-600 py-2.5 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  Verifikasi &amp; Aktifkan Sesi Sekarang
                </button>
              </div>
            )}

            {sessionModalTab === "cookie" && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="mb-1 block text-slate-300">
                    Cookie JSON / Session Token (dienkripsi AES-256-GCM)
                  </label>
                  <textarea
                    rows={4}
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-slate-300">
                    Update Proxy URL Khusus Akun Ini (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="http://user:pass@ip:port"
                    value={proxyOverrideInput}
                    onChange={(e) => setProxyOverrideInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
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
                  className="w-full rounded-xl bg-cyan-600 py-2.5 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  Enkripsi &amp; Simpan Cookie Login
                </button>
              </div>
            )}

            {sessionModalTab === "challenge" && (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-amber-200">
                  Status saat ini:{" "}
                  <strong>{statusLabelIndonesian(sessionModalAccount.status)}</strong>. Selesaikan verifikasi 2FA/CAPTCHA pada profil terisolasi akun ini, lalu konfirmasi di bawah.
                </div>
                <div>
                  <label className="mb-1 block text-slate-300">
                    Kode OTP / Catatan Verifikasi (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: 482910 atau verified-manual"
                    value={challengeCodeInput}
                    onChange={(e) => setChallengeCodeInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
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
                  className="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Konfirmasi Selesai &amp; Pulihkan Akun ke Siap
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
