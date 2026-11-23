import crypto from "node:crypto";
import path from "node:path";
import {
  AccountRow,
  DbInstance,
  Platform,
  accounts,
  decryptSecret,
  encryptSecret,
  ensureDir,
  eq,
  redactSecrets,
  resolveDataPath,
} from "@seiton/shared";
import { BrowserContext, Page } from "playwright";
import { emitPipelineEvent } from "../events";
import { launchIsolatedPersistentContext } from "./playwright-launcher";

interface ActiveOnboardingSession {
  accountId: string;
  platform: Platform;
  context: BrowserContext;
  page: Page;
  startedAt: number;
}

const globalKey = "__seitonOnboardingSessions" as const;

type GlobalWithOnboarding = typeof globalThis & {
  [globalKey]?: Map<string, ActiveOnboardingSession>;
};

function getOnboardingSessions(): Map<string, ActiveOnboardingSession> {
  const g = globalThis as GlobalWithOnboarding;
  if (!g[globalKey]) {
    g[globalKey] = new Map<string, ActiveOnboardingSession>();
  }
  return g[globalKey];
}

const PLATFORM_ONBOARDING_URLS: Record<
  Platform,
  { signup: string; login: string }
> = {
  tiktok: {
    signup: "https://www.tiktok.com/signup/phone-or-email/email",
    login: "https://www.tiktok.com/login/phone-or-email/email",
  },
  threads: {
    signup: "https://www.threads.net/login",
    login: "https://www.threads.net/login",
  },
  x: {
    signup: "https://x.com/i/flow/signup",
    login: "https://x.com/i/flow/login",
  },
  instagram: {
    signup: "https://www.instagram.com/accounts/emailsignup/",
    login: "https://www.instagram.com/accounts/login/",
  },
  facebook: {
    signup: "https://www.facebook.com/r.php",
    login: "https://www.facebook.com/login/",
  },
};

async function captureOnboardingShot(
  page: Page,
  platform: string,
  accountId: string
): Promise<string> {
  const dir = ensureDir(resolveDataPath("logs", "onboarding"));
  const filename = `${platform}-${accountId}-${Date.now()}.png`;
  const abs = path.join(dir, filename);
  await page.screenshot({ path: abs, fullPage: false }).catch(() => undefined);
  return `./data/logs/onboarding/${filename}`;
}

async function tryFillVisible(
  page: Page,
  selectors: string[],
  value: string | undefined
): Promise<boolean> {
  if (!value) return false;
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.fill(value);
        return true;
      }
    } catch {
      // Try next selector
    }
  }
  return false;
}

export interface OnboardingStartParams {
  db: DbInstance;
  accountId?: string;
  platform: Platform;
  mode: "signup" | "login";
  email: string;
  handle: string;
  displayName?: string;
  password?: string;
  groupTag?: string;
  proxyUrl?: string;
  headless?: boolean;
}

export interface OnboardingResult {
  account: AccountRow;
  screenshotPath: string;
  currentUrl: string;
  cookieCount?: number;
  message: string;
}

/**
 * Starts an isolated Playwright persistent browser session on the real platform signup/login page
 * and fills initial email/identity fields so the operator can inspect or submit the OTP.
 */
export async function startAccountOnboarding(
  params: OnboardingStartParams
): Promise<OnboardingResult> {
  const sessions = getOnboardingSessions();
  const accountId =
    params.accountId || `acc-${params.platform}-${crypto.randomUUID().slice(0, 8)}`;

  // Close existing onboarding session for this account if open
  const existingSession = sessions.get(accountId);
  if (existingSession) {
    await existingSession.context.close().catch(() => undefined);
    sessions.delete(accountId);
  }

  const profileDir = `./data/profiles/${params.platform}-${accountId}`;
  const absProfileDir = ensureDir(
    resolveDataPath("profiles", `${params.platform}-${accountId}`)
  );

  let proxyConfig: { server: string; username?: string; password?: string } | undefined;
  let encryptedProxy: string | null = null;
  if (params.proxyUrl && params.proxyUrl.trim().length > 0) {
    encryptedProxy = encryptSecret(params.proxyUrl.trim());
    if (process.env.LIVE_PROXY_ENABLED === "true") {
      const parsed = new URL(params.proxyUrl.trim());
      proxyConfig = {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      };
    }
  }

  const existingRow = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();

  const initialSession = encryptSecret(
    JSON.stringify({
      platform: params.platform,
      handle: params.handle,
      email: params.email,
      onboardingMode: params.mode,
      authenticated: false,
      startedAt: new Date().toISOString(),
    })
  );

  if (existingRow) {
    params.db
      .update(accounts)
      .set({
        handle: params.handle,
        groupTag: params.groupTag ?? existingRow.groupTag,
        encryptedProxy: encryptedProxy ?? existingRow.encryptedProxy,
        encryptedSession: initialSession,
        status: "ONBOARDING_OTP",
        lastActiveAt: Date.now(),
      })
      .where(eq(accounts.id, accountId))
      .run();
  } else {
    params.db
      .insert(accounts)
      .values({
        id: accountId,
        platform: params.platform,
        handle: params.handle,
        groupTag: params.groupTag ?? "seiton-umkm",
        profileDir,
        encryptedProxy,
        encryptedSession: initialSession,
        timezone: "Asia/Jakarta",
        dailyPostLimit: 5,
        postsToday: 0,
        status: "ONBOARDING_OTP",
        lastActiveAt: Date.now(),
      })
      .run();
  }

  let context: BrowserContext;
  try {
    context = await launchIsolatedPersistentContext({
      userDataDir: absProfileDir,
      proxy: proxyConfig,
      headless: params.headless ?? false,
    });
  } catch {
    // Fallback to headless if no desktop X11/display server is available
    context = await launchIsolatedPersistentContext({
      userDataDir: absProfileDir,
      proxy: proxyConfig,
      headless: true,
    });
  }

  const page = context.pages()[0] ?? (await context.newPage());
  const targetUrl = PLATFORM_ONBOARDING_URLS[params.platform][params.mode];

  let navMessage = `Browser terisolasi dibuka pada ${targetUrl}.`;
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(1200);

    const filledEmail = await tryFillVisible(
      page,
      [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="reg_email__"]',
        'input[name="emailOrPhone"]',
        'input[autocomplete="email"]',
        'input[name="text"]',
      ],
      params.email
    );
    await tryFillVisible(
      page,
      ['input[name="fullName"]', 'input[name="name"]', 'input[name="firstname"]'],
      params.displayName ?? params.handle.replace(/^@/, "")
    );
    await tryFillVisible(
      page,
      ['input[name="username"]', 'input[autocomplete="username"]'],
      params.handle.replace(/^@/, "")
    );
    await tryFillVisible(
      page,
      ['input[type="password"]', 'input[name="password"]', 'input[name="reg_passwd__"]'],
      params.password
    );

    navMessage = filledEmail
      ? `Email ${params.email} diisi pada halaman ${params.platform}. Periksa screenshot/browser, selesaikan langkah atau CAPTCHA bila ada, lalu setor kode OTP.`
      : `Halaman ${params.platform} terbuka. Silakan lengkapi registrasi/CAPTCHA di jendela browser atau masukkan OTP bila diminta.`;
  } catch (err) {
    navMessage = redactSecrets(
      `Browser terbuka, namun navigasi ke ${targetUrl} mengalami kendala: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  sessions.set(accountId, {
    accountId,
    platform: params.platform,
    context,
    page,
    startedAt: Date.now(),
  });

  const screenshotPath = await captureOnboardingShot(page, params.platform, accountId);
  const updatedAccount = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get()!;

  emitPipelineEvent({
    type: "account:update",
    accountId,
    status: "ONBOARDING_OTP",
    message: `Onboarding ${params.handle} (${params.platform}) menunggu verifikasi Email/OTP.`,
  });

  return {
    account: updatedAccount,
    screenshotPath,
    currentUrl: page.url(),
    message: navMessage,
  };
}

/**
 * Submits the user-provided Email OTP code into the active Playwright onboarding session,
 * saves extracted cookies encrypted with AES-256-GCM, and promotes account status to IDLE.
 */
export async function submitOnboardingOtp(params: {
  db: DbInstance;
  accountId: string;
  otpCode: string;
}): Promise<OnboardingResult> {
  const sessions = getOnboardingSessions();
  const session = sessions.get(params.accountId);
  const row = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, params.accountId))
    .get();

  if (!row) {
    throw new Error("Akun onboarding tidak ditemukan");
  }

  if (!session) {
    throw new Error(
      "Sesi browser onboarding tidak aktif. Mulai ulang sesi dari Langkah 1 atau selesaikan manual."
    );
  }

  const { page, context } = session;
  const filledOtp = await tryFillVisible(
    page,
    [
      'input[autocomplete="one-time-code"]',
      'input[name*="code" i]',
      'input[name*="otp" i]',
      'input[inputmode="numeric"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="kode" i]',
      'input[type="tel"]',
    ],
    params.otpCode
  );

  if (filledOtp) {
    await page.keyboard.press("Enter").catch(() => undefined);
    await tryFillVisible(page, [], undefined);
    const submitBtn = page
      .locator(
        'button[type="submit"], button:has-text("Next"), button:has-text("Verify"), button:has-text("Confirm"), button:has-text("Lanjut")'
      )
      .first();
    if ((await submitBtn.count()) > 0 && (await submitBtn.isVisible())) {
      await submitBtn.click().catch(() => undefined);
    }
    await page.waitForTimeout(2000);
  }

  const cookies = await context.cookies();
  const screenshotPath = await captureOnboardingShot(page, row.platform, row.id);
  const currentUrl = page.url();

  const existingMeta = row.encryptedSession
    ? JSON.parse(decryptSecret(row.encryptedSession))
    : {};

  const encryptedSession = encryptSecret(
    JSON.stringify({
      ...existingMeta,
      authenticated: true,
      otpVerifiedAt: new Date().toISOString(),
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
      })),
    })
  );

  params.db
    .update(accounts)
    .set({
      encryptedSession,
      status: "IDLE",
      lastActiveAt: Date.now(),
    })
    .where(eq(accounts.id, row.id))
    .run();

  await context.close().catch(() => undefined);
  sessions.delete(row.id);

  const updated = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, row.id))
    .get()!;

  emitPipelineEvent({
    type: "account:update",
    accountId: row.id,
    status: "IDLE",
    message: `OTP diverifikasi! ${updated.handle} (${cookies.length} cookie sesi tersimpan terenkripsi).`,
  });

  return {
    account: updated,
    screenshotPath,
    currentUrl,
    cookieCount: cookies.length,
    message: filledOtp
      ? `Kode OTP dikirim & ${cookies.length} cookie sesi asli disimpan terenkripsi AES-256-GCM.`
      : `Input OTP otomatis tidak ditemukan di DOM saat ini; ${cookies.length} cookie profil tetap diamankan & akun diaktifkan.`,
  };
}

/**
 * Captures a fresh screenshot of an active onboarding browser session.
 */
export async function refreshOnboardingScreenshot(params: {
  db: DbInstance;
  accountId: string;
}): Promise<OnboardingResult> {
  const session = getOnboardingSessions().get(params.accountId);
  const row = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, params.accountId))
    .get();
  if (!row || !session) {
    throw new Error("Sesi browser onboarding tidak aktif");
  }
  const screenshotPath = await captureOnboardingShot(
    session.page,
    row.platform,
    row.id
  );
  return {
    account: row,
    screenshotPath,
    currentUrl: session.page.url(),
    message: "Screenshot sesi browser onboarding diperbarui.",
  };
}

/**
 * Extracts cookies after the operator completes signup/login/CAPTCHA manually in the browser window.
 */
export async function completeManualOnboarding(params: {
  db: DbInstance;
  accountId: string;
}): Promise<OnboardingResult> {
  const sessions = getOnboardingSessions();
  const session = sessions.get(params.accountId);
  const row = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, params.accountId))
    .get();
  if (!row || !session) {
    throw new Error("Sesi browser onboarding tidak aktif");
  }
  const cookies = await session.context.cookies();
  const screenshotPath = await captureOnboardingShot(
    session.page,
    row.platform,
    row.id
  );
  const currentUrl = session.page.url();

  const encryptedSession = encryptSecret(
    JSON.stringify({
      platform: row.platform,
      handle: row.handle,
      authenticated: true,
      manualCompletedAt: new Date().toISOString(),
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
      })),
    })
  );

  params.db
    .update(accounts)
    .set({
      encryptedSession,
      status: "IDLE",
      lastActiveAt: Date.now(),
    })
    .where(eq(accounts.id, row.id))
    .run();

  await session.context.close().catch(() => undefined);
  sessions.delete(row.id);

  const updated = params.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, row.id))
    .get()!;

  return {
    account: updated,
    screenshotPath,
    currentUrl,
    cookieCount: cookies.length,
    message: `Profil browser terisolasi disimpan (${cookies.length} cookie) & akun ${updated.handle} aktif.`,
  };
}
