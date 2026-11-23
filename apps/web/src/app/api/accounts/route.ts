import crypto from "node:crypto";
import {
  CreateAccountInputSchema,
  UpdateAccountInputSchema,
  accounts,
  encryptSecret,
  getSharedDb,
  purgeDummyAccounts,
  redactSecrets,
} from "@seiton/shared";
import { emitPipelineEvent } from "@seiton/worker";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serializeAccount } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = getSharedDb();
    const rows = db.select().from(accounts).all().map(serializeAccount);
    return NextResponse.json({ accounts: rows });
  } catch (error) {
    const msg = redactSecrets(error instanceof Error ? error.message : "Error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = CreateAccountInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Input akun tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const input = parsed.data;
    const db = getSharedDb();
    const id = `acc-${input.platform}-${crypto.randomUUID().slice(0, 8)}`;
    const encryptedProxy = input.proxyUrl ? encryptSecret(input.proxyUrl) : null;
    const encryptedSession = input.sessionCookieJson
      ? encryptSecret(input.sessionCookieJson)
      : encryptSecret(
          JSON.stringify({
            platform: input.platform,
            handle: input.handle,
            authenticated: true,
          })
        );

    db.insert(accounts)
      .values({
        id,
        platform: input.platform,
        handle: input.handle,
        groupTag: input.groupTag,
        profileDir: `./data/profiles/${input.platform}-${id}`,
        encryptedProxy,
        encryptedSession,
        timezone: input.timezone,
        dailyPostLimit: input.dailyPostLimit,
        postsToday: 0,
        status: "IDLE",
        lastActiveAt: null,
      })
      .run();

    const created = db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!created) {
      throw new Error("Account insertion verification failed");
    }

    emitPipelineEvent({
      type: "account:update",
      accountId: id,
      status: "IDLE",
      message: `Akun baru ditambahkan: ${input.handle} (${input.platform})`,
    });

    return NextResponse.json({ account: serializeAccount(created) }, { status: 201 });
  } catch (error) {
    const msg = redactSecrets(error instanceof Error ? error.message : "Failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = UpdateAccountInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Update akun tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const db = getSharedDb();
    const existing = db.select().from(accounts).where(eq(accounts.id, input.id)).get();
    if (!existing) {
      return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
    }

    const updates: Partial<typeof accounts.$inferInsert> = {};
    if (input.handle !== undefined) updates.handle = input.handle;
    if (input.groupTag !== undefined) updates.groupTag = input.groupTag;
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.dailyPostLimit !== undefined) updates.dailyPostLimit = input.dailyPostLimit;
    if (input.status !== undefined) updates.status = input.status;
    if (input.resetPostsToday) updates.postsToday = 0;
    if (input.proxyUrl !== undefined) {
      updates.encryptedProxy = input.proxyUrl ? encryptSecret(input.proxyUrl) : null;
    }
    if (input.sessionCookieJson !== undefined && input.sessionCookieJson.length > 0) {
      updates.encryptedSession = encryptSecret(input.sessionCookieJson);
    }

    db.update(accounts).set(updates).where(eq(accounts.id, input.id)).run();
    const updated = db.select().from(accounts).where(eq(accounts.id, input.id)).get();

    emitPipelineEvent({
      type: "account:update",
      accountId: input.id,
      status: updated?.status ?? existing.status,
      message: `Konfigurasi akun ${updated?.handle ?? existing.handle} diperbarui.`,
    });

    return NextResponse.json({
      account: updated ? serializeAccount(updated) : null,
    });
  } catch (error) {
    const msg = redactSecrets(error instanceof Error ? error.message : "Failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");
    const id = searchParams.get("id");
    const db = getSharedDb();

    if (mode === "purge_dummies") {
      const removed = purgeDummyAccounts(db);
      emitPipelineEvent({
        type: "account:update",
        status: "IDLE",
        message: `${removed} akun dummy bawaan dihapus. Tambahkan akun asli Anda melalui Wizard Email + OTP.`,
      });
      return NextResponse.json({ removed });
    }

    if (!id) {
      return NextResponse.json({ error: "Parameter id atau mode=purge_dummies wajib diisi" }, { status: 400 });
    }

    db.delete(accounts).where(eq(accounts.id, id)).run();
    emitPipelineEvent({
      type: "account:update",
      accountId: id,
      status: "DISABLED",
      message: `Akun ${id} dihapus dari Account Vault.`,
    });
    return NextResponse.json({ deleted: id });
  } catch (error) {
    const msg = redactSecrets(error instanceof Error ? error.message : "Delete failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
