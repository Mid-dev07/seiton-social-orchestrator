import {
  MuseConfigInputSchema,
  getSafeMuseSettings,
  getSharedDb,
  redactSecrets,
  saveMuseSettings,
} from "@seiton/shared";
import { emitPipelineEvent } from "@seiton/worker";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getSharedDb();
  return NextResponse.json({ settings: getSafeMuseSettings(db) });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = MuseConfigInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Konfigurasi Muse AI tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = getSharedDb();
    const settings = saveMuseSettings(db, parsed.data);

    emitPipelineEvent({
      type: "campaign:update",
      status: settings.hasApiKey ? "ACTIVE" : "IDLE",
      message: settings.hasApiKey
        ? `Koneksi Live Meta Muse AI aktif (${settings.baseUrl} · ${settings.orchestratorModel}).`
        : "Pengaturan Muse AI diperbarui.",
    });

    return NextResponse.json({ settings });
  } catch (error) {
    const msg = redactSecrets(
      error instanceof Error ? error.message : "Gagal menyimpan konfigurasi Muse AI"
    );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
