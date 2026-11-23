import { NextResponse } from "next/server";
import { buildDashboardState } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const state = buildDashboardState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
