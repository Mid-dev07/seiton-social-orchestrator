import {
  ResearchBriefSchema,
  getMuseRuntimeSettings,
  getSharedDb,
  redactSecrets,
} from "@seiton/shared";
import { createModelProvider } from "@seiton/worker";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const startedAt = Date.now();
  try {
    const db = getSharedDb();
    const runtime = getMuseRuntimeSettings(db);
    const provider = createModelProvider(runtime);

    const res = await provider.generateStructured({
      role: "RESEARCH",
      schema: ResearchBriefSchema,
      systemPrompt:
        "You are Seiton.id Researcher Agent. Return valid JSON matching ResearchBriefSchema.",
      userPrompt:
        "Diagnostic test: summarize 1 Indonesian UMKM digitalization trend and 1 Seiton.id premium app benefit.",
      contextData: {
        targetPlatforms: ["tiktok", "x"],
        priorWinningPatterns: [],
      },
    });

    return NextResponse.json({
      ok: true,
      providerName: res.providerName,
      modelUsed: res.modelUsed,
      tokensUsed: res.tokensUsed,
      latencyMs: Date.now() - startedAt,
      sampleTopic: res.data.trends[0]?.topic ?? "OK",
      isLiveMuseApi: res.providerName === "MetaMuseProvider",
    });
  } catch (error) {
    const msg = redactSecrets(error instanceof Error ? error.message : "Connection test failed");
    return NextResponse.json(
      {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: msg,
      },
      { status: 502 }
    );
  }
}
