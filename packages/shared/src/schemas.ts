import { z } from "zod";

export { z };

export const PlatformSchema = z.enum(["tiktok", "threads", "x", "instagram", "facebook"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const AccountStatusSchema = z.enum([
  "IDLE",
  "ACTIVE",
  "ONBOARDING_OTP",
  "CHALLENGE_PAUSED",
  "RATE_LIMITED",
  "DISABLED",
]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const CampaignStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "PAUSED_BUDGET",
  "COMPLETED",
  "FAILED",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const AgentStageSchema = z.enum([
  "RESEARCH",
  "STRATEGY",
  "COPY",
  "MEDIA",
  "QA",
  "PUBLISH",
  "INSIGHT",
]);
export type AgentStage = z.infer<typeof AgentStageSchema>;

export const AgentRunStatusSchema = z.enum(["RUNNING", "SUCCESS", "FAILED"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const MediaTypeSchema = z.enum(["NONE", "IMAGE", "CAROUSEL", "VIDEO"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const QAStatusSchema = z.enum(["PENDING", "PASSED", "REJECTED"]);
export type QAStatus = z.infer<typeof QAStatusSchema>;

export const PublishJobStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "DRY_RUN_OK",
  "PUBLISHED",
  "CHALLENGE_PAUSED",
  "FAILED",
]);
export type PublishJobStatus = z.infer<typeof PublishJobStatusSchema>;

export const AspectRatioSchema = z.enum(["9:16", "4:5", "1:1"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const PLATFORM_LIMITS: Record<
  Platform,
  { maxChars: number; allowedAspectRatios: readonly AspectRatio[]; label: string }
> = {
  x: { maxChars: 280, allowedAspectRatios: ["1:1", "4:5", "9:16"], label: "X (Twitter)" },
  threads: { maxChars: 500, allowedAspectRatios: ["1:1", "4:5", "9:16"], label: "Threads" },
  instagram: { maxChars: 2200, allowedAspectRatios: ["1:1", "4:5", "9:16"], label: "Instagram" },
  tiktok: { maxChars: 2200, allowedAspectRatios: ["9:16", "1:1"], label: "TikTok" },
  facebook: { maxChars: 63206, allowedAspectRatios: ["1:1", "4:5", "9:16"], label: "Facebook" },
};

// --- Agent JSON Contracts (TECH_SPEC.md §3) ---

export const ResearchBriefSchema = z.object({
  trends: z
    .array(
      z.object({
        topic: z.string().min(2),
        hookAngle: z.string().min(2),
        platform: PlatformSchema,
        confidence: z.number().min(0).max(1),
      })
    )
    .min(1),
  audiencePainPoints: z.array(z.string().min(2)).min(1),
  bannedAngles: z.array(z.string().min(2)),
  priorWinningPatterns: z.array(z.string()),
});
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

export const CampaignAssignmentSchema = z.object({
  accountId: z.string().min(1),
  platform: PlatformSchema,
  scheduledIso: z.string().min(10),
  contentAngle: z.string().min(3),
  format: z.enum(["IMAGE", "VIDEO"]),
  variationSeed: z.string().min(4),
});
export type CampaignAssignment = z.infer<typeof CampaignAssignmentSchema>;

export const CampaignPlanSchema = z.object({
  assignments: z.array(CampaignAssignmentSchema).min(1),
});
export type CampaignPlan = z.infer<typeof CampaignPlanSchema>;

export const CopyItemSchema = z.object({
  accountId: z.string().min(1),
  platform: PlatformSchema,
  hook: z.string().min(3),
  body: z.string().min(3),
  cta: z.string().min(3),
  hashtags: z.array(z.string().min(2)).min(1),
  variantLabel: z.string().min(2),
});
export type CopyItem = z.infer<typeof CopyItemSchema>;

export const CopyBundleSchema = z.object({
  items: z.array(CopyItemSchema).min(1),
});
export type CopyBundle = z.infer<typeof CopyBundleSchema>;

export const VisualSpecSchema = z.object({
  accountId: z.string().min(1),
  format: z.enum(["IMAGE", "VIDEO"]),
  aspectRatio: AspectRatioSchema,
  headline: z.string().min(3),
  subheadline: z.string().min(3),
  accentHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  durationSec: z.number().int().min(1).max(60).optional(),
  variationSeed: z.string().min(4),
});
export type VisualSpec = z.infer<typeof VisualSpecSchema>;

export const VisualSpecBundleSchema = z.object({
  specs: z.array(VisualSpecSchema).min(1),
});
export type VisualSpecBundle = z.infer<typeof VisualSpecBundleSchema>;

export const QAEvaluationSchema = z.object({
  overallPassed: z.boolean(),
  complianceSummary: z.string().min(2),
  flaggedAccountIds: z.array(z.string()),
  rewriteGuidance: z.string().optional(),
});
export type QAEvaluation = z.infer<typeof QAEvaluationSchema>;

export const InsightMetricItemSchema = z.object({
  publishJobId: z.string().min(1),
  accountId: z.string().min(1),
  platform: PlatformSchema,
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  replies: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  winningPatternSummary: z.string().min(3),
});

export const InsightReportSchema = z.object({
  metrics: z.array(InsightMetricItemSchema),
  topWinningPatterns: z.array(z.string()).min(1),
  recommendedNextAngles: z.array(z.string()).min(1),
});
export type InsightReport = z.infer<typeof InsightReportSchema>;

export const PerformanceMemorySchema = z.object({
  updatedAt: z.number().int().nonnegative(),
  winningPatterns: z.array(z.string()),
  platformHighlights: z.record(z.string(), z.string()),
  lastCampaignId: z.string().optional(),
});
export type PerformanceMemory = z.infer<typeof PerformanceMemorySchema>;

// --- API Input Schemas ---

export const CreateCampaignInputSchema = z.object({
  commandPrompt: z.string().trim().min(5, "Perintah kampanye minimal 5 karakter"),
  targetPlatforms: z.array(PlatformSchema).min(1, "Pilih minimal 1 platform"),
  targetGroupTag: z.string().trim().min(1).default("all"),
  accountIds: z.array(z.string().min(1)).optional(),
  dryRun: z.boolean().default(true),
  maxTokenBudget: z.number().int().min(500).max(1000000).default(50000),
  dailyQuotaOverride: z.number().int().min(1).max(50).optional(),
  simulateChallengeAccountId: z.string().optional(),
  executionMode: z.enum(["fast", "browser"]).default("browser"),
  sync: z.boolean().optional(),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const OperatorLoginInputSchema = z.object({
  email: z.string().trim().email().optional(),
  password: z.string().optional(),
  quickDemo: z.boolean().optional(),
});
export type OperatorLoginInput = z.infer<typeof OperatorLoginInputSchema>;

export const AccountSessionActionSchema = z.object({
  accountId: z.string().min(1),
  action: z.enum(["verify_session", "import_cookie", "resolve_challenge", "verify_all"]),
  cookiePayload: z.string().trim().optional(),
  verificationCode: z.string().trim().optional(),
  proxyUrl: z.string().trim().optional(),
});
export type AccountSessionAction = z.infer<typeof AccountSessionActionSchema>;

export const CreateAccountInputSchema = z.object({
  platform: PlatformSchema,
  handle: z.string().trim().min(2),
  groupTag: z.string().trim().min(1).default("seiton-umkm"),
  proxyUrl: z.string().trim().optional(),
  sessionCookieJson: z.string().trim().optional(),
  timezone: z.string().trim().min(2).default("Asia/Jakarta"),
  dailyPostLimit: z.number().int().min(1).max(50).default(5),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInputSchema>;

export const UpdateAccountInputSchema = z.object({
  id: z.string().min(1),
  handle: z.string().trim().min(2).optional(),
  groupTag: z.string().trim().min(1).optional(),
  proxyUrl: z.string().trim().optional(),
  sessionCookieJson: z.string().trim().optional(),
  timezone: z.string().trim().min(2).optional(),
  dailyPostLimit: z.number().int().min(1).max(50).optional(),
  status: AccountStatusSchema.optional(),
  resetPostsToday: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInputSchema>;

export const KillSwitchInputSchema = z.object({
  paused: z.boolean(),
  reason: z.string().trim().max(240).optional(),
});
export type KillSwitchInput = z.infer<typeof KillSwitchInputSchema>;

export const MuseConfigInputSchema = z.object({
  baseUrl: z.string().trim().url("Base URL harus valid (misal https://api.meta.ai/v1)"),
  apiKey: z.string().trim().optional(),
  orchestratorModel: z.string().trim().min(2).default("muse-wonder-1.0"),
  specialistModel: z.string().trim().min(2).default("muse-spark-1.3"),
  guardModel: z.string().trim().min(2).default("muse-ember-1.0"),
  imageModel: z.string().trim().min(2).default("muse-image-1.0"),
  livePlatformAutomation: z.boolean().default(true),
  liveProxyEnabled: z.boolean().default(false),
});
export type MuseConfigInput = z.infer<typeof MuseConfigInputSchema>;

export const OnboardingActionSchema = z.object({
  action: z.enum(["start_onboarding", "submit_otp", "refresh_screenshot", "complete_manual"]),
  accountId: z.string().optional(),
  platform: PlatformSchema.optional(),
  mode: z.enum(["signup", "login"]).default("signup"),
  email: z.string().trim().email("Email wajib valid").optional(),
  handle: z.string().trim().min(2).optional(),
  displayName: z.string().trim().min(2).optional(),
  password: z.string().min(6).optional(),
  groupTag: z.string().trim().default("seiton-umkm"),
  proxyUrl: z.string().trim().optional(),
  otpCode: z.string().trim().min(3).max(16).optional(),
  headless: z.boolean().default(false),
});
export type OnboardingActionInput = z.infer<typeof OnboardingActionSchema>;
