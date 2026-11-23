import fs from "node:fs";
import path from "node:path";
import { Browser, BrowserContext, chromium } from "playwright";

function findCachedChromiumExecutable(): string | undefined {
  try {
    const defaultExec = chromium.executablePath();
    if (defaultExec && fs.existsSync(defaultExec)) {
      return defaultExec;
    }
  } catch {
    // Fall back to scanning local Playwright cache directories
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return undefined;
  }
  const msPlaywrightDir = path.join(localAppData, "ms-playwright");
  if (!fs.existsSync(msPlaywrightDir)) {
    return undefined;
  }
  const entries = fs
    .readdirSync(msPlaywrightDir)
    .filter((name) => name.startsWith("chromium-") && !name.includes("headless_shell"))
    .sort()
    .reverse();

  for (const entry of entries) {
    const winExec = path.join(msPlaywrightDir, entry, "chrome-win64", "chrome.exe");
    if (fs.existsSync(winExec)) {
      return winExec;
    }
    const win32Exec = path.join(msPlaywrightDir, entry, "chrome-win", "chrome.exe");
    if (fs.existsSync(win32Exec)) {
      return win32Exec;
    }
    const linuxExec = path.join(msPlaywrightDir, entry, "chrome-linux", "chrome");
    if (fs.existsSync(linuxExec)) {
      return linuxExec;
    }
  }
  return undefined;
}

/**
 * Launches a standard headless Chromium browser for deterministic local asset rendering.
 */
export async function launchHeadlessChromium(): Promise<Browser> {
  const executablePath = findCachedChromiumExecutable();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/**
 * Launches an isolated persistent Chromium context bound to a single account's userDataDir and optional proxy.
 */
export async function launchIsolatedPersistentContext(options: {
  userDataDir: string;
  proxy?: { server: string; username?: string; password?: string };
  headless?: boolean;
}): Promise<BrowserContext> {
  const executablePath = findCachedChromiumExecutable();
  return chromium.launchPersistentContext(options.userDataDir, {
    headless: options.headless ?? true,
    ...(executablePath ? { executablePath } : {}),
    ...(options.proxy ? { proxy: options.proxy } : {}),
    viewport: { width: 1280, height: 800 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
