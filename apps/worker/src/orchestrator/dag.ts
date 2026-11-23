import crypto from "node:crypto";
import path from "node:path";
import {
  AccountRow,
  AgentStage,
  AspectRatio,
  CampaignPlan,
  CopyBundle,
  DbInstance,
  Platform,
  ResearchBrief,
  VisualSpec,
  VisualSpecBundle,
  accounts,
  agentRuns,
  campaigns,
  contentAssets,
  getPerformanceMemory,
  getSharedDb,
  insights,
  isGlobalPaused,
  publishJobs,
  redactSecrets,
  resolveWorkspaceRoot,
  savePerformanceMemory,
} from "@seiton/shared";
import { eq, inArray } from "drizzle-orm";
import { getPlatformAdapter } from "../adapters";
import { runCopywriterAgent } from "../agents/copywriter";
import { runDesignerAgent } from "../agents/designer";
import { ScrapedJobMetric, runInsightAnalystAgent } from "../agents/insight-analyst";
import { runQaGateAgent } from "../agents/qa-gate";
import { runResearcherAgent } from "../agents/researcher";
import { runStrategistAgent } from "../agents/strategist";
import { BrowserProfileManager } from "../browser/profile-manager";
import { emitPipelineEvent } from "../events";
import {
  renderDryRunComposerSvg,
  renderVisualSpecFastSvg,
  renderVisualSpecToMedia,
} from "../media/renderer";
import { ModelProvider, createModelProvider, formatCopyText } from "../models/provider";

export interface ExecuteCampaignOptions {
  db?: DbInstance;
  provider?: ModelProvider;
  profileManager?: BrowserProfileManager;
  accountIds?: string[];
  simulateChallengeAccountId?: string;
  executionMode?: "fast" | "browser";
}

export interface CampaignExecutionSummary {
  campaignId: string;
  status: "COMPLETED" | "PAUSED" | "PAUSED_BUDGET" | "FAILED";
  tokensUsed: number;
  assetsCreated: number;
  jobsExecuted: number;
  pausedByKillSwitch: boolean;
}

const MAX_ATTEMPTS = 3; // 1 initial attempt + 2 automatic retries

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

async function runLoggedStage<T>(params: {
  db: DbInstance;
  campaignId: string;
  stage: AgentStage;
  modelUsed: string;
  attempt: number;
  inputSnapshot: unknown;
  execute: () => Promise<{ output: T; tokensUsed: number; actualModel?: string }>;
}): Promise<{ output: T; tokensUsed: number }> {
  const runId = newId("run");
  const startedAt = Date.now();
  const safeInput = redactSecrets(JSON.stringify(params.inputSnapshot));

  params.db
    .insert(agentRuns)
    .values({
      id: runId,
      campaignId: params.campaignId,
      stage: params.stage,
      modelUsed: params.modelUsed,
      attempt: params.attempt,
      inputJson: safeInput,
      outputJson: "{}",
      tokensUsed: 0,
      durationMs: 0,
      status: "RUNNING",
      errorMessage: null,
      createdAt: startedAt,
    })
    .run();

  emitPipelineEvent({
    type: "agent_run:update",
    campaignId: params.campaignId,
    stage: params.stage,
    status: "RUNNING",
    message: `Stage ${params.stage} (attempt ${params.attempt}) dimulai dengan ${params.modelUsed}`,
  });

  try {
    const { output, tokensUsed, actualModel } = await params.execute();
    const durationMs = Date.now() - startedAt;
    const safeOutput = redactSecrets(JSON.stringify(output));

    params.db
      .update(agentRuns)
      .set({
        modelUsed: actualModel ?? params.modelUsed,
        outputJson: safeOutput,
        tokensUsed,
        durationMs,
        status: "SUCCESS",
      })
      .where(eq(agentRuns.id, runId))
      .run();

    const currentCampaign = params.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, params.campaignId))
      .get();
    if (currentCampaign) {
      params.db
        .update(campaigns)
        .set({ tokensUsed: currentCampaign.tokensUsed + tokensUsed })
        .where(eq(campaigns.id, params.campaignId))
        .run();
    }

    emitPipelineEvent({
      type: "agent_run:update",
      campaignId: params.campaignId,
      stage: params.stage,
      status: "SUCCESS",
      message: `Stage ${params.stage} selesai dalam ${durationMs}ms (${tokensUsed} token)`,
    });

    return { output, tokensUsed };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const rawMsg = error instanceof Error ? error.message : String(error);
    const safeError = redactSecrets(rawMsg);

    params.db
      .update(agentRuns)
      .set({
        durationMs,
        status: "FAILED",
        errorMessage: safeError,
      })
      .where(eq(agentRuns.id, runId))
      .run();

    emitPipelineEvent({
      type: "agent_run:update",
      campaignId: params.campaignId,
      stage: params.stage,
      status: "FAILED",
      message: `Stage ${params.stage} gagal: ${safeError}`,
    });

    throw error;
  }
}

async function withRetries<T>(
  maxAttempts: number,
  fn: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function checkBudgetOrPause(db: DbInstance, campaignId: string): boolean {
  const row = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!row) {
    return true;
  }
  if (row.tokensUsed >= row.maxTokenBudget) {
    db.update(campaigns)
      .set({ status: "PAUSED_BUDGET" })
      .where(eq(campaigns.id, campaignId))
      .run();
    emitPipelineEvent({
      type: "campaign:update",
      campaignId,
      status: "PAUSED_BUDGET",
      message: `Kampanye dihentikan otomatis: anggaran token tercapai (${row.tokensUsed}/${row.maxTokenBudget})`,
    });
    return true;
  }
  return false;
}

function checkKillSwitchOrPause(db: DbInstance, campaignId: string): boolean {
  if (!isGlobalPaused(db)) {
    return false;
  }
  db.update(campaigns).set({ status: "PAUSED" }).where(eq(campaigns.id, campaignId)).run();
  emitPipelineEvent({
    type: "campaign:update",
    campaignId,
    status: "PAUSED",
    message: "Eksekusi kampanye dihentikan oleh Global Kill Switch (PAUSE ALL)",
  });
  return true;
}

/**
 * Executes the stateful multi-agent DAG pipeline for a single campaign.
 */
export async function executeCampaignDag(
  campaignId: string,
  options: ExecuteCampaignOptions = {}
): Promise<CampaignExecutionSummary> {
  const db = options.db ?? getSharedDb();
  const provider = options.provider ?? createModelProvider();
  const profileManager = options.profileManager ?? new BrowserProfileManager();

  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  const returnSummary = (
    status: CampaignExecutionSummary["status"],
    assetsCreated = 0,
    jobsExecuted = 0,
    pausedByKillSwitch = false
  ): CampaignExecutionSummary => {
    const latest = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
    return {
      campaignId,
      status,
      tokensUsed: latest?.tokensUsed ?? campaign.tokensUsed,
      assetsCreated,
      jobsExecuted,
      pausedByKillSwitch,
    };
  };

  if (checkKillSwitchOrPause(db, campaignId)) {
    return returnSummary("PAUSED", 0, 0, true);
  }

  db.update(campaigns).set({ status: "RUNNING" }).where(eq(campaigns.id, campaignId)).run();
  emitPipelineEvent({
    type: "campaign:update",
    campaignId,
    status: "RUNNING",
    message: `Kampanye ${campaignId} dimulai (${provider.name})`,
  });

  const targetPlatforms = JSON.parse(campaign.targetPlatforms) as Platform[];

  // Resolve eligible accounts
  const allAccounts = options.accountIds?.length
    ? db.select().from(accounts).where(inArray(accounts.id, options.accountIds)).all()
    : db.select().from(accounts).where(inArray(accounts.platform, targetPlatforms)).all();

  const groupFiltered = allAccounts.filter((acc) => {
    if (
      campaign.targetGroupTag === "all" ||
      campaign.targetGroupTag === "seiton-all" ||
      options.accountIds?.length
    ) {
      return targetPlatforms.includes(acc.platform as Platform);
    }
    return (
      acc.groupTag === campaign.targetGroupTag &&
      targetPlatforms.includes(acc.platform as Platform)
    );
  });

  const eligibleAccounts: AccountRow[] = [];
  for (const acc of groupFiltered) {
    if (
      acc.status === "DISABLED" ||
      acc.status === "CHALLENGE_PAUSED" ||
      acc.status === "RATE_LIMITED"
    ) {
      continue;
    }
    if (acc.postsToday >= acc.dailyPostLimit) {
      db.update(accounts)
        .set({ status: "RATE_LIMITED" })
        .where(eq(accounts.id, acc.id))
        .run();
      continue;
    }
    eligibleAccounts.push(acc);
  }

  if (eligibleAccounts.length === 0) {
    db.update(campaigns).set({ status: "FAILED" }).where(eq(campaigns.id, campaignId)).run();
    emitPipelineEvent({
      type: "campaign:update",
      campaignId,
      status: "FAILED",
      message: "Tidak ada akun sehat dengan kuota harian tersedia untuk kampanye ini.",
    });
    return returnSummary("FAILED");
  }

  // Stage 1: RESEARCH
  if (checkKillSwitchOrPause(db, campaignId)) {
    return returnSummary("PAUSED", 0, 0, true);
  }
  if (checkBudgetOrPause(db, campaignId)) {
    return returnSummary("PAUSED_BUDGET");
  }

  let researchBrief!: ResearchBrief;
  try {
    const perfMemory = getPerformanceMemory(db);
    const res = await withRetries(MAX_ATTEMPTS, async (attempt) => {
      const stageOut = await runLoggedStage({
        db,
        campaignId,
        stage: "RESEARCH",
        modelUsed: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
        attempt,
        inputSnapshot: {
          commandPrompt: campaign.commandPrompt,
          targetPlatforms,
          priorWinningPatterns: perfMemory.winningPatterns,
        },
        execute: async () => {
          const r = await runResearcherAgent(provider, {
            campaignId,
            commandPrompt: campaign.commandPrompt,
            targetPlatforms,
            performanceMemory: perfMemory,
          });
          return { output: r.brief, tokensUsed: r.tokensUsed, actualModel: r.modelUsed };
        },
      });
      return stageOut.output;
    });
    researchBrief = res;
  } catch {
    db.update(campaigns).set({ status: "FAILED" }).where(eq(campaigns.id, campaignId)).run();
    return returnSummary("FAILED");
  }

  // Stage 2: STRATEGY
  if (checkKillSwitchOrPause(db, campaignId)) {
    return returnSummary("PAUSED", 0, 0, true);
  }
  if (checkBudgetOrPause(db, campaignId)) {
    return returnSummary("PAUSED_BUDGET");
  }

  let campaignPlan!: CampaignPlan;
  try {
    campaignPlan = await withRetries(MAX_ATTEMPTS, async (attempt) => {
      const stageOut = await runLoggedStage({
        db,
        campaignId,
        stage: "STRATEGY",
        modelUsed: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
        attempt,
        inputSnapshot: {
          accountCount: eligibleAccounts.length,
          accounts: eligibleAccounts.map((a) => ({ id: a.id, platform: a.platform })),
        },
        execute: async () => {
          const s = await runStrategistAgent(provider, {
            campaignId,
            commandPrompt: campaign.commandPrompt,
            researchBrief,
            accounts: eligibleAccounts,
            attempt,
          });
          return { output: s.plan, tokensUsed: s.tokensUsed, actualModel: s.modelUsed };
        },
      });
      return stageOut.output;
    });
  } catch {
    db.update(campaigns).set({ status: "FAILED" }).where(eq(campaigns.id, campaignId)).run();
    return returnSummary("FAILED");
  }

  // Stage 3..5: COPY -> MEDIA -> QA (Max 2 retries on QA rejection)
  const accountMap = new Map(eligibleAccounts.map((acc) => [acc.id, acc]));
  let qaPassed = false;
  let qaFeedback: string | undefined;
  let finalAssets: Array<{
    assetId: string;
    account: AccountRow;
    platform: Platform;
    caption: string;
    aspectRatio: AspectRatio;
    mediaType: "IMAGE" | "VIDEO";
    mediaPath: string;
    mediaAbsolutePath: string;
    mediaSha256: string;
  }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (checkKillSwitchOrPause(db, campaignId)) {
      return returnSummary("PAUSED", finalAssets.length, 0, true);
    }
    if (checkBudgetOrPause(db, campaignId)) {
      return returnSummary("PAUSED_BUDGET", finalAssets.length);
    }

    let copyBundle: CopyBundle;
    try {
      const copyOut = await runLoggedStage({
        db,
        campaignId,
        stage: "COPY",
        modelUsed: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
        attempt,
        inputSnapshot: {
          assignmentCount: campaignPlan.assignments.length,
          qaFeedback,
        },
        execute: async () => {
          const c = await runCopywriterAgent(provider, {
            campaignId,
            commandPrompt: campaign.commandPrompt,
            researchBrief,
            plan: campaignPlan,
            attempt,
            qaFeedback,
          });
          return { output: c.copyBundle, tokensUsed: c.tokensUsed, actualModel: c.modelUsed };
        },
      });
      copyBundle = copyOut.output;
    } catch {
      continue;
    }

    if (checkKillSwitchOrPause(db, campaignId)) {
      return returnSummary("PAUSED", 0, 0, true);
    }
    if (checkBudgetOrPause(db, campaignId)) {
      return returnSummary("PAUSED_BUDGET");
    }

    let visualBundle: VisualSpecBundle;
    const renderedByAccount = new Map<
      string,
      {
        spec: VisualSpec;
        mediaPath: string;
        absolutePath: string;
        mediaSha256: string;
        mediaType: "IMAGE" | "VIDEO";
      }
    >();

    try {
      const mediaOut = await runLoggedStage({
        db,
        campaignId,
        stage: "MEDIA",
        modelUsed: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
        attempt,
        inputSnapshot: {
          assignments: campaignPlan.assignments.map((a) => ({
            accountId: a.accountId,
            format: a.format,
            variationSeed: a.variationSeed,
          })),
        },
        execute: async () => {
          const d = await runDesignerAgent(provider, {
            campaignId,
            plan: campaignPlan,
            copyBundle,
            attempt,
          });
          for (const spec of d.visualBundle.specs) {
            const acc = accountMap.get(spec.accountId);
            if (!acc) {
              continue;
            }
            const rendered =
              options.executionMode === "fast"
                ? renderVisualSpecFastSvg(spec, campaignId, acc.handle)
                : await renderVisualSpecToMedia(spec, campaignId, acc.handle);
            renderedByAccount.set(spec.accountId, {
              spec,
              ...rendered,
            });
          }
          return {
            output: {
              specs: d.visualBundle.specs,
              renderedFiles: Array.from(renderedByAccount.entries()).map(([id, r]) => ({
                accountId: id,
                mediaPath: r.mediaPath,
                mediaSha256: r.mediaSha256,
                mediaType: r.mediaType,
              })),
            },
            tokensUsed: d.tokensUsed,
            actualModel: d.modelUsed,
          };
        },
      });
      visualBundle = { specs: mediaOut.output.specs };
    } catch {
      continue;
    }

    if (checkKillSwitchOrPause(db, campaignId)) {
      return returnSummary("PAUSED", 0, 0, true);
    }
    if (checkBudgetOrPause(db, campaignId)) {
      return returnSummary("PAUSED_BUDGET");
    }

    const candidates = copyBundle.items
      .map((item) => {
        const rendered = renderedByAccount.get(item.accountId);
        const spec = visualBundle.specs.find((s) => s.accountId === item.accountId);
        if (!rendered || !spec) {
          return null;
        }
        return {
          accountId: item.accountId,
          platform: item.platform,
          fullText: formatCopyText(item),
          aspectRatio: spec.aspectRatio,
          mediaSha256: rendered.mediaSha256,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const qaOut = await runLoggedStage({
      db,
      campaignId,
      stage: "QA",
      modelUsed: process.env.META_MODEL_GUARD || "muse-ember-1.0",
      attempt,
      inputSnapshot: {
        candidateCount: candidates.length,
        bannedAngles: researchBrief.bannedAngles,
      },
      execute: async () => {
        const q = await runQaGateAgent(provider, {
          campaignId,
          candidates,
          bannedAngles: researchBrief.bannedAngles,
          attempt,
        });
        return {
          output: q,
          tokensUsed: q.tokensUsed,
          actualModel: q.modelUsed,
        };
      },
    });

    // Store content_assets snapshot for this attempt
    const batchAssets: typeof finalAssets = [];
    for (const item of copyBundle.items) {
      const account = accountMap.get(item.accountId);
      const rendered = renderedByAccount.get(item.accountId);
      const qaResult = qaOut.output.deterministic.results.find(
        (r) => r.accountId === item.accountId
      );
      if (!account || !rendered || !qaResult) {
        continue;
      }

      const fullCaption = formatCopyText(item);
      const assetId = newId("asset");
      const qaStatus = qaResult.passed && qaOut.output.evaluation.overallPassed ? "PASSED" : "REJECTED";
      const qaNotes =
        qaResult.notes.length > 0
          ? qaResult.notes.join("; ")
          : qaOut.output.evaluation.complianceSummary;

      db.insert(contentAssets)
        .values({
          id: assetId,
          campaignId,
          accountId: account.id,
          platform: item.platform,
          hook: item.hook,
          caption: fullCaption,
          mediaType: rendered.mediaType,
          aspectRatio: rendered.spec.aspectRatio,
          mediaPath: rendered.mediaPath,
          mediaSha256: rendered.mediaSha256,
          similarityScore: qaResult.similarityScore,
          qaStatus,
          qaNotes,
          createdAt: Date.now(),
        })
        .run();

      emitPipelineEvent({
        type: "asset:update",
        campaignId,
        accountId: account.id,
        status: qaStatus,
        message: `Aset ${account.handle} (${item.platform}): similarity=${qaResult.similarityScore}, sha256=${rendered.mediaSha256.slice(0, 12)}...`,
      });

      if (qaStatus === "PASSED") {
        batchAssets.push({
          assetId,
          account,
          platform: item.platform,
          caption: fullCaption,
          aspectRatio: rendered.spec.aspectRatio,
          mediaType: rendered.mediaType,
          mediaPath: rendered.mediaPath,
          mediaAbsolutePath: rendered.absolutePath,
          mediaSha256: rendered.mediaSha256,
        });
      }
    }

    if (qaOut.output.evaluation.overallPassed && batchAssets.length === copyBundle.items.length) {
      qaPassed = true;
      finalAssets = batchAssets;
      break;
    }

    qaFeedback =
      qaOut.output.evaluation.rewriteGuidance ??
      `QA gagal pada attempt ${attempt}: kemiripan atau validasi tidak lolos.`;
  }

  if (!qaPassed || finalAssets.length === 0) {
    db.update(campaigns).set({ status: "FAILED" }).where(eq(campaigns.id, campaignId)).run();
    emitPipelineEvent({
      type: "campaign:update",
      campaignId,
      status: "FAILED",
      message: "Kampanye dihentikan: QA Gate menolak aset setelah maksimal 2x retry.",
    });
    return returnSummary("FAILED");
  }

  // Stage 6: PUBLISH (Isolated Browser Worker + 5 Platform Adapters)
  const effectiveDryRun =
    campaign.dryRun === 1 || process.env.DRY_RUN !== "false";

  const scrapedMetrics: ScrapedJobMetric[] = [];
  const publishResults: Array<{
    jobId: string;
    accountId: string;
    platform: Platform;
    status: string;
    screenshotPath?: string;
  }> = [];

  const publishRunId = newId("run");
  const publishStartedAt = Date.now();
  db.insert(agentRuns)
    .values({
      id: publishRunId,
      campaignId,
      stage: "PUBLISH",
      modelUsed: "playwright-isolated-worker",
      attempt: 1,
      inputJson: JSON.stringify({
        assetCount: finalAssets.length,
        dryRun: effectiveDryRun,
      }),
      outputJson: "{}",
      tokensUsed: 0,
      durationMs: 0,
      status: "RUNNING",
      errorMessage: null,
      createdAt: publishStartedAt,
    })
    .run();

  emitPipelineEvent({
    type: "agent_run:update",
    campaignId,
    stage: "PUBLISH",
    status: "RUNNING",
    message: `Menjalankan ${finalAssets.length} browser job terisolasi (DRY_RUN=${effectiveDryRun})`,
  });

  // Create PENDING publish_jobs upfront so Kill Switch interruptions are visible cleanly
  const plannedJobs = finalAssets.map((asset, idx) => {
    const jobId = newId("job");
    db.insert(publishJobs)
      .values({
        id: jobId,
        campaignId,
        accountId: asset.account.id,
        assetId: asset.assetId,
        scheduledAt: Date.now() + idx * 1000,
        status: "PENDING",
        publishedUrl: null,
        screenshotPath: null,
        errorMessage: null,
      })
      .run();
    return { jobId, asset };
  });

  let pausedByKillSwitch = false;

  for (const { jobId, asset } of plannedJobs) {
    if (checkKillSwitchOrPause(db, campaignId)) {
      pausedByKillSwitch = true;
      break;
    }

    const adapter = getPlatformAdapter(asset.platform);
    const simulateChallenge =
      options.simulateChallengeAccountId === asset.account.id;

    db.update(publishJobs)
      .set({ status: "RUNNING" })
      .where(eq(publishJobs.id, jobId))
      .run();
    db.update(accounts)
      .set({ status: "ACTIVE", lastActiveAt: Date.now() })
      .where(eq(accounts.id, asset.account.id))
      .run();

    emitPipelineEvent({
      type: "publish_job:update",
      campaignId,
      accountId: asset.account.id,
      status: "RUNNING",
      message: `Membuka profil browser terisolasi untuk ${asset.account.handle} (${asset.platform})`,
    });

    try {
      const useFastExecution =
        options.executionMode === "fast" && !simulateChallenge;

      const outcome = useFastExecution
        ? {
            status: effectiveDryRun
              ? ("DRY_RUN_OK" as const)
              : ("PUBLISHED" as const),
            screenshotPath: renderDryRunComposerSvg({
              platform: asset.platform,
              accountId: asset.account.id,
              handle: asset.account.handle,
              caption: asset.caption,
              mediaSha256: asset.mediaSha256,
              dryRun: effectiveDryRun,
            }),
            publishedUrl: effectiveDryRun
              ? undefined
              : `${adapter.selectors.composerUrl}#published-${asset.account.id}-${Date.now()}`,
            errorMessage: undefined,
            metric: await adapter.scrapeBasicMetrics(
              null,
              null,
              jobId,
              asset.account.id
            ),
          }
        : await profileManager.runWithIsolatedAccountContext(
            asset.account,
            async (_context, page) => {
              const mediaAbs = path.isAbsolute(asset.mediaAbsolutePath)
                ? asset.mediaAbsolutePath
                : path.resolve(resolveWorkspaceRoot(), asset.mediaPath);

              const payload = {
                campaignId,
                account: asset.account,
                caption: asset.caption,
                aspectRatio: asset.aspectRatio,
                mediaType: asset.mediaType,
                mediaAbsolutePath: mediaAbs,
                mediaSha256: asset.mediaSha256,
                dryRun: effectiveDryRun,
                simulateChallenge,
              };

              const sessionCheck = await adapter.verifySession(
                page,
                payload,
                profileManager,
                db
              );
              if (!sessionCheck.ok) {
                return {
                  status: "CHALLENGE_PAUSED" as const,
                  screenshotPath: sessionCheck.challengeScreenshotPath ?? "",
                  errorMessage: sessionCheck.reason ?? "Challenge/CAPTCHA detected",
                  metric: null as ScrapedJobMetric | null,
                };
              }

              if (isGlobalPaused(db)) {
                return {
                  status: "PENDING" as const,
                  screenshotPath: "",
                  errorMessage: "Halted by Global Kill Switch prior to compose",
                  metric: null as ScrapedJobMetric | null,
                };
              }

              await adapter.composePost(page, payload);
              const submitRes = await adapter.submitOrDryRun(
                page,
                payload,
                effectiveDryRun
              );
              const metric = await adapter.scrapeBasicMetrics(
                page,
                submitRes.publishedUrl ?? null,
                jobId,
                asset.account.id
              );

              return {
                status: submitRes.status,
                screenshotPath: submitRes.screenshotPath,
                publishedUrl: submitRes.publishedUrl,
                errorMessage: submitRes.errorMessage,
                metric,
              };
            }
          );

      if (outcome.status === "PENDING") {
        db.update(publishJobs)
          .set({ status: "PENDING", errorMessage: outcome.errorMessage })
          .where(eq(publishJobs.id, jobId))
          .run();
        db.update(accounts)
          .set({ status: "IDLE" })
          .where(eq(accounts.id, asset.account.id))
          .run();
        checkKillSwitchOrPause(db, campaignId);
        pausedByKillSwitch = true;
        break;
      }

      if (outcome.status === "CHALLENGE_PAUSED") {
        db.update(publishJobs)
          .set({
            status: "CHALLENGE_PAUSED",
            screenshotPath: outcome.screenshotPath,
            errorMessage: outcome.errorMessage,
          })
          .where(eq(publishJobs.id, jobId))
          .run();
        publishResults.push({
          jobId,
          accountId: asset.account.id,
          platform: asset.platform,
          status: "CHALLENGE_PAUSED",
          screenshotPath: outcome.screenshotPath,
        });
        emitPipelineEvent({
          type: "publish_job:update",
          campaignId,
          accountId: asset.account.id,
          status: "CHALLENGE_PAUSED",
          message: `CAPTCHA/Challenge terdeteksi untuk ${asset.account.handle} — bukti screenshot tersimpan.`,
        });
        continue;
      }

      db.update(publishJobs)
        .set({
          status: outcome.status,
          screenshotPath: outcome.screenshotPath,
          publishedUrl: outcome.publishedUrl ?? null,
          errorMessage: null,
        })
        .where(eq(publishJobs.id, jobId))
        .run();

      const nextPostsToday = asset.account.postsToday + 1;
      const nextStatus =
        nextPostsToday >= asset.account.dailyPostLimit ? "RATE_LIMITED" : "IDLE";
      db.update(accounts)
        .set({
          postsToday: nextPostsToday,
          status: nextStatus,
          lastActiveAt: Date.now(),
        })
        .where(eq(accounts.id, asset.account.id))
        .run();

      if (outcome.metric) {
        scrapedMetrics.push(outcome.metric);
      }
      publishResults.push({
        jobId,
        accountId: asset.account.id,
        platform: asset.platform,
        status: outcome.status,
        screenshotPath: outcome.screenshotPath,
      });

      emitPipelineEvent({
        type: "publish_job:update",
        campaignId,
        accountId: asset.account.id,
        status: outcome.status,
        message: `${asset.account.handle} (${asset.platform}) -> ${outcome.status}`,
      });
    } catch (error) {
      const msg = redactSecrets(error instanceof Error ? error.message : String(error));
      db.update(publishJobs)
        .set({
          status: "FAILED",
          errorMessage: msg,
        })
        .where(eq(publishJobs.id, jobId))
        .run();
      db.update(accounts)
        .set({ status: "IDLE", lastActiveAt: Date.now() })
        .where(eq(accounts.id, asset.account.id))
        .run();
      publishResults.push({
        jobId,
        accountId: asset.account.id,
        platform: asset.platform,
        status: "FAILED",
      });
    }
  }

  db.update(agentRuns)
    .set({
      outputJson: redactSecrets(JSON.stringify({ results: publishResults, pausedByKillSwitch })),
      durationMs: Date.now() - publishStartedAt,
      status: pausedByKillSwitch ? "FAILED" : "SUCCESS",
      errorMessage: pausedByKillSwitch ? "Halted by Global Kill Switch" : null,
    })
    .where(eq(agentRuns.id, publishRunId))
    .run();

  if (pausedByKillSwitch) {
    return returnSummary("PAUSED", finalAssets.length, publishResults.length, true);
  }

  // Stage 7: INSIGHT ANALYST
  if (scrapedMetrics.length > 0 && !checkKillSwitchOrPause(db, campaignId)) {
    if (!checkBudgetOrPause(db, campaignId)) {
      const previousMemory = getPerformanceMemory(db);
      const insightOut = await runLoggedStage({
        db,
        campaignId,
        stage: "INSIGHT",
        modelUsed: process.env.META_MODEL_ORCHESTRATOR || "muse-wonder-1.0",
        attempt: 1,
        inputSnapshot: { metricCount: scrapedMetrics.length },
        execute: async () => {
          const res = await runInsightAnalystAgent(provider, {
            campaignId,
            metrics: scrapedMetrics,
            previousMemory,
          });
          return {
            output: res,
            tokensUsed: res.tokensUsed,
            actualModel: res.modelUsed,
          };
        },
      });

      const collectedAt = Date.now();
      for (const m of insightOut.output.report.metrics) {
        db.insert(insights)
          .values({
            id: newId("ins"),
            publishJobId: m.publishJobId,
            accountId: m.accountId,
            platform: m.platform,
            views: m.views,
            likes: m.likes,
            replies: m.replies,
            shares: m.shares,
            winningPatternSummary: m.winningPatternSummary,
            collectedAt,
          })
          .run();
      }
      savePerformanceMemory(db, insightOut.output.nextMemory);

      emitPipelineEvent({
        type: "insight:update",
        campaignId,
        status: "SUCCESS",
        message: `Insight Analyst menyimpan ${insightOut.output.report.metrics.length} metrik & memperbarui PerformanceMemory.`,
      });
    }
  }

  const anySuccess = publishResults.some(
    (r) => r.status === "DRY_RUN_OK" || r.status === "PUBLISHED"
  );
  const finalStatus: CampaignExecutionSummary["status"] = anySuccess
    ? "COMPLETED"
    : "FAILED";

  db.update(campaigns)
    .set({ status: finalStatus })
    .where(eq(campaigns.id, campaignId))
    .run();

  emitPipelineEvent({
    type: "campaign:update",
    campaignId,
    status: finalStatus,
    message: `Kampanye ${campaignId} berstatus ${finalStatus}`,
  });

  return returnSummary(finalStatus, finalAssets.length, publishResults.length, false);
}
