import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "@seiton/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get("path");
    if (!rawPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const normalized = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!normalized.startsWith("data/")) {
      return NextResponse.json({ error: "Access restricted to data/ directory" }, { status: 403 });
    }

    const subPath = normalized.slice("data/".length);
    const resolved = resolveDataPath(...subPath.split("/").filter(Boolean));
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Asset file not found" }, { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";
    const buffer = fs.readFileSync(resolved);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to serve media";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
