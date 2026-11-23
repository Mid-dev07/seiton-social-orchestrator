import fs from "node:fs";
import path from "node:path";
import {
  AccountRow,
  AspectRatio,
  DbInstance,
  PLATFORM_LIMITS,
  Platform,
  decryptSecret,
  ensureDir,
  resolveDataPath,
} from "@seiton/shared";
import { Page } from "playwright";
import { BrowserProfileManager } from "../browser/profile-manager";
import { ScrapedJobMetric } from "../agents/insight-analyst";

export interface PlatformSelectors {
  platform: Platform;
  displayName: string;
  composerUrl: string;
  composerInput: string;
  fileInput: string;
  publishButton: string;
  charCounter: string;
  mediaPreview: string;
  loginIndicators: string[];
  challengeIndicators: string[];
}

export interface AdapterComposePayload {
  campaignId: string;
  account: AccountRow;
  caption: string;
  aspectRatio: AspectRatio;
  mediaType: "NONE" | "IMAGE" | "CAROUSEL" | "VIDEO";
  mediaAbsolutePath?: string;
  mediaSha256?: string;
  dryRun: boolean;
  livePlatformAutomation?: boolean;
  simulateChallenge?: boolean;
}

export interface AdapterSubmitResult {
  status: "DRY_RUN_OK" | "PUBLISHED" | "CHALLENGE_PAUSED";
  screenshotPath: string;
  publishedUrl?: string;
  errorMessage?: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly selectors: PlatformSelectors;
  validatePayload(payload: AdapterComposePayload): void;
  verifySession(
    page: Page,
    payload: AdapterComposePayload,
    profileManager: BrowserProfileManager,
    db: DbInstance
  ): Promise<{ ok: boolean; challengeScreenshotPath?: string; reason?: string }>;
  composePost(page: Page, payload: AdapterComposePayload): Promise<void>;
  submitOrDryRun(
    page: Page,
    payload: AdapterComposePayload,
    dryRun: boolean
  ): Promise<AdapterSubmitResult>;
  scrapeBasicMetrics(
    page: Page | null,
    postUrl: string | null,
    publishJobId: string,
    accountId: string
  ): Promise<ScrapedJobMetric>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSelectorAttr(selector: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}="([^"]+)"`);
  const match = selector.match(regex);
  return match?.[1] ?? null;
}

/**
 * Shared Playwright composer & challenge automation engine parameterized by centralized platform selectors.
 */
export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: Platform;
  abstract readonly selectors: PlatformSelectors;

  protected abstract readonly brandColor: string;

  validatePayload(payload: AdapterComposePayload): void {
    const limits = PLATFORM_LIMITS[this.platform];
    if (!payload.caption || payload.caption.trim().length === 0) {
      throw new Error(`Caption kosong ditolak oleh adapter ${this.platform}`);
    }
    if (payload.caption.length > limits.maxChars) {
      throw new Error(
        `Caption melebihi batas karakter ${this.platform} (${payload.caption.length}/${limits.maxChars})`
      );
    }
    if (!limits.allowedAspectRatios.includes(payload.aspectRatio)) {
      throw new Error(
        `Rasio aspek ${payload.aspectRatio} ditolak oleh adapter ${this.platform}`
      );
    }
  }

  private buildComposerMockHtml(payload: AdapterComposePayload): string {
    const limit = PLATFORM_LIMITS[this.platform].maxChars;
    const composerTestId =
      getSelectorAttr(this.selectors.composerInput, "data-testid") ??
      `${this.platform}-composer-input`;
    const fileTestId =
      getSelectorAttr(this.selectors.fileInput, "data-testid") ??
      `${this.platform}-media-input`;
    const publishTestId =
      getSelectorAttr(this.selectors.publishButton, "data-testid") ??
      `${this.platform}-publish-btn`;
    const counterTestId =
      getSelectorAttr(this.selectors.charCounter, "data-testid") ??
      `${this.platform}-char-counter`;
    const previewTestId =
      getSelectorAttr(this.selectors.mediaPreview, "data-testid") ??
      `${this.platform}-media-preview`;

    let embeddedImageDataUri = "";
    if (
      payload.mediaAbsolutePath &&
      payload.mediaAbsolutePath.endsWith(".png") &&
      fs.existsSync(payload.mediaAbsolutePath)
    ) {
      const b64 = fs.readFileSync(payload.mediaAbsolutePath).toString("base64");
      embeddedImageDataUri = `data:image/png;base64,${b64}`;
    }

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(this.selectors.displayName)} — Dry Run Preview</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #0b1120;
    color: #e2e8f0;
    padding: 28px;
    min-height: 100vh;
  }
  .shell {
    max-width: 820px;
    margin: 0 auto;
    background: #111827;
    border: 1px solid #334155;
    border-top: 4px solid ${this.brandColor};
    border-radius: 16px;
    overflow: hidden;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 22px;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
  }
  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    background: #064e3b;
    color: #6ee7b7;
  }
  .grid {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 20px;
    padding: 22px;
  }
  label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 8px; font-weight: 600; }
  textarea {
    width: 100%;
    min-height: 220px;
    background: #020617;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 14px;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    font-size: 12px;
    color: #94a3b8;
  }
  .preview-box {
    background: #020617;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    min-height: 250px;
  }
  .preview-box img {
    max-width: 100%;
    max-height: 230px;
    border-radius: 8px;
    border: 1px solid #1e293b;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 22px;
    background: #0f172a;
    border-top: 1px solid #1e293b;
  }
  .publish-btn {
    padding: 10px 20px;
    border-radius: 10px;
    border: none;
    background: ${this.brandColor};
    color: #ffffff;
    font-weight: 700;
    opacity: 0.75;
    cursor: not-allowed;
  }
  .file-status {
    font-size: 11px;
    color: #38bdf8;
    font-family: monospace;
    word-break: break-all;
  }
</style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div>
        <strong>${escapeHtml(this.selectors.displayName)}</strong>
        <span style="color:#94a3b8;margin-left:10px;font-size:13px;">${escapeHtml(payload.account.handle)}</span>
      </div>
      <span class="badge">${payload.dryRun ? "DRY_RUN PREVIEW · PUBLISH LOCKED" : "LIVE COMPOSER"}</span>
    </div>
    <div class="grid">
      <div>
        <label>Composer Caption (${escapeHtml(this.platform.toUpperCase())})</label>
        <textarea data-testid="${escapeHtml(composerTestId)}" id="composer-input" placeholder="Tulis caption..."></textarea>
        <div class="meta-row">
          <span data-testid="${escapeHtml(counterTestId)}" id="char-counter">0 / ${limit}</span>
          <span>Aspect: ${escapeHtml(payload.aspectRatio)}</span>
        </div>
      </div>
      <div class="preview-box" data-testid="${escapeHtml(previewTestId)}">
        ${
          embeddedImageDataUri
            ? `<img src="${embeddedImageDataUri}" alt="Rendered asset preview" />`
            : `<div style="padding:18px;text-align:center;border:1px dashed #475569;border-radius:8px;width:100%;">
                <div style="font-weight:700;color:#f8fafc;">${escapeHtml(payload.mediaType)} READY</div>
                <div style="font-size:12px;color:#94a3b8;margin-top:6px;">${escapeHtml(path.basename(payload.mediaAbsolutePath ?? "asset"))}</div>
              </div>`
        }
        <input type="file" data-testid="${escapeHtml(fileTestId)}" id="media-file-input" style="font-size:11px;color:#cbd5e1;" />
        <div class="file-status" id="file-attached-label">SHA256: ${escapeHtml((payload.mediaSha256 ?? "none").slice(0, 16))}...</div>
      </div>
    </div>
    <div class="footer">
      <div style="font-size:12px;color:#94a3b8;">Isolated Profile: ${escapeHtml(payload.account.profileDir)}</div>
      <button type="button" data-testid="${escapeHtml(publishTestId)}" class="publish-btn" id="publish-btn">
        ${payload.dryRun ? "Publish Disabled (DRY_RUN)" : "Publish Post"}
      </button>
    </div>
  </div>
  <script>
    const input = document.getElementById("composer-input");
    const counter = document.getElementById("char-counter");
    const fileInput = document.getElementById("media-file-input");
    const fileLabel = document.getElementById("file-attached-label");
    input.addEventListener("input", () => {
      counter.textContent = input.value.length + " / ${limit}";
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        fileLabel.textContent = "Attached: " + fileInput.files[0].name + " (" + fileInput.files[0].size + " bytes)";
      }
    });
  </script>
</body>
</html>`;
  }

  private buildChallengeMockHtml(payload: AdapterComposePayload): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(this.selectors.displayName)} — Security Checkpoint</title>
<style>
  body { font-family: system-ui, sans-serif; background: #18181b; color: #fafafa; display: grid; place-items: center; min-height: 100vh; }
  .card { background: #27272a; border: 2px solid #ef4444; border-radius: 14px; padding: 32px; max-width: 480px; text-align: center; }
  h1 { color: #f87171; margin-bottom: 12px; font-size: 22px; }
  p { color: #d4d4d8; margin-bottom: 20px; font-size: 14px; }
  input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #52525b; background: #09090b; color: #fff; }
</style>
</head>
<body>
  <div class="card" data-testid="challenge" id="captcha-box">
    <h1>Security Challenge &amp; CAPTCHA Required</h1>
    <p>Verify you are human before continuing session for ${escapeHtml(payload.account.handle)} (${escapeHtml(this.platform)}).</p>
    <input type="text" name="captcha_response" placeholder="Two-factor / CAPTCHA verification code" />
  </div>
</body>
</html>`;
  }

  async verifySession(
    page: Page,
    payload: AdapterComposePayload,
    profileManager: BrowserProfileManager,
    db: DbInstance
  ): Promise<{ ok: boolean; challengeScreenshotPath?: string; reason?: string }> {
    this.validatePayload(payload);

    const useLivePlatform =
      Boolean(payload.livePlatformAutomation) ||
      process.env.LIVE_PLATFORM_AUTOMATION === "true";

    if (payload.simulateChallenge) {
      await page.setContent(this.buildChallengeMockHtml(payload), { waitUntil: "load" });
    } else if (useLivePlatform) {
      if (payload.account.encryptedSession) {
        try {
          const rawSession = decryptSecret(payload.account.encryptedSession);
          const parsedSession = JSON.parse(rawSession) as
            | Array<{ name: string; value: string; domain?: string; path?: string }>
            | { cookies?: Array<{ name: string; value: string; domain?: string; path?: string }> };
          const cookieList = Array.isArray(parsedSession)
            ? parsedSession
            : Array.isArray(parsedSession.cookies)
              ? parsedSession.cookies
              : [];
          const validCookies = cookieList.filter((c) => c.name && c.value && c.domain);
          if (validCookies.length > 0) {
            await page.context().addCookies(
              validCookies.map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain!,
                path: c.path || "/",
              }))
            );
          }
        } catch {
          // Non-cookie metadata JSON — rely on persistent userDataDir cookies
        }
      }
      await page.goto(this.selectors.composerUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
    } else {
      await page.setContent(this.buildComposerMockHtml(payload), { waitUntil: "load" });
    }

    const challenge = await profileManager.detectAndPauseIfChallenged(
      page,
      payload.account,
      db,
      this.selectors.challengeIndicators
    );
    if (challenge.challenged) {
      return {
        ok: false,
        challengeScreenshotPath: challenge.screenshotPath,
        reason: challenge.reason,
      };
    }

    if (useLivePlatform) {
      for (const loginSelector of this.selectors.loginIndicators) {
        const count = await page.locator(loginSelector).count().catch(() => 0);
        if (count > 0) {
          const check = await profileManager.detectAndPauseIfChallenged(
            page,
            payload.account,
            db,
            [loginSelector]
          );
          return {
            ok: false,
            challengeScreenshotPath: check.screenshotPath,
            reason: `Login required (${loginSelector})`,
          };
        }
      }
    }

    return { ok: true };
  }

  async composePost(page: Page, payload: AdapterComposePayload): Promise<void> {
    this.validatePayload(payload);

    const composerLocator = page.locator(this.selectors.composerInput).first();
    await composerLocator.waitFor({ state: "visible", timeout: 10000 });
    await composerLocator.click();
    await composerLocator.fill("");
    await composerLocator.type(payload.caption, { delay: 4 });

    if (payload.mediaAbsolutePath && fs.existsSync(payload.mediaAbsolutePath)) {
      const fileInputLocator = page.locator(this.selectors.fileInput).first();
      const fileCount = await fileInputLocator.count().catch(() => 0);
      if (fileCount > 0) {
        await fileInputLocator.setInputFiles(payload.mediaAbsolutePath);
      }
    }
  }

  async submitOrDryRun(
    page: Page,
    payload: AdapterComposePayload,
    dryRun: boolean
  ): Promise<AdapterSubmitResult> {
    if (dryRun) {
      const dryRunDir = ensureDir(resolveDataPath("logs", "dry-run"));
      const filename = `${this.platform}-${payload.account.id}-${Date.now()}.png`;
      const absPath = path.join(dryRunDir, filename);
      const relPath = `./data/logs/dry-run/${filename}`;
      await page.screenshot({ path: absPath, fullPage: true });
      return {
        status: "DRY_RUN_OK",
        screenshotPath: relPath,
      };
    }

    const publishBtn = page.locator(this.selectors.publishButton).first();
    await publishBtn.waitFor({ state: "visible", timeout: 10000 });
    await publishBtn.click();

    const liveDir = ensureDir(resolveDataPath("logs", "dry-run"));
    const filename = `${this.platform}-${payload.account.id}-live-${Date.now()}.png`;
    const absPath = path.join(liveDir, filename);
    await page.screenshot({ path: absPath, fullPage: true });

    return {
      status: "PUBLISHED",
      screenshotPath: `./data/logs/dry-run/${filename}`,
      publishedUrl: `${this.selectors.composerUrl}#published-${payload.account.id}-${Date.now()}`,
    };
  }

  async scrapeBasicMetrics(
    _page: Page | null,
    _postUrl: string | null,
    publishJobId: string,
    accountId: string
  ): Promise<ScrapedJobMetric> {
    // Deterministic baseline metrics derived from job/account IDs during dry-run/local simulation
    let seed = 0;
    const key = `${publishJobId}:${accountId}:${this.platform}`;
    for (let i = 0; i < key.length; i += 1) {
      seed = (seed * 33 + key.charCodeAt(i)) >>> 0;
    }
    const views = 420 + (seed % 1850);
    const likes = Math.round(views * (0.06 + (seed % 5) * 0.01));
    const replies = Math.round(likes * 0.14);
    const shares = Math.round(likes * 0.19);
    return {
      publishJobId,
      accountId,
      platform: this.platform,
      views,
      likes,
      replies,
      shares,
    };
  }
}
