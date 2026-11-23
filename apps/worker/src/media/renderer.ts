import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { AspectRatio, VisualSpec, ensureDir, resolveDataPath } from "@seiton/shared";
import { launchHeadlessChromium } from "../browser/playwright-launcher";

const execFileAsync = promisify(execFile);

const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 540, height: 960 },
  "4:5": { width: 600, height: 750 },
  "1:1": { width: 600, height: 600 },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hashSeedNumber(seed: string): number {
  let acc = 0;
  for (let i = 0; i < seed.length; i += 1) {
    acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return acc;
}

function buildCreativeHtml(
  spec: VisualSpec,
  accountHandle: string,
  width: number,
  height: number
): string {
  const seedVal = hashSeedNumber(spec.variationSeed);
  const cx1 = 80 + (seedVal % 260);
  const cy1 = 100 + ((seedVal >> 4) % 240);
  const cx2 = 160 + ((seedVal >> 8) % 280);
  const cy2 = 220 + ((seedVal >> 12) % 300);
  const rotation = seedVal % 45;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #090d16;
    color: #f8fafc;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 40px;
  }
  .bg-glow {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at ${cx1}px ${cy1}px, ${spec.accentHex}66 0%, transparent 55%),
      radial-gradient(circle at ${cx2}px ${cy2}px, #0ea5e933 0%, transparent 50%),
      linear-gradient(155deg, #090d16 0%, #111827 55%, #0f172a 100%);
    z-index: 0;
  }
  .geo {
    position: absolute;
    right: -40px;
    bottom: -40px;
    width: 320px;
    height: 320px;
    border: 2px solid ${spec.accentHex}55;
    border-radius: 36px;
    transform: rotate(${rotation}deg);
    z-index: 1;
  }
  .top-bar, .main-card, .footer {
    position: relative;
    z-index: 2;
  }
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid ${spec.accentHex};
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: ${spec.accentHex};
  }
  .ratio-tag {
    font-size: 12px;
    color: #94a3b8;
    font-family: monospace;
  }
  .main-card {
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-left: 6px solid ${spec.accentHex};
    border-radius: 20px;
    padding: 32px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.45);
  }
  .eyebrow {
    color: #38bdf8;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  h1 {
    font-size: ${width >= 600 ? 34 : 30}px;
    line-height: 1.18;
    font-weight: 800;
    color: #ffffff;
    margin-bottom: 16px;
  }
  p {
    font-size: 18px;
    line-height: 1.5;
    color: #cbd5e1;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    padding-top: 16px;
  }
  .handle {
    font-size: 15px;
    font-weight: 600;
    color: #e2e8f0;
  }
  .seed {
    font-size: 11px;
    font-family: monospace;
    color: #64748b;
  }
</style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="geo"></div>
  <div class="top-bar">
    <div class="brand-pill"><span class="dot"></span>SEITON.ID</div>
    <div class="ratio-tag">${escapeHtml(spec.format)} · ${escapeHtml(spec.aspectRatio)}</div>
  </div>
  <div class="main-card">
    <div class="eyebrow">Digitalisasi UMKM &amp; Aplikasi Premium</div>
    <h1>${escapeHtml(spec.headline)}</h1>
    <p>${escapeHtml(spec.subheadline)}</p>
  </div>
  <div class="footer">
    <div class="handle">${escapeHtml(accountHandle)}</div>
    <div class="seed">${escapeHtml(spec.variationSeed)}</div>
  </div>
</body>
</html>`;
}

export interface RenderedMediaResult {
  mediaPath: string;
  absolutePath: string;
  mediaSha256: string;
  mediaType: "IMAGE" | "VIDEO";
}

/**
 * Deterministically renders VisualSpec HTML/CSS to PNG via Playwright Chromium and re-encodes
 * via FFmpeg with per-account micro-crop and metadata so every account receives a unique SHA-256 hash.
 */
export async function renderVisualSpecToMedia(
  spec: VisualSpec,
  campaignId: string,
  accountHandle: string
): Promise<RenderedMediaResult> {
  const mediaDir = ensureDir(resolveDataPath("media"));
  const dims = DIMENSIONS[spec.aspectRatio];
  const stagingPng = path.join(mediaDir, `.staging-${campaignId}-${spec.accountId}.png`);
  const ext = spec.format === "VIDEO" ? "mp4" : "png";
  const outputFilename = `${campaignId}-${spec.accountId}.${ext}`;
  const finalOutputPath = path.join(mediaDir, outputFilename);

  const browser = await launchHeadlessChromium();
  try {
    const page = await browser.newPage({
      viewport: { width: dims.width, height: dims.height },
      deviceScaleFactor: 1,
    });
    const html = buildCreativeHtml(spec, accountHandle, dims.width, dims.height);
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: stagingPng, type: "png" });
  } finally {
    await browser.close();
  }

  const seedNum = hashSeedNumber(spec.variationSeed);
  const cropOffset = (seedNum % 2) + 1;
  const metadataComment = `seiton:${campaignId}:${spec.accountId}:${spec.variationSeed}`;

  try {
    if (spec.format === "VIDEO") {
      const duration = String(spec.durationSec ?? 2);
      await execFileAsync("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        stagingPng,
        "-t",
        duration,
        "-vf",
        `crop=iw-4:ih-4:${cropOffset}:${cropOffset},scale=${dims.width}:${dims.height},format=yuv420p`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-metadata",
        `comment=${metadataComment}`,
        finalOutputPath,
      ]);
    } else {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        stagingPng,
        "-vf",
        `crop=iw-4:ih-4:${cropOffset}:${cropOffset},scale=${dims.width}:${dims.height}`,
        "-metadata",
        `comment=${metadataComment}`,
        finalOutputPath,
      ]);
    }
  } finally {
    if (fs.existsSync(stagingPng)) {
      fs.unlinkSync(stagingPng);
    }
  }

  const fileBuffer = fs.readFileSync(finalOutputPath);
  const mediaSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  return {
    mediaPath: `./data/media/${outputFilename}`,
    absolutePath: finalOutputPath,
    mediaSha256,
    mediaType: spec.format,
  };
}

/**
 * Lightweight zero-Chromium SVG asset renderer for fast mode (low CPU/RAM footprint).
 */
export function renderVisualSpecFastSvg(
  spec: VisualSpec,
  campaignId: string,
  accountHandle: string
): RenderedMediaResult {
  const mediaDir = ensureDir(resolveDataPath("media"));
  const dims = DIMENSIONS[spec.aspectRatio];
  const outputFilename = `${campaignId}-${spec.accountId}.svg`;
  const finalOutputPath = path.join(mediaDir, outputFilename);
  const seedVal = hashSeedNumber(spec.variationSeed);
  const cx = 120 + (seedVal % 260);
  const cy = 120 + ((seedVal >> 5) % 240);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.width}" height="${dims.height}" viewBox="0 0 ${dims.width} ${dims.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${escapeHtml(spec.accentHex)}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#090d16" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${dims.width}" height="${dims.height}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="260" fill="url(#glow)"/>
  <rect x="28" y="28" width="136" height="34" rx="17" fill="#0f172a" stroke="${escapeHtml(spec.accentHex)}" stroke-width="1.5"/>
  <text x="52" y="50" fill="#f8fafc" font-family="Segoe UI,sans-serif" font-size="13" font-weight="700">SEITON.ID</text>
  <text x="${dims.width - 36}" y="50" text-anchor="end" fill="#94a3b8" font-family="monospace" font-size="12">${escapeHtml(spec.format)} · ${escapeHtml(spec.aspectRatio)}</text>
  <rect x="28" y="${Math.round(dims.height * 0.25)}" width="${dims.width - 56}" height="${Math.round(dims.height * 0.45)}" rx="18" fill="#0f172a" fill-opacity="0.88" stroke="#334155"/>
  <rect x="28" y="${Math.round(dims.height * 0.25)}" width="6" height="${Math.round(dims.height * 0.45)}" rx="3" fill="${escapeHtml(spec.accentHex)}"/>
  <text x="54" y="${Math.round(dims.height * 0.34)}" fill="#38bdf8" font-family="Segoe UI,sans-serif" font-size="13" font-weight="700">DIGITALISASI UMKM &amp; APLIKASI PREMIUM</text>
  <text x="54" y="${Math.round(dims.height * 0.43)}" fill="#ffffff" font-family="Segoe UI,sans-serif" font-size="24" font-weight="800">${escapeHtml(spec.headline.slice(0, 34))}</text>
  <text x="54" y="${Math.round(dims.height * 0.51)}" fill="#cbd5e1" font-family="Segoe UI,sans-serif" font-size="15">${escapeHtml(spec.subheadline.slice(0, 48))}</text>
  <line x1="28" y1="${dims.height - 72}" x2="${dims.width - 28}" y2="${dims.height - 72}" stroke="#1e293b"/>
  <text x="32" y="${dims.height - 38}" fill="#e2e8f0" font-family="Segoe UI,sans-serif" font-size="14" font-weight="600">${escapeHtml(accountHandle)}</text>
  <text x="${dims.width - 32}" y="${dims.height - 38}" text-anchor="end" fill="#64748b" font-family="monospace" font-size="11">${escapeHtml(spec.variationSeed)}</text>
</svg>`;

  fs.writeFileSync(finalOutputPath, svg, "utf8");
  const mediaSha256 = crypto.createHash("sha256").update(svg, "utf8").digest("hex");

  return {
    mediaPath: `./data/media/${outputFilename}`,
    absolutePath: finalOutputPath,
    mediaSha256,
    mediaType: "IMAGE",
  };
}

/**
 * Generates an isolated dry-run composer SVG snapshot in fast mode.
 */
export function renderDryRunComposerSvg(params: {
  platform: string;
  accountId: string;
  handle: string;
  caption: string;
  mediaSha256: string;
  dryRun: boolean;
}): string {
  const dryRunDir = ensureDir(resolveDataPath("logs", "dry-run"));
  const filename = `${params.platform}-${params.accountId}-${Date.now()}.svg`;
  const absPath = path.join(dryRunDir, filename);
  const relPath = `./data/logs/dry-run/${filename}`;
  const previewLines = params.caption.slice(0, 140).replace(/\s+/g, " ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="360" viewBox="0 0 760 360">
  <rect width="760" height="360" rx="14" fill="#0b1120"/>
  <rect x="20" y="20" width="720" height="320" rx="12" fill="#111827" stroke="#334155"/>
  <rect x="20" y="20" width="720" height="48" rx="12" fill="#0f172a"/>
  <text x="40" y="49" fill="#f8fafc" font-family="Segoe UI,sans-serif" font-size="15" font-weight="700">${escapeHtml(params.platform.toUpperCase())} COMPOSER · ${escapeHtml(params.handle)}</text>
  <rect x="520" y="31" width="200" height="26" rx="13" fill="#064e3b"/>
  <text x="620" y="48" text-anchor="middle" fill="#6ee7b7" font-family="Segoe UI,sans-serif" font-size="11" font-weight="700">${params.dryRun ? "DRY_RUN · PUBLISH LOCKED" : "PUBLISHED"}</text>
  <rect x="40" y="88" width="680" height="160" rx="10" fill="#020617" stroke="#1e293b"/>
  <text x="58" y="122" fill="#38bdf8" font-family="Segoe UI,sans-serif" font-size="12" font-weight="700">ISOLATED ACCOUNT COMPOSER PREVIEW</text>
  <text x="58" y="156" fill="#e2e8f0" font-family="Segoe UI,sans-serif" font-size="14">${escapeHtml(previewLines.slice(0, 68))}</text>
  <text x="58" y="184" fill="#cbd5e1" font-family="Segoe UI,sans-serif" font-size="14">${escapeHtml(previewLines.slice(68, 136))}</text>
  <text x="58" y="228" fill="#64748b" font-family="monospace" font-size="11">SHA-256: ${escapeHtml(params.mediaSha256.slice(0, 32))}...</text>
  <rect x="550" y="272" width="170" height="36" rx="8" fill="#0e7490" opacity="0.75"/>
  <text x="635" y="295" text-anchor="middle" fill="#ffffff" font-family="Segoe UI,sans-serif" font-size="12" font-weight="700">${params.dryRun ? "Publish Locked" : "Published"}</text>
</svg>`;

  fs.writeFileSync(absPath, svg, "utf8");
  return relPath;
}
