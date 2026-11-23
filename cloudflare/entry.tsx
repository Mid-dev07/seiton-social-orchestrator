import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DashboardClient,
  DashboardState,
  OperatorProfile,
} from "../apps/web/src/components/DashboardClient";

function BootstrapApp() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [stateRes, authRes] = await Promise.all([
          fetch("/api/state", { cache: "no-store" }),
          fetch("/api/auth", { cache: "no-store" }),
        ]);
        if (!stateRes.ok) {
          throw new Error(`HTTP ${stateRes.status} saat memuat state`);
        }
        const stateJson = (await stateRes.json()) as DashboardState;
        const authJson = authRes.ok
          ? ((await authRes.json()) as {
              authenticated?: boolean;
              operator?: OperatorProfile | null;
            })
          : { authenticated: false, operator: null };

        if (!cancelled) {
          setState(stateJson);
          setOperator(authJson.operator ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat aplikasi");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b14] p-6 text-rose-300">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-6 text-sm">
          Gagal memuat Seiton-Social Media: {error}
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b14] text-xs text-slate-400">
        Memuat Seiton-Social Media Cloud Orchestrator...
      </div>
    );
  }

  return <DashboardClient initialState={state} initialOperator={operator} />;
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<BootstrapApp />);
}
