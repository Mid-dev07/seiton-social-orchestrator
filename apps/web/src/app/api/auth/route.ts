import { OperatorLoginInputSchema, redactSecrets } from "@seiton/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "seiton_operator_session";

function parseOperatorFromCookie(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!match) {
    return null;
  }
  const raw = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  try {
    const parsed = JSON.parse(raw) as {
      email?: string;
      name?: string;
      role?: string;
    };
    if (parsed.email && parsed.name) {
      return {
        email: parsed.email,
        name: parsed.name,
        role: parsed.role ?? "Operator Lead",
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(request: Request) {
  const operator = parseOperatorFromCookie(request.headers.get("cookie"));
  return NextResponse.json({
    authenticated: Boolean(operator),
    operator,
  });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = OperatorLoginInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Format login tidak valid", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const expectedEmail = (process.env.OPERATOR_EMAIL ?? "admin@seiton.id").toLowerCase();
    const expectedPassword = process.env.OPERATOR_PASSWORD ?? "seiton2026";
    const input = parsed.data;

    let operator: { email: string; name: string; role: string };

    if (input.quickDemo) {
      operator = {
        email: expectedEmail,
        name: "Operator Seiton.id",
        role: "Growth Lead",
      };
    } else {
      const email = (input.email ?? "").trim().toLowerCase();
      const password = input.password ?? "";
      if (email !== expectedEmail || password !== expectedPassword) {
        return NextResponse.json(
          {
            error:
              "Email atau password salah. Gunakan admin@seiton.id / seiton2026 atau tombol Masuk Instan.",
          },
          { status: 401 }
        );
      }
      operator = {
        email,
        name: "Operator Seiton.id",
        role: "Growth Lead",
      };
    }

    const response = NextResponse.json({
      authenticated: true,
      operator,
    });
    response.cookies.set(SESSION_COOKIE, JSON.stringify(operator), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    const msg = redactSecrets(error instanceof Error ? error.message : "Login gagal");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false, operator: null });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
