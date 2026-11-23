import fs from "node:fs";
import path from "node:path";
import {
  AccountRow,
  DbInstance,
  accounts,
  decryptSecret,
  ensureDir,
  resolveDataPath,
  resolveWorkspaceRoot,
} from "@seiton/shared";
import { eq } from "drizzle-orm";
import { BrowserContext, Page } from "playwright";
import { emitPipelineEvent } from "../events";
import { launchIsolatedPersistentContext } from "./playwright-launcher";

class AsyncSemaphore {
  private activeCount = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

export interface ChallengeDetectionResult {
  challenged: boolean;
  reason?: string;
  screenshotPath?: string;
}

const CHALLENGE_SELECTORS = [
  'input[name*="captcha"]',
  "#captcha-box",
  '[data-testid="challenge"]',
  ".g-recaptcha",
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="turnstile"]',
  '[data-testid="login-checkpoint"]',
];

const CHALLENGE_TEXT_REGEX =
  /verify you are human|two-factor|2fa verification|security challenge|captcha|unusual login/i;

export class BrowserProfileManager {
  private readonly accountLocks = new Map<string, Promise<void>>();
  private readonly semaphore: AsyncSemaphore;

  constructor(maxConcurrent?: number) {
    const configured =
      maxConcurrent ?? Number(process.env.MAX_CONCURRENT_BROWSERS || "2");
    this.semaphore = new AsyncSemaphore(
      Number.isFinite(configured) && configured >= 1 ? configured : 2
    );
  }

  /**
   * Resolves the dedicated Chromium userDataDir for a specific account (1 account = 1 directory).
   */
  getAccountProfileDir(account: AccountRow): string {
    const raw = account.profileDir?.trim();
    const resolved = raw
      ? path.isAbsolute(raw)
        ? raw
        : path.resolve(resolveWorkspaceRoot(), raw)
      : resolveDataPath("profiles", `${account.platform}-${account.id}`);
    return ensureDir(resolved);
  }

  /**
   * Decrypts account proxy and session credentials in memory without logging raw values.
   */
  private decryptAccountBindings(account: AccountRow): {
    proxyConfig?: { server: string; username?: string; password?: string };
  } {
    if (account.encryptedSession) {
      decryptSecret(account.encryptedSession);
    }

    if (!account.encryptedProxy) {
      return {};
    }

    const decryptedProxy = decryptSecret(account.encryptedProxy);
    if (process.env.LIVE_PROXY_ENABLED !== "true") {
      return {};
    }

    const parsed = new URL(decryptedProxy);
    return {
      proxyConfig: {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      },
    };
  }

  /**
   * Acquires an exclusive per-account mutex AND global concurrency semaphore, launches the isolated
   * persistent Chromium context, runs the provided callback, and cleans up reliably.
   */
  async runWithIsolatedAccountContext<T>(
    account: AccountRow,
    fn: (context: BrowserContext, page: Page) => Promise<T>
  ): Promise<T> {
    const previousLock = this.accountLocks.get(account.id) ?? Promise.resolve();
    let releaseAccountLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseAccountLock = resolve;
    });
    const chainedLock = previousLock.then(() => currentLock);
    this.accountLocks.set(account.id, chainedLock);

    await previousLock;
    await this.semaphore.acquire();

    let context: BrowserContext | null = null;
    try {
      const userDataDir = this.getAccountProfileDir(account);
      const { proxyConfig } = this.decryptAccountBindings(account);
      context = await launchIsolatedPersistentContext({
        userDataDir,
        proxy: proxyConfig,
      });
      const existingPages = context.pages();
      const page = existingPages[0] ?? (await context.newPage());
      return await fn(context, page);
    } finally {
      if (context) {
        await context.close().catch(() => undefined);
      }
      this.semaphore.release();
      releaseAccountLock();
      if (this.accountLocks.get(account.id) === chainedLock) {
        this.accountLocks.delete(account.id);
      }
    }
  }

  /**
   * Checks URL and DOM for login checkpoints, 2FA prompts, or CAPTCHAs.
   * When detected, captures an evidence screenshot and marks the account CHALLENGE_PAUSED.
   */
  async detectAndPauseIfChallenged(
    page: Page,
    account: AccountRow,
    db: DbInstance,
    extraIndicators: string[] = []
  ): Promise<ChallengeDetectionResult> {
    const urlLower = page.url().toLowerCase();
    const urlHit =
      urlLower.includes("checkpoint") ||
      urlLower.includes("captcha") ||
      urlLower.includes("challenge") ||
      urlLower.includes("two_factor");

    let domHitSelector: string | null = null;
    for (const selector of [...CHALLENGE_SELECTORS, ...extraIndicators]) {
      const count = await page.locator(selector).count().catch(() => 0);
      if (count > 0) {
        domHitSelector = selector;
        break;
      }
    }

    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const textHit = CHALLENGE_TEXT_REGEX.test(bodyText);

    if (!urlHit && !domHitSelector && !textHit) {
      return { challenged: false };
    }

    const challengeDir = ensureDir(resolveDataPath("logs", "challenges"));
    const filename = `${account.platform}-${account.id}-${Date.now()}.png`;
    const absoluteScreenshot = path.join(challengeDir, filename);
    const relativeScreenshot = `./data/logs/challenges/${filename}`;
    await page.screenshot({ path: absoluteScreenshot, fullPage: true });

    const reason = domHitSelector
      ? `Challenge DOM detected (${domHitSelector})`
      : urlHit
        ? `Challenge URL detected (${page.url()})`
        : "Challenge/CAPTCHA verification prompt detected";

    db.update(accounts)
      .set({
        status: "CHALLENGE_PAUSED",
        lastActiveAt: Date.now(),
      })
      .where(eq(accounts.id, account.id))
      .run();

    emitPipelineEvent({
      type: "account:update",
      accountId: account.id,
      status: "CHALLENGE_PAUSED",
      message: `${account.handle} (${account.platform}) dijeda otomatis: ${reason}`,
    });

    // Ensure non-empty file check
    if (!fs.existsSync(absoluteScreenshot)) {
      throw new Error(`Challenge screenshot missing at ${absoluteScreenshot}`);
    }

    return {
      challenged: true,
      reason,
      screenshotPath: relativeScreenshot,
    };
  }
}
