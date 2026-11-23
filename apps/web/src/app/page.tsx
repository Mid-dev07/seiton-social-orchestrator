import { cookies } from "next/headers";
import { DashboardClient, OperatorProfile } from "@/components/DashboardClient";
import { buildDashboardState } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const initialState = buildDashboardState();
  const cookieStore = await cookies();
  const rawSession = cookieStore.get("seiton_operator_session")?.value;

  let initialOperator: OperatorProfile | null = null;
  if (rawSession) {
    try {
      const parsed = JSON.parse(decodeURIComponent(rawSession)) as Partial<OperatorProfile>;
      if (parsed.email && parsed.name) {
        initialOperator = {
          email: parsed.email,
          name: parsed.name,
          role: parsed.role ?? "Growth Lead",
        };
      }
    } catch {
      initialOperator = null;
    }
  }

  return (
    <DashboardClient
      initialState={initialState}
      initialOperator={initialOperator}
    />
  );
}
