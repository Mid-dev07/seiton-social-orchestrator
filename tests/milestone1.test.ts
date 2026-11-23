import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  accounts,
  agentRuns,
  campaigns,
  contentAssets,
  createDbConnection,
  decryptSecret,
  encryptSecret,
  evaluateCampaignAntiDuplicate,
  getPerformanceMemory,
  insights,
  isGlobalPaused,
  loadWorkspaceEnv,
  publishJobs,
  redactSecrets,
  resolveWorkspaceRoot,
  seedDefaultSeitonAccounts,
  setGlobalPaused,
  AccountSessionActionSchema,
  OperatorLoginInputSchema,
  evaluateAntiSlopCompliance,
  getMuseRuntimeSettings,
  getSafeMuseSettings,
  purgeDummyAccounts,
  saveMuseSettings,
  eq,
  z,
} from "@seiton/shared";
import {
  MockModelProvider,
  ModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  executeCampaignDag,
} from "@seiton/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadWorkspaceEnv();

const tempDbFiles: string[] = [];

function createTempTestDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `seiton-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`
  );
  tempDbFiles.push(dbPath, `${dbPath}-wal`, `${dbPath}-shm`);
  const db = createDbConnection(dbPath);
  seedDefaultSeitonAccounts(db);
  return db;
}

describe("Seiton-Social Media Milestone 1 Verification", () => {
  beforeAll(() => {
    process.env.DRY_RUN = "true";
    process.env.META_API_KEY = "mock";
  });

  afterAll(() => {
    for (const file of tempDbFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  it("1. Database migrations, 10 Seiton.id accounts, and AES-256-GCM encryption/tamper-resistance", () => {
    const db = createTempTestDb();
    const seededAccounts = db.select().from(accounts).all();
    expect(seededAccounts).toHaveLength(10);

    const platforms = new Set(seededAccounts.map((a) => a.platform));
    expect(platforms).toEqual(
      new Set(["tiktok", "threads", "x", "instagram", "facebook"])
    );

    // AES-256-GCM unique IV per encryption and auth tag verification
    const secretProxy = "http://seiton_user:superSecretPass99@10.20.30.40:8080";
    const c1 = encryptSecret(secretProxy);
    const c2 = encryptSecret(secretProxy);
    expect(c1).not.toBe(c2);
    expect(decryptSecret(c1)).toBe(secretProxy);
    expect(decryptSecret(c2)).toBe(secretProxy);

    // Tamper with auth tag -> must throw
    const parts = c1.split(":");
    expect(parts).toHaveLength(4);
    const corruptedTag =
      parts[2]!.slice(0, -2) + (parts[2]!.endsWith("ff") ? "00" : "ff");
    const tamperedPayload = `${parts[0]}:${parts[1]}:${corruptedTag}:${parts[3]}`;
    expect(() => decryptSecret(tamperedPayload)).toThrow(/authentication failed/i);

    // Redaction safety
    const leak = `Authorization: Bearer secret_token_123 proxy=${secretProxy} enc=${c1}`;
    const redacted = redactSecrets(leak);
    expect(redacted).not.toContain("secret_token_123");
    expect(redacted).not.toContain("superSecretPass99");
    expect(redacted).not.toContain(parts[3]!);

    db.$client.close();
  });

  it("2. Anti-duplicate gate rejects similarity >= 0.60, duplicate SHA-256, and triggers max 2x retry circuit breaker", async () => {
    const duplicateCheck = evaluateCampaignAntiDuplicate([
      {
        accountId: "acc-1",
        platform: "x",
        fullText: "Digitalisasi UMKM bersama Seiton sekarang lebih cepat dan mudah untuk kasir toko.",
        aspectRatio: "1:1",
        mediaSha256: "hash_a",
      },
      {
        accountId: "acc-2",
        platform: "x",
        fullText: "Digitalisasi UMKM bersama Seiton sekarang lebih cepat dan praktis untuk kasir toko.",
        aspectRatio: "1:1",
        mediaSha256: "hash_a",
      },
    ]);
    expect(duplicateCheck.allPassed).toBe(false);
    expect(duplicateCheck.results[0]!.similarityScore).toBeGreaterThanOrEqual(0.6);
    expect(duplicateCheck.results[0]!.notes.some((n) => n.includes("SHA-256"))).toBe(true);

    // Test DAG max 2 retries (3 total attempts) when COPY keeps producing identical captions
    const db = createTempTestDb();
    const campaignId = "camp-retry-breaker";
    db.insert(campaigns)
      .values({
        id: campaignId,
        commandPrompt: "Uji retry QA gate max 2x",
        targetPlatforms: JSON.stringify(["x"]),
        targetGroupTag: "all",
        dryRun: 1,
        maxTokenBudget: 50000,
        tokensUsed: 0,
        status: "QUEUED",
        createdAt: Date.now(),
      })
      .run();

    const baseMock = new MockModelProvider();
    let copyCalls = 0;
    const duplicateCopyProvider: ModelProvider = {
      name: "MockModelProvider",
      async generateStructured<TSchema extends z.ZodTypeAny>(
        req: StructuredGenerationRequest<TSchema>
      ): Promise<StructuredGenerationResult<z.infer<TSchema>>> {
        if (req.role === "COPY") {
          copyCalls += 1;
          const duplicateItems = [
            {
              accountId: "acc-x-umkm",
              platform: "x",
              hook: "Seiton digitalisasi kasir UMKM Indonesia sekarang!",
              body: "Gunakan Seiton.id untuk pembukuan warung modern.",
              cta: "Kunjungi Seiton.id hari ini.",
              hashtags: ["#SeitonID", "#UMKM"],
              variantLabel: "dup-test",
            },
            {
              accountId: "acc-x-premium",
              platform: "x",
              hook: "Seiton digitalisasi kasir UMKM Indonesia sekarang!",
              body: "Gunakan Seiton.id untuk pembukuan warung modern.",
              cta: "Kunjungi Seiton.id hari ini.",
              hashtags: ["#SeitonID", "#UMKM"],
              variantLabel: "dup-test",
            },
          ];
          return {
            data: req.schema.parse({ items: duplicateItems }),
            modelUsed: "muse-spark-1.3",
            tokensUsed: 120,
            providerName: "MockModelProvider",
          };
        }
        return baseMock.generateStructured(req);
      },
    };

    const summary = await executeCampaignDag(campaignId, {
      db,
      provider: duplicateCopyProvider,
      accountIds: ["acc-x-umkm", "acc-x-premium"],
    });

    expect(summary.status).toBe("FAILED");
    expect(copyCalls).toBe(3); // 1 initial + 2 retries
    const qaRuns = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.campaignId, campaignId))
      .all()
      .filter((r) => r.stage === "QA");
    expect(qaRuns).toHaveLength(3);

    db.$client.close();
  });

  it("3. End-to-End DAG + Media Rendering + Playwright Dry-Run across 2 TikTok + 2 X accounts (same & cross platform)", async () => {
    const db = createTempTestDb();
    const campaignId = "camp-e2e-seiton";
    db.insert(campaigns)
      .values({
        id: campaignId,
        commandPrompt:
          "Promosikan Seiton.id untuk digitalisasi UMKM serta paket langganan aplikasi premium resmi bergaransi.",
        targetPlatforms: JSON.stringify(["tiktok", "x"]),
        targetGroupTag: "all",
        dryRun: 1,
        maxTokenBudget: 50000,
        tokensUsed: 0,
        status: "QUEUED",
        createdAt: Date.now(),
      })
      .run();

    const summary = await executeCampaignDag(campaignId, {
      db,
      accountIds: [
        "acc-tiktok-umkm",
        "acc-tiktok-premium",
        "acc-x-umkm",
        "acc-x-premium",
      ],
    });

    expect(summary.status).toBe("COMPLETED");
    expect(summary.assetsCreated).toBe(4);
    expect(summary.jobsExecuted).toBe(4);

    const runs = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.campaignId, campaignId))
      .all();
    const completedStages = new Set(
      runs.filter((r) => r.status === "SUCCESS").map((r) => r.stage)
    );
    expect(completedStages).toEqual(
      new Set(["RESEARCH", "STRATEGY", "COPY", "MEDIA", "QA", "PUBLISH", "INSIGHT"])
    );

    const assets = db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.campaignId, campaignId))
      .all();
    expect(assets).toHaveLength(4);

    const root = resolveWorkspaceRoot();
    const hashes = new Set<string>();
    for (const asset of assets) {
      expect(asset.qaStatus).toBe("PASSED");
      expect(asset.similarityScore).toBeLessThan(0.6);
      expect(asset.mediaSha256).toBeTruthy();
      hashes.add(asset.mediaSha256!);
      if (asset.platform === "x") {
        expect(asset.caption.length).toBeLessThanOrEqual(280);
      }
      const mediaFile = path.resolve(root, asset.mediaPath!);
      expect(fs.existsSync(mediaFile)).toBe(true);
      expect(fs.statSync(mediaFile).size).toBeGreaterThan(1000);
    }
    expect(hashes.size).toBe(4);

    const jobs = db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.campaignId, campaignId))
      .all();
    expect(jobs).toHaveLength(4);
    for (const job of jobs) {
      expect(job.status).toBe("DRY_RUN_OK");
      expect(job.screenshotPath).toContain("dry-run");
      const shotFile = path.resolve(root, job.screenshotPath!);
      expect(fs.existsSync(shotFile)).toBe(true);
      expect(fs.statSync(shotFile).size).toBeGreaterThan(5000);
    }

    const insightRows = db.select().from(insights).all();
    expect(insightRows.length).toBeGreaterThanOrEqual(4);
    const memory = getPerformanceMemory(db);
    expect(memory.lastCampaignId).toBe(campaignId);

    db.$client.close();
  });

  it("4. CAPTCHA/2FA detection marks account CHALLENGE_PAUSED and saves evidence screenshot", async () => {
    const db = createTempTestDb();
    const campaignId = "camp-captcha-check";
    db.insert(campaigns)
      .values({
        id: campaignId,
        commandPrompt: "Uji deteksi CAPTCHA pada akun Threads Seiton.id",
        targetPlatforms: JSON.stringify(["threads"]),
        targetGroupTag: "all",
        dryRun: 1,
        maxTokenBudget: 50000,
        tokensUsed: 0,
        status: "QUEUED",
        createdAt: Date.now(),
      })
      .run();

    await executeCampaignDag(campaignId, {
      db,
      accountIds: ["acc-threads-umkm"],
      simulateChallengeAccountId: "acc-threads-umkm",
    });

    const acc = db
      .select()
      .from(accounts)
      .where(eq(accounts.id, "acc-threads-umkm"))
      .get();
    expect(acc?.status).toBe("CHALLENGE_PAUSED");

    const job = db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.campaignId, campaignId))
      .get();
    expect(job?.status).toBe("CHALLENGE_PAUSED");
    expect(job?.screenshotPath).toContain("challenges");
    const shotFile = path.resolve(resolveWorkspaceRoot(), job!.screenshotPath!);
    expect(fs.existsSync(shotFile)).toBe(true);

    db.$client.close();
  });

  it("5. Global Kill Switch (PAUSE ALL CAMPAIGNS) halts dispatch in < 2000ms", async () => {
    const db = createTempTestDb();
    const campaignId = "camp-kill-switch";
    db.insert(campaigns)
      .values({
        id: campaignId,
        commandPrompt: "Uji kecepatan penghentian Global Kill Switch",
        targetPlatforms: JSON.stringify(["facebook", "instagram"]),
        targetGroupTag: "all",
        dryRun: 1,
        maxTokenBudget: 50000,
        tokensUsed: 0,
        status: "QUEUED",
        createdAt: Date.now(),
      })
      .run();

    const tStart = Date.now();
    const killResult = setGlobalPaused(db, true, "test_kill_switch");
    const killElapsed = Date.now() - tStart;

    expect(killResult.paused).toBe(true);
    expect(killElapsed).toBeLessThan(2000);
    expect(isGlobalPaused(db)).toBe(true);

    const dispatchStart = Date.now();
    const summary = await executeCampaignDag(campaignId, {
      db,
      accountIds: ["acc-fb-umkm", "acc-ig-umkm"],
    });
    const dispatchStopElapsed = Date.now() - dispatchStart;

    expect(summary.status).toBe("PAUSED");
    expect(summary.pausedByKillSwitch).toBe(true);
    expect(summary.jobsExecuted).toBe(0);
    expect(dispatchStopElapsed).toBeLessThan(2000);

    const jobs = db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.campaignId, campaignId))
      .all();
    expect(jobs).toHaveLength(0);

    setGlobalPaused(db, false, "cleanup");
    db.$client.close();
  });

  it("6. Lightweight fast execution mode & Login/Session Zod schemas work cleanly without Chromium overhead", async () => {
    const loginParsed = OperatorLoginInputSchema.safeParse({ quickDemo: true });
    expect(loginParsed.success).toBe(true);

    const sessionParsed = AccountSessionActionSchema.safeParse({
      accountId: "acc-tiktok-umkm",
      action: "import_cookie",
      cookiePayload: '[{"name":"sessionid","value":"abc123"}]',
    });
    expect(sessionParsed.success).toBe(true);

    const db = createTempTestDb();
    const campaignId = "camp-fast-mode";
    db.insert(campaigns)
      .values({
        id: campaignId,
        commandPrompt: "Promosi Seiton.id mode ringan tanpa beban CPU device",
        targetPlatforms: JSON.stringify(["tiktok", "instagram"]),
        targetGroupTag: "all",
        dryRun: 1,
        maxTokenBudget: 50000,
        tokensUsed: 0,
        status: "QUEUED",
        createdAt: Date.now(),
      })
      .run();

    const summary = await executeCampaignDag(campaignId, {
      db,
      accountIds: ["acc-tiktok-umkm", "acc-ig-umkm"],
      executionMode: "fast",
    });

    expect(summary.status).toBe("COMPLETED");
    expect(summary.assetsCreated).toBe(2);
    expect(summary.jobsExecuted).toBe(2);

    const assets = db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.campaignId, campaignId))
      .all();
    expect(assets).toHaveLength(2);
    expect(new Set(assets.map((a) => a.mediaSha256)).size).toBe(2);
    for (const asset of assets) {
      expect(asset.mediaPath).toMatch(/\.svg$/);
      expect(fs.existsSync(path.resolve(resolveWorkspaceRoot(), asset.mediaPath!))).toBe(true);
    }

    db.$client.close();
  });

  it("7. Anti-slop guard, encrypted Muse AI settings, and purgeDummyAccounts behavior", () => {
    const slopHit = evaluateAntiSlopCompliance(
      "Di era digital yang serba cepat ini, Seiton bukan sekadar alat, melainkan game-changer revolusioner."
    );
    expect(slopHit.passed).toBe(false);
    expect(slopHit.hits.length).toBeGreaterThanOrEqual(3);

    const qaSlop = evaluateCampaignAntiDuplicate([
      {
        accountId: "acc-real-1",
        platform: "x",
        fullText: "Di era digital yang serba cepat, kasir Seiton bukan sekadar aplikasi biasa.",
        aspectRatio: "1:1",
        mediaSha256: "unique_hash_slop_1",
      },
    ]);
    expect(qaSlop.allPassed).toBe(false);
    expect(qaSlop.results[0]!.notes.some((n) => n.includes("AI-slop"))).toBe(true);

    const db = createTempTestDb();
    const saved = saveMuseSettings(db, {
      baseUrl: "https://api.meta.ai/v1",
      apiKey: "meta_live_secret_token_xyz123",
      orchestratorModel: "muse-wonder-1.0",
      specialistModel: "muse-spark-1.3",
      guardModel: "muse-ember-1.0",
      imageModel: "muse-image-1.0",
      livePlatformAutomation: true,
      liveProxyEnabled: false,
    });
    expect(saved.hasApiKey).toBe(true);
    expect(saved.maskedApiKey).not.toContain("secret_token");
    expect(getSafeMuseSettings(db).hasApiKey).toBe(true);
    expect(getMuseRuntimeSettings(db).apiKey).toBe("meta_live_secret_token_xyz123");

    const removed = purgeDummyAccounts(db);
    expect(removed).toBe(10);
    expect(db.select().from(accounts).all()).toHaveLength(0);
    // Must not re-seed dummy accounts after purge
    expect(seedDefaultSeitonAccounts(db)).toBe(0);
    expect(db.select().from(accounts).all()).toHaveLength(0);

    db.$client.close();
  });
});
