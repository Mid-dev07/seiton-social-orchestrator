import crypto from "node:crypto";
import {
  CreateCampaignInputSchema,
  accounts,
  campaigns,
  getSharedDb,
  isGlobalPaused,
  redactSecrets,
} from "@seiton/shared";
import { emitPipelineEvent, executeCampaignDag } from "@seiton/worker";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = getSharedDb();
    if (isGlobalPaused(db)) {
      return NextResponse.json(
        {
          error:
            "Operasi sedang dijeda oleh Global Kill Switch (PAUSE ALL CAMPAIGNS). Nonaktifkan pause untuk memulai kampanye baru.",
        },
        { status: 409 }
      );
    }

    const body: unknown = await request.json();
    const parsed = CreateCampaignInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Input kampanye tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    if (input.dailyQuotaOverride) {
      db.update(accounts)
        .set({ dailyPostLimit: input.dailyQuotaOverride })
        .run();
    }

    const campaignId = `camp-${crypto.randomUUID().slice(0, 10)}`;
    const effectiveDryRun = input.dryRun || process.env.DRY_RUN !== "false" ? 1 : 0;

    db.insert(campaigns)
      .values({
        id: campaignId,
        commandPrompt: input.commandPrompt,
        targetPlatforms: JSON.stringify(input.targetPlatforms),
        targetGroupTag: input.targetGroupTag,
        dryRun: effectiveDryRun,
        maxTokenBudget: input.maxTokenBudget,
        tokensUsed: 0,
        status: "QUEUED",
        createdAt: Date.now(),
      })
      .run();

    emitPipelineEvent({
      type: "campaign:update",
      campaignId,
      status: "QUEUED",
      message: `Kampanye baru dibuat: "${input.commandPrompt.slice(0, 60)}"`,
    });

    // Atomically claim campaign before execution to avoid duplicate dispatch if standalone worker polls
    db.update(campaigns)
      .set({ status: "RUNNING" })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "QUEUED")))
      .run();

    const execPromise = executeCampaignDag(campaignId, {
      db,
      accountIds: input.accountIds,
      simulateChallengeAccountId: input.simulateChallengeAccountId,
      executionMode: input.executionMode,
    }).catch((err) => {
      const safeErr = redactSecrets(err instanceof Error ? err.message : String(err));
      db.update(campaigns)
        .set({ status: "FAILED" })
        .where(eq(campaigns.id, campaignId))
        .run();
      emitPipelineEvent({
        type: "campaign:update",
        campaignId,
        status: "FAILED",
        message: `Error eksekusi DAG: ${safeErr}`,
      });
      return null;
    });

    if (input.sync) {
      const summary = await execPromise;
      return NextResponse.json({ campaignId, summary }, { status: 201 });
    }

    void execPromise;
    return NextResponse.json({ campaignId, status: "RUNNING" }, { status: 201 });
  } catch (error) {
    const safeErr = redactSecrets(
      error instanceof Error ? error.message : "Failed to create campaign"
    );
    return NextResponse.json({ error: safeErr }, { status: 500 });
  }
}
