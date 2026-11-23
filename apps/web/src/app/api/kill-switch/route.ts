import {
  KillSwitchInputSchema,
  getSharedDb,
  setGlobalPaused,
} from "@seiton/shared";
import { emitPipelineEvent } from "@seiton/worker";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body: unknown = await request.json();
    const parsed = KillSwitchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload kill switch tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = getSharedDb();
    const result = setGlobalPaused(
      db,
      parsed.data.paused,
      parsed.data.reason ?? "dashboard_kill_switch"
    );
    const elapsedMs = Date.now() - startedAt;

    emitPipelineEvent({
      type: "kill_switch:update",
      status: result.paused ? "PAUSED" : "ACTIVE",
      message: result.paused
        ? `GLOBAL KILL SWITCH AKTIF (${elapsedMs}ms): seluruh dispatch baru dihentikan (${result.pausedCampaigns} kampanye dijeda).`
        : `Operasi dilanjutkan (${elapsedMs}ms).`,
    });

    return NextResponse.json({
      ...result,
      elapsedMs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Kill switch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
