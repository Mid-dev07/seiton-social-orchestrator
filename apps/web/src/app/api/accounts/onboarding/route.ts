import {
  OnboardingActionSchema,
  getSharedDb,
  redactSecrets,
} from "@seiton/shared";
import {
  completeManualOnboarding,
  refreshOnboardingScreenshot,
  startAccountOnboarding,
  submitOnboardingOtp,
} from "@seiton/worker";
import { NextResponse } from "next/server";
import { serializeAccount } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = OnboardingActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Input onboarding tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const db = getSharedDb();

    if (input.action === "start_onboarding") {
      if (!input.platform || !input.email || !input.handle) {
        return NextResponse.json(
          { error: "Platform, email, dan handle wajib diisi untuk memulai pembuatan/login akun." },
          { status: 400 }
        );
      }
      const res = await startAccountOnboarding({
        db,
        accountId: input.accountId,
        platform: input.platform,
        mode: input.mode,
        email: input.email,
        handle: input.handle,
        displayName: input.displayName,
        password: input.password,
        groupTag: input.groupTag,
        proxyUrl: input.proxyUrl,
        headless: input.headless,
      });
      return NextResponse.json({
        account: serializeAccount(res.account),
        screenshotPath: res.screenshotPath,
        currentUrl: res.currentUrl,
        message: res.message,
      });
    }

    if (!input.accountId) {
      return NextResponse.json({ error: "accountId wajib diisi" }, { status: 400 });
    }

    if (input.action === "submit_otp") {
      if (!input.otpCode) {
        return NextResponse.json({ error: "Kode OTP wajib diisi" }, { status: 400 });
      }
      const res = await submitOnboardingOtp({
        db,
        accountId: input.accountId,
        otpCode: input.otpCode,
      });
      return NextResponse.json({
        account: serializeAccount(res.account),
        screenshotPath: res.screenshotPath,
        currentUrl: res.currentUrl,
        cookieCount: res.cookieCount,
        message: res.message,
      });
    }

    if (input.action === "refresh_screenshot") {
      const res = await refreshOnboardingScreenshot({
        db,
        accountId: input.accountId,
      });
      return NextResponse.json({
        account: serializeAccount(res.account),
        screenshotPath: res.screenshotPath,
        currentUrl: res.currentUrl,
        message: res.message,
      });
    }

    const res = await completeManualOnboarding({
      db,
      accountId: input.accountId,
    });
    return NextResponse.json({
      account: serializeAccount(res.account),
      screenshotPath: res.screenshotPath,
      currentUrl: res.currentUrl,
      cookieCount: res.cookieCount,
      message: res.message,
    });
  } catch (error) {
    const msg = redactSecrets(
      error instanceof Error ? error.message : "Onboarding error"
    );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
